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

  // Get task results
  const result = await cdpEval(
    wsUrl,
    `
    (function() {
      var store = window.__SEPILOT_SDK_STORE__;
      if (!store) return JSON.stringify({ error: 'Store not found' });
      var s = store.getState();
      var plan = s.coworkPlan;
      if (!plan) return JSON.stringify({ error: 'No plan' });

      var output = {
        coworkTeamStatus: s.coworkTeamStatus,
        isStreaming: s.isStreaming,
        messageCount: (s.messages || []).length
      };

      // Get task results (truncated)
      output.tasks = (plan.tasks || []).map(function(t) {
        return {
          id: t.id,
          title: t.title,
          status: t.status,
          graphType: t.graphType,
          result: t.result ? t.result.substring(0, 500) : null,
          error: t.error || null
        };
      });

      // Get last few messages
      var msgs = s.messages || [];
      output.lastMessages = msgs.slice(-3).map(function(m) {
        return {
          role: m.role,
          contentLen: m.content ? m.content.length : 0,
          contentPreview: m.content ? m.content.substring(0, 200) : null
        };
      });

      return JSON.stringify(output, null, 2);
    })()
  `
  );
  console.log(result);
}

main().catch((e) => {
  console.error('Error:', e.message);
  process.exit(1);
});
