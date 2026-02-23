import { chromium } from 'playwright-core';

const browser = await chromium.connectOverCDP('http://localhost:9222');
const ctx = browser.contexts()[0];
const pages = ctx.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];

// Check what each extension actually has in __SEPILOT_EXTENSIONS__
const extContents = await page.evaluate(() => {
  const exts = globalThis.__SEPILOT_EXTENSIONS__;
  if (!exts) return { error: 'no extensions' };

  const result = {};
  for (const [id, ext] of Object.entries(exts)) {
    const keys = Object.keys(ext || {});
    result[id] = {
      keys: keys,
      hasDefault: !!ext.default,
      defaultKeys: ext.default ? Object.keys(ext.default) : [],
      hasManifest: !!ext.manifest,
      manifestId: ext.manifest?.id,
      manifestMode: ext.manifest?.mode,
      // Check if the definition is nested
      defaultManifest: ext.default?.manifest?.id,
      defaultMainComponent: !!ext.default?.MainComponent,
    };
  }
  return result;
});

console.log('=== Extension Content Analysis ===\n');
for (const [id, detail] of Object.entries(extContents)) {
  const hasMainAnywhere = detail.defaultMainComponent || detail.keys.includes('MainComponent');
  const status = hasMainAnywhere ? '✅' : '❌';
  console.log(`${status} ${id}:`);
  console.log(`   Top-level keys: ${detail.keys.join(', ')}`);
  console.log(`   Has default: ${detail.hasDefault}`);
  if (detail.hasDefault) {
    console.log(`   Default keys: ${detail.defaultKeys.join(', ')}`);
    console.log(`   Default manifest: ${detail.defaultManifest}`);
    console.log(`   Default MainComponent: ${detail.defaultMainComponent}`);
  }
  if (detail.hasManifest) {
    console.log(`   Direct manifest: ${detail.manifestId} (mode: ${detail.manifestMode})`);
  }
  console.log();
}

await browser.close();
