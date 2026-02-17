const portInput = document.getElementById('port') as HTMLInputElement;
const tokenInput = document.getElementById('token') as HTMLInputElement;
const connectBtn = document.getElementById('connect') as HTMLButtonElement;
const statusDiv = document.getElementById('status') as HTMLDivElement;
const statusText = document.getElementById('statusText') as HTMLSpanElement;

// Load current status
chrome.runtime.sendMessage({ type: 'get_status' }, (response) => {
  if (response) {
    portInput.value = String(response.port || 3695);
    updateStatusUI(response.connected, response.authenticated);
  }
});

// Load saved token
chrome.storage.local.get(['authToken', 'port'], (result) => {
  if (result.authToken) tokenInput.value = result.authToken;
  if (result.port) portInput.value = String(result.port);
});

connectBtn.addEventListener('click', () => {
  const port = parseInt(portInput.value, 10);
  const token = tokenInput.value.trim();

  if (!token) {
    tokenInput.focus();
    return;
  }

  if (port < 1024 || port > 65535) {
    portInput.focus();
    return;
  }

  chrome.runtime.sendMessage(
    { type: 'set_config', token, port },
    () => {
      statusText.textContent = 'Connecting...';
    }
  );
});

// Listen for status updates from service worker
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'status') {
    updateStatusUI(
      message.status === 'connected',
      message.status === 'connected'
    );
  }
});

function updateStatusUI(connected: boolean, authenticated: boolean): void {
  statusDiv.className = `status ${connected ? (authenticated ? 'connected' : 'error') : 'disconnected'}`;
  if (connected && authenticated) {
    statusText.textContent = 'Connected & Authenticated';
  } else if (connected) {
    statusText.textContent = 'Connected (not authenticated)';
  } else {
    statusText.textContent = 'Disconnected';
  }
}
