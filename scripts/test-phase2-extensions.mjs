/**
 * Phase 2: Extension UI Loading + Settings Tab Test
 *
 * 12개 Extension 모드 전환 + 설정 다이얼로그 전체 점검
 */

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const CDP_URL = 'http://localhost:9222';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'scripts/screenshots');

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const allErrors = [];

async function main() {
  console.log('=== Phase 2: Extension + Settings Test ===\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => {
    const url = p.url();
    return url.includes('localhost:3000') && !url.includes('/notification');
  }) || pages[0];

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      if (!text.includes('favicon') && !text.includes('DevTools')) {
        allErrors.push({ phase: 'unknown', text: text.substring(0, 300) });
      }
    }
  });

  // ===== Part 1: Extension Mode Switching =====
  console.log('--- Part 1: Extension Mode Switching ---\n');

  // Get all available modes from the mode selector dropdown
  const availableModes = await page.evaluate(() => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (!store) return [];
    const state = store.getState();
    // Get registered extensions from store
    const extensions = state.registeredExtensions || [];
    return extensions;
  });

  console.log('Registered extensions from store:', JSON.stringify(availableModes, null, 2));

  // Known extension modes to test
  const modesToTest = [
    'chat', 'editor', 'browser', 'terminal', 'architect',
    'presentation', 'github-actions', 'github-pr-review',
    'github-project', 'confluence', 'jira-scrum',
    'git-desktop-assistant', 'mail-file-watcher'
  ];

  for (const mode of modesToTest) {
    const errorsBefore = allErrors.length;

    // Switch mode
    const result = await page.evaluate(async (targetMode) => {
      const store = window.__SEPILOT_SDK_STORE__;
      if (!store) return { error: 'No store' };
      try {
        store.getState().setAppMode(targetMode);
        await new Promise(r => setTimeout(r, 800));
        return {
          currentMode: store.getState().appMode,
          success: true,
        };
      } catch (e) { return { error: e.message }; }
    }, mode);

    await page.waitForTimeout(500);

    // Check page state
    const pageState = await page.evaluate(() => {
      const body = document.body;
      const hasErrorBoundary = !!document.querySelector('.error-boundary-fallback');
      const errorTexts = [];
      document.querySelectorAll('.error-boundary-fallback, [data-error]').forEach(el => {
        errorTexts.push(el.textContent?.substring(0, 100));
      });

      // Check sidebar content
      const sidebar = document.querySelector('[data-sidebar]') || document.querySelector('aside') || document.querySelector('.sidebar');
      const sidebarHasContent = sidebar ? sidebar.innerHTML.length > 50 : false;

      return {
        hasErrorBoundary,
        errorTexts,
        sidebarHasContent,
        bodyLength: body.innerHTML.length,
      };
    });

    // Take screenshot
    const screenshotName = `ext-${mode}.png`;
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotName) });

    const newErrors = allErrors.length - errorsBefore;
    const status = pageState.hasErrorBoundary ? '❌ ERROR' : (newErrors > 0 ? '⚠️ WARN' : '✅ OK');

    console.log(`${status} mode: ${mode} (errors: ${newErrors}) sidebar:${pageState.sidebarHasContent}`);

    if (pageState.hasErrorBoundary) {
      console.log(`   Error: ${pageState.errorTexts.join(', ')}`);
    }
    if (newErrors > 0) {
      allErrors.slice(-newErrors).forEach(e => {
        console.log(`   Console: ${e.text.substring(0, 150)}`);
      });
    }
  }

  // ===== Part 2: Settings Dialog =====
  console.log('\n--- Part 2: Settings Dialog ---\n');

  // Go back to chat mode
  await page.evaluate(() => {
    window.__SEPILOT_SDK_STORE__?.getState().setAppMode('chat');
  });
  await page.waitForTimeout(500);

  // Try to open settings by clicking the gear icon
  const settingsOpened = await page.evaluate(async () => {
    // Method 1: Click gear icon in sidebar
    const gearButtons = document.querySelectorAll('button');
    let clicked = false;
    for (const btn of gearButtons) {
      const svg = btn.querySelector('svg');
      if (svg) {
        // Check for settings/gear icon (lucide Settings icon has a specific path)
        const paths = svg.querySelectorAll('path, circle, line');
        const btnText = btn.textContent?.trim().toLowerCase();
        const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase() || '';
        if (btnText === 'settings' || ariaLabel.includes('settings') || ariaLabel.includes('설정')) {
          btn.click();
          clicked = true;
          break;
        }
      }
    }

    if (!clicked) {
      // Method 2: Try dispatch event
      window.dispatchEvent(new CustomEvent('sepilot:open-settings'));
      await new Promise(r => setTimeout(r, 300));
    }

    if (!clicked) {
      // Method 3: Find by icon class or data attribute
      const settingsBtn = document.querySelector('[data-testid="settings-button"]')
        || document.querySelector('button[aria-label*="setting"]')
        || document.querySelector('button[aria-label*="Settings"]');
      if (settingsBtn) {
        settingsBtn.click();
        clicked = true;
      }
    }

    await new Promise(r => setTimeout(r, 500));

    const dialog = document.querySelector('[role="dialog"]');
    return { clicked, opened: !!dialog };
  });

  if (!settingsOpened.opened) {
    // Try clicking the last icon in sidebar footer (typically settings)
    const retrySettings = await page.evaluate(async () => {
      // Get all footer buttons (bottom of sidebar)
      const footer = document.querySelector('.sidebar-footer') || document.querySelector('[class*="footer"]');
      const allButtons = footer ? footer.querySelectorAll('button') : document.querySelectorAll('button');

      // The settings button is usually the last one in the footer
      const buttons = Array.from(allButtons);
      const lastBtn = buttons[buttons.length - 1];
      if (lastBtn) {
        lastBtn.click();
        await new Promise(r => setTimeout(r, 500));
      }

      const dialog = document.querySelector('[role="dialog"]');
      return { opened: !!dialog, buttonCount: buttons.length };
    });

    if (!retrySettings.opened) {
      // Try keyboard shortcut
      await page.keyboard.press('Meta+,');
      await page.waitForTimeout(500);
    }
  }

  // Check if dialog is open now
  const dialogState = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    if (!dialog) return { opened: false };

    // Find tabs/navigation in the dialog
    const navItems = dialog.querySelectorAll('button, [role="tab"], a');
    const tabTexts = [];
    navItems.forEach(item => {
      const text = item.textContent?.trim();
      if (text && text.length > 0 && text.length < 60 && !text.includes('×') && !text.includes('Close')) {
        tabTexts.push(text);
      }
    });

    return { opened: true, tabs: tabTexts, tabCount: tabTexts.length };
  });

  console.log(`Settings dialog: ${dialogState.opened ? 'Opened' : 'FAILED TO OPEN'}`);

  if (dialogState.opened) {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'settings-dialog.png') });
    console.log(`Settings tabs found: ${dialogState.tabCount}`);

    // Try clicking through settings tabs
    const settingsTabList = await page.evaluate(() => {
      const dialog = document.querySelector('[role="dialog"]');
      if (!dialog) return [];

      // Find the sidebar/nav within the dialog
      const navButtons = dialog.querySelectorAll('.settings-nav button, [data-settings-nav] button, nav button');
      if (navButtons.length === 0) {
        // Try finding list items or links in the settings sidebar
        const items = dialog.querySelectorAll('li button, .sidebar button, [class*="nav"] button, [class*="menu"] button');
        return Array.from(items).map((el, i) => ({
          index: i,
          text: el.textContent?.trim().substring(0, 50),
        })).filter(t => t.text && t.text.length > 0 && t.text.length < 50);
      }

      return Array.from(navButtons).map((el, i) => ({
        index: i,
        text: el.textContent?.trim().substring(0, 50),
      }));
    });

    console.log(`\nSettings navigation items: ${settingsTabList.length}`);
    for (const tab of settingsTabList) {
      console.log(`  [${tab.index}] ${tab.text}`);
    }

    // Close dialog
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  // ===== Part 3: Thinking Mode Selector =====
  console.log('\n--- Part 3: Thinking Mode Selector ---\n');

  // Check thinking mode options
  const thinkingModeCheck = await page.evaluate(async () => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (!store) return { error: 'No store' };
    const state = store.getState();

    // Try different thinking modes
    const modes = ['instant', 'chat', 'coding', 'agent', 'deep-thinking', 'cowork'];
    const results = {};

    for (const mode of modes) {
      try {
        if (state.setThinkingMode) {
          state.setThinkingMode(mode);
          await new Promise(r => setTimeout(r, 200));
          const newState = store.getState();
          results[mode] = {
            set: true,
            thinkingMode: newState.thinkingMode,
            graphType: newState.selectedGraphType,
          };
        } else {
          results[mode] = { error: 'setThinkingMode not found' };
        }
      } catch (e) {
        results[mode] = { error: e.message };
      }
    }

    // Reset to instant
    if (state.setThinkingMode) state.setThinkingMode('instant');

    return results;
  });

  console.log('Thinking mode tests:');
  for (const [mode, result] of Object.entries(thinkingModeCheck)) {
    if (result.error) {
      console.log(`  ❌ ${mode}: ${result.error}`);
    } else {
      console.log(`  ✅ ${mode}: thinkingMode=${result.thinkingMode}, graphType=${result.graphType}`);
    }
  }

  // ===== SUMMARY =====
  console.log('\n\n========== PHASE 2 SUMMARY ==========');
  console.log(`Total console errors: ${allErrors.length}`);

  if (allErrors.length > 0) {
    console.log('\n--- All Console Errors ---');
    const unique = [...new Set(allErrors.map(e => e.text.substring(0, 200)))];
    unique.forEach((err, i) => {
      console.log(`${i + 1}. ${err}`);
    });
  }

  // Save results
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'phase2-results.json'),
    JSON.stringify({ errors: allErrors, thinkingModes: thinkingModeCheck }, null, 2)
  );

  await browser.close();
  console.log('\nDone!');
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
