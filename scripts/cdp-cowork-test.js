#!/usr/bin/env node
/**
 * CDP Cowork Test Script - Electron 앱에서 Cowork 모드로 전환하고 PPTX 생성 테스트
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
            (t) => t.url.includes('localhost:300') && t.type === 'page'
          );
          if (mainPage) {
            resolve(mainPage.webSocketDebuggerUrl);
          } else {
            reject(
              new Error('Main page not found. Targets: ' + targets.map((t) => t.url).join(', '))
            );
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
    }, 30000);

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
        } else if (result.result && result.result.exceptionDetails) {
          resolve({ error: result.result.exceptionDetails.text || 'Exception' });
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
  const command = process.argv[2] || 'set-cowork';

  console.log('[CDP-Cowork] Connecting to Electron app...');
  const wsUrl = await getMainPageWsUrl();
  console.log('[CDP-Cowork] Connected:', wsUrl);

  if (command === 'set-cowork') {
    // Step 1: Click Thinking Mode trigger to open dropdown
    console.log('[CDP-Cowork] Step 1: Opening Thinking Mode dropdown...');
    const step1 = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        var btn = document.querySelector('[data-testid="thinking-mode-trigger"]') ||
                  document.querySelector('[aria-label="Thinking Mode"]');
        if (btn) {
          btn.click();
          return 'Clicked Thinking Mode trigger';
        }
        return 'Thinking Mode trigger not found';
      })()
    `
    );
    console.log('[CDP-Cowork]', step1);

    // Wait for dropdown to appear
    await new Promise((r) => setTimeout(r, 500));

    // Step 2: Select Cowork from dropdown
    console.log('[CDP-Cowork] Step 2: Selecting Cowork mode...');
    const wsUrl2 = await getMainPageWsUrl();
    const step2 = await evaluateInElectron(
      wsUrl2,
      `
      (async function() {
        await new Promise(function(r) { setTimeout(r, 300); });

        // Find all menu items
        var items = Array.from(document.querySelectorAll('[role="menuitem"]'));
        var allVisible = items.map(function(i) { return (i.textContent || '').trim().substring(0, 50); });

        var coworkItem = items.find(function(item) {
          return (item.textContent || '').toLowerCase().includes('cowork');
        });

        if (coworkItem) {
          coworkItem.click();
          return JSON.stringify({ success: true, clicked: 'Cowork', allItems: allVisible });
        }

        // If no menuitem found, try broader search
        var allEls = Array.from(document.querySelectorAll('*')).filter(function(el) {
          var rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0 && (el.textContent || '').toLowerCase().includes('cowork');
        });

        return JSON.stringify({
          success: false,
          menuItems: allVisible,
          coworkElements: allEls.length,
          msg: 'Cowork item not found in dropdown'
        });
      })()
    `
    );
    console.log('[CDP-Cowork]', step2);

    // Step 3: Verify the mode changed
    await new Promise((r) => setTimeout(r, 500));
    const wsUrl3 = await getMainPageWsUrl();
    const step3 = await evaluateInElectron(
      wsUrl3,
      `
      (function() {
        // Check the store state
        var store = window.__SEPILOT_SDK_STORE__;
        if (store) {
          var s = store.getState();
          return JSON.stringify({
            thinkingMode: s.thinkingMode,
            enableTools: s.enableTools,
            inputTrustLevel: s.inputTrustLevel,
            workingDirectory: s.workingDirectory
          });
        }

        // Fallback: check UI state
        var trigger = document.querySelector('[data-testid="thinking-mode-trigger"]');
        if (trigger) {
          return JSON.stringify({
            triggerText: trigger.textContent.trim().substring(0, 30),
            triggerClasses: trigger.className.substring(0, 100)
          });
        }
        return JSON.stringify({ error: 'Cannot verify mode' });
      })()
    `
    );
    console.log('[CDP-Cowork] Current state:', step3);
  } else if (command === 'set-working-dir') {
    // Set working directory directly via store
    const dir = process.argv[3] || 'C:\\git\\sepilot-docs';
    console.log('[CDP-Cowork] Setting working directory to:', dir);

    const result = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (store) {
          store.getState().setWorkingDirectory('${dir.replace(/\\/g, '\\\\')}');
          var s = store.getState();
          return JSON.stringify({
            success: true,
            workingDirectory: s.workingDirectory,
            thinkingMode: s.thinkingMode
          });
        }
        return JSON.stringify({ error: 'Store not found' });
      })()
    `
    );
    console.log('[CDP-Cowork]', result);
  } else if (command === 'store-state') {
    // Check full store state related to cowork
    const result = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (store) {
          var s = store.getState();
          return JSON.stringify({
            thinkingMode: s.thinkingMode,
            inputTrustLevel: s.inputTrustLevel,
            enableTools: s.enableTools,
            enableRAG: s.enableRAG,
            workingDirectory: s.workingDirectory,
            currentConversationId: s.currentConversationId,
            conversationCount: (s.conversations || []).length,
            enableImageGeneration: s.enableImageGeneration
          });
        }
        return JSON.stringify({ error: 'Store not found' });
      })()
    `
    );
    console.log('[CDP-Cowork] Store State:', result);
  } else if (command === 'set-mode-direct') {
    // Directly set thinkingMode via Zustand store
    const mode = process.argv[3] || 'cowork';
    console.log('[CDP-Cowork] Directly setting thinkingMode to:', mode);

    const result = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (store) {
          var state = store.getState();
          if (typeof state.setThinkingMode === 'function') {
            state.setThinkingMode('${mode}');
            var newState = store.getState();
            return JSON.stringify({
              success: true,
              thinkingMode: newState.thinkingMode,
              enableTools: newState.enableTools,
              inputTrustLevel: newState.inputTrustLevel
            });
          }
          return JSON.stringify({ error: 'setThinkingMode not found in store' });
        }
        return JSON.stringify({ error: 'Store not found' });
      })()
    `
    );
    console.log('[CDP-Cowork]', result);
  } else if (command === 'send-message') {
    const message = process.argv[3] || 'Hello from CDP test!';
    console.log('[CDP-Cowork] Sending message:', message);

    const result = await evaluateInElectron(
      wsUrl,
      `
      (async function() {
        var textarea = document.querySelector('textarea[placeholder]') || document.querySelector('textarea');
        if (!textarea) {
          return JSON.stringify({ error: 'No textarea found' });
        }

        // Set value via native setter for React compatibility
        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(textarea, ${JSON.stringify(message)});
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        await new Promise(function(r) { setTimeout(r, 500); });

        // Find and click send button
        var sendBtn = document.querySelector('[title="Send Message"]') ||
                     document.querySelector('button[type="submit"]') ||
                     document.querySelector('[data-testid="send-button"]');

        if (sendBtn) {
          sendBtn.click();
          return JSON.stringify({ success: true, message: 'Message sent' });
        }
        return JSON.stringify({ error: 'Send button not found', textareaValue: textarea.value.substring(0, 50) });
      })()
    `
    );
    console.log('[CDP-Cowork]', result);
  } else if (command === 'check-streaming') {
    // Check if streaming is active and get current messages
    const result = await evaluateInElectron(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (store) {
          var s = store.getState();
          var convId = s.currentConversationId;
          var conv = (s.conversations || []).find(function(c) { return c.id === convId; });
          var msgs = conv ? (conv.messages || []) : [];
          var lastMsgs = msgs.slice(-5);
          return JSON.stringify({
            isStreaming: !!s.isStreaming,
            conversationId: convId,
            messageCount: msgs.length,
            lastMessages: lastMsgs.map(function(m) {
              return {
                role: m.role,
                contentPreview: (m.content || '').substring(0, 200),
                tool_calls: m.tool_calls ? m.tool_calls.length : 0
              };
            })
          });
        }
        return JSON.stringify({ error: 'Store not found' });
      })()
    `
    );
    console.log('[CDP-Cowork] Streaming Status:', result);
  }
}

main().catch((e) => {
  console.error('[CDP-Cowork] Error:', e.message);
  process.exit(1);
});
