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

  const result = await cdpEval(
    wsUrl,
    `
    (function() {
      var store = window.__SEPILOT_SDK_STORE__;
      if (!store) return JSON.stringify({ error: 'Store not found' });
      var s = store.getState();
      var convId = s.currentConversationId;
      var convs = s.conversations || [];

      var convDetails = convs.map(function(c) {
        var msgs = c.messages || [];
        var lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        return {
          id: c.id,
          title: (c.title || '').substring(0, 50),
          msgCount: msgs.length,
          lastRole: lastMsg ? lastMsg.role : null,
          lastContentLen: lastMsg ? (lastMsg.content || '').length : 0,
          lastContentPreview: lastMsg ? (lastMsg.content || '').substring(0, 200) : ''
        };
      });

      return JSON.stringify({
        isStreaming: !!s.isStreaming,
        streamingConversationId: s.streamingConversationId || null,
        currentConversationId: convId,
        thinkingMode: s.thinkingMode,
        workingDirectory: s.workingDirectory,
        conversationCount: convs.length,
        conversations: convDetails
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
