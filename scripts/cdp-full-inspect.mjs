import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => p.url().includes('localhost:3000') && !p.url().includes('/notification')) || pages[0];

// 1. 전체 store state의 키 목록 확인
const storeKeys = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return [];
  const s = store.getState();
  return Object.keys(s).filter(k => {
    const v = s[k];
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
});
console.log('=== Store Keys (non-empty) ===');
console.log(storeKeys);

// 2. 현재 대화 상태 더 자세히
const convState = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return {};
  const s = store.getState();
  return {
    currentConversationId: s.currentConversationId,
    selectedGraphType: s.selectedGraphType,
    isStreaming: s.isStreaming,
    isAgentRunning: s.isAgentRunning,
    graphConfig: s.graphConfig,
    // 메시지 저장 구조 확인
    messagesKeys: Object.keys(s.messages || {}),
    messagesCountByConv: Object.fromEntries(
      Object.entries(s.messages || {}).map(([k, v]) => [k.substring(0, 25), Array.isArray(v) ? v.length : 'non-array'])
    ),
    // 현재 대화의 메시지
    currentMessagesDetail: (() => {
      const convId = s.currentConversationId;
      if (!convId) return 'no current conv';
      const msgs = s.messages?.[convId];
      if (!msgs) return `no messages for ${convId.substring(0, 20)}`;
      if (!Array.isArray(msgs)) return `messages is ${typeof msgs}`;
      return msgs.map(m => ({
        role: m.role,
        contentLen: typeof m.content === 'string' ? m.content.length : 0,
        preview: typeof m.content === 'string' ? m.content.substring(0, 100) : 'non-string',
      }));
    })(),
  };
});
console.log('\n=== Conversation State ===');
console.log(JSON.stringify(convState, null, 2));

// 3. Electron 콘솔 로그에서 스킬 관련 로그 수집
const consoleErrors = [];
page.on('console', msg => {
  if (msg.type() === 'error' || msg.text().includes('Skill') || msg.text().includes('skill')) {
    consoleErrors.push(`[${msg.type()}] ${msg.text().substring(0, 200)}`);
  }
});

// 잠시 대기 후 수집
await new Promise(r => setTimeout(r, 2000));

console.log('\n=== Console Messages (skill related) ===');
console.log(consoleErrors);

// 4. 스크린샷
await page.screenshot({ path: '/tmp/sepilot-detail.png' });
console.log('\nScreenshot saved');

await browser.close();
