import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => p.url().includes('localhost:3000') && !p.url().includes('/notification')) || pages[0];

// 최근 대화의 메시지 확인
const chatState = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'No store' };
  const s = store.getState();

  return {
    appMode: s.appMode,
    currentConvId: s.currentConversationId,
    conversations: s.conversations?.map(c => ({
      id: c.id,
      title: c.title?.substring(0, 50),
      graphType: c.graphType,
      messagesCount: s.messages?.[c.id]?.length || 0,
    })),
    // 현재 대화 메시지
    currentMessages: (() => {
      const convId = s.currentConversationId;
      if (!convId) return [];
      const msgs = s.messages?.[convId] || [];
      return msgs.map(m => ({
        id: m.id?.substring(0, 20),
        role: m.role,
        contentPreview: typeof m.content === 'string' ? m.content.substring(0, 200) : 'non-string',
        type: m.type,
        toolCalls: m.tool_calls?.length || 0,
      }));
    })(),
    // 에이전트 관련 상태
    streaming: s.isStreaming,
    isAgentRunning: s.isAgentRunning,
    selectedGraphType: s.selectedGraphType,
  };
});

console.log('=== Chat State ===');
console.log(JSON.stringify(chatState, null, 2));

// DOM에서 표시되는 채팅 메시지 확인
const visibleMessages = await page.evaluate(() => {
  const messageElements = document.querySelectorAll('[data-message-id], [class*="message"], [class*="Message"]');
  return Array.from(messageElements).slice(0, 10).map(el => ({
    className: el.className?.substring(0, 80),
    textPreview: el.textContent?.substring(0, 200),
    dataAttr: el.getAttribute('data-message-id'),
  }));
});

console.log('\n=== Visible DOM Messages ===');
console.log(JSON.stringify(visibleMessages, null, 2));

// 스크린샷
await page.screenshot({ path: '/tmp/sepilot-chat-detail.png' });
console.log('\nScreenshot: /tmp/sepilot-chat-detail.png');

await browser.close();
