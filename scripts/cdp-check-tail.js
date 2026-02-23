#!/usr/bin/env node
// Check the last 2000 characters of the assistant message
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
  const tailLen = parseInt(process.argv[2]) || 3000;
  const result = await cdpEval(
    wsUrl,
    `
    (function() {
      var store = window.__SEPILOT_SDK_STORE__;
      if (!store) return 'Store not found';
      var s = store.getState();
      var msgs = s.messages || [];
      var last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
      if (!last) return 'No messages';
      var content = last.content || '';
      var tail = content.length > ${tailLen} ? content.substring(content.length - ${tailLen}) : content;
      return JSON.stringify({
        totalLen: content.length,
        isStreaming: s.isStreaming,
        coworkTeamStatus: s.coworkTeamStatus,
        tail: tail
      });
    })()
  `
  );

  try {
    const parsed = JSON.parse(result);
    console.log(
      'Content length:',
      parsed.totalLen,
      '| Streaming:',
      parsed.isStreaming,
      '| Status:',
      parsed.coworkTeamStatus
    );
    console.log('--- Last', tailLen, 'chars ---');
    console.log(parsed.tail);
  } catch (e) {
    console.log(result);
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
