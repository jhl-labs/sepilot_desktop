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

// 1. Check extension registry directly
const registryState = await page.evaluate(() => {
  // The extension registry is imported in the app - check if it's accessible
  // Try checking the __SEPILOT_EXTENSIONS__ entries more closely
  const exts = globalThis.__SEPILOT_EXTENSIONS__ || {};
  const results = {};

  for (const [id, mod] of Object.entries(exts)) {
    const def = mod.default || mod;
    results[id] = {
      hasManifest: !!def.manifest,
      manifestId: def.manifest?.id,
      manifestMode: def.manifest?.mode,
      hasMainComponent: !!def.MainComponent,
      hasSidebarComponent: !!def.SidebarComponent,
      hasSettingsComponent: !!def.SettingsComponent,
      hasCreateStoreSlice: !!def.createStoreSlice,
      hasActivate: !!def.activate,
      keys: Object.keys(def).slice(0, 15),
    };
  }
  return results;
});
console.log('\n=== Extension Definitions ===');
console.log(JSON.stringify(registryState, null, 2));

// 2. Try to manually run the loading pipeline for a missing extension
const loadTest = await page.evaluate(async () => {
  const testId = 'terminal';
  const exts = globalThis.__SEPILOT_EXTENSIONS__ || {};
  const mod = exts[testId];
  if (!mod) return { error: 'Not in __SEPILOT_EXTENSIONS__' };

  const def = mod.default || mod;

  // Check if it has the essential fields
  const info = {
    id: testId,
    hasManifest: !!def.manifest,
    manifestId: def.manifest?.id,
    manifestMode: def.manifest?.mode,
    manifestVersion: def.manifest?.version,
    hasMainComponent: !!def.MainComponent,
    hasSidebarComponent: !!def.SidebarComponent,
    mainComponentType: typeof def.MainComponent,
    sidebarComponentType: typeof def.SidebarComponent,
  };

  return info;
});
console.log('\n=== Terminal Extension Detail ===');
console.log(JSON.stringify(loadTest, null, 2));

// 3. Check the file log for extension loading details
const logResult = await page.evaluate(async () => {
  try {
    const api = window.electronAPI;
    if (!api) return { error: 'No API' };

    // Read the extension loading log file
    const result = await api.invoke('fs:read-file', {
      filePath: '/Users/jhl/Library/Application Support/sepilot-desktop/logs/extension-loading.log',
    });
    if (result && typeof result === 'string') {
      // Get last 100 lines
      const lines = result.split('\n');
      return lines.slice(-100).join('\n');
    }
    return { raw: typeof result, keys: result ? Object.keys(result) : null };
  } catch (e) {
    return { error: e.message };
  }
});
console.log('\n=== Extension Loading Log ===');
console.log(typeof logResult === 'string' ? logResult : JSON.stringify(logResult, null, 2));

await browser.close();
