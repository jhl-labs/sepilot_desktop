import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => p.url().includes('localhost:3000') && !p.url().includes('/notification')) || pages[0];
console.log('Connected to:', page.url());

// Screenshot
await page.screenshot({ path: '/tmp/sepilot-current.png' });
console.log('Screenshot saved: /tmp/sepilot-current.png');

// App State
const state = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'No SDK store found' };
  const s = store.getState();
  return {
    appMode: s.appMode,
    selectedGraphType: s.selectedGraphType,
    extensions: Object.keys(window.__SEPILOT_EXTENSIONS__ || {}),
    modulesCount: Object.keys(window.__SEPILOT_MODULES__ || {}).length,
    conversationsCount: s.conversations?.length,
    currentConvId: s.currentConversationId,
    skillsCount: s.availableSkills?.length,
    availableSkills: s.availableSkills?.map(sk => ({ id: sk.id, name: sk.name, description: sk.description?.substring(0, 60) })),
  };
});
console.log('\n=== App State ===');
console.log(JSON.stringify(state, null, 2));

// Available graph types
const graphTypes = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return [];
  const s = store.getState();
  return s.availableGraphTypes || [];
});
console.log('\n=== Available Graph Types ===');
console.log(JSON.stringify(graphTypes, null, 2));

// Check current messages
const messages = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return [];
  const s = store.getState();
  const convId = s.currentConversationId;
  const msgs = s.messages?.[convId] || [];
  return msgs.slice(-5).map(m => ({
    role: m.role,
    contentPreview: typeof m.content === 'string' ? m.content.substring(0, 150) : JSON.stringify(m.content).substring(0, 150),
    type: m.type,
    toolCalls: m.tool_calls?.length || 0,
  }));
});
console.log('\n=== Recent Messages ===');
console.log(JSON.stringify(messages, null, 2));

// Check for skills injection state
const skillsState = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return {};
  const s = store.getState();
  return {
    skillsEnabled: s.skillsEnabled,
    systemPromptSkillsIncluded: s.systemPrompt?.includes('skill') || s.systemPrompt?.includes('스킬'),
    selectedPersona: s.selectedPersona?.name,
    workingDirectory: s.workingDirectory,
  };
});
console.log('\n=== Skills State ===');
console.log(JSON.stringify(skillsState, null, 2));

await browser.close();
