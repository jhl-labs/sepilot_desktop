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

// Check the registry state
const registryInfo = await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (!store) return { error: 'No store' };
  const state = store.getState();

  // Get extension registry info
  const activeExts = (state.activeExtensions || []).map(e => e.manifest?.id);

  // Check extensionsVersion
  return {
    activeExtensions: activeExts,
    extensionsVersion: state.extensionsVersion,
    hasUpdateActiveExtensions: typeof state.updateActiveExtensions === 'function',
  };
});
console.log('\n=== Registry Info ===');
console.log(JSON.stringify(registryInfo, null, 2));

// The key test: manually trigger the full loading pipeline for ONE extension
const pipelineTest = await page.evaluate(async () => {
  const testId = 'architect';
  const results = { extensionId: testId, steps: [] };

  try {
    // Step 1: Check __SEPILOT_EXTENSIONS__
    const exts = globalThis.__SEPILOT_EXTENSIONS__ || {};
    const mod = exts[testId];
    results.steps.push({ step: 1, name: 'Check __SEPILOT_EXTENSIONS__', found: !!mod });

    if (!mod) {
      results.steps.push({ step: 1.5, name: 'Script tag load needed' });
      return results;
    }

    // Step 2: Resolve definition
    const def = mod.default || mod;
    results.steps.push({
      step: 2,
      name: 'Resolve definition',
      hasManifest: !!def.manifest,
      id: def.manifest?.id,
      mode: def.manifest?.mode,
    });

    // Step 3: Try to get the extension registry module
    // This mimics what loader.ts does after loadExtensionRuntime()
    const loadedExt = def;

    // Step 4: Try registration in extension registry
    // We need to import extensionRegistry - but that's bundled in the app
    // Let's check if there's a way to access it
    const store = window.__SEPILOT_SDK_STORE__;
    const state = store.getState();
    const isAlreadyActive = (state.activeExtensions || []).some(e => e.manifest?.id === testId);
    results.steps.push({
      step: 4,
      name: 'Check if already active',
      isAlreadyActive,
    });

    // Step 5: Check updateActiveExtensions function
    results.steps.push({
      step: 5,
      name: 'Check store functions',
      hasUpdateActiveExtensions: typeof state.updateActiveExtensions === 'function',
      hasSetExtensionsVersion: typeof state.setExtensionsVersion === 'function',
    });

  } catch (e) {
    results.error = e.message;
    results.stack = e.stack;
  }

  return results;
});
console.log('\n=== Pipeline Test (architect) ===');
console.log(JSON.stringify(pipelineTest, null, 2));

// Check the Electron console log for renderer-side extension loading messages
// Listen for console messages
const consoleMessages = [];
page.on('console', msg => {
  const text = msg.text();
  if (text.includes('Extension') || text.includes('extension') || text.includes('RuntimeLoader') || text.includes('ExtensionLoader')) {
    consoleMessages.push(`[${msg.type()}] ${text}`);
  }
});

// Force a page reload to see the loading flow
console.log('\n=== Reloading page to capture loading flow... ===');
await page.reload({ waitUntil: 'networkidle' });

// Wait for extensions to load
await new Promise(resolve => setTimeout(resolve, 5000));

console.log(`\n=== Console Messages During Load (${consoleMessages.length}) ===`);
consoleMessages.forEach(msg => console.log(msg));

// Check final state after reload
const finalState = await page.evaluate(() => {
  const exts = globalThis.__SEPILOT_EXTENSIONS__ || {};
  const store = window.__SEPILOT_SDK_STORE__;
  const state = store ? store.getState() : null;
  return {
    globalExts: Object.keys(exts),
    activeExts: state ? (state.activeExtensions || []).map(e => e.manifest?.id) : [],
  };
});
console.log('\n=== Final State After Reload ===');
console.log(JSON.stringify(finalState, null, 2));

await browser.close();
