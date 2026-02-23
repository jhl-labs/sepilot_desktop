#!/usr/bin/env node
/**
 * CDP New Chat - Start a new conversation via CDP
 */
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
  const command = process.argv[2] || 'new-chat';

  if (command === 'new-chat') {
    // Create a new conversation via store
    console.log('[CDP] Creating new conversation...');
    const result = await cdpEval(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (!store) return JSON.stringify({ error: 'Store not found' });
        var s = store.getState();

        // Call createConversation if available
        if (typeof s.createConversation === 'function') {
          s.createConversation();
          var newState = store.getState();
          return JSON.stringify({
            success: true,
            conversationId: newState.currentConversationId,
            thinkingMode: newState.thinkingMode,
            messageCount: (newState.messages || []).length,
            isStreaming: newState.isStreaming
          });
        }

        // Try clicking the new chat button
        var btn = document.querySelector('[data-testid="new-chat-button"]') ||
                  document.querySelector('[aria-label="New Chat"]') ||
                  document.querySelector('[aria-label="새 대화"]');
        if (btn) {
          btn.click();
          return JSON.stringify({ success: true, method: 'button-click' });
        }

        return JSON.stringify({ error: 'No createConversation function found' });
      })()
    `
    );
    console.log('[CDP]', result);
  } else if (command === 'set-cowork') {
    console.log('[CDP] Setting Cowork mode...');
    const result = await cdpEval(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (!store) return JSON.stringify({ error: 'Store not found' });
        var s = store.getState();
        if (typeof s.setThinkingMode === 'function') {
          s.setThinkingMode('cowork');
          var newState = store.getState();
          return JSON.stringify({
            success: true,
            thinkingMode: newState.thinkingMode,
            enableTools: newState.enableTools
          });
        }
        return JSON.stringify({ error: 'setThinkingMode not found' });
      })()
    `
    );
    console.log('[CDP]', result);
  } else if (command === 'send') {
    const message = process.argv[3] || 'Hello!';
    console.log('[CDP] Sending message:', message.substring(0, 80) + '...');

    const result = await cdpEval(
      wsUrl,
      `
      (async function() {
        var textarea = document.querySelector('textarea[placeholder]') || document.querySelector('textarea');
        if (!textarea) return JSON.stringify({ error: 'No textarea found' });

        var nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        nativeInputValueSetter.call(textarea, ${JSON.stringify(message)});

        // Trigger React-compatible events
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        // Also dispatch React synthetic-like event with target property
        var inputEvent = new Event('input', { bubbles: true });
        Object.defineProperty(inputEvent, 'target', { value: textarea });
        textarea.dispatchEvent(inputEvent);

        // Focus the textarea to ensure UI updates
        textarea.focus();

        await new Promise(function(r) { setTimeout(r, 1200); });

        var sendBtn = document.querySelector('[aria-label="Send Message"]') ||
                     document.querySelector('[aria-label="메시지 전송"]') ||
                     document.querySelector('[data-testid="send-button"]') ||
                     document.querySelector('button[type="submit"]');

        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return JSON.stringify({ success: true, message: 'Message sent via button' });
        }

        // Fallback: Press Enter to send
        textarea.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
          bubbles: true, cancelable: true
        }));

        await new Promise(function(r) { setTimeout(r, 500); });

        // Check if message was sent by looking at store
        var store = window.__SEPILOT_SDK_STORE__;
        if (store) {
          var s = store.getState();
          if (s.isStreaming || (s.messages || []).length > 0) {
            return JSON.stringify({ success: true, message: 'Message sent via Enter key' });
          }
        }

        // Last fallback: try clicking send button even if disabled
        if (sendBtn) {
          sendBtn.removeAttribute('disabled');
          sendBtn.click();
          return JSON.stringify({ success: true, message: 'Message sent via force click' });
        }

        return JSON.stringify({ error: 'Send button not found', textareaValue: textarea.value.substring(0, 50) });
      })()
    `
    );
    console.log('[CDP]', result);
  } else if (command === 'status') {
    const result = await cdpEval(
      wsUrl,
      `
      (function() {
        var store = window.__SEPILOT_SDK_STORE__;
        if (!store) return JSON.stringify({ error: 'Store not found' });
        var s = store.getState();
        return JSON.stringify({
          isStreaming: s.isStreaming,
          thinkingMode: s.thinkingMode,
          coworkTeamStatus: s.coworkTeamStatus,
          messageCount: (s.messages || []).length,
          conversationId: s.currentConversationId
        });
      })()
    `
    );
    console.log('[CDP]', result);
  } else if (command === 'wait-done') {
    // Wait until streaming is complete
    const maxWait = parseInt(process.argv[3]) || 300; // seconds
    console.log('[CDP] Waiting for streaming to complete (max ' + maxWait + 's)...');
    let elapsed = 0;
    const interval = 5; // check every 5 seconds

    while (elapsed < maxWait) {
      await new Promise((r) => setTimeout(r, interval * 1000));
      elapsed += interval;

      const wsUrl2 = await getWsUrl();
      const status = await cdpEval(
        wsUrl2,
        `
        (function() {
          var store = window.__SEPILOT_SDK_STORE__;
          if (!store) return JSON.stringify({ error: 'Store not found' });
          var s = store.getState();
          var plan = s.coworkPlan;
          var taskInfo = '';
          if (plan && plan.tasks) {
            taskInfo = plan.tasks.map(function(t) {
              return t.id + ':' + t.status;
            }).join(', ');
          }
          return JSON.stringify({
            isStreaming: s.isStreaming,
            coworkTeamStatus: s.coworkTeamStatus,
            tasks: taskInfo,
            msgCount: (s.messages || []).length
          });
        })()
      `
      );

      try {
        const parsed = JSON.parse(status);
        console.log(
          '[' + elapsed + 's] Streaming:',
          parsed.isStreaming,
          '| Status:',
          parsed.coworkTeamStatus,
          '| Tasks:',
          parsed.tasks
        );

        if (
          !parsed.isStreaming &&
          parsed.coworkTeamStatus !== 'executing' &&
          parsed.coworkTeamStatus !== 'planning'
        ) {
          console.log('[CDP] Streaming complete!');
          break;
        }
      } catch (e) {
        console.log('[' + elapsed + 's]', status);
      }
    }

    if (elapsed >= maxWait) {
      console.log('[CDP] Timeout after ' + maxWait + ' seconds');
    }
  }
}

main().catch((e) => {
  console.error('[CDP] Error:', e.message);
  process.exit(1);
});
