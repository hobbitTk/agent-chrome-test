/**
 * MCP Server
 *
 * Exposes browser control and testing tools via the Model Context Protocol.
 * Wraps the WebSocket bridge to provide a standard MCP interface.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { WebSocketBridge } from './ws-bridge.js';
import type { TestSession } from './session.js';
import { compareScreenshots } from './visual/compare.js';
import { BaselineStore } from './visual/store.js';

export function createMcpServer(bridge: WebSocketBridge, session: TestSession, baselineStore: BaselineStore): McpServer {
  const server = new McpServer({
    name: 'agent-chrome-test',
    version: '0.1.0',
  });

  // ─── Browser Control Tools ──────────────────────────────────────────────

  server.tool(
    'browser_navigate',
    'Navigate the active Chrome tab to a URL',
    { url: z.string().describe('The URL to navigate to') },
    async ({ url }) => {
      const result = await bridge.sendCommand('navigate', { url });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_click',
    'Click an element by CSS selector',
    {
      selector: z.string().describe('CSS selector for the element to click'),
      doubleClick: z.boolean().optional().describe('Double-click instead of single click'),
    },
    async ({ selector, doubleClick }) => {
      const result = await bridge.sendCommand('click', { selector, doubleClick });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_type',
    'Type text into an input element',
    {
      selector: z.string().describe('CSS selector for the input element'),
      text: z.string().describe('Text to type'),
      clear: z.boolean().optional().describe('Clear existing text before typing'),
    },
    async ({ selector, text, clear }) => {
      const result = await bridge.sendCommand('type', { selector, text, clear });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_select',
    'Select an option from a dropdown',
    {
      selector: z.string().describe('CSS selector for the select element'),
      value: z.string().describe('Option value or text to select'),
    },
    async ({ selector, value }) => {
      const result = await bridge.sendCommand('select', { selector, value });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_hover',
    'Hover over an element',
    { selector: z.string().describe('CSS selector for the element') },
    async ({ selector }) => {
      const result = await bridge.sendCommand('hover', { selector });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_scroll',
    'Scroll the page or an element',
    {
      direction: z.enum(['up', 'down', 'left', 'right']).describe('Scroll direction'),
      amount: z.number().optional().describe('Pixels to scroll (default 300)'),
      selector: z.string().optional().describe('CSS selector to scroll within'),
    },
    async ({ direction, amount, selector }) => {
      const result = await bridge.sendCommand('scroll', { direction, amount, selector });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_key',
    'Press a keyboard key',
    {
      key: z.string().describe('Key to press (e.g. Enter, Escape, Tab, a, 1)'),
      modifiers: z.array(z.enum(['ctrl', 'shift', 'alt', 'meta'])).optional().describe('Modifier keys'),
    },
    async ({ key, modifiers }) => {
      const result = await bridge.sendCommand('key', { key, modifiers });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_wait',
    'Wait for an element to appear or disappear',
    {
      selector: z.string().describe('CSS selector to wait for'),
      state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().describe('Desired state (default: visible)'),
      timeout: z.number().optional().describe('Timeout in ms (default: 5000)'),
    },
    async ({ selector, state, timeout }) => {
      const result = await bridge.sendCommand('wait', { selector, state, timeout });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // ─── Reading & Querying Tools ───────────────────────────────────────────

  server.tool(
    'browser_screenshot',
    'Capture a screenshot of the active tab. Returns base64 PNG.',
    {},
    async () => {
      const result = await bridge.sendCommand('screenshot', {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_query',
    'Query a DOM element - get its text, attributes, visibility, bounding box',
    { selector: z.string().describe('CSS selector') },
    async ({ selector }) => {
      const result = await bridge.sendCommand('query', { selector });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_query_all',
    'Query all matching DOM elements (max 100)',
    { selector: z.string().describe('CSS selector') },
    async ({ selector }) => {
      const result = await bridge.sendCommand('query_all', { selector });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_text',
    'Get text content of the page or a specific element',
    { selector: z.string().optional().describe('CSS selector (defaults to body)') },
    async ({ selector }) => {
      const result = await bridge.sendCommand('text', { selector });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_html',
    'Get HTML content of the page or a specific element',
    {
      selector: z.string().optional().describe('CSS selector (defaults to body)'),
      outer: z.boolean().optional().describe('Include outer HTML'),
    },
    async ({ selector, outer }) => {
      const result = await bridge.sendCommand('html', { selector, outer });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_evaluate',
    'Execute JavaScript in the page context and return the result. Code runs in the page\'s main world.',
    { code: z.string().describe('JavaScript code to execute') },
    async ({ code }) => {
      const result = await bridge.sendCommand('evaluate', { code });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_url',
    'Get the current page URL',
    {},
    async () => {
      const result = await bridge.sendCommand('url', {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'browser_title',
    'Get the current page title',
    {},
    async () => {
      const result = await bridge.sendCommand('title', {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  // ─── Testing & Assertion Tools ──────────────────────────────────────────

  server.tool(
    'test_assert_element',
    'Assert that an element exists or has a specific state',
    {
      selector: z.string().describe('CSS selector'),
      state: z.enum(['exists', 'visible', 'hidden', 'not_exists']).describe('Expected state'),
    },
    async ({ selector, state }) => {
      try {
        const result: any = await bridge.sendCommand('query', { selector });
        let passed = false;
        switch (state) {
          case 'exists':
            passed = result !== null;
            break;
          case 'visible':
            passed = result?.visible === true;
            break;
          case 'hidden':
            passed = result?.visible === false;
            break;
          case 'not_exists':
            passed = false; // if query succeeded, element exists
            break;
        }
        session.addAssertion(passed, `Element "${selector}" is ${state}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ passed, selector, state, actual: result }),
          }],
        };
      } catch {
        const passed = state === 'not_exists' || state === 'hidden';
        session.addAssertion(passed, `Element "${selector}" is ${state}`);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ passed, selector, state, actual: 'not found' }),
          }],
        };
      }
    }
  );

  server.tool(
    'test_assert_text',
    'Assert text content of an element',
    {
      selector: z.string().describe('CSS selector'),
      expected: z.string().describe('Expected text'),
      op: z.enum(['contains', 'equals', 'matches']).optional().describe('Comparison (default: contains)'),
    },
    async ({ selector, expected, op }) => {
      const result: any = await bridge.sendCommand('text', { selector });
      const actual = result?.text ?? '';
      const operator = op ?? 'contains';

      let passed = false;
      switch (operator) {
        case 'contains':
          passed = actual.includes(expected);
          break;
        case 'equals':
          passed = actual.trim() === expected.trim();
          break;
        case 'matches':
          passed = new RegExp(expected).test(actual);
          break;
      }

      session.addAssertion(passed, `Text of "${selector}" ${operator} "${expected}"`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ passed, selector, expected, actual: actual.slice(0, 500), op: operator }),
        }],
      };
    }
  );

  server.tool(
    'test_assert_url',
    'Assert the current page URL',
    {
      expected: z.string().describe('Expected URL or pattern'),
      op: z.enum(['contains', 'equals', 'matches']).optional().describe('Comparison (default: contains)'),
    },
    async ({ expected, op }) => {
      const result: any = await bridge.sendCommand('url', {});
      const actual = result?.url ?? '';
      const operator = op ?? 'contains';

      let passed = false;
      switch (operator) {
        case 'contains':
          passed = actual.includes(expected);
          break;
        case 'equals':
          passed = actual === expected;
          break;
        case 'matches':
          passed = new RegExp(expected).test(actual);
          break;
      }

      session.addAssertion(passed, `URL ${operator} "${expected}"`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ passed, expected, actual, op: operator }),
        }],
      };
    }
  );

  server.tool(
    'test_assert_count',
    'Assert the number of elements matching a selector',
    {
      selector: z.string().describe('CSS selector'),
      expected: z.number().describe('Expected count'),
      op: z.enum(['equals', 'greaterThan', 'lessThan', 'atLeast', 'atMost']).optional().describe('Comparison (default: equals)'),
    },
    async ({ selector, expected, op }) => {
      const result: any = await bridge.sendCommand('query_all', { selector });
      const actual = result?.total ?? 0;
      const operator = op ?? 'equals';

      let passed = false;
      switch (operator) {
        case 'equals':
          passed = actual === expected;
          break;
        case 'greaterThan':
          passed = actual > expected;
          break;
        case 'lessThan':
          passed = actual < expected;
          break;
        case 'atLeast':
          passed = actual >= expected;
          break;
        case 'atMost':
          passed = actual <= expected;
          break;
      }

      session.addAssertion(passed, `Count of "${selector}" ${operator} ${expected}`);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ passed, selector, expected, actual, op: operator }),
        }],
      };
    }
  );

  // ─── Network Tools ──────────────────────────────────────────────────────

  server.tool(
    'network_capture_start',
    'Start capturing network requests',
    {
      urlPattern: z.string().optional().describe('Regex pattern to filter URLs'),
    },
    async ({ urlPattern }) => {
      const result = await bridge.sendCommand('network_capture_start', { urlPattern });
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'network_capture_stop',
    'Stop capturing and return all captured network requests',
    {},
    async () => {
      const result = await bridge.sendCommand('network_capture_stop', {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  );

  server.tool(
    'network_assert_request',
    'Assert that a network request was made (requires active capture)',
    {
      url: z.string().describe('URL pattern to match (substring)'),
      method: z.string().optional().describe('HTTP method (GET, POST, etc.)'),
      status: z.number().optional().describe('Expected status code'),
    },
    async ({ url, method, status }) => {
      const captureResult: any = await bridge.sendCommand('network_capture_stop', {});
      const requests = captureResult?.requests ?? [];

      const match = requests.find((r: any) => {
        if (!r.url.includes(url)) return false;
        if (method && r.method.toUpperCase() !== method.toUpperCase()) return false;
        if (status !== undefined && r.status !== status) return false;
        return true;
      });

      const passed = !!match;
      session.addAssertion(
        passed,
        `Network request ${method ?? 'ANY'} ${url} ${status ? `(${status})` : ''}`
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ passed, url, method, status, matchedRequest: match, totalCaptured: requests.length }),
        }],
      };
    }
  );

  // ─── Visual Regression Tools ────────────────────────────────────────────

  server.tool(
    'test_visual_compare',
    'Compare the current page screenshot against a saved baseline. Creates baseline on first run.',
    {
      name: z.string().describe('Baseline name (alphanumeric and hyphens only)'),
      threshold: z.number().min(0).max(1).optional().describe('Pixel match threshold 0-1 (default 0.1)'),
    },
    async ({ name, threshold }) => {
      const screenshotResult: any = await bridge.sendCommand('screenshot', {});
      const actual = Buffer.from(screenshotResult.data, 'base64');

      const baseline = await baselineStore.load(name);
      if (!baseline) {
        await baselineStore.save(name, actual);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ firstRun: true, baselineSaved: true, name }),
          }],
        };
      }

      const result = await compareScreenshots(actual, baseline, threshold);

      if (!result.match && result.diffImageBase64) {
        await baselineStore.saveDiff(name, Buffer.from(result.diffImageBase64, 'base64'));
      }

      session.addAssertion(result.match, `Visual snapshot "${name}" matches baseline`);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            match: result.match,
            diffPixels: result.diffPixels,
            diffPercentage: result.diffPercentage.toFixed(2),
            totalPixels: result.totalPixels,
            name,
          }),
        }],
      };
    }
  );

  server.tool(
    'test_visual_update',
    'Update (or create) the baseline screenshot for a given name',
    {
      name: z.string().describe('Baseline name to update'),
    },
    async ({ name }) => {
      const screenshotResult: any = await bridge.sendCommand('screenshot', {});
      const actual = Buffer.from(screenshotResult.data, 'base64');
      const filePath = await baselineStore.save(name, actual);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ updated: true, name, filePath }),
        }],
      };
    }
  );

  // ─── Session Tools ──────────────────────────────────────────────────────

  server.tool(
    'test_session_start',
    'Start a named test session to group assertions and track results',
    { name: z.string().describe('Session name') },
    async ({ name }) => {
      session.start(name);
      return { content: [{ type: 'text', text: JSON.stringify({ session: name, started: true }) }] };
    }
  );

  server.tool(
    'test_session_end',
    'End the current test session and get results summary',
    {},
    async () => {
      const summary = session.end();
      return { content: [{ type: 'text', text: JSON.stringify(summary) }] };
    }
  );

  return server;
}
