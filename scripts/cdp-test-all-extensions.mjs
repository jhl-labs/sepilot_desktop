import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const CDP_URL = 'http://localhost:9222';
const SCREENSHOT_DIR = path.join(process.cwd(), 'scripts', 'screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const browser = await chromium.connectOverCDP(CDP_URL);
const context = browser.contexts()[0];
const pages = context.pages();
const page = pages.find(p => {
  const url = p.url();
  return url.includes('localhost:3000') && !url.includes('/notification');
}) || pages[0];
console.log('Connected to:', page.url());

// Test modes in order
const testModes = [
  { mode: 'chat', label: 'Chat' },
  { mode: 'editor', label: 'Editor' },
  { mode: 'browser', label: 'Browser' },
  { mode: 'terminal', label: 'Terminal' },
  { mode: 'architect', label: 'Architect' },
  { mode: 'presentation', label: 'Presentation' },
  { mode: 'github-actions', label: 'GitHub Actions' },
  { mode: 'github-pr-review', label: 'GitHub PR Review' },
  { mode: 'github-project', label: 'GitHub Project' },
  { mode: 'confluence', label: 'Confluence' },
  { mode: 'jira-scrum', label: 'Jira Scrum' },
  { mode: 'git-desktop-assistant', label: 'Git Desktop' },
  { mode: 'mail-monitor', label: 'Mail File Watcher' },
];

const results = [];

for (const { mode, label } of testModes) {
  // Clear console errors
  const errors = [];
  const consoleHandler = msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  };
  page.on('console', consoleHandler);

  // Switch mode
  await page.evaluate(m => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (store) store.getState().setAppMode(m);
  }, mode);

  // Wait for render
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Take screenshot
  const screenshotPath = path.join(SCREENSHOT_DIR, `ext-${mode}.png`);
  await page.screenshot({ path: screenshotPath });

  // Check for "not found" text
  const hasNotFound = await page.evaluate(() => {
    const body = document.body.textContent || '';
    return body.includes('not found') || body.includes('Extension for mode');
  });

  // Check for visible main content (not just sidebar)
  const mainContentCheck = await page.evaluate(m => {
    // Check if there's meaningful content in the main area
    const mainArea = document.querySelector('main') || document.querySelector('[class*="main"]');
    const bodyText = document.body.textContent || '';
    return {
      hasMainArea: !!mainArea,
      mainText: mainArea ? mainArea.textContent?.substring(0, 200) : null,
      hasExtNotFound: bodyText.includes(`Extension for mode '${m}' not found`) ||
                      bodyText.includes(`Extension for mode "${m}" not found`),
    };
  }, mode);

  page.removeListener('console', consoleHandler);

  const result = {
    mode,
    label,
    hasNotFound: mainContentCheck.hasExtNotFound,
    consoleErrors: errors.length,
    errors: errors.slice(0, 3), // First 3 errors
    screenshot: screenshotPath,
  };
  results.push(result);

  const status = result.hasNotFound ? '❌ NOT FOUND' :
                 result.consoleErrors > 0 ? `⚠️ ${result.consoleErrors} errors` : '✅ OK';
  console.log(`${status} ${label} (${mode})`);
  if (result.consoleErrors > 0) {
    result.errors.forEach(e => console.log(`    Error: ${e.substring(0, 150)}`));
  }
}

// Summary
console.log('\n=== Summary ===');
const ok = results.filter(r => !r.hasNotFound && r.consoleErrors === 0).length;
const withErrors = results.filter(r => !r.hasNotFound && r.consoleErrors > 0).length;
const notFound = results.filter(r => r.hasNotFound).length;
console.log(`✅ OK: ${ok}`);
console.log(`⚠️ With errors: ${withErrors}`);
console.log(`❌ Not found: ${notFound}`);

// Reset to chat mode
await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (store) store.getState().setAppMode('chat');
});

await browser.close();
