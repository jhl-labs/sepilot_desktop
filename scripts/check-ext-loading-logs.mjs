import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];

// 1. Get all console messages
const messages = [];
page.on('console', msg => {
  messages.push({ type: msg.type(), text: msg.text() });
});

// 2. Re-trigger extension loading and capture logs
const reloadResult = await page.evaluate(async () => {
  // Attempt to call the extension loading function
  const api = globalThis.electronAPI;
  if (!api) return { error: 'no electronAPI' };

  // Get current extension list
  try {
    const result = await api.invoke('extension:list-renderer-extensions');
    const extList = Array.isArray(result) ? result : (result?.data || []);
    return {
      rendererExtensionCount: extList.length,
      extensionIds: extList.map(e => e.id),
      // Check if extensions have renderer entry
      details: extList.map(e => ({
        id: e.id,
        hasRenderer: !!e.renderer,
        renderer: e.renderer,
        hasManifest: !!e.manifest,
        manifestId: e.manifest?.id,
        mode: e.manifest?.mode,
        enabled: e.manifest?.enabled,
      })),
    };
  } catch (e) {
    return { error: e.message };
  }
});
console.log('=== Renderer Extension List from Main Process ===');
console.log(JSON.stringify(reloadResult, null, 2));

// 3. Check what the loader received
const loaderState = await page.evaluate(() => {
  // Check if there's a loading status or error info
  const store = globalThis.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'no store' };
  const state = store.getState();

  return {
    activeExtensionCount: (state.activeExtensions || []).length,
    activeIds: (state.activeExtensions || []).map(e => e.manifest?.id),
    extensionsVersion: state.extensionsVersion,
    // Check if there are failed extensions info
    extensionErrors: state.extensionErrors,
    extensionLoadStatus: state.extensionLoadStatus,
  };
});
console.log('\n=== Loader State ===');
console.log(JSON.stringify(loaderState, null, 2));

// 4. Try manually loading a failed extension
const manualLoadTest = await page.evaluate(async () => {
  const extId = 'terminal';
  const ext = globalThis.__SEPILOT_EXTENSIONS__?.[extId];
  if (!ext) return { error: 'not in globals' };

  // Try to access the definition
  const def = ext.default || ext;
  return {
    id: extId,
    manifestId: def.manifest?.id,
    manifestMode: def.manifest?.mode,
    hasMainComponent: !!def.MainComponent,
    hasSidebarComponent: !!def.SidebarComponent,
    hasCreateStoreSlice: !!def.createStoreSlice,
    // Check if we can get all manifest data
    manifestName: def.manifest?.name,
    manifestEnabled: def.manifest?.enabled,
    manifestShowInSidebar: def.manifest?.showInSidebar,
  };
});
console.log('\n=== Manual Load Test (terminal) ===');
console.log(JSON.stringify(manualLoadTest, null, 2));

// 5. Check the actual loadExtensions call trace
const loadTrace = await page.evaluate(async () => {
  // Look for the extension loader module
  const loader = globalThis.__SEPILOT_EXTENSION_LOADER__;
  if (loader) return { hasLoader: true };

  // Try to see what happened during initial load
  // Check script tags for extension loading
  const scripts = document.querySelectorAll('script[src*="sepilot-ext"]');
  const scriptSrcs = Array.from(scripts).map(s => s.src);

  return {
    hasLoader: false,
    extensionScripts: scriptSrcs,
    scriptCount: scriptSrcs.length,
  };
});
console.log('\n=== Extension Script Tags ===');
console.log(JSON.stringify(loadTrace, null, 2));

await browser.close();
