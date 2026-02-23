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

// First switch to chat mode
await page.evaluate(() => {
  const store = window.__SEPILOT_SDK_STORE__;
  if (store) store.getState().setAppMode('chat');
});
await page.waitForTimeout(500);

// Open settings dialog
console.log('Opening settings dialog...');
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent('sepilot:open-settings'));
});
await page.waitForTimeout(2000);

// Check what dialogs exist
const dialogCheck = await page.evaluate(() => {
  // Check for various dialog patterns
  const dialogs = document.querySelectorAll('[role="dialog"]');
  const radixDialogs = document.querySelectorAll('[data-state="open"]');
  const overlays = document.querySelectorAll('[data-radix-portal]');

  // Check body for portal children
  const bodyLastChildren = [];
  for (let i = document.body.children.length - 1; i >= Math.max(0, document.body.children.length - 5); i--) {
    const child = document.body.children[i];
    bodyLastChildren.push({
      tag: child.tagName,
      id: child.id,
      classes: child.className?.substring(0, 100),
      role: child.getAttribute('role'),
      dataState: child.getAttribute('data-state'),
      childCount: child.children.length,
      text: child.textContent?.substring(0, 100),
    });
  }

  return {
    dialogCount: dialogs.length,
    radixCount: radixDialogs.length,
    portalCount: overlays.length,
    bodyLastChildren,
  };
});
console.log('Dialog check:', JSON.stringify(dialogCheck, null, 2));

// Try to find the dialog content - it might use a different selector
const settingsContent = await page.evaluate(() => {
  // Look for the settings dialog by its content
  const allElements = document.querySelectorAll('*');
  const settingsElements = [];
  for (const el of allElements) {
    const text = el.textContent?.trim() || '';
    if (text.startsWith('설정') || text.startsWith('Settings')) {
      if (el.tagName === 'H2' || el.tagName === 'H3') {
        settingsElements.push({
          tag: el.tagName,
          text: text.substring(0, 50),
          parent: el.parentElement?.tagName,
          grandparent: el.parentElement?.parentElement?.tagName,
        });
      }
    }
  }

  // Also check for nav elements (settings sidebar has a nav)
  const navs = document.querySelectorAll('nav');
  const navInfo = Array.from(navs).map(nav => ({
    buttons: nav.querySelectorAll('button').length,
    text: nav.textContent?.substring(0, 200),
  }));

  return { settingsElements, navInfo };
});
console.log('Settings content:', JSON.stringify(settingsContent, null, 2));

// If dialog didn't open, let's check if the settings component renders differently
// It might be a Sheet or a fullscreen overlay instead of a Dialog
const sheetCheck = await page.evaluate(() => {
  const sheets = document.querySelectorAll('[data-state="open"][role="dialog"]');
  const fixedElements = document.querySelectorAll('.fixed.inset-0, [class*="fixed"][class*="inset"]');

  return {
    sheets: sheets.length,
    fixedOverlays: Array.from(fixedElements).map(el => ({
      tag: el.tagName,
      classes: el.className?.substring(0, 200),
      role: el.getAttribute('role'),
      children: el.children.length,
    })),
  };
});
console.log('Sheet/overlay check:', JSON.stringify(sheetCheck, null, 2));

await browser.close();
