# Agent Chrome Test

**Let AI agents control and test in your real Chrome browser.**

[![npm](https://img.shields.io/npm/v/@dtk/agent-chrome-test)](https://www.npmjs.com/package/@dtk/agent-chrome-test)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A Chrome extension + MCP server that gives AI agents (Claude Code, Cursor, custom agents) full browser control against your existing session — with your cookies, auth, and extensions already active.

---

## Why this instead of Playwright?

| | Playwright / Puppeteer | **Agent Chrome Test** |
|---|---|---|
| Browser | Launches a new blank browser | Your real Chrome, already logged in |
| Auth | Must re-authenticate every run | Sessions, cookies, extensions all there |
| Interface | Code API | MCP tools (works with any AI agent) |
| Assertions | Manual + library | Built-in test session + visual regression |
| Network | Interceptable via CDP | Capture & assert on real requests |
| Privacy | Data leaves machine | Everything stays on `127.0.0.1` |

---

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  AI Agent           │     │  Node.js Server       │     │  Chrome Ext     │
│                     │ MCP │                       │ WS  │  (MV3)          │
│  Claude Code        │────►│  MCP tools (25+)      │────►│                 │
│  Cursor             │     │  WebSocket bridge     │     │  Service Worker │
│  Custom agent       │     │  Visual regression    │     │  Content Script │
│                     │     │  Test sessions        │     │                 │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
      MCP or raw WS              ws://127.0.0.1:3695         Your Chrome
```

**Three layers:**
1. **Chrome Extension** (MV3) — Runs in your browser, executes browser actions
2. **Node.js Server** — Bridges agents to the extension, runs the MCP protocol, handles visual comparison
3. **Agent Interface** — 25+ MCP tools for AI clients, or raw WebSocket for custom agents

---

## Quick Start

### 1. Install the server

```bash
npm install -g @dtk/agent-chrome-test
```

Or use without installing:

```bash
npx @dtk/agent-chrome-test
```

### 2. Load the Chrome extension

Download or clone the repo, then:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select `packages/extension/dist`

> The extension needs to be loaded from source for now. A Chrome Web Store listing is planned.

### 3. Start the server

```bash
agent-chrome-test
# or: npx @dtk/agent-chrome-test
```

Output:

```
  agent-chrome-test server started

  WebSocket:  ws://127.0.0.1:3695
  Auth Token: abc123def456...

  Paste this token into the Chrome extension popup to connect.
  Audit log:  .agent-chrome-test/audit.log
```

### 4. Connect the extension

1. Click the extension icon in the Chrome toolbar
2. Paste the auth token from the terminal
3. Click **Connect** — badge turns green ✅

---

## MCP Configuration

### Claude Code

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "agent-chrome-test": {
      "command": "npx",
      "args": ["-y", "@dtk/agent-chrome-test"],
      "env": {
        "ACT_ALLOWED_ORIGINS": "localhost,127.0.0.1,myapp.local,staging.myapp.com"
      }
    }
  }
}
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "agent-chrome-test": {
      "command": "npx",
      "args": ["-y", "@dtk/agent-chrome-test"],
      "env": {
        "ACT_ALLOWED_ORIGINS": "localhost,127.0.0.1"
      }
    }
  }
}
```

### Cursor / other MCP clients

Use the same `command` + `args` pattern above — any MCP-compatible client works.

---

## MCP Tools Reference

### Browser Control

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_navigate` | `url` | Navigate active tab to URL |
| `browser_click` | `selector`, `doubleClick?` | Click element by CSS selector |
| `browser_type` | `selector`, `text`, `clear?` | Type into an input |
| `browser_select` | `selector`, `value` | Select a dropdown option |
| `browser_hover` | `selector` | Hover over element |
| `browser_scroll` | `direction`, `amount?`, `selector?` | Scroll page or element |
| `browser_key` | `key`, `modifiers?` | Press a keyboard key |
| `browser_wait` | `selector`, `state?`, `timeout?` | Wait for element state |

### Reading & Querying

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_screenshot` | — | Capture PNG screenshot, base64 encoded |
| `browser_query` | `selector` | Get element text, attributes, visibility |
| `browser_query_all` | `selector` | Get all matching elements (max 100) |
| `browser_text` | `selector?` | Get text content of page or element |
| `browser_html` | `selector?`, `outer?` | Get HTML content |
| `browser_evaluate` | `code` | Execute JS in page's main world |
| `browser_url` | — | Get current page URL |
| `browser_title` | — | Get current page title |

### Assertions

| Tool | Parameters | Description |
|------|-----------|-------------|
| `test_assert_element` | `selector`, `state` | Assert element `exists` / `visible` / `hidden` / `not_exists` |
| `test_assert_text` | `selector`, `expected`, `op?` | Assert text `contains` / `equals` / `matches` (regex) |
| `test_assert_url` | `expected`, `op?` | Assert current URL |
| `test_assert_count` | `selector`, `expected`, `op?` | Assert number of matching elements |

### Visual Regression

| Tool | Parameters | Description |
|------|-----------|-------------|
| `test_visual_compare` | `name`, `threshold?` | Compare screenshot to baseline. Creates baseline on first run. |
| `test_visual_update` | `name` | Update (overwrite) baseline screenshot |

Baselines are stored in `.agent-chrome-test/baselines/`. Diffs saved to `.agent-chrome-test/baselines/diffs/` when mismatches are found.

### Network Capture

| Tool | Parameters | Description |
|------|-----------|-------------|
| `network_capture_start` | `urlPattern?` | Start recording requests (optional regex filter) |
| `network_capture_stop` | — | Stop and return all captured requests |
| `network_assert_request` | `url`, `method?`, `status?` | Assert a request was made |

Captures: URL, method, status code, resource type, timestamp. **Never** request or response bodies.

### Test Sessions

| Tool | Parameters | Description |
|------|-----------|-------------|
| `test_session_start` | `name` | Start a named session to group assertions |
| `test_session_end` | — | End session, return pass/fail summary |

---

## Example Agent Workflow

Here's what an AI agent test session looks like:

```
agent → test_session_start { name: "checkout flow" }
agent → browser_navigate { url: "https://myapp.local/cart" }
agent → test_assert_element { selector: ".cart-item", state: "visible" }
agent → test_assert_count { selector: ".cart-item", expected: 3 }
agent → browser_click { selector: "[data-testid=checkout-btn]" }
agent → browser_wait { selector: "#payment-form", state: "visible" }
agent → test_assert_url { expected: "/checkout", op: "contains" }
agent → test_visual_compare { name: "checkout-page" }
agent → network_capture_start {}
agent → browser_click { selector: "[data-testid=submit-order]" }
agent → network_assert_request { url: "/api/orders", method: "POST", status: 201 }
agent → test_session_end {}
← { passed: 6, failed: 0, assertions: [...] }
```

---

## Raw WebSocket API

Connect directly without MCP — useful for custom agents or scripting:

```javascript
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const ws = new WebSocket('ws://127.0.0.1:3695');

ws.on('open', () => {
  // Authenticate first
  ws.send(JSON.stringify({ type: 'auth', token: 'TOKEN_FROM_TERMINAL' }));
});

ws.on('message', async (data) => {
  const msg = JSON.parse(data.toString());

  if (msg.type === 'auth_result' && msg.success) {
    // Send commands
    ws.send(JSON.stringify({
      id: randomUUID(),
      type: 'command',
      command: 'navigate',
      params: { url: 'https://example.com' }
    }));
  }

  // Responses are matched by id
  if (msg.type === 'response') {
    console.log(msg.data);
  }
});
```

### Message format

**Command (client → extension):**
```typescript
{
  id: string;       // UUID — used to match response
  type: 'command';
  command: string;  // e.g. 'navigate', 'click', 'screenshot'
  params: Record<string, unknown>;
}
```

**Response (extension → client):**
```typescript
{
  id: string;       // Matches command id
  type: 'response';
  success: boolean;
  data?: unknown;
  error?: string;
}
```

---

## Security Design

Security is a first-class concern, not an afterthought.

### Localhost-only binding
The WebSocket server binds to `127.0.0.1` only — never `0.0.0.0`. No traffic leaves your machine.

### Token authentication
A cryptographically random 32-byte token is generated on each server start. The extension must provide it on the WebSocket handshake. Token comparison uses constant-time equality to prevent timing attacks.

### URL allowlist
Agents can only navigate to origins you configure. Default: `localhost` and `127.0.0.1`. Attempts to navigate outside the allowlist throw an error.

### Audit log
Every agent action is logged to `.agent-chrome-test/audit.log` with timestamp, command, and parameters. The file is created with mode `0o600` (owner read/write only). Agents cannot disable or modify it.

### No telemetry
Zero external network calls. Nothing is phoned home. All data (screenshots, sessions, baselines) stays in your project directory.

### Minimal Chrome permissions
```json
["activeTab", "scripting", "storage", "webRequest", "tabs"]
```

No `cookies`, `history`, `bookmarks`, or `passwords` permissions. `webRequest` is read-only (no blocking).

### Network capture privacy
Only records URL, method, status code, and resource type. **Never** request or response bodies.

### Prompt injection defense
Commands come from the local server (trusted). Web page content is never interpreted as commands. DOM content returned to agents is sanitized.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACT_PORT` | `3695` | WebSocket port |
| `ACT_ALLOWED_ORIGINS` | `localhost,127.0.0.1` | Comma-separated origins agents can navigate to |

---

## Building from Source

Requires Node.js ≥ 18 and pnpm.

```bash
git clone https://github.com/hobbitTk/agent-chrome-test
cd agent-chrome-test
pnpm install

# Build all packages
pnpm --filter @agent-chrome-test/shared build
pnpm --filter @agent-chrome-test/extension build
pnpm --filter @dtk/agent-chrome-test build
```

Or use the root build script:

```bash
pnpm build
```

### Project structure

```
agent-chrome-test/
├── packages/
│   ├── shared/        # Shared protocol types (TypeScript)
│   ├── extension/     # Chrome Extension (MV3)
│   │   ├── manifest.json
│   │   └── src/
│   │       ├── service-worker.ts   # WebSocket client, command routing
│   │       ├── content-script.ts   # DOM operations
│   │       └── popup/              # Connection UI
│   └── server/        # MCP server + WebSocket bridge (published to npm)
│       └── src/
│           ├── index.ts            # Entry point
│           ├── mcp-server.ts       # 25+ MCP tools
│           ├── ws-bridge.ts        # WebSocket server, auth, audit log
│           ├── session.ts          # Test session tracking
│           └── visual/
│               ├── compare.ts      # pixelmatch screenshot comparison
│               └── store.ts        # Baseline file management
└── README.md
```

---

## Troubleshooting

**Extension badge stays gray after clicking Connect**
- Make sure the server is running (`npx @dtk/agent-chrome-test`)
- Check that you pasted the token correctly (no leading/trailing spaces)
- Reload the extension at `chrome://extensions` and try again

**"Extension not connected" error in MCP tools**
- The extension must be connected before MCP tools can work
- Start the server, connect the extension, then use the tools

**"URL not in allowlist" error**
- Add the domain to `ACT_ALLOWED_ORIGINS` in your MCP config
- Example: `"ACT_ALLOWED_ORIGINS": "localhost,myapp.local,staging.example.com"`

**Commands time out**
- Check the active tab — the extension operates on the currently active tab
- Some pages (chrome://, PDF viewer, etc.) don't support content scripts

---

## License

MIT — see [LICENSE](LICENSE)
