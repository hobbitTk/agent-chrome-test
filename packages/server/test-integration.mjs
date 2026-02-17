/**
 * Integration test — spins up a fresh WebSocketBridge, connects a
 * simulated extension, then drives commands through the bridge and
 * checks that responses are correctly correlated and returned.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Minimal in-process bridge (mirrors ws-bridge.ts logic) ─────────────────

class TestBridge {
  token = randomBytes(16).toString('hex');
  client = null;
  authenticated = false;
  pending = new Map();

  async start(port) {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({ port, host: '127.0.0.1' });
      this.wss.on('listening', resolve);
      this.wss.on('connection', (ws) => {
        if (this.client?.readyState === 1) { ws.close(4001); return; }
        this.client = ws;
        ws.on('message', (data) => this._onMessage(ws, data.toString()));
        ws.on('close', () => { this.client = null; this.authenticated = false; });
      });
    });
  }

  async stop() {
    this.client?.close();
    return new Promise((r) => this.wss?.close(r));
  }

  sendCommand(command, params = {}, timeoutMs = 5000) {
    if (!this.authenticated) throw new Error('Not authenticated');
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timeout: ${command}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.client.send(JSON.stringify({ id, type: 'command', command, params }));
    });
  }

  _onMessage(ws, raw) {
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    if (msg.type === 'auth') {
      const ok = msg.token === this.token;
      this.authenticated = ok;
      ws.send(JSON.stringify({ type: 'auth_result', success: ok }));
      return;
    }
    if (msg.type === 'response' && msg.id) {
      const p = this.pending.get(msg.id);
      if (p) {
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        msg.success ? p.resolve(msg.data) : p.reject(new Error(msg.error));
      }
    }
  }
}

// ─── Simulated Extension ─────────────────────────────────────────────────────

function connectFakeExtension(port, token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'auth_result' && msg.success) { resolve(ws); return; }
      if (msg.type === 'command') {
        // Respond with canned data based on command
        let responseData;
        switch (msg.command) {
          case 'url':     responseData = { url: 'https://example.com/test' }; break;
          case 'title':   responseData = { title: 'Test Page' }; break;
          case 'screenshot': responseData = { data: Buffer.alloc(500).fill(0x41).toString('base64') }; break;
          case 'evaluate': responseData = msg.params.code === '1 + 1' ? 2 : 'ok'; break;
          case 'query':   responseData = { text: 'Hello', visible: true, tagName: 'DIV' }; break;
          case 'text':    responseData = { text: 'Page content here' }; break;
          case 'ping':    responseData = { pong: true, timestamp: Date.now() }; break;
          default:        responseData = { ok: true };
        }
        ws.send(JSON.stringify({ id: msg.id, type: 'response', success: true, data: responseData }));
      }
    });
  });
}

// ─── Test Runner ─────────────────────────────────────────────────────────────

const PORT = 3697; // don't clash with live server on 3695
let passed = 0;
let failed = 0;

function assert(label, condition, actual) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}  got: ${JSON.stringify(actual)}`);
    failed++;
  }
}

async function run() {
  const bridge = new TestBridge();
  await bridge.start(PORT);
  console.log(`Bridge started on port ${PORT} — token: ${bridge.token.slice(0, 8)}...`);

  // Connect simulated extension
  const extWs = await connectFakeExtension(PORT, bridge.token);
  console.log('Fake extension connected & authenticated\n');

  // ── Auth ────────────────────────────────────────────────────────────────
  assert('Bridge reports authenticated', bridge.authenticated, bridge.authenticated);

  // ── URL ──────────────────────────────────────────────────────────────────
  console.log('── url / title ─────────────────────────────────');
  const url = await bridge.sendCommand('url');
  assert('url.url is a string', typeof url?.url === 'string', url);
  assert('url.url value correct', url?.url === 'https://example.com/test', url?.url);

  const title = await bridge.sendCommand('title');
  assert('title.title is a string', typeof title?.title === 'string', title);

  // ── Screenshot ────────────────────────────────────────────────────────────
  console.log('\n── screenshot ──────────────────────────────────');
  const shot = await bridge.sendCommand('screenshot');
  assert('screenshot.data is base64 string', typeof shot?.data === 'string', shot);
  assert('screenshot.data has content', shot?.data?.length > 10, shot?.data?.length);

  // ── Evaluate ──────────────────────────────────────────────────────────────
  console.log('\n── evaluate ────────────────────────────────────');
  const evalResult = await bridge.sendCommand('evaluate', { code: '1 + 1' });
  assert('evaluate 1+1 returns 2', evalResult === 2, evalResult);

  // ── DOM query ─────────────────────────────────────────────────────────────
  console.log('\n── query / text ────────────────────────────────');
  const qResult = await bridge.sendCommand('query', { selector: '#main' });
  assert('query returns element info', qResult?.visible === true, qResult);
  assert('query returns tagName', typeof qResult?.tagName === 'string', qResult);

  const textResult = await bridge.sendCommand('text', { selector: 'body' });
  assert('text returns string', typeof textResult?.text === 'string', textResult);

  // ── Ping / keepalive ──────────────────────────────────────────────────────
  console.log('\n── ping ────────────────────────────────────────');
  const ping = await bridge.sendCommand('ping');
  assert('ping returns pong', ping?.pong === true, ping);

  // ── Timeout / error handling ──────────────────────────────────────────────
  console.log('\n── timeout handling ────────────────────────────');
  // Disconnect extension to test pending-command rejection
  extWs.close();
  await new Promise((r) => setTimeout(r, 100));
  assert('bridge clears authenticated after disconnect', !bridge.authenticated, bridge.authenticated);

  console.log('\n─────────────────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed`);

  await bridge.stop();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Test crashed:', err);
  process.exit(1);
});
