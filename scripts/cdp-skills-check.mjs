import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => p.url().includes('localhost:3000') && !p.url().includes('/notification')) || pages[0];
console.log('Connected to:', page.url());

// IPC를 통해 스킬 상태 확인
const skillsState = await page.evaluate(async () => {
  try {
    // electronAPI를 통해 스킬 상태 확인
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI found' };

    // skills:get-installed 호출
    let installed = null;
    let enabled = null;

    try {
      installed = await api.invoke('skills:get-installed');
    } catch (e) {
      installed = { error: e.message };
    }

    try {
      enabled = await api.invoke('skills:get-enabled');
    } catch (e) {
      enabled = { error: e.message };
    }

    return {
      installed: installed ? (Array.isArray(installed) ? installed.map(s => ({ id: s.id, name: s.manifest?.name, enabled: s.enabled, version: s.manifest?.version })) : installed) : null,
      enabled: enabled ? (Array.isArray(enabled) ? enabled.map(s => ({ id: s.id, name: s.manifest?.name })) : enabled) : null,
    };
  } catch (err) {
    return { error: err.message };
  }
});

console.log('\n=== Skills State ===');
console.log(JSON.stringify(skillsState, null, 2));

// Zustand store에서 스킬 관련 상태 확인
const storeSkills = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'No store' };
  const s = store.getState();
  return {
    selectedGraphType: s.selectedGraphType,
    graphConfig: s.graphConfig,
  };
});
console.log('\n=== Store Graph Config ===');
console.log(JSON.stringify(storeSkills, null, 2));

await browser.close();
