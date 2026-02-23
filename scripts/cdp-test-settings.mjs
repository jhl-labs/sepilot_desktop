/**
 * SEPilot Desktop CDP Settings Dialog Test Script
 * Tests all settings tabs by navigating through them and collecting console errors.
 */

import { chromium } from 'playwright-core';

const CDP_URL = 'http://localhost:9222';

function log(msg) {
  console.log(`[TEST] ${msg}`);
}

function logSection(title) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

async function main() {
  log('SEPilot Settings Dialog CDP Test - Start\n');

  // Connect via CDP
  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();

  // Find the main app page
  let page = null;
  for (const p of pages) {
    const url = p.url();
    if (url.includes('localhost:3000') && !url.includes('/notification') && !url.includes('/quick-input')) {
      page = p;
      break;
    }
  }
  if (!page) page = pages[0];

  log(`Selected page: ${page.url()}`);

  // Collect console errors
  const allConsoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      allConsoleErrors.push(msg.text());
    }
  });

  // ========================================================
  // STEP 1: Open Settings Dialog
  // ========================================================
  logSection('STEP 1: Open Settings Dialog');

  // Close any existing popups
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Dispatch the event
  log('Dispatching sepilot:open-settings event...');
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('sepilot:open-settings'));
  });
  await page.waitForTimeout(2000);

  // Find the settings dialog container - it's a fixed div that appeared
  const settingsContainer = await page.evaluate(() => {
    // Find the fixed container with the nav
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.position === 'fixed' && rect.width > 600 && rect.height > 400) {
        const nav = el.querySelector('nav');
        if (nav && nav.querySelectorAll('button').length > 5) {
          return {
            found: true,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          };
        }
      }
    }
    return { found: false };
  });

  if (!settingsContainer.found) {
    log('ERROR: Settings container not found. Aborting.');
    await browser.close();
    process.exit(1);
  }

  log(`Settings container: ${settingsContainer.width}x${settingsContainer.height}`);

  // ========================================================
  // STEP 2: Discover all tabs
  // ========================================================
  logSection('STEP 2: Discover Settings Tabs');

  // Get all tabs, including ones that need scrolling
  const tabsInfo = await page.evaluate(() => {
    // Find the settings nav
    const allElements = document.querySelectorAll('*');
    let settingsDiv = null;
    for (const el of allElements) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (style.position === 'fixed' && rect.width > 600 && rect.height > 400) {
        const nav = el.querySelector('nav');
        if (nav && nav.querySelectorAll('button').length > 5) {
          settingsDiv = el;
          break;
        }
      }
    }

    if (!settingsDiv) return { tabs: [], categories: [] };

    const nav = settingsDiv.querySelector('nav');
    const h3s = nav.querySelectorAll('h3');
    const categories = Array.from(h3s).map(h => h.textContent?.trim() || '');

    // Get ALL buttons in nav (some may be scrolled out of view)
    const buttons = nav.querySelectorAll('button');
    const tabs = Array.from(buttons).map((btn, idx) => {
      const text = btn.textContent?.trim() || '';
      const title = btn.getAttribute('title') || '';
      const isActive = btn.className?.includes('bg-accent') || false;
      return { text, title, isActive, index: idx };
    }).filter(t => t.text);

    return { tabs, categories, navScrollHeight: nav.scrollHeight, navClientHeight: nav.clientHeight };
  });

  log(`Categories: ${tabsInfo.categories.length}`);
  tabsInfo.categories.forEach((c) => log(`  - ${c}`));
  log(`Nav scrollable: scrollHeight=${tabsInfo.navScrollHeight}, clientHeight=${tabsInfo.navClientHeight}`);
  log(`\nTotal settings tabs: ${tabsInfo.tabs.length}`);
  tabsInfo.tabs.forEach((t, i) => {
    const active = t.isActive ? ' [ACTIVE]' : '';
    log(`  [${i}] "${t.text}"${active}`);
  });

  // ========================================================
  // STEP 3: Initial console errors
  // ========================================================
  logSection('STEP 3: Initial Console Error Check');
  await page.waitForTimeout(500);

  const initialErrors = [...allConsoleErrors];
  if (initialErrors.length > 0) {
    log(`Initial console errors: ${initialErrors.length}`);
    initialErrors.forEach((e, i) => log(`  [${i + 1}] ${e.substring(0, 200)}`));
  } else {
    log('No initial console errors.');
  }

  // ========================================================
  // STEP 4: Click through each tab
  // ========================================================
  logSection('STEP 4: Navigate Through Each Tab');

  const results = [];

  for (let i = 0; i < tabsInfo.tabs.length; i++) {
    const tab = tabsInfo.tabs[i];
    const errorsBeforeClick = allConsoleErrors.length;

    log(`\n--- Tab [${i}]: "${tab.text}" ---`);

    // Scroll the tab into view and click it using evaluate (more reliable than mouse.click for scrolled elements)
    const clickResult = await page.evaluate((tabIndex) => {
      // Find settings container
      const allElements = document.querySelectorAll('*');
      let settingsDiv = null;
      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.position === 'fixed' && rect.width > 600 && rect.height > 400) {
          const nav = el.querySelector('nav');
          if (nav && nav.querySelectorAll('button').length > 5) {
            settingsDiv = el;
            break;
          }
        }
      }
      if (!settingsDiv) return { clicked: false, error: 'Settings container not found' };

      const nav = settingsDiv.querySelector('nav');
      const buttons = nav.querySelectorAll('button');
      const visibleButtons = Array.from(buttons).filter(b => b.textContent?.trim());

      if (tabIndex >= visibleButtons.length) {
        return { clicked: false, error: `Tab index ${tabIndex} out of range (${visibleButtons.length})` };
      }

      const btn = visibleButtons[tabIndex];
      // Scroll button into view
      btn.scrollIntoView({ block: 'center' });
      // Click it
      btn.click();

      return { clicked: true, text: btn.textContent?.trim() };
    }, i);

    if (!clickResult.clicked) {
      log(`  [SKIP] Could not click: ${clickResult.error}`);
      results.push({ name: tab.text, index: i, status: 'SKIP', consoleErrors: [], uiErrors: [] });
      continue;
    }

    await page.waitForTimeout(1500);

    // Collect new console errors
    const newErrors = allConsoleErrors.slice(errorsBeforeClick);

    // Check content area
    const contentCheck = await page.evaluate(() => {
      // Find settings container
      const allElements = document.querySelectorAll('*');
      let settingsDiv = null;
      for (const el of allElements) {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.position === 'fixed' && rect.width > 600 && rect.height > 400) {
          const nav = el.querySelector('nav');
          if (nav && nav.querySelectorAll('button').length > 5) {
            settingsDiv = el;
            break;
          }
        }
      }
      if (!settingsDiv) return { rendered: false };

      const nav = settingsDiv.querySelector('nav');

      // Find active tab
      let activeTabText = '';
      for (const btn of nav.querySelectorAll('button')) {
        if (btn.className?.includes('bg-accent')) {
          activeTabText = btn.textContent?.trim() || '';
          break;
        }
      }

      // Find content area - it's a sibling/adjacent to nav, usually .flex-1.overflow-y-auto or .p-6
      // Strategy: find all descendants with overflow-y-auto that are NOT the nav
      let contentArea = null;

      // Method 1: look for the flex-1 overflow-y-auto p-6 div (the settings content panel)
      const candidates = settingsDiv.querySelectorAll('.overflow-y-auto');
      for (const c of candidates) {
        if (c === nav || nav.contains(c)) continue;  // skip the nav itself
        const rect = c.getBoundingClientRect();
        if (rect.width > 300 && rect.height > 200) {
          contentArea = c;
          break;
        }
      }

      // Method 2: find the sibling of nav inside the flex container
      if (!contentArea) {
        const flexParent = nav.parentElement;
        if (flexParent) {
          for (const child of flexParent.children) {
            if (child !== nav && child.tagName !== 'NAV') {
              const rect = child.getBoundingClientRect();
              if (rect.width > 300) {
                contentArea = child;
                break;
              }
            }
          }
        }
      }

      if (!contentArea) {
        return { rendered: true, activeTab: activeTabText, contentAreaFound: false, hasContent: false };
      }

      const inputs = contentArea.querySelectorAll('input, select, textarea, [role="switch"], [role="checkbox"], [role="combobox"]');
      const buttons = contentArea.querySelectorAll('button');
      const headings = contentArea.querySelectorAll('h1, h2, h3, h4, h5, h6');
      const labels = contentArea.querySelectorAll('label');
      const textContent = contentArea.textContent?.trim() || '';

      // Check for error indicators
      const errorElements = contentArea.querySelectorAll(
        '.text-red-500, .text-destructive, [role="alert"]'
      );
      const errorTexts = Array.from(errorElements)
        .map((el) => el.textContent?.trim())
        .filter((t) => t && t.length > 0 && t.length < 200);

      return {
        rendered: true,
        activeTab: activeTabText,
        contentAreaFound: true,
        inputCount: inputs.length,
        buttonCount: buttons.length,
        headingCount: headings.length,
        labelCount: labels.length,
        contentLength: textContent.length,
        errorTexts,
        hasContent: textContent.length > 10,
        // Sample of content for debugging
        contentPreview: textContent.substring(0, 100),
      };
    });

    const tabResult = {
      name: tab.text,
      index: i,
      rendered: contentCheck.rendered || false,
      activeTab: contentCheck.activeTab || '',
      contentAreaFound: contentCheck.contentAreaFound || false,
      inputCount: contentCheck.inputCount || 0,
      buttonCount: contentCheck.buttonCount || 0,
      headingCount: contentCheck.headingCount || 0,
      labelCount: contentCheck.labelCount || 0,
      contentLength: contentCheck.contentLength || 0,
      consoleErrors: newErrors,
      uiErrors: contentCheck.errorTexts || [],
      hasContent: contentCheck.hasContent || false,
      status: 'OK',
    };

    // Determine status
    if (newErrors.length > 0) {
      tabResult.status = 'ERROR';
    } else if (!contentCheck.contentAreaFound) {
      tabResult.status = 'NO_CONTENT_AREA';
    } else if (!contentCheck.hasContent) {
      tabResult.status = 'EMPTY';
    }

    results.push(tabResult);

    // Log individual tab result
    if (tabResult.status === 'OK') {
      log(`  [OK] "${tab.text}" - ${contentCheck.inputCount} inputs, ${contentCheck.buttonCount} btns, ${contentCheck.labelCount} labels, content: ${contentCheck.contentLength} chars`);
      if (contentCheck.contentPreview) {
        log(`    Preview: "${contentCheck.contentPreview.substring(0, 80)}..."`);
      }
    } else if (tabResult.status === 'EMPTY' || tabResult.status === 'NO_CONTENT_AREA') {
      log(`  [WARN] "${tab.text}" - ${tabResult.status} (contentAreaFound: ${contentCheck.contentAreaFound}, chars: ${contentCheck.contentLength})`);
    } else {
      log(`  [ERROR] "${tab.text}"`);
      if (newErrors.length > 0) {
        log(`    Console errors (${newErrors.length}):`);
        newErrors.forEach((e, j) => log(`      [${j + 1}] ${e.substring(0, 300)}`));
      }
      if (contentCheck.errorTexts && contentCheck.errorTexts.length > 0) {
        log(`    UI error elements:`);
        contentCheck.errorTexts.forEach((e) => log(`      - ${e.substring(0, 200)}`));
      }
      log(`    Content stats: ${contentCheck.inputCount} inputs, ${contentCheck.buttonCount} btns, content: ${contentCheck.contentLength} chars`);
    }
  }

  // ========================================================
  // STEP 5: Close dialog
  // ========================================================
  logSection('STEP 5: Close Settings Dialog');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  log('Pressed Escape to close settings.');

  // ========================================================
  // FINAL REPORT
  // ========================================================
  logSection('FINAL REPORT: Settings Tab Test Results');

  const okTabs = results.filter((r) => r.status === 'OK');
  const errorTabs = results.filter((r) => r.status === 'ERROR');
  const emptyTabs = results.filter((r) => r.status === 'EMPTY' || r.status === 'NO_CONTENT_AREA');
  const skipTabs = results.filter((r) => r.status === 'SKIP');

  log(`\nTotal tabs tested: ${results.length}`);
  log(`  OK (no errors):     ${okTabs.length}`);
  log(`  ERROR:              ${errorTabs.length}`);
  log(`  EMPTY (no content): ${emptyTabs.length}`);
  log(`  SKIP:               ${skipTabs.length}`);

  log('\n--- Tabs that rendered without errors ---');
  if (okTabs.length === 0) log('  (none)');
  okTabs.forEach((r) => {
    log(`  [OK] "${r.name}" - ${r.inputCount} inputs, ${r.buttonCount} btns, ${r.labelCount} labels`);
  });

  if (emptyTabs.length > 0) {
    log('\n--- Tabs with empty content ---');
    emptyTabs.forEach((r) => {
      log(`  [${r.status}] "${r.name}" (contentAreaFound: ${r.contentAreaFound}, ${r.contentLength} chars)`);
    });
  }

  if (errorTabs.length > 0) {
    log('\n--- Tabs with console errors ---');
    errorTabs.forEach((r) => {
      log(`  [ERROR] "${r.name}"`);
      if (r.consoleErrors.length > 0) {
        r.consoleErrors.forEach((e, i) => log(`    [${i + 1}] ${e.substring(0, 300)}`));
      }
      if (r.uiErrors.length > 0) {
        r.uiErrors.forEach((e) => log(`    UI: ${e.substring(0, 200)}`));
      }
    });
  }

  // Total console errors
  const uniqueErrors = [...new Set(allConsoleErrors)];
  log(`\n--- All Unique Console Errors (${uniqueErrors.length}) ---`);
  if (uniqueErrors.length > 0) {
    uniqueErrors.forEach((e, i) => {
      log(`  [${i + 1}] ${e.substring(0, 300)}`);
    });
  } else {
    log('  No console errors during entire test.');
  }

  log('\n' + '='.repeat(70));
  log('  Test Complete');
  log('='.repeat(70));

  await browser.close();
  log('CDP connection closed.');
}

main().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
