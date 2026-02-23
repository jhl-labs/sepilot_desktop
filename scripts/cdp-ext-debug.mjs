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

// 1. Check __SEPILOT_EXTENSIONS__
const globalExts = await page.evaluate(() => {
  const exts = globalThis.__SEPILOT_EXTENSIONS__ || {};
  return Object.keys(exts);
});
console.log('\n=== __SEPILOT_EXTENSIONS__ ===');
console.log('Count:', globalExts.length);
console.log('IDs:', JSON.stringify(globalExts));

// 2. Check activeExtensions in store
const storeState = await page.evaluate(() => {
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
  };
});
console.log('\n=== Store State ===');
console.log(JSON.stringify(storeState, null, 2));

// 3. Check if loadExtensionRuntime was called with console override
// Try loading one extension manually to see what happens
const testResult = await page.evaluate(async () => {
  const results = {};

  // Check what IPC returns
  try {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI' };

    const ipcResult = await api.invoke('extension:list-renderer-extensions');
    if (!ipcResult?.success) return { error: 'IPC failed', detail: ipcResult };

    const extList = ipcResult.data || [];
    results.ipcExtensionCount = extList.length;
    results.ipcExtensions = extList.map(e => ({
      id: e.id,
      renderer: e.renderer,
      hasRenderer: !!e.renderer,
    }));
  } catch (e) {
    results.ipcError = e.message;
  }

  return results;
});
console.log('\n=== IPC Extension List ===');
console.log(JSON.stringify(testResult, null, 2));

// 4. Try manually loading a missing extension via script tag
const manualLoadResult = await page.evaluate(async () => {
  const testId = 'terminal';
  const scriptUrl = `sepilot-ext://${testId}/dist/renderer.js`;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;

    script.onload = () => {
      const exts = globalThis.__SEPILOT_EXTENSIONS__ || {};
      const loaded = !!exts[testId];
      script.remove();
      resolve({
        success: true,
        loaded,
        extensionKeys: Object.keys(exts),
        hasDefault: loaded ? !!exts[testId].default : false,
        hasManifest: loaded ? !!(exts[testId].default || exts[testId]).manifest : false,
      });
    };

    script.onerror = (event) => {
      script.remove();
      resolve({
        success: false,
        error: 'Script load failed',
        scriptUrl,
      });
    };

    document.head.appendChild(script);

    // Timeout
    setTimeout(() => resolve({ success: false, error: 'timeout' }), 5000);
  });
});
console.log('\n=== Manual Script Load Test (terminal) ===');
console.log(JSON.stringify(manualLoadResult, null, 2));

await browser.close();
