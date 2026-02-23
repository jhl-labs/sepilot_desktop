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
      // Find all textareas
      var textareas = Array.from(document.querySelectorAll('textarea'));
      var inputs = Array.from(document.querySelectorAll('input[type="text"]'));
      var contentEditables = Array.from(document.querySelectorAll('[contenteditable="true"]'));
      var divRoles = Array.from(document.querySelectorAll('[role="textbox"]'));

      return JSON.stringify({
        textareas: textareas.map(function(t) {
          return {
            placeholder: t.placeholder || '',
            className: (t.className || '').substring(0, 100),
            id: t.id,
            visible: t.offsetWidth > 0 && t.offsetHeight > 0,
            rect: t.getBoundingClientRect()
          };
        }),
        textInputs: inputs.length,
        contentEditables: contentEditables.length,
        divTextboxes: divRoles.length,
        bodyChildren: document.body ? document.body.children.length : 0,
        title: document.title
      });
    })()
  `
  );
  console.log(result);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
