#!/usr/bin/env node
const WebSocket = require('ws');
const http = require('http');

async function getWsUrl() {
  return new Promise((resolve, reject) => {
    http
      .get('http://localhost:9222/json', (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          const targets = JSON.parse(d);
          const main = targets.find(
            (t) =>
              t.type === 'page' &&
              t.url.includes('localhost:300') &&
              !t.url.includes('/notification') &&
              !t.url.includes('/quick-input')
          );
          if (main) resolve(main.webSocketDebuggerUrl);
          else reject(new Error('Not found'));
        });
      })
      .on('error', reject);
  });
}

async function cdpEval(wsUrl, expr) {
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
          params: { expression: expr, returnByValue: true, awaitPromise: true },
        })
      );
    });
    ws.on('message', (data) => {
      const result = JSON.parse(data.toString());
      if (result.id === 1) {
        clearTimeout(timeout);
        ws.close();
        if (result.result && result.result.result) resolve(result.result.result.value);
        else resolve(JSON.stringify(result));
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

async function main() {
  const wsUrl = await getWsUrl();
  const result = await cdpEval(
    wsUrl,
    `
    (function() {
      var store = window.__SEPILOT_SDK_STORE__;
      var storeInfo = 'not found';
      if (store) {
        var s = store.getState();
        storeInfo = JSON.stringify({
          appMode: s.appMode,
          thinkingMode: s.thinkingMode,
          sidebarVisible: s.sidebarVisible,
          conversationCount: (s.conversations || []).length,
          activeConversationId: s.activeConversationId,
          currentConversationId: s.currentConversationId
        });
      }

      // Check for chat-related elements
      var chatContainer = document.querySelector('[data-testid="chat-container"]');
      var chatInput = document.querySelector('[data-testid="chat-input"]');
      var unifiedInput = document.querySelector('.unified-chat-input');
      var anyTextarea = document.querySelectorAll('textarea');
      var sendButtons = document.querySelectorAll('[aria-label*="Send"], [aria-label*="전송"]');

      return JSON.stringify({
        store: storeInfo,
        hasChatContainer: !!chatContainer,
        hasChatInput: !!chatInput,
        hasUnifiedInput: !!unifiedInput,
        textareaCount: anyTextarea.length,
        sendButtonCount: sendButtons.length,
        url: window.location.href,
        bodyText: document.body ? document.body.innerText.substring(0, 500) : 'no body'
      });
    })()
  `
  );

  try {
    const parsed = JSON.parse(result);
    if (parsed.store && typeof parsed.store === 'string') {
      parsed.store = JSON.parse(parsed.store);
    }
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log(result);
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
