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

// 1. Check current extensions config
const currentConfig = await page.evaluate(async () => {
  const api = window.electronAPI;
  if (!api) return { error: 'No API' };

  try {
    const result = await api.config.load();
    return {
      extensions: result.data?.extensions || {},
      allKeys: Object.keys(result.data || {}),
    };
  } catch (e) {
    return { error: e.message };
  }
});
console.log('\n=== Current Extensions Config ===');
console.log(JSON.stringify(currentConfig, null, 2));

// 2. Enable all extensions in config
const enableResult = await page.evaluate(async () => {
  const api = window.electronAPI;
  if (!api) return { error: 'No API' };

  try {
    // Load current config
    const configResult = await api.config.load();
    const config = configResult.data || {};
    const extensions = config.extensions || {};

    // Enable all extensions
    const extensionIds = [
      'architect', 'browser', 'confluence', 'editor',
      'git-desktop-assistant', 'github-actions', 'github-pr-review',
      'github-project', 'jira-scrum', 'mail-file-watcher',
      'presentation', 'terminal'
    ];

    for (const id of extensionIds) {
      extensions[id] = { ...(extensions[id] || {}), enabled: true };
    }

    // Save config
    config.extensions = extensions;
    const saveResult = await api.config.save(config);
    return {
      success: true,
      saveResult,
      enabledExtensions: Object.entries(extensions)
        .filter(([, v]) => v.enabled)
        .map(([k]) => k),
    };
  } catch (e) {
    return { error: e.message, stack: e.stack };
  }
});
console.log('\n=== Enable All Extensions Result ===');
console.log(JSON.stringify(enableResult, null, 2));

await browser.close();
