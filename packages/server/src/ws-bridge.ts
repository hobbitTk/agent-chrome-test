/**
 * WebSocket Bridge
 *
 * Server-side WebSocket that connects to the Chrome extension.
 * Handles auth token verification, command dispatching, and response correlation.
 *
 * Security:
 * - Binds to 127.0.0.1 only (never 0.0.0.0)
 * - Token-based authentication on handshake
 * - All commands logged to audit log
 */

import { WebSocketServer, WebSocket } from 'ws';
import { randomBytes } from 'node:crypto';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type {
  Command,
  Response,
  CommandName,
} from '@agent-chrome-test/shared';

export interface BridgeOptions {
  port: number;
  auditLogDir: string;
  allowedOrigins?: string[];
}

interface PendingCommand {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WebSocketBridge {
  private wss: WebSocketServer | null = null;
  private client: WebSocket | null = null;
  private authToken: string;
  private isAuthenticated = false;
  private pending = new Map<string, PendingCommand>();
  private auditLogPath: string;
  private allowedOrigins: string[];
  private onConnectCallbacks: Array<() => void> = [];
  private onDisconnectCallbacks: Array<() => void> = [];

  constructor(private options: BridgeOptions) {
    // Generate cryptographically random auth token
    this.authToken = randomBytes(32).toString('hex');
    this.allowedOrigins = options.allowedOrigins ?? [];

    // Set up audit log
    if (!existsSync(options.auditLogDir)) {
      mkdirSync(options.auditLogDir, { recursive: true, mode: 0o700 });
    }
    this.auditLogPath = join(options.auditLogDir, 'audit.log');
  }

  get token(): string {
    return this.authToken;
  }

  get connected(): boolean {
    return this.client?.readyState === WebSocket.OPEN && this.isAuthenticated;
  }

  onConnect(cb: () => void): void {
    this.onConnectCallbacks.push(cb);
  }

  onDisconnect(cb: () => void): void {
    this.onDisconnectCallbacks.push(cb);
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new WebSocketServer({
        port: this.options.port,
        host: '127.0.0.1', // SECURITY: localhost only
      });

      this.wss.on('listening', () => {
        resolve();
      });

      this.wss.on('connection', (ws) => {
        // Only allow one client at a time
        if (this.client?.readyState === WebSocket.OPEN) {
          ws.close(4001, 'Another client is already connected');
          return;
        }

        this.client = ws;
        this.isAuthenticated = false;

        ws.on('message', (data) => {
          this.handleMessage(ws, data.toString());
        });

        ws.on('close', () => {
          if (this.client === ws) {
            this.client = null;
            this.isAuthenticated = false;
            // Reject all pending commands
            for (const [id, pending] of this.pending) {
              pending.reject(new Error('Extension disconnected'));
              clearTimeout(pending.timer);
              this.pending.delete(id);
            }
            for (const cb of this.onDisconnectCallbacks) cb();
          }
        });
      });
    });
  }

  async stop(): Promise<void> {
    // Reject all pending
    for (const [id, pending] of this.pending) {
      pending.reject(new Error('Server shutting down'));
      clearTimeout(pending.timer);
      this.pending.delete(id);
    }

    this.client?.close();

    return new Promise((resolve) => {
      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  /**
   * Send a command to the extension and wait for the response.
   */
  async sendCommand(
    command: CommandName,
    params: Record<string, unknown> = {},
    timeoutMs = 30_000
  ): Promise<unknown> {
    if (!this.connected) {
      throw new Error('Extension not connected. Make sure the Chrome extension is running and authenticated.');
    }

    const id = crypto.randomUUID();
    const cmd: Command = {
      id,
      type: 'command',
      command,
      params,
    };

    // Audit log
    this.audit(command, params);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });
      this.client!.send(JSON.stringify(cmd));
    });
  }

  private handleMessage(ws: WebSocket, raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return; // ignore malformed messages
    }

    // Handle authentication
    if (msg.type === 'auth') {
      const valid =
        typeof msg.token === 'string' &&
        msg.token.length > 0 &&
        timingSafeEqual(msg.token, this.authToken);

      if (valid) {
        this.isAuthenticated = true;
        ws.send(
          JSON.stringify({
            type: 'auth_result',
            success: true,
            allowedOrigins: this.allowedOrigins,
          })
        );
        for (const cb of this.onConnectCallbacks) cb();
      } else {
        ws.send(
          JSON.stringify({
            type: 'auth_result',
            success: false,
            error: 'Invalid auth token',
          })
        );
        this.audit('auth_failed', { extensionId: msg.extensionId });
      }
      return;
    }

    // Handle response to a pending command
    if (msg.type === 'response' && msg.id) {
      const pending = this.pending.get(msg.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pending.delete(msg.id);

        if (msg.success) {
          pending.resolve(msg.data);
        } else {
          pending.reject(new Error(msg.error ?? 'Command failed'));
        }
      }
      return;
    }

    // Handle ping from keepalive
    if (msg.type === 'command' && msg.command === 'ping') {
      ws.send(
        JSON.stringify({
          id: msg.id,
          type: 'response',
          success: true,
          data: { pong: true },
        })
      );
      return;
    }
  }

  private audit(action: string, params: Record<string, unknown> = {}): void {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      params: sanitizeForLog(params),
    };

    try {
      appendFileSync(this.auditLogPath, JSON.stringify(entry) + '\n', {
        mode: 0o600,
      });
    } catch {
      // Don't crash if audit log write fails
    }
  }
}

// ─── Security Helpers ───────────────────────────────────────────────────────

/**
 * Constant-time string comparison to prevent timing attacks on auth token.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

/**
 * Remove potentially sensitive data from audit log entries.
 */
function sanitizeForLog(
  params: Record<string, unknown>
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string' && value.length > 200) {
      sanitized[key] = value.slice(0, 200) + '...[truncated]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
