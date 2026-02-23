import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';
const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => p.url().includes('localhost:3000') && !p.url().includes('/notification')) || pages[0];

// 정확한 store key 사용
const state = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return {};
  const s = store.getState();

  const activeConvId = s.activeConversationId;

  // messages 구조 확인
  const msgsRaw = s.messages;
  let messagesInfo = {};
  if (msgsRaw) {
    if (typeof msgsRaw === 'object') {
      messagesInfo = {
        type: Array.isArray(msgsRaw) ? 'array' : 'object',
        keys: Object.keys(msgsRaw).slice(0, 10),
        firstFewItems: Array.isArray(msgsRaw)
          ? msgsRaw.slice(0, 3).map(m => ({
              id: m?.id?.substring(0, 30),
              role: m?.role,
              contentLen: typeof m?.content === 'string' ? m.content.length : 0,
              preview: typeof m?.content === 'string' ? m.content.substring(0, 150) : JSON.stringify(m?.content)?.substring(0, 150),
            }))
          : Object.entries(msgsRaw).slice(0, 3).map(([k, v]) => ({
              key: k,
              valueType: typeof v,
              isArray: Array.isArray(v),
              length: Array.isArray(v) ? v.length : undefined,
            })),
      };
    }
  }

  return {
    activeConversationId: activeConvId,
    graphType: s.graphType,
    thinkingMode: s.thinkingMode,
    isStreaming: s.isStreaming,
    appMode: s.appMode,
    enableTools: s.enableTools,
    enableRAG: s.enableRAG,
    activePersonaId: s.activePersonaId,
    workingDirectory: s.workingDirectory,
    messagesInfo,
    // messagesCache 확인
    messagesCacheKeys: Object.keys(s.messagesCache || {}).slice(0, 5),
    // conversations 상세
    activeConv: s.conversations?.find(c => c.id === activeConvId),
  };
});

console.log('=== Precise Store State ===');
console.log(JSON.stringify(state, null, 2));

// 현재 표시중인 채팅 DOM 확인
const chatDom = await page.evaluate(() => {
  // 채팅 메시지 영역 찾기
  const chatArea = document.querySelector('[class*="chat"], [class*="Chat"], [data-testid*="chat"]');
  if (!chatArea) return { error: 'No chat area found' };

  // 메시지 버블 찾기
  const allText = chatArea.textContent?.substring(0, 1000) || '';
  return {
    chatAreaClass: chatArea.className?.toString()?.substring(0, 100),
    textPreview: allText,
    childCount: chatArea.children?.length,
  };
});

console.log('\n=== Chat DOM ===');
console.log(JSON.stringify(chatDom, null, 2));

await browser.close();
