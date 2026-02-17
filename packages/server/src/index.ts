/**
 * Server Entry Point
 *
 * Starts the WebSocket bridge and MCP server.
 * Displays auth token for the extension to connect.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketBridge } from './ws-bridge.js';
import { createMcpServer } from './mcp-server.js';
import { TestSession } from './session.js';
import { BaselineStore } from './visual/store.js';
import { join } from 'node:path';

const DEFAULT_PORT = 3695;
const DATA_DIR = join(process.cwd(), '.agent-chrome-test');

async function main(): Promise<void> {
  const port = parseInt(process.env.ACT_PORT ?? '', 10) || DEFAULT_PORT;
  const allowedOrigins = process.env.ACT_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()) ?? [];

  // Check if running in MCP mode (stdin is piped) or standalone
  const isMcpMode = !process.stdin.isTTY;

  // Create WebSocket bridge
  const bridge = new WebSocketBridge({
    port,
    auditLogDir: DATA_DIR,
    allowedOrigins,
  });

  bridge.onConnect(() => {
    if (!isMcpMode) {
      console.log('\x1b[32m[connected]\x1b[0m Chrome extension connected and authenticated');
    }
  });

  bridge.onDisconnect(() => {
    if (!isMcpMode) {
      console.log('\x1b[33m[disconnected]\x1b[0m Chrome extension disconnected');
    }
  });

  // Start WebSocket server
  await bridge.start();

  if (isMcpMode) {
    // MCP mode: communicate via stdin/stdout
    // Log to stderr so it doesn't interfere with MCP protocol
    console.error(`[agent-chrome-test] WebSocket server on ws://127.0.0.1:${port}`);
    console.error(`[agent-chrome-test] Auth token: ${bridge.token}`);

    const session = new TestSession();
    const baselineStore = new BaselineStore(join(DATA_DIR, 'baselines'));
    const mcpServer = createMcpServer(bridge, session, baselineStore);
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
  } else {
    // Standalone mode: print info to terminal
    console.log('');
    console.log('  \x1b[1magent-chrome-test\x1b[0m server started');
    console.log('');
    console.log(`  WebSocket:  ws://127.0.0.1:${port}`);
    console.log(`  Auth Token: \x1b[36m${bridge.token}\x1b[0m`);
    console.log('');
    console.log('  Paste this token into the Chrome extension popup to connect.');
    console.log('  Audit log:  ' + join(DATA_DIR, 'audit.log'));
    console.log('');
    console.log('  Waiting for extension to connect...');
    console.log('');

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('\n  Shutting down...');
      await bridge.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
