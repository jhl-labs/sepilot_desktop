#!/usr/bin/env node
/**
 * CDP Send Message Script - Electron 앱 textarea에 메시지를 입력하고 전송
 *
 * Usage:
 *   node cdp-send-msg.js "메시지"        - 메시지 전송
 *   node cdp-send-msg.js --find-buttons  - 모든 버튼 찾기
 *   node cdp-send-msg.js --status        - 스트리밍 상태 확인
 *   node cdp-send-msg.js --wait          - 스트리밍 완료 대기
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
          const main = targets.find((t) => t.type === 'page' && t.url.includes('localhost:300'));
          if (main) resolve(main.webSocketDebuggerUrl);
          else reject(new Error('Main page not found'));
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
    }, 30000);
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
        if (result.result && result.result.result) {
          resolve(result.result.result.value);
        } else if (result.result && result.result.exceptionDetails) {
          resolve(
            'EXCEPTION: ' +
              (result.result.exceptionDetails.text ||
                JSON.stringify(result.result.exceptionDetails))
          );
        } else {
          resolve(JSON.stringify(result));
        }
      }
    });
    ws.on('error', (e) => {
      clearTimeout(timeout);
      reject(e);
    });
  });
}

async function findButtons() {
  const wsUrl = await getWsUrl();
  const result = await cdpEval(
    wsUrl,
    `
    (function() {
      var allBtns = Array.from(document.querySelectorAll('button'));
      var bottomBtns = allBtns.filter(function(b) {
        var rect = b.getBoundingClientRect();
        return rect.top > 700;
      });
      return JSON.stringify(bottomBtns.map(function(b) {
        var svg = b.querySelector('svg');
        var svgClass = svg ? svg.getAttribute('class') || '' : '';
        return {
          title: b.title || '',
          ariaLabel: b.getAttribute('aria-label') || '',
          text: (b.textContent || '').trim().substring(0, 30),
          disabled: b.disabled,
          type: b.type || '',
          testid: b.getAttribute('data-testid') || '',
          hasSvg: !!svg,
          svgClass: svgClass.substring(0, 50),
          x: Math.round(b.getBoundingClientRect().left),
          y: Math.round(b.getBoundingClientRect().top),
          className: b.className.substring(0, 80)
        };
      }));
    })()
  `
  );
  console.log('[CDP] Bottom buttons:');
  try {
    const btns = JSON.parse(result);
    btns.forEach((b, i) => {
      console.log(
        `  [${i}] title="${b.title}" aria="${b.ariaLabel}" text="${b.text}" testid="${b.testid}" disabled=${b.disabled} type=${b.type} pos=(${b.x},${b.y})`
      );
    });
  } catch (e) {
    console.log(result);
  }
}

async function checkStatus() {
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
      var conv = convs.find(function(c) { return c.id === convId; });
      var msgs = conv ? (conv.messages || []) : [];
      var lastMsgs = msgs.slice(-3);
      return JSON.stringify({
        isStreaming: !!s.isStreaming,
        thinkingMode: s.thinkingMode,
        workingDirectory: s.workingDirectory,
        conversationId: convId,
        messageCount: msgs.length,
        lastMessages: lastMsgs.map(function(m) {
          return {
            role: m.role,
            contentPreview: (m.content || '').substring(0, 300),
            toolCalls: m.tool_calls ? m.tool_calls.length : 0
          };
        })
      });
    })()
  `
  );
  console.log('[CDP] Status:', result);
}

async function waitForCompletion(maxWaitSec) {
  const maxWait = (maxWaitSec || 300) * 1000; // default 5 min
  const startTime = Date.now();
  let lastMsgCount = 0;

  console.log('[CDP] Waiting for streaming to complete (max ' + maxWait / 1000 + 's)...');

  while (Date.now() - startTime < maxWait) {
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
        var conv = convs.find(function(c) { return c.id === convId; });
        var msgs = conv ? (conv.messages || []) : [];
        var lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        return JSON.stringify({
          isStreaming: !!s.isStreaming,
          messageCount: msgs.length,
          lastRole: lastMsg ? lastMsg.role : null,
          lastContentLen: lastMsg ? (lastMsg.content || '').length : 0,
          lastContentPreview: lastMsg ? (lastMsg.content || '').substring(0, 200) : ''
        });
      })()
    `
    );

    try {
      const status = JSON.parse(result);
      const elapsed = Math.round((Date.now() - startTime) / 1000);

      if (status.messageCount !== lastMsgCount) {
        console.log(
          `[CDP] [${elapsed}s] msgs=${status.messageCount} streaming=${status.isStreaming} lastRole=${status.lastRole} contentLen=${status.lastContentLen}`
        );
        if (status.lastContentPreview) {
          console.log(`[CDP]   preview: ${status.lastContentPreview.substring(0, 150)}...`);
        }
        lastMsgCount = status.messageCount;
      }

      if (!status.isStreaming && status.messageCount > 1) {
        console.log('[CDP] Streaming completed!');
        return;
      }
    } catch (e) {
      console.log('[CDP] Parse error:', result);
    }

    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log('[CDP] Timeout reached');
}

async function sendMessage(message) {
  console.log('[CDP] Connecting...');
  const wsUrl = await getWsUrl();
  console.log('[CDP] Connected');

  // Step 1: Set textarea value
  console.log('[CDP] Step 1: Setting textarea value...');
  const escapedMsg = JSON.stringify(message);
  const step1 = await cdpEval(
    wsUrl,
    `
    (function() {
      var ta = document.querySelector('textarea');
      if (!ta) return 'ERROR: No textarea found';
      var setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(ta, ${escapedMsg});
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      ta.dispatchEvent(new Event('change', { bubbles: true }));
      // Also focus textarea
      ta.focus();
      return 'OK: set ' + ta.value.length + ' chars';
    })()
  `
  );
  console.log('[CDP]', step1);

  // Wait for React to process
  await new Promise((r) => setTimeout(r, 1500));

  // Step 2: Find all send-like buttons
  console.log('[CDP] Step 2: Finding send button...');
  const wsUrl2 = await getWsUrl();
  const step2 = await cdpEval(
    wsUrl2,
    `
    (function() {
      // Try multiple selectors
      var btn = document.querySelector('[data-testid="send-button"]') ||
                document.querySelector('[aria-label="Send Message"]') ||
                document.querySelector('[aria-label="메시지 전송"]') ||
                document.querySelector('[title="Send Message"]') ||
                document.querySelector('[title="메시지 전송"]') ||
                document.querySelector('[title="전송"]') ||
                document.querySelector('button[type="submit"]');

      // If none found, search by SVG (send icon is usually ArrowUp or Send icon)
      if (!btn) {
        var allBtns = Array.from(document.querySelectorAll('button'));
        // Find buttons with ArrowUp-like SVG (send icon)
        btn = allBtns.find(function(b) {
          var rect = b.getBoundingClientRect();
          // Must be in the bottom-right area near the textarea
          if (rect.top < 700 || rect.left < 1200) return false;
          // Check for SVG with arrow up path or send icon
          var svg = b.querySelector('svg');
          if (svg) {
            var paths = Array.from(svg.querySelectorAll('path'));
            var d = paths.map(function(p) { return p.getAttribute('d') || ''; }).join(' ');
            // ArrowUp icon typically has upward-pointing path
            return d.includes('M12 19V5') || d.includes('ArrowUp') || d.includes('m5 12') ||
                   b.className.includes('send') || b.getAttribute('aria-label') === 'Send';
          }
          return false;
        });
      }

      if (!btn) {
        // Last resort: find the last button in bottom-right
        var allBtns2 = Array.from(document.querySelectorAll('button')).filter(function(b) {
          var rect = b.getBoundingClientRect();
          return rect.top > 740 && rect.left > 1200;
        });
        if (allBtns2.length > 0) {
          btn = allBtns2[allBtns2.length - 1]; // Last button in the area
        }
      }

      if (btn) {
        var info = {
          found: true,
          title: btn.title,
          ariaLabel: btn.getAttribute('aria-label') || '',
          disabled: btn.disabled,
          x: Math.round(btn.getBoundingClientRect().left),
          y: Math.round(btn.getBoundingClientRect().top)
        };
        if (!btn.disabled) {
          btn.click();
          info.clicked = true;
        }
        return JSON.stringify(info);
      }
      return JSON.stringify({ found: false });
    })()
  `
  );
  console.log('[CDP]', step2);

  // Step 3: Alternatively try Enter key on textarea
  try {
    const parsed = JSON.parse(step2);
    if (!parsed.found || !parsed.clicked) {
      console.log('[CDP] Step 3: Trying Enter key...');
      const wsUrl3 = await getWsUrl();
      await cdpEval(
        wsUrl3,
        `
        (function() {
          var ta = document.querySelector('textarea');
          if (ta) {
            ta.focus();
            // Dispatch Enter keydown event
            var enterEvent = new KeyboardEvent('keydown', {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
              which: 13,
              bubbles: true,
              cancelable: true
            });
            ta.dispatchEvent(enterEvent);
            return 'Enter dispatched';
          }
          return 'No textarea';
        })()
      `
      );
      console.log('[CDP] Enter key dispatched');
    }
  } catch (e) {
    // ignore parse error
  }

  // Step 4: Wait and check streaming
  await new Promise((r) => setTimeout(r, 3000));
  console.log('[CDP] Step 4: Checking streaming...');
  const wsUrl4 = await getWsUrl();
  const step4 = await cdpEval(
    wsUrl4,
    `
    (function() {
      var store = window.__SEPILOT_SDK_STORE__;
      if (!store) return JSON.stringify({ error: 'Store not found' });
      var s = store.getState();
      var convId = s.currentConversationId;
      var convs = s.conversations || [];
      var conv = convs.find(function(c) { return c.id === convId; });
      var msgs = conv ? (conv.messages || []) : [];
      return JSON.stringify({
        isStreaming: !!s.isStreaming,
        thinkingMode: s.thinkingMode,
        messageCount: msgs.length,
        conversationId: convId
      });
    })()
  `
  );
  console.log('[CDP]', step4);
}

async function main() {
  const arg = process.argv[2] || '';

  if (arg === '--find-buttons') {
    await findButtons();
  } else if (arg === '--status') {
    await checkStatus();
  } else if (arg === '--wait') {
    const maxSec = parseInt(process.argv[3]) || 300;
    await waitForCompletion(maxSec);
  } else {
    const message =
      arg ||
      '최신 AI 트렌드에 대한 프레젠테이션을 만들어줘. 웹에서 최신 정보를 조사하고, python-pptx로 10슬라이드 PPTX 파일을 생성해줘.';
    await sendMessage(message);
  }
}

main().catch((e) => {
  console.error('[CDP] Error:', e.message);
  process.exit(1);
});
