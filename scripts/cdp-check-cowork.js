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
  const command = process.argv[2] || 'plan';
  const wsUrl = await getWsUrl();

  if (command === 'plan') {
    const result = await cdpEval(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (!store) return JSON.stringify({ error: 'Store not found' });
        var s = store.getState();
        return JSON.stringify({
          coworkTeamStatus: s.coworkTeamStatus,
          coworkPlan: s.coworkPlan,
          coworkTokensConsumed: s.coworkTokensConsumed,
          coworkTotalTokenBudget: s.coworkTotalTokenBudget,
          isStreaming: s.isStreaming
        }, null, 2);
      })()
    `
    );
    console.log(result);
  } else if (command === 'messages') {
    const result = await cdpEval(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (!store) return JSON.stringify({ error: 'Store not found' });
        var s = store.getState();
        var msgs = s.messages || [];
        return JSON.stringify({
          messageCount: msgs.length,
          messages: msgs.map(function(m) {
            return {
              id: (m.id || '').substring(0, 30),
              role: m.role,
              contentLength: (m.content || '').length,
              contentPreview: (m.content || '').substring(0, 500),
              tool_calls: m.tool_calls ? m.tool_calls.map(function(tc) {
                return { name: tc.name || tc.function_name || '', args: JSON.stringify(tc.args || tc.arguments || {}).substring(0, 100) };
              }) : []
            };
          })
        }, null, 2);
      })()
    `
    );
    console.log(result);
  } else if (command === 'last-message') {
    const result = await cdpEval(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (!store) return JSON.stringify({ error: 'Store not found' });
        var s = store.getState();
        var msgs = s.messages || [];
        var last = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        if (!last) return JSON.stringify({ error: 'No messages' });
        return JSON.stringify({
          id: last.id,
          role: last.role,
          contentLength: (last.content || '').length,
          content: (last.content || '').substring(0, 2000),
          isStreaming: s.isStreaming,
          coworkTeamStatus: s.coworkTeamStatus
        }, null, 2);
      })()
    `
    );
    console.log(result);
  } else if (command === 'full-result') {
    // Get the full last message content (for checking PPTX generation result)
    const result = await cdpEval(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (!store) return JSON.stringify({ error: 'Store not found' });
        var s = store.getState();
        var msgs = s.messages || [];
        var assistantMsgs = msgs.filter(function(m) { return m.role === 'assistant'; });
        var last = assistantMsgs.length > 0 ? assistantMsgs[assistantMsgs.length - 1] : null;
        if (!last) return JSON.stringify({ error: 'No assistant messages' });
        return JSON.stringify({
          id: last.id,
          role: last.role,
          content: last.content || '',
          isStreaming: s.isStreaming
        }, null, 2);
      })()
    `
    );
    console.log(result);
  }
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
