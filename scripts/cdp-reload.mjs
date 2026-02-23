import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';
const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];

console.log('Reloading page...');
await page.reload({ waitUntil: 'networkidle' });
console.log('Page reloaded, waiting for extensions...');
await page.waitForTimeout(4000);
console.log('Done. Page URL:', page.url());
await browser.close();
