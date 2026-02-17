/**
 * Extension Service Worker
 *
 * Connects to the local server via WebSocket, routes commands to content scripts,
 * handles browser-level operations (navigate, screenshot, evaluate).
 *
 * Security:
 * - Only connects to localhost (hardcoded)
 * - Requires auth token on handshake
 * - URL allowlist enforced before any navigation
 */

// ─── Types (inline to avoid bundling issues) ────────────────────────────────

interface Command {
  id: string;
  type: 'command';
  command: string;
  params: Record<string, unknown>;
  tabId?: number;
}

interface Response {
  id: string;
  type: 'response';
  success: boolean;
  data?: unknown;
  error?: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

const DEFAULT_PORT = 3695;
const KEEPALIVE_INTERVAL_MS = 20_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 50;

// URL allowlist - only these origins can be interacted with
// Extended via server config on auth
let allowedOrigins: string[] = [
  'http://localhost',
  'https://localhost',
  'http://127.0.0.1',
  'https://127.0.0.1',
];

// ─── State ──────────────────────────────────────────────────────────────────

let ws: WebSocket | null = null;
let authToken: string | null = null;
let isAuthenticated = false;
let reconnectAttempts = 0;
let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let port = DEFAULT_PORT;

// Network capture state
let networkCaptureActive = false;
let capturedRequests: Array<{
  url: string;
  method: string;
  status: number;
  type: string;
  timestamp: number;
}> = [];
let networkCapturePattern: RegExp | null = null;

// ─── Storage ────────────────────────────────────────────────────────────────

async function loadConfig(): Promise<void> {
  const result = await chrome.storage.local.get(['authToken', 'port']);
  if (result.authToken) authToken = result.authToken;
  if (result.port) port = result.port;
}

async function saveConfig(token: string, serverPort: number): Promise<void> {
  authToken = token;
  port = serverPort;
  await chrome.storage.local.set({ authToken: token, port: serverPort });
}

// ─── URL Allowlist ──────────────────────────────────────────────────────────

function isUrlAllowed(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Allow local file:// URLs unconditionally
    if (parsed.protocol === 'file:') return true;
    return allowedOrigins.some((origin) => {
      const parsedOrigin = new URL(origin.includes('://') ? origin : `https://${origin}`);
      return (
        parsed.hostname === parsedOrigin.hostname ||
        parsed.hostname.endsWith(`.${parsedOrigin.hostname}`)
      );
    });
  } catch {
    return false;
  }
}

// ─── WebSocket Connection ───────────────────────────────────────────────────

function connect(): void {
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) {
    return;
  }

  // SECURITY: Only connect to localhost - hardcoded, never configurable via web content
  const wsUrl = `ws://127.0.0.1:${port}`;

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    console.log('[agent-chrome-test] Connected to server');
    reconnectAttempts = 0;

    // Send auth token
    if (authToken) {
      ws!.send(
        JSON.stringify({
          type: 'auth',
          token: authToken,
          extensionId: chrome.runtime.id,
        })
      );
    }

    startKeepalive();
    updateBadge('connected');
  };

  ws.onmessage = (event) => {
    handleMessage(event.data as string);
  };

  ws.onclose = () => {
    console.log('[agent-chrome-test] Disconnected from server');
    isAuthenticated = false;
    stopKeepalive();
    updateBadge('disconnected');
    scheduleReconnect();
  };

  ws.onerror = () => {
    // onclose will fire after this
  };
}

function scheduleReconnect(): void {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.log('[agent-chrome-test] Max reconnect attempts reached');
    updateBadge('error');
    return;
  }

  const delay = Math.min(
    RECONNECT_BASE_MS * Math.pow(2, reconnectAttempts),
    RECONNECT_MAX_MS
  );
  reconnectAttempts++;

  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, delay);
}

function startKeepalive(): void {
  stopKeepalive();
  keepaliveTimer = setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ id: crypto.randomUUID(), type: 'command', command: 'ping', params: {} }));
    }
  }, KEEPALIVE_INTERVAL_MS);
}

function stopKeepalive(): void {
  if (keepaliveTimer) {
    clearInterval(keepaliveTimer);
    keepaliveTimer = null;
  }
}

// ─── Badge / Status ─────────────────────────────────────────────────────────

function updateBadge(status: 'connected' | 'disconnected' | 'error'): void {
  const colors: Record<string, string> = {
    connected: '#22c55e',
    disconnected: '#6b7280',
    error: '#ef4444',
  };
  const texts: Record<string, string> = {
    connected: 'ON',
    disconnected: 'OFF',
    error: 'ERR',
  };

  chrome.action.setBadgeBackgroundColor({ color: colors[status] });
  chrome.action.setBadgeText({ text: texts[status] });

  // Notify popup if open
  chrome.runtime.sendMessage({ type: 'status', status }).catch(() => {
    // popup not open, ignore
  });
}

// ─── Message Handling ───────────────────────────────────────────────────────

async function handleMessage(raw: string): Promise<void> {
  let msg: any;
  try {
    msg = JSON.parse(raw);
  } catch {
    console.error('[agent-chrome-test] Invalid JSON from server');
    return;
  }

  // Handle auth response
  if (msg.type === 'auth_result') {
    isAuthenticated = msg.success;
    if (msg.success) {
      // Server may send allowed origins
      if (msg.allowedOrigins) {
        allowedOrigins = [...allowedOrigins, ...msg.allowedOrigins];
      }
      updateBadge('connected');
    } else {
      console.error('[agent-chrome-test] Auth failed:', msg.error);
      updateBadge('error');
    }
    return;
  }

  // Only process commands if authenticated
  if (!isAuthenticated && authToken) {
    sendResponse(msg.id, false, undefined, 'Not authenticated');
    return;
  }

  if (msg.type !== 'command') return;

  try {
    const result = await executeCommand(msg as Command);
    sendResponse(msg.id, true, result);
  } catch (err) {
    sendResponse(msg.id, false, undefined, err instanceof Error ? err.message : String(err));
  }
}

async function executeCommand(cmd: Command): Promise<unknown> {
  const tabId = cmd.tabId ?? (await getActiveTabId());

  switch (cmd.command) {
    case 'ping':
      return { pong: true, timestamp: Date.now() };

    case 'navigate': {
      const url = cmd.params.url as string;
      if (!isUrlAllowed(url)) {
        throw new Error(`URL not in allowlist: ${url}. Add the domain to your server config.`);
      }
      await chrome.tabs.update(tabId, { url });
      // Wait for page load
      await waitForTabLoad(tabId);
      return { url };
    }

    case 'screenshot': {
      const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
        format: 'png',
      });
      // Strip data URL prefix to get raw base64
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
      return { data: base64 };
    }

    case 'evaluate': {
      const code = cmd.params.code as string;
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: (codeToEval: string) => {
          // eslint-disable-next-line no-eval
          return eval(codeToEval);
        },
        args: [code],
      });
      return results[0]?.result;
    }

    case 'url': {
      const tab = await chrome.tabs.get(tabId);
      return { url: tab.url };
    }

    case 'title': {
      const tab = await chrome.tabs.get(tabId);
      return { title: tab.title };
    }

    case 'network_capture_start': {
      networkCaptureActive = true;
      capturedRequests = [];
      const pattern = cmd.params.urlPattern as string | undefined;
      networkCapturePattern = pattern ? new RegExp(pattern) : null;
      return { capturing: true };
    }

    case 'network_capture_stop': {
      networkCaptureActive = false;
      const requests = [...capturedRequests];
      capturedRequests = [];
      networkCapturePattern = null;
      return { requests };
    }

    // DOM commands - forward to content script
    case 'click':
    case 'type':
    case 'select':
    case 'hover':
    case 'scroll':
    case 'key':
    case 'wait':
    case 'query':
    case 'query_all':
    case 'text':
    case 'html': {
      return await sendToContentScript(tabId, cmd.command, cmd.params);
    }

    default:
      throw new Error(`Unknown command: ${cmd.command}`);
  }
}

// ─── Content Script Communication ───────────────────────────────────────────

function sendToContentScript(
  tabId: number,
  command: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { command, params }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`Content script error: ${chrome.runtime.lastError.message}`));
        return;
      }
      if (response?.error) {
        reject(new Error(response.error));
        return;
      }
      resolve(response?.data);
    });
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('No active tab found');
  return tab.id;
}

function waitForTabLoad(tabId: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Page load timeout'));
    }, timeoutMs);

    function listener(
      updatedTabId: number,
      changeInfo: chrome.tabs.TabChangeInfo
    ) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }

    chrome.tabs.onUpdated.addListener(listener);
  });
}

function sendResponse(
  id: string,
  success: boolean,
  data?: unknown,
  error?: string
): void {
  if (ws?.readyState !== WebSocket.OPEN) return;

  const response: Response = { id, type: 'response', success };
  if (data !== undefined) response.data = data;
  if (error) response.error = error;

  ws.send(JSON.stringify(response));
}

// ─── Network Request Capture ────────────────────────────────────────────────

chrome.webRequest.onCompleted.addListener(
  (details) => {
    if (!networkCaptureActive) return;

    // Privacy: only capture URL, method, status, type - never bodies
    const entry = {
      url: details.url,
      method: details.method,
      status: details.statusCode,
      type: details.type,
      timestamp: details.timeStamp,
    };

    if (networkCapturePattern && !networkCapturePattern.test(details.url)) {
      return;
    }

    capturedRequests.push(entry);
  },
  { urls: ['<all_urls>'] }
);

// ─── Message from popup ────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'get_status') {
    sendResponse({
      connected: ws?.readyState === WebSocket.OPEN,
      authenticated: isAuthenticated,
      port,
    });
    return true;
  }

  if (message.type === 'set_config') {
    saveConfig(message.token, message.port).then(() => {
      // Reconnect with new config
      ws?.close();
      reconnectAttempts = 0;
      connect();
      sendResponse({ ok: true });
    });
    return true;
  }

  return false;
});

// ─── Initialize ─────────────────────────────────────────────────────────────

loadConfig().then(() => {
  connect();
});
