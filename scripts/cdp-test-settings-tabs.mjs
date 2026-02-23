import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';
const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];

// Collect console errors
const errors = [];
page.on('console', msg => {
  if (msg.type() === 'error') {
    errors.push(msg.text());
  }
});

// Switch to chat mode first
await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (store) store.getState().setAppMode('chat');
});
await page.waitForTimeout(500);

// Open settings
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('sepilot:open-settings'));
});
await page.waitForTimeout(1500);

// Get all nav buttons (settings tabs)
const tabs = await page.evaluate(() => {
  const nav = document.querySelector('nav');
  if (!nav) return [];
  const buttons = nav.querySelectorAll('button');
  return Array.from(buttons).map(btn => {
    const rect = btn.getBoundingClientRect();
    return {
      text: btn.textContent?.trim() || '',
      x: Math.round(rect.x + rect.width / 2),
      y: Math.round(rect.y + rect.height / 2),
      visible: rect.width > 0 && rect.height > 0,
    };
  }).filter(t => t.visible && t.text);
});

console.log(`Found ${tabs.length} settings tabs\n`);

const results = [];
for (let i = 0; i < tabs.length; i++) {
  const tab = tabs[i];
  const errorsBefore = errors.length;

  await page.mouse.click(tab.x, tab.y);
  await page.waitForTimeout(800);

  const newErrors = errors.slice(errorsBefore);
  const status = newErrors.length > 0 ? 'ERROR' : 'OK';
  const icon = status === 'OK' ? '✅' : '⚠️';

  console.log(`${icon} ${tab.text}${newErrors.length > 0 ? ` (${newErrors.length} errors)` : ''}`);
  if (newErrors.length > 0) {
    newErrors.forEach(e => console.log(`    ${e.substring(0, 150)}`));
  }

  results.push({ name: tab.text, status, errors: newErrors });
}

// Close dialog
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// Summary
const ok = results.filter(r => r.status === 'OK').length;
const errCount = results.filter(r => r.status === 'ERROR').length;
console.log(`\n=== Summary ===`);
console.log(`✅ OK: ${ok}`);
console.log(`⚠️ Errors: ${errCount}`);

await browser.close();
