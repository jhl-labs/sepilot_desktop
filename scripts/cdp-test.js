#!/usr/bin/env node
/**
 * CDP Test Script - Electron 앱에 직접 연결하여 상태 확인 및 Cowork 테스트
 */
const WebSocket = require('ws');
const http = require('http');

const CDP_URL = 'http://localhost:9222/json';

async function getMainPageWsUrl() {
  return new Promise((resolve, reject) => {
    http
      .get(CDP_URL, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const targets = JSON.parse(data);
          const mainPage = targets.find(
            (t) => t.url === 'http://localhost:3000/' && t.type === 'page'
          );
          if (mainPage) {
            resolve(mainPage.webSocketDebuggerUrl);
          } else {
            reject(new Error('Main page not found'));
          }
        });
      })
      .on('error', reject);
  });
}

async function evaluateInElectron(wsUrl, expression) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout'));
    }, 15000);

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression,
            returnByValue: true,
            awaitPromise: true,
          },
        })
      );
    });

    ws.on('message', (data) => {
      const result = JSON.parse(data.toString());
      if (result.id === 1) {
        clearTimeout(timeout);
        ws.close();
        if (result.result && result.result.result) {
          resolve(result.result.result.value || result.result.result);
        } else {
          resolve(result);
        }
      }
    });

    ws.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

async function main() {
  const command = process.argv[2] || 'check';

  console.log('[CDP] Connecting to Electron app...');
  const wsUrl = await getMainPageWsUrl();
  console.log('[CDP] Connected:', wsUrl);

  if (command === 'check') {
    // 1. Check basic app state
    const state = await evaluateInElectron(
      wsUrl,
      `
      JSON.stringify({
        hasElectronAPI: !!window.electronAPI,
        hasLLM: !!window.electronAPI?.llm,
        hasLanggraph: !!window.electronAPI?.langgraph,
        hasMCP: !!window.electronAPI?.mcp,
        hasFile: !!window.electronAPI?.file,
        url: window.location.href,
      })
    `
    );
    console.log('[CDP] App State:', state);

    // 2. Check Zustand store
    const storeState = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        // Try to access Zustand store via React internals or global
        const store = window.__SEPILOT_STORE__ || window.__zustand_store__;
        if (store) {
          const s = store.getState();
          return JSON.stringify({
            appMode: s.appMode,
            conversationCount: s.conversations?.length || 0,
            currentConversationId: s.currentConversationId,
            workingDirectory: s.workingDirectory,
          });
        }
        return JSON.stringify({ error: 'Store not found directly, trying React tree...' });
      })()
    `
    );
    console.log('[CDP] Store State:', storeState);
  } else if (command === 'set-cowork') {
    // Switch to Cowork mode
    const result = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        // Find the mode selector and click Cowork
        const modeBtn = document.querySelector('[data-mode="cowork"]') ||
                        Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Cowork'));
        if (modeBtn) {
          modeBtn.click();
          return 'Clicked Cowork mode button';
        }
        return 'Cowork button not found. Available buttons: ' +
          Array.from(document.querySelectorAll('button')).slice(0, 10).map(b => b.textContent.trim()).join(', ');
      })()
    `
    );
    console.log('[CDP] Set Cowork:', result);
  } else if (command === 'screenshot') {
    // Take a screenshot via CDP
    const wsUrl2 = await getMainPageWsUrl();
    const ws = new WebSocket(wsUrl2);

    await new Promise((resolve, reject) => {
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            id: 1,
            method: 'Page.captureScreenshot',
            params: { format: 'png', quality: 80 },
          })
        );
      });
      ws.on('message', (data) => {
        const result = JSON.parse(data.toString());
        if (result.id === 1 && result.result && result.result.data) {
          const fs = require('fs');
          const buf = Buffer.from(result.result.data, 'base64');
          fs.writeFileSync('C:/git/sepilot_desktop/cdp-screenshot.png', buf);
          console.log('[CDP] Screenshot saved to cdp-screenshot.png (' + buf.length + ' bytes)');
          ws.close();
          resolve();
        }
      });
      ws.on('error', reject);
    });
  } else if (command === 'ui-info') {
    // Get detailed UI info - bottom bar, mode selector, etc.
    const info = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        var allBtns = Array.from(document.querySelectorAll('button, [role="button"]'));
        var bottomBtns = allBtns.filter(function(b) {
          var rect = b.getBoundingClientRect();
          return rect.top > window.innerHeight - 100;
        });
        var topLeftBtns = allBtns.filter(function(b) {
          var rect = b.getBoundingClientRect();
          return rect.top < 50 && rect.left < 200;
        });
        var modeDropdown = document.querySelector('[data-state="open"], [data-state="closed"]');
        var chatHeader = document.querySelector('h1, h2, [class*="header"]');
        var textareas = Array.from(document.querySelectorAll('textarea'));

        return JSON.stringify({
          bottomButtons: bottomBtns.map(function(b) {
            return {
              text: (b.textContent || '').trim().substring(0, 30),
              title: b.title || b.getAttribute('aria-label') || '',
              tag: b.tagName,
              x: Math.round(b.getBoundingClientRect().left),
              y: Math.round(b.getBoundingClientRect().top)
            };
          }),
          topLeftButtons: topLeftBtns.map(function(b) {
            return {
              text: (b.textContent || '').trim().substring(0, 30),
              title: b.title || '',
              x: Math.round(b.getBoundingClientRect().left),
              y: Math.round(b.getBoundingClientRect().top)
            };
          }),
          textareas: textareas.map(function(t) {
            return { placeholder: t.placeholder, x: Math.round(t.getBoundingClientRect().left), y: Math.round(t.getBoundingClientRect().top) };
          }),
          windowSize: { w: window.innerWidth, h: window.innerHeight }
        });
      })()
    `
    );
    console.log('[CDP] UI Info:', info);
  } else if (command === 'click-mode') {
    // Click the "Chat v" dropdown at top-left to switch modes
    const result = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        var topBtns = Array.from(document.querySelectorAll('button, [role="button"]')).filter(function(b) {
          var rect = b.getBoundingClientRect();
          return rect.top < 50 && rect.left < 200;
        });
        var chatBtn = topBtns.find(function(b) { return (b.textContent || '').includes('Chat') || (b.textContent || '').includes('Cowork') || (b.textContent || '').includes('Coding'); });
        if (chatBtn) {
          chatBtn.click();
          return 'Clicked mode button: ' + chatBtn.textContent.trim();
        }
        return 'Mode button not found. Top buttons: ' + topBtns.map(function(b) { return b.textContent.trim(); }).join(', ');
      })()
    `
    );
    console.log('[CDP] Click Mode:', result);
  } else if (command === 'select-mode') {
    // After dropdown is open, select a specific mode
    const modeName = process.argv[3] || 'Cowork';
    const result = await evaluateInElectron(
      wsUrl,
      `
      (async function() {
        await new Promise(function(r) { setTimeout(r, 300); });
        var items = Array.from(document.querySelectorAll('[role="menuitem"], [role="option"], [data-value], [class*="dropdown"] button, [class*="dropdown"] div'));
        var match = items.find(function(item) { return (item.textContent || '').includes('${modeName}'); });
        if (match) {
          match.click();
          return 'Selected mode: ${modeName}';
        }
        var allVisible = Array.from(document.querySelectorAll('*')).filter(function(el) {
          var rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (el.textContent || '').includes('${modeName}');
        });
        return 'Mode not found in dropdown. Items with "${modeName}": ' + allVisible.length + '. All dropdown items: ' + items.map(function(i) { return i.textContent.trim().substring(0, 30); }).join(' | ');
      })()
    `
    );
    console.log('[CDP] Select Mode:', result);
  } else if (command === 'send-message') {
    const message = process.argv[3] || 'Hello from CDP test!';
    // Try to type in the chat input and send
    const result = await evaluateInElectron(
      wsUrl,
      `
      (async function() {
        // Find textarea/input for chat
        const textarea = document.querySelector('textarea[placeholder]') || document.querySelector('textarea');
        if (!textarea) {
          return 'No textarea found';
        }

        // Set value and trigger React change event
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(textarea, ${JSON.stringify(message)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait a moment for React to process
        await new Promise(r => setTimeout(r, 500));

        // Find and click send button
        const sendBtn = document.querySelector('button[type="submit"]') ||
                       document.querySelector('[data-testid="send-button"]') ||
                       Array.from(document.querySelectorAll('button')).find(b => {
                         const svg = b.querySelector('svg');
                         return svg || b.textContent.includes('전송') || b.textContent.includes('Send');
                       });

        if (sendBtn) {
          sendBtn.click();
          return 'Message sent: ' + ${JSON.stringify(message)};
        }
        return 'Send button not found. Textarea value set to: ' + textarea.value;
      })()
    `
    );
    console.log('[CDP] Send Message:', result);
  }
}

main().catch((e) => {
  console.error('[CDP] Error:', e.message);
  process.exit(1);
});
