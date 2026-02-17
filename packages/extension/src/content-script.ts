/**
 * Content Script - DOM Operations
 *
 * Injected into web pages. Handles element queries, clicks, typing,
 * text extraction, and waiting for elements.
 *
 * Runs in an isolated world (cannot access page JS globals).
 * All data from web pages is treated as untrusted.
 */

// ─── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message.command) return false;

  handleCommand(message.command, message.params)
    .then((data) => sendResponse({ data }))
    .catch((err) =>
      sendResponse({ error: err instanceof Error ? err.message : String(err) })
    );

  return true; // keep channel open for async response
});

// ─── Command Router ─────────────────────────────────────────────────────────

async function handleCommand(
  command: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (command) {
    case 'click':
      return cmdClick(params);
    case 'type':
      return cmdType(params);
    case 'select':
      return cmdSelect(params);
    case 'hover':
      return cmdHover(params);
    case 'scroll':
      return cmdScroll(params);
    case 'key':
      return cmdKey(params);
    case 'wait':
      return cmdWait(params);
    case 'query':
      return cmdQuery(params);
    case 'query_all':
      return cmdQueryAll(params);
    case 'text':
      return cmdText(params);
    case 'html':
      return cmdHtml(params);
    default:
      throw new Error(`Unknown content script command: ${command}`);
  }
}

// ─── Element Helpers ────────────────────────────────────────────────────────

function querySelector(selector: string): Element {
  const el = document.querySelector(selector);
  if (!el) throw new Error(`Element not found: ${selector}`);
  return el;
}

function getElementInfo(el: Element): Record<string, unknown> {
  const rect = el.getBoundingClientRect();
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    attrs[attr.name] = attr.value;
  }

  return {
    tagName: el.tagName.toLowerCase(),
    text: (el as HTMLElement).innerText?.slice(0, 1000) ?? '', // truncate for safety
    attributes: attrs,
    visible: isVisible(el),
    boundingBox:
      rect.width > 0 && rect.height > 0
        ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
        : null,
  };
}

function isVisible(el: Element): boolean {
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function scrollIntoView(el: Element): void {
  el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
}

// ─── Commands ───────────────────────────────────────────────────────────────

async function cmdClick(params: Record<string, unknown>): Promise<unknown> {
  const el = querySelector(params.selector as string) as HTMLElement;
  scrollIntoView(el);

  // Small delay for scroll to settle
  await sleep(50);

  if (params.doubleClick) {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
  } else {
    el.click();
  }

  return { clicked: true };
}

async function cmdType(params: Record<string, unknown>): Promise<unknown> {
  const el = querySelector(params.selector as string) as HTMLInputElement | HTMLTextAreaElement;
  scrollIntoView(el);
  el.focus();

  if (params.clear) {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const text = params.text as string;

  // Set value and dispatch events to trigger framework handlers
  el.value += text;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return { typed: true };
}

async function cmdSelect(params: Record<string, unknown>): Promise<unknown> {
  const el = querySelector(params.selector as string) as HTMLSelectElement;
  scrollIntoView(el);

  const value = params.value as string;
  const option = Array.from(el.options).find(
    (opt) => opt.value === value || opt.textContent === value
  );

  if (!option) {
    throw new Error(`Option not found: ${value}`);
  }

  el.value = option.value;
  el.dispatchEvent(new Event('change', { bubbles: true }));

  return { selected: option.value };
}

async function cmdHover(params: Record<string, unknown>): Promise<unknown> {
  const el = querySelector(params.selector as string) as HTMLElement;
  scrollIntoView(el);

  el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
  el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

  return { hovered: true };
}

async function cmdScroll(params: Record<string, unknown>): Promise<unknown> {
  const amount = (params.amount as number) ?? 300;
  const direction = params.direction as string;

  const target = params.selector
    ? querySelector(params.selector as string)
    : document.documentElement;

  const scrollOpts: Record<string, number> = {};
  switch (direction) {
    case 'up':    scrollOpts.top = -amount; break;
    case 'down':  scrollOpts.top = amount; break;
    case 'left':  scrollOpts.left = -amount; break;
    case 'right': scrollOpts.left = amount; break;
  }

  (target as Element).scrollBy({ ...scrollOpts, behavior: 'instant' });

  return { scrolled: true };
}

async function cmdKey(params: Record<string, unknown>): Promise<unknown> {
  const key = params.key as string;
  const modifiers = (params.modifiers as string[]) ?? [];

  const eventInit: KeyboardEventInit = {
    key,
    code: key,
    bubbles: true,
    cancelable: true,
    ctrlKey: modifiers.includes('ctrl'),
    shiftKey: modifiers.includes('shift'),
    altKey: modifiers.includes('alt'),
    metaKey: modifiers.includes('meta'),
  };

  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent('keydown', eventInit));
  target.dispatchEvent(new KeyboardEvent('keyup', eventInit));

  return { key };
}

async function cmdWait(params: Record<string, unknown>): Promise<unknown> {
  const selector = params.selector as string;
  const state = (params.state as string) ?? 'visible';
  const timeout = (params.timeout as number) ?? 5000;

  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    function check(): boolean {
      const el = document.querySelector(selector);

      switch (state) {
        case 'attached':
          return el !== null;
        case 'detached':
          return el === null;
        case 'visible':
          return el !== null && isVisible(el);
        case 'hidden':
          return el === null || !isVisible(el);
        default:
          return el !== null;
      }
    }

    if (check()) {
      resolve({ found: true, elapsed: Date.now() - startTime });
      return;
    }

    const observer = new MutationObserver(() => {
      if (check()) {
        observer.disconnect();
        resolve({ found: true, elapsed: Date.now() - startTime });
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for "${selector}" to be ${state} (${timeout}ms)`));
    }, timeout);
  });
}

async function cmdQuery(params: Record<string, unknown>): Promise<unknown> {
  const el = querySelector(params.selector as string);
  return getElementInfo(el);
}

async function cmdQueryAll(params: Record<string, unknown>): Promise<unknown> {
  const els = document.querySelectorAll(params.selector as string);
  // Limit to 100 elements for safety
  const results = Array.from(els)
    .slice(0, 100)
    .map((el) => getElementInfo(el));
  return { elements: results, total: els.length };
}

async function cmdText(params: Record<string, unknown>): Promise<unknown> {
  const selector = (params.selector as string) ?? 'body';
  const el = querySelector(selector) as HTMLElement;
  // Truncate large text content
  const text = el.innerText?.slice(0, 10_000) ?? '';
  return { text };
}

async function cmdHtml(params: Record<string, unknown>): Promise<unknown> {
  const selector = (params.selector as string) ?? 'body';
  const el = querySelector(selector);
  const outer = params.outer as boolean;
  // Truncate large HTML
  const html = (outer ? el.outerHTML : el.innerHTML).slice(0, 50_000);
  return { html };
}

// ─── Utility ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
