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
          const main = targets.find((t) => t.type === 'page' && t.url.includes('localhost:300'));
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
        else if (result.result && result.result.exceptionDetails)
          resolve('EXCEPTION: ' + JSON.stringify(result.result.exceptionDetails));
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

  // Check streaming-related state keys more thoroughly
  const result = await cdpEval(
    wsUrl,
    `
    (function() {
      var store = window.__SEPILOT_SDK_STORE__;
      if (!store) return JSON.stringify({ error: 'Store not found' });
      var s = store.getState();

      // Find streaming-related keys
      var stateKeys = Object.keys(s);
      var streamKeys = stateKeys.filter(function(k) {
        return k.toLowerCase().includes('stream') ||
               k.toLowerCase().includes('message') ||
               k.toLowerCase().includes('current') ||
               k.toLowerCase().includes('cowork') ||
               k.toLowerCase().includes('graph');
      });

      var streamState = {};
      streamKeys.forEach(function(k) {
        var val = s[k];
        if (typeof val === 'function') {
          streamState[k] = '[function]';
        } else if (typeof val === 'object' && val !== null) {
          if (Array.isArray(val)) {
            streamState[k] = '[Array(' + val.length + ')]';
          } else {
            streamState[k] = '[Object keys: ' + Object.keys(val).join(', ').substring(0, 100) + ']';
          }
        } else {
          streamState[k] = val;
        }
      });

      // Also check the visible chat messages in DOM
      var msgBubbles = document.querySelectorAll('[class*="message"], [class*="Message"], [data-message-id]');
      var visibleMsgs = Array.from(msgBubbles).map(function(el) {
        return {
          text: (el.textContent || '').substring(0, 100),
          className: (el.className || '').substring(0, 60)
        };
      }).slice(-5);

      return JSON.stringify({
        streamState: streamState,
        visibleMessages: visibleMsgs,
        allStateKeyCount: stateKeys.length
      }, null, 2);
    })()
  `
  );

  try {
    const parsed = JSON.parse(result);
    console.log(JSON.stringify(parsed, null, 2));
  } catch (e) {
    console.log(result);
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
