import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];

// 1. Compare __SEPILOT_EXTENSIONS__ entries
const extDetails = await page.evaluate(() => {
  const exts = globalThis.__SEPILOT_EXTENSIONS__;
  if (!exts) return { error: 'no extensions' };

  const result = {};
  for (const [id, ext] of Object.entries(exts)) {
    result[id] = {
      hasManifest: !!ext.manifest,
      mode: ext.manifest?.mode,
      enabled: ext.manifest?.enabled,
      hasMainComponent: !!ext.MainComponent,
      hasSidebarComponent: !!ext.SidebarComponent,
      hasSettingsComponent: !!ext.SettingsComponent,
      hasCreateStoreSlice: !!ext.createStoreSlice,
      hasActivate: !!ext.activate,
      hasDeactivate: !!ext.deactivate,
      manifestKeys: ext.manifest ? Object.keys(ext.manifest) : [],
    };
  }
  return result;
});
console.log('=== Extension Details from __SEPILOT_EXTENSIONS__ ===');
for (const [id, detail] of Object.entries(extDetails)) {
  const status = detail.hasMainComponent ? '✅' : '⚠️';
  console.log(`${status} ${id}: Main=${detail.hasMainComponent} Sidebar=${detail.hasSidebarComponent} mode=${detail.mode} enabled=${detail.enabled}`);
}

// 2. Check activeExtensions content
const activeExts = await page.evaluate(() => {
  const store = globalThis.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'no store' };
  const state = store.getState();
  const active = state.activeExtensions || [];
  return active.map(ext => ({
    id: ext.manifest?.id,
    mode: ext.manifest?.mode,
    hasMain: !!ext.MainComponent,
    hasSidebar: !!ext.SidebarComponent,
  }));
});
console.log('\n=== Active Extensions (in store) ===');
console.log(JSON.stringify(activeExts, null, 2));

// 3. Check extension loading logs - try to re-trigger extension loading
const reloadResult = await page.evaluate(async () => {
  const api = globalThis.electronAPI;
  if (!api) return { error: 'no electronAPI' };

  // Check if there's a refreshExtensions function
  const store = globalThis.__SEPILOT_SDK_STORE__;
  if (store) {
    const state = store.getState();
    if (state.refreshExtensions) {
      try {
        await state.refreshExtensions();
        await new Promise(r => setTimeout(r, 1000));
        return {
          afterRefresh: (store.getState().activeExtensions || []).map(e => e.manifest?.id),
        };
      } catch (e) { return { refreshError: e.message }; }
    }
  }
  return { noRefresh: true };
});
console.log('\n=== After Refresh Attempt ===');
console.log(JSON.stringify(reloadResult, null, 2));

await browser.close();
