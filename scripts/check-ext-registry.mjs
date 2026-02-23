import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];

// 1. Check extension globals
const globals = await page.evaluate(() => {
  return {
    hasModules: !!globalThis.__SEPILOT_MODULES__,
    hasExtensions: !!globalThis.__SEPILOT_EXTENSIONS__,
    moduleKeys: globalThis.__SEPILOT_MODULES__ ? Object.keys(globalThis.__SEPILOT_MODULES__) : [],
    extensionKeys: globalThis.__SEPILOT_EXTENSIONS__ ? Object.keys(globalThis.__SEPILOT_EXTENSIONS__) : [],
    allSepilotGlobals: Object.keys(globalThis).filter(k => k.includes('SEPILOT')).sort(),
  };
});
console.log('=== Extension Globals ===');
console.log(JSON.stringify(globals, null, 2));

// 2. Check store extension-related keys
const storeData = await page.evaluate(() => {
  const store = globalThis.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'no store' };
  const state = store.getState();
  const extKeys = Object.keys(state).filter(k =>
    k.toLowerCase().includes('ext') || k.toLowerCase().includes('mode')
  );
  const result = {};
  extKeys.forEach(k => {
    const val = state[k];
    if (typeof val === 'function') result[k] = '[function]';
    else if (Array.isArray(val)) result[k] = `[array:${val.length}]`;
    else if (typeof val === 'object' && val !== null) result[k] = `[object:${JSON.stringify(val).substring(0, 100)}]`;
    else result[k] = val;
  });
  return result;
});
console.log('\n=== Store Extension Keys ===');
console.log(JSON.stringify(storeData, null, 2));

// 3. Check IPC for loaded extensions
const ipcExtensions = await page.evaluate(async () => {
  const api = globalThis.electronAPI;
  if (!api) return { error: 'no electronAPI' };
  try {
    const result = await api.invoke('extension:list-renderer-extensions');
    if (Array.isArray(result)) {
      return result.map(e => ({ id: e.id, mode: e.manifest?.mode, enabled: e.manifest?.enabled }));
    }
    if (result?.data) {
      return result.data.map(e => ({ id: e.id, mode: e.manifest?.mode, enabled: e.manifest?.enabled }));
    }
    return { raw: JSON.stringify(result).substring(0, 500) };
  } catch (e) { return { error: e.message }; }
});
console.log('\n=== IPC Extension List ===');
console.log(JSON.stringify(ipcExtensions, null, 2));

// 4. Check what's in the extension registry
const registryData = await page.evaluate(() => {
  // Try various ways to access the registry
  const registry = globalThis.__SEPILOT_EXTENSION_REGISTRY__;
  if (registry) {
    const all = registry.getAll ? registry.getAll() : [];
    return { source: 'global', count: all.length, ids: all.map(e => e.manifest?.id) };
  }

  // Try from store
  const store = globalThis.__SEPILOT_SDK_STORE__;
  if (store) {
    const state = store.getState();
    if (state.activeExtensions) {
      return { source: 'store.activeExtensions', count: state.activeExtensions.length };
    }
  }

  return { error: 'no registry found' };
});
console.log('\n=== Extension Registry ===');
console.log(JSON.stringify(registryData, null, 2));

await browser.close();
