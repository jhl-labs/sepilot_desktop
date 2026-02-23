import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];
console.log('Connected to:', page.url());

// Reload the page to apply config changes
console.log('Reloading page...');
await page.reload({ waitUntil: 'networkidle' });
await new Promise(resolve => setTimeout(resolve, 8000)); // Wait for extensions to load

// Check final state
const state = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'No store' };
  const s = store.getState();
  return {
    activeExtensions: (s.activeExtensions || []).map(e => ({
      id: e.manifest?.id,
      mode: e.manifest?.mode,
      hasMain: !!e.MainComponent,
      hasSidebar: !!e.SidebarComponent,
    })),
    extensionsVersion: s.extensionsVersion,
    appMode: s.appMode,
    activeCount: (s.activeExtensions || []).length,
  };
});
console.log('\n=== Active Extensions After Reload ===');
console.log(`Total active: ${state.activeCount}`);
console.log(JSON.stringify(state, null, 2));

// Quick test: switch to each mode and verify no errors
const modeTests = ['terminal', 'architect', 'presentation', 'github-actions', 'confluence', 'jira-scrum', 'git-desktop-assistant', 'mail-monitor'];
const modeResults = [];

for (const mode of modeTests) {
  const result = await page.evaluate(async (testMode) => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (!store) return { error: 'No store' };

    store.getState().setAppMode(testMode);
    await new Promise(resolve => setTimeout(resolve, 500));

    const s = store.getState();
    const activeExt = (s.activeExtensions || []).find(e => e.manifest?.mode === testMode);
    return {
      mode: testMode,
      appMode: s.appMode,
      extensionFound: !!activeExt,
      extensionId: activeExt?.manifest?.id,
    };
  }, mode);
  modeResults.push(result);
}

console.log('\n=== Mode Switch Test Results ===');
modeResults.forEach(r => {
  console.log(`  ${r.extensionFound ? '✅' : '❌'} ${r.mode}: ${r.extensionFound ? r.extensionId : 'NOT FOUND'}`);
});

// Reset to chat mode
await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (store) store.getState().setAppMode('chat');
});

await browser.close();
