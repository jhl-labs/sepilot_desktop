/**
 * FAIL 항목 보완 조사 스크립트
 *
 * 1-3. React 앱 마운트 확인 → DOM 구조 탐색
 * 5-1. Zustand store 접근 → Renderer에서 올바른 접근 방법 탐색
 */

const WebSocket = require('ws');
const WS_URL = 'ws://localhost:9222/devtools/page/757DDF2844BCD3D748666A7F38120847';

let msgId = 0;
const pendingCallbacks = new Map();
let ws;

function connect() {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => reject(new Error('Timeout')), 5000);
    ws.on('open', () => {
      clearTimeout(timer);
      resolve();
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.id !== undefined && pendingCallbacks.has(msg.id)) {
        pendingCallbacks.get(msg.id)(msg);
        pendingCallbacks.delete(msg.id);
      }
    });
  });
}

function evaluate(expression, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    const timer = setTimeout(() => {
      pendingCallbacks.delete(id);
      reject(new Error('Timeout'));
    }, timeout);
    pendingCallbacks.set(id, (msg) => {
      clearTimeout(timer);
      if (msg.result?.exceptionDetails) {
        resolve({
          type: 'error',
          error:
            msg.result.exceptionDetails.exception?.description || msg.result.exceptionDetails.text,
        });
      } else {
        resolve(msg.result?.result);
      }
    });
    ws.send(
      JSON.stringify({
        id,
        method: 'Runtime.evaluate',
        params: { expression, returnByValue: true, awaitPromise: true },
      })
    );
  });
}

async function main() {
  await connect();
  console.log('CDP connected.\n');

  // ==============================
  // Investigation 1: React mount element
  // ==============================
  console.log('=== Investigation 1: React Root Element ===');

  const rootCheck = await evaluate(`
    (() => {
      const checks = {};
      checks['#__next'] = !!document.getElementById('__next');
      checks['#root'] = !!document.getElementById('root');
      checks['#app'] = !!document.getElementById('app');
      checks['[data-reactroot]'] = !!document.querySelector('[data-reactroot]');
      checks['main'] = !!document.querySelector('main');
      checks['body>div'] = document.querySelectorAll('body > div').length;
      checks['body children count'] = document.body.children.length;
      checks['body first child tag'] = document.body.children[0]?.tagName;
      checks['body first child id'] = document.body.children[0]?.id;
      checks['body first child class'] = document.body.children[0]?.className?.substring(0, 100);
      // Check for React fiber
      const firstDiv = document.body.children[0];
      const fiberKeys = firstDiv ? Object.keys(firstDiv).filter(k => k.startsWith('__react')) : [];
      checks['react fiber keys'] = fiberKeys;
      return checks;
    })()
  `);
  console.log('Root check:', JSON.stringify(rootCheck.value, null, 2));

  // ==============================
  // Investigation 2: Zustand store access from Renderer
  // ==============================
  console.log('\n=== Investigation 2: Zustand Store Access ===');

  const storeAccess = await evaluate(`
    (() => {
      const checks = {};

      // Check if __NEXT_DATA__ exists (Next.js presence)
      checks['__NEXT_DATA__'] = typeof window.__NEXT_DATA__ !== 'undefined';

      // Check globalThis for store
      const globalKeys = Object.keys(globalThis).filter(k =>
        k.toLowerCase().includes('store') ||
        k.toLowerCase().includes('zustand') ||
        k.toLowerCase().includes('sepilot') ||
        k.startsWith('__')
      ).slice(0, 30);
      checks['relevant globalThis keys'] = globalKeys;

      // Check if any React fiber has store
      const firstDiv = document.body.children[0];
      if (firstDiv) {
        const fiberKey = Object.keys(firstDiv).find(k => k.startsWith('__reactFiber'));
        checks['has react fiber'] = !!fiberKey;
      }

      // Check window properties
      const windowStoreKeys = Object.keys(window).filter(k =>
        k.toLowerCase().includes('store') ||
        k.toLowerCase().includes('chat') ||
        k.toLowerCase().includes('zustand')
      );
      checks['window store keys'] = windowStoreKeys;

      return checks;
    })()
  `);
  console.log('Store access:', JSON.stringify(storeAccess.value, null, 2));

  // ==============================
  // Investigation 3: Try webpack module access
  // ==============================
  console.log('\n=== Investigation 3: Webpack Module Access ===');

  const webpackAccess = await evaluate(`
    (() => {
      const checks = {};

      // Check for webpack require
      checks['webpackChunk'] = Object.keys(globalThis).filter(k => k.includes('webpackChunk')).slice(0, 5);

      // Try __webpack_require__
      checks['__webpack_require__'] = typeof __webpack_require__ !== 'undefined';

      // Check for __SEPILOT__ globals
      const sepilotKeys = Object.keys(globalThis).filter(k => k.includes('SEPILOT'));
      checks['SEPILOT globals'] = sepilotKeys;

      // Check __SEPILOT_MODULES__
      if (globalThis.__SEPILOT_MODULES__) {
        checks['__SEPILOT_MODULES__ keys'] = Object.keys(globalThis.__SEPILOT_MODULES__);
      }

      return checks;
    })()
  `);
  console.log('Webpack access:', JSON.stringify(webpackAccess.value, null, 2));

  // ==============================
  // Investigation 4: Try accessing store via React internals
  // ==============================
  console.log('\n=== Investigation 4: React Internals Store Access ===');

  const reactStore = await evaluate(`
    (() => {
      try {
        // Find React root
        const container = document.body.children[0];
        if (!container) return { error: 'no container' };

        const fiberKey = Object.keys(container).find(k => k.startsWith('__reactFiber'));
        if (!fiberKey) return { error: 'no fiber key found', keys: Object.keys(container).filter(k => k.startsWith('__')).slice(0, 5) };

        let fiber = container[fiberKey];
        let storeFound = false;
        let depth = 0;
        const providers = [];

        // Walk up the fiber tree to find Zustand Provider or store hooks
        while (fiber && depth < 100) {
          if (fiber.memoizedState) {
            const state = fiber.memoizedState;
            // Check if this fiber has a zustand store in its state
            if (state.queue?.lastRenderedState?.appMode !== undefined) {
              storeFound = true;
              return {
                found: true,
                depth,
                appMode: state.queue.lastRenderedState.appMode,
                keys: Object.keys(state.queue.lastRenderedState).slice(0, 20),
              };
            }
          }

          // Check provider type
          if (fiber.type?.displayName || fiber.type?.name) {
            const name = fiber.type.displayName || fiber.type.name;
            if (name.includes('Provider') || name.includes('Store') || name.includes('Context')) {
              providers.push(name);
            }
          }

          fiber = fiber.return || fiber.child;
          depth++;
        }

        return { found: false, providers: providers.slice(0, 20), maxDepth: depth };
      } catch(e) {
        return { error: e.message };
      }
    })()
  `);
  console.log('React store:', JSON.stringify(reactStore.value, null, 2));

  // ==============================
  // Investigation 5: Try IPC to get Main Process store state
  // ==============================
  console.log('\n=== Investigation 5: IPC-based Store Check ===');

  const ipcStore = await evaluate(`
    (async () => {
      try {
        if (!window.electronAPI) return { error: 'no electronAPI' };

        // Try known IPC channels to get state
        const results = {};

        // Try config:get for app mode
        try {
          const config = await window.electronAPI.invoke('config:get', 'appMode');
          results['config:get appMode'] = config;
        } catch(e) {
          results['config:get error'] = e.message;
        }

        // Try to list available LangGraph graph types
        try {
          const graphTypes = await window.electronAPI.invoke('langgraph:get-graph-types');
          results['langgraph graph types'] = graphTypes;
        } catch(e) {
          results['langgraph graph types error'] = e.message?.substring(0, 100);
        }

        // Check electronAPI.langgraph
        results['electronAPI.langgraph methods'] = window.electronAPI.langgraph
          ? Object.keys(window.electronAPI.langgraph)
          : 'not found';

        return results;
      } catch(e) {
        return { error: e.message };
      }
    })()
  `);
  console.log('IPC store:', JSON.stringify(ipcStore.value, null, 2));

  // ==============================
  // Investigation 6: Check DOM for mode indicators
  // ==============================
  console.log('\n=== Investigation 6: DOM Mode Indicators ===');

  const domModes = await evaluate(`
    (() => {
      const results = {};

      // Find all buttons and their text
      const buttons = document.querySelectorAll('button');
      const allButtonTexts = [];
      buttons.forEach(b => {
        const text = (b.textContent || '').trim();
        if (text.length > 0 && text.length < 50) {
          allButtonTexts.push(text);
        }
      });
      results['button texts'] = allButtonTexts.slice(0, 30);

      // Find sidebar items
      const sidebarItems = document.querySelectorAll('[class*="sidebar"] button, [class*="sidebar"] a, [class*="sidebar"] [role="button"]');
      results['sidebar items count'] = sidebarItems.length;

      // Check for mode-related elements
      const modeElements = document.querySelectorAll('[data-mode], [data-thinking-mode]');
      results['mode elements count'] = modeElements.length;

      // Check for "Coding" or "Cowork" text in entire DOM
      const bodyText = document.body.innerText;
      results['body contains Coding'] = bodyText.includes('Coding');
      results['body contains Cowork'] = bodyText.includes('Cowork');
      results['body contains coding'] = bodyText.includes('coding');
      results['body contains cowork'] = bodyText.includes('cowork');

      // Look for select/dropdown with mode options
      const selects = document.querySelectorAll('select');
      results['select elements'] = selects.length;

      return results;
    })()
  `);
  console.log('DOM modes:', JSON.stringify(domModes.value, null, 2));

  ws.close();
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
