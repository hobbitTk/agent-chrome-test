/**
 * Shared protocol types for communication between CLI server and Chrome extension.
 * All messages are JSON-serialized over WebSocket.
 */

// ─── Message Types ──────────────────────────────────────────────────────────

/** Command sent from server to extension */
export interface Command {
  id: string;
  type: 'command';
  command: CommandName;
  params: Record<string, unknown>;
  tabId?: number; // defaults to active tab
}

/** Response from extension to server */
export interface Response {
  id: string; // correlates with command.id
  type: 'response';
  success: boolean;
  data?: unknown;
  error?: string;
}

/** Unsolicited event from extension to server */
export interface ExtensionEvent {
  type: 'event';
  event: EventName;
  data: unknown;
}

/** Authentication message from extension on connect */
export interface AuthMessage {
  type: 'auth';
  token: string;
  extensionId: string;
}

/** Auth response from server */
export interface AuthResponse {
  type: 'auth_result';
  success: boolean;
  error?: string;
}

export type Message = Command | Response | ExtensionEvent | AuthMessage | AuthResponse;

// ─── Command Names ──────────────────────────────────────────────────────────

export type CommandName =
  // Browser control
  | 'navigate'
  | 'click'
  | 'type'
  | 'select'
  | 'hover'
  | 'scroll'
  | 'key'
  | 'wait'
  // Reading & querying
  | 'screenshot'
  | 'query'
  | 'query_all'
  | 'text'
  | 'html'
  | 'evaluate'
  | 'url'
  | 'title'
  // Network
  | 'network_capture_start'
  | 'network_capture_stop'
  // Lifecycle
  | 'ping';

// ─── Event Names ────────────────────────────────────────────────────────────

export type EventName =
  | 'connected'
  | 'disconnected'
  | 'network_request'
  | 'page_load'
  | 'page_error';

// ─── Command Parameter Types ────────────────────────────────────────────────

export interface NavigateParams {
  url: string;
}

export interface ClickParams {
  selector: string;
  button?: 'left' | 'right' | 'middle';
  doubleClick?: boolean;
}

export interface TypeParams {
  selector: string;
  text: string;
  clear?: boolean; // clear existing text first
}

export interface SelectParams {
  selector: string;
  value: string;
}

export interface HoverParams {
  selector: string;
}

export interface ScrollParams {
  direction: 'up' | 'down' | 'left' | 'right';
  amount?: number; // pixels, default 300
  selector?: string; // scroll within element
}

export interface KeyParams {
  key: string; // e.g. 'Enter', 'Escape', 'Tab'
  modifiers?: Array<'ctrl' | 'shift' | 'alt' | 'meta'>;
}

export interface WaitParams {
  selector: string;
  state?: 'visible' | 'hidden' | 'attached' | 'detached';
  timeout?: number; // ms, default 5000
}

export interface ScreenshotParams {
  fullPage?: boolean;
  selector?: string; // screenshot specific element
}

export interface QueryParams {
  selector: string;
}

export interface TextParams {
  selector?: string; // defaults to body
}

export interface HtmlParams {
  selector?: string;
  outer?: boolean;
}

export interface EvaluateParams {
  code: string;
  args?: unknown[];
}

export interface NetworkCaptureStartParams {
  urlPattern?: string; // regex pattern to filter
}

// ─── Response Data Types ────────────────────────────────────────────────────

export interface QueryResult {
  text: string;
  tagName: string;
  attributes: Record<string, string>;
  visible: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
}

export interface ScreenshotResult {
  data: string; // base64 PNG
  width: number;
  height: number;
}

export interface NetworkRequest {
  url: string;
  method: string;
  status: number;
  type: string; // 'xmlhttprequest', 'fetch', 'document', etc.
  timestamp: number;
  headers?: Record<string, string>; // response headers (opt-in)
}

// ─── Utility ────────────────────────────────────────────────────────────────

/** Generate a unique message ID */
export function generateId(): string {
  return crypto.randomUUID();
}

/** Create a command message */
export function createCommand(
  command: CommandName,
  params: Record<string, unknown> = {},
  tabId?: number
): Command {
  return {
    id: generateId(),
    type: 'command',
    command,
    params,
    tabId,
  };
}

/** Create a success response */
export function createResponse(id: string, data?: unknown): Response {
  return { id, type: 'response', success: true, data };
}

/** Create an error response */
export function createErrorResponse(id: string, error: string): Response {
  return { id, type: 'response', success: false, error };
}

/** Type guard for Command */
export function isCommand(msg: Message): msg is Command {
  return msg.type === 'command';
}

/** Type guard for Response */
export function isResponse(msg: Message): msg is Response {
  return msg.type === 'response';
}

/** Type guard for Event */
export function isEvent(msg: Message): msg is ExtensionEvent {
  return msg.type === 'event';
}

/** Type guard for Auth */
export function isAuth(msg: Message): msg is AuthMessage {
  return msg.type === 'auth';
}
