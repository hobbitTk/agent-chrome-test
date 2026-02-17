# Agent Chrome Test

AI agents can control and test in your real Chrome browser.

Unlike Playwright/Puppeteer, this works against your **existing Chrome session** — with your cookies, auth, and extensions already active. Unlike generic browser automation tools, it's purpose-built for **testing**: assertions, visual regression, network validation, and test session management.

## Architecture

```
┌─────────────────────┐     ┌──────────────────┐     ┌────────────────┐
│  AI Agent           │     │  Server (Node.js) │     │  Chrome Ext    │
│  (Claude Code,      │────►│                   │────►│  (MV3)         │
│   Cursor, custom)   │     │  MCP Server       │     │                │
│                     │ MCP │  + WebSocket API  │ WS  │  Service Worker│
│                     │ or  │  + Visual Compare │     │  Content Script│
│                     │ WS  │  + Test Sessions  │     │                │
└─────────────────────┘     └──────────────────┘     └────────────────┘
```

## Features

- **Browser control** — navigate, click, type, scroll, keyboard, hover
- **DOM querying** — element text, attributes, visibility, full HTML
- **Assertions** — element state, text content, URL, element count
- **Visual regression** — screenshot comparison with pixelmatch diff images
- **Network capture** — record and assert on HTTP requests (URL/method/status)
- **Test sessions** — group assertions, get pass/fail summary
- **JS evaluation** — run arbitrary code in page's main world
- **Audit log** — every agent action logged locally, nothing sent externally

## Quick Start

### 1. Install dependencies and build

```bash
pnpm install && pnpm build
```

Or build packages individually:

```bash
cd packages/shared && npx tsc
cd ../extension && node build.mjs
cd ../server && npx tsc
```

### 2. Load the Chrome extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select `packages/extension/dist`

The extension icon should appear in the toolbar with an "OFF" badge.

### 3. Start the server

```bash
node packages/server/dist/index.js
```

The terminal will print the auth token:

```
  agent-chrome-test server started

  WebSocket:  ws://127.0.0.1:3695
  Auth Token: abc123...

  Paste this token into the Chrome extension popup to connect.
```

### 4. Connect the extension

1. Click the extension icon in the Chrome toolbar
2. Paste the auth token from the terminal
3. Port should already be `3695`
4. Click **Connect**
5. Badge turns green — extension is live

## MCP Configuration (Claude Code)

Add to your Claude Code MCP settings (`~/.claude/settings.json` or project `.mcp.json`):

```json
{
  "mcpServers": {
    "agent-chrome-test": {
      "command": "node",
      "args": ["/path/to/agent-chrome-test/packages/server/dist/index.js"],
      "env": {
        "ACT_ALLOWED_ORIGINS": "localhost,127.0.0.1,myapp.local"
      }
    }
  }
}
```

## Available MCP Tools

### Browser Control

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_navigate` | `url` | Navigate active tab to URL |
| `browser_click` | `selector`, `doubleClick?` | Click element by CSS selector |
| `browser_type` | `selector`, `text`, `clear?` | Type text into input |
| `browser_select` | `selector`, `value` | Select dropdown option |
| `browser_hover` | `selector` | Hover over element |
| `browser_scroll` | `direction`, `amount?`, `selector?` | Scroll page or element |
| `browser_key` | `key`, `modifiers?` | Press keyboard key |
| `browser_wait` | `selector`, `state?`, `timeout?` | Wait for element state |

### Reading & Querying

| Tool | Parameters | Description |
|------|-----------|-------------|
| `browser_screenshot` | — | Capture screenshot, returns base64 PNG |
| `browser_query` | `selector` | Get element text, attributes, visibility |
| `browser_query_all` | `selector` | Get all matching elements (max 100) |
| `browser_text` | `selector?` | Get text content of page or element |
| `browser_html` | `selector?`, `outer?` | Get HTML content |
| `browser_evaluate` | `code` | Execute JS in page, return result |
| `browser_url` | — | Get current page URL |
| `browser_title` | — | Get current page title |

### Testing & Assertions

| Tool | Parameters | Description |
|------|-----------|-------------|
| `test_assert_element` | `selector`, `state` | Assert element exists/visible/hidden |
| `test_assert_text` | `selector`, `expected`, `op?` | Assert text contains/equals/matches |
| `test_assert_url` | `expected`, `op?` | Assert current URL |
| `test_assert_count` | `selector`, `expected`, `op?` | Assert number of matching elements |
| `test_visual_compare` | `name`, `threshold?` | Compare screenshot against baseline |
| `test_visual_update` | `name` | Update baseline screenshot |

### Network

| Tool | Parameters | Description |
|------|-----------|-------------|
| `network_capture_start` | `urlPattern?` | Start capturing network requests |
| `network_capture_stop` | — | Stop and return captured requests |
| `network_assert_request` | `url`, `method?`, `status?` | Assert a request was made |

### Session Management

| Tool | Parameters | Description |
|------|-----------|-------------|
| `test_session_start` | `name` | Start a named test session |
| `test_session_end` | — | End session, return pass/fail summary |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ACT_PORT` | `3695` | WebSocket port |
| `ACT_ALLOWED_ORIGINS` | `localhost,127.0.0.1` | Comma-separated list of allowed origins for navigation |

## Security

- **Localhost-only** — WebSocket server binds to `127.0.0.1`, never `0.0.0.0`
- **Token auth** — random 32-byte token required on every connection, timing-safe comparison
- **URL allowlist** — agents can only navigate to configured origins, not arbitrary URLs
- **Audit log** — all agent actions logged to `.agent-chrome-test/audit.log`
- **No telemetry** — zero external network calls, everything stays on your machine
- **Minimal permissions** — no cookies, history, bookmarks, or password access
- **Network privacy** — only records URL/method/status, never request or response bodies

## WebSocket API

You can also connect directly without MCP using any WebSocket client:

```javascript
// test-client.mjs
import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const ws = new WebSocket('ws://127.0.0.1:3695');

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'auth', token: 'PASTE_TOKEN_HERE' }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'auth_result' && msg.success) {
    ws.send(JSON.stringify({
      id: randomUUID(),
      type: 'command',
      command: 'navigate',
      params: { url: 'https://example.com' }
    }));
  }
});
```
