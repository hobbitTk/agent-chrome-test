import WebSocket from 'ws';
import { randomUUID } from 'node:crypto';

const TOKEN = process.env.TOKEN ?? 'f4c0c0c08dd35468d48d31962a78d5ef939d933c1349b034efe5b9a72c455355';
const ws = new WebSocket('ws://127.0.0.1:3695');

let passed = 0;
let failed = 0;

function assert(label, condition, actual) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label} — got: ${JSON.stringify(actual)}`);
    failed++;
  }
}

function send(command, params = {}) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${command}`)), 10000);
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, type: 'command', command, params }));
  });
}

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'auth', token: TOKEN }));
});

ws.on('message', async (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type !== 'auth_result') return;

  try {
    assert('Auth succeeds', msg.success === true, msg);

    console.log('\n── URL & Title ──────────────────────────────');
    const urlRes = await send('url');
    assert('url returns a string', typeof urlRes.data?.url === 'string', urlRes.data);
    const titleRes = await send('title');
    assert('title returns a string', typeof titleRes.data?.title === 'string', titleRes.data);
    console.log(`     page:  ${urlRes.data?.url}`);
    console.log(`     title: ${titleRes.data?.title}`);

    console.log('\n── Screenshot ──────────────────────────────');
    const shotRes = await send('screenshot');
    assert('screenshot returns base64 PNG', typeof shotRes.data?.data === 'string' && shotRes.data.data.length > 100, shotRes.data);
    if (shotRes.data?.data) {
      console.log(`     PNG size: ~${Math.round(shotRes.data.data.length * 0.75 / 1024)} KB`);
    }

    console.log('\n── Evaluate JS ─────────────────────────────');
    const e1 = await send('evaluate', { code: '1 + 1' });
    assert('evaluate: 1+1 = 2', e1.data === 2, e1.data);
    const e2 = await send('evaluate', { code: 'typeof document.title' });
    assert('evaluate: document.title is string', e2.data === 'string', e2.data);

    console.log('\n── Ping ────────────────────────────────────');
    const pingRes = await send('ping');
    assert('ping returns pong', pingRes.data?.pong === true, pingRes.data);

  } catch (err) {
    console.error('Test error:', err.message);
    failed++;
  }

  console.log('\n─────────────────────────────────────────────');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  ws.close();
  process.exit(failed > 0 ? 1 : 0);
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Overall timeout — no auth_result received');
  process.exit(1);
}, 15000);
