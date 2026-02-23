/**
 * Comprehensive App Test Script
 *
 * CDP를 통해 Electron 앱의 전체 기능을 테스트합니다.
 * Phase 1: 기본 상태 점검
 * Phase 2: Extension 로딩 + 모드 전환
 * Phase 3: 설정 다이얼로그
 */

import { chromium } from 'playwright-core';
import fs from 'fs';
import path from 'path';

const CDP_URL = 'http://localhost:9222';
const SCREENSHOTS_DIR = path.join(process.cwd(), 'scripts/screenshots');

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const errors = [];
const warnings = [];
const results = {};

async function main() {
  console.log('=== SEPilot Desktop Comprehensive Test ===\n');

  const browser = await chromium.connectOverCDP(CDP_URL);
  const context = browser.contexts()[0];
  const pages = context.pages();
  const page = pages.find(p => {
    const url = p.url();
    return url.includes('localhost:3000') && !url.includes('/notification');
  }) || pages[0];

  console.log('Connected to:', page.url());

  // Collect console errors
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({ text: msg.text(), location: msg.location() });
    }
    if (msg.type() === 'warning' && !msg.text().includes('DevTools')) {
      warnings.push(msg.text());
    }
  });

  // ===== PHASE 1: Basic State Check =====
  console.log('\n--- Phase 1: Basic State Check ---');

  // 1.1 Store state
  const storeState = await page.evaluate(() => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (!store) return { error: 'No store' };
    const s = store.getState();
    return {
      appMode: s.appMode,
      selectedGraphType: s.selectedGraphType,
      thinkingMode: s.thinkingMode,
      hasModel: !!s.selectedModel,
      modelProvider: s.selectedModelProvider,
      selectedModel: s.selectedModel,
      currentConversationId: s.currentConversationId,
      extensionsVersion: s.extensionsVersion,
    };
  });
  results.storeState = storeState;
  console.log('Store State:', JSON.stringify(storeState, null, 2));

  // 1.2 Extension registry
  const extensionStatus = await page.evaluate(() => {
    const registry = window.__SEPILOT_EXTENSION_REGISTRY__;
    if (!registry) return { error: 'No registry' };
    const extensions = registry.getAll ? registry.getAll() : [];
    return extensions.map(ext => ({
      id: ext.manifest?.id,
      name: ext.manifest?.name,
      mode: ext.manifest?.mode,
      enabled: ext.manifest?.enabled,
      hasMain: !!ext.MainComponent,
      hasSidebar: !!ext.SidebarComponent,
      hasSettings: !!ext.SettingsComponent,
      hasStoreSlice: !!ext.createStoreSlice,
    }));
  });
  results.extensions = extensionStatus;
  console.log(`\nExtensions loaded: ${Array.isArray(extensionStatus) ? extensionStatus.length : 'ERROR'}`);
  if (Array.isArray(extensionStatus)) {
    extensionStatus.forEach(ext => {
      console.log(`  ${ext.enabled ? '✅' : '❌'} ${ext.id} (mode: ${ext.mode}) Main:${ext.hasMain} Sidebar:${ext.hasSidebar} Settings:${ext.hasSettings} Store:${ext.hasStoreSlice}`);
    });
  }

  // 1.3 Skills check
  const skillsStatus = await page.evaluate(async () => {
    const api = window.electronAPI;
    if (!api) return { error: 'No electronAPI' };
    try {
      const result = await api.invoke('skills:get-enabled');
      const skills = Array.isArray(result) ? result : (result?.data || []);
      return {
        totalCount: skills.length,
        skills: skills.map(s => ({
          id: s.id,
          name: s.manifest?.name,
          tags: s.manifest?.tags,
        })),
      };
    } catch (e) { return { error: e.message }; }
  });
  results.skills = skillsStatus;
  console.log(`\nSkills loaded: ${skillsStatus.totalCount || 'ERROR'}`);

  // 1.4 Screenshot of initial state
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-initial-state.png') });
  console.log('Screenshot: 01-initial-state.png');

  // ===== PHASE 2: Extension Mode Switching =====
  console.log('\n--- Phase 2: Extension Mode Switching ---');

  const extensionModes = Array.isArray(extensionStatus)
    ? extensionStatus.filter(e => e.enabled).map(e => e.mode)
    : [];

  for (let i = 0; i < extensionModes.length; i++) {
    const mode = extensionModes[i];
    if (!mode) continue;

    console.log(`\n  Testing mode: ${mode}`);

    // Switch mode via store
    const switchResult = await page.evaluate(async (targetMode) => {
      const store = window.__SEPILOT_SDK_STORE__;
      if (!store) return { error: 'No store' };
      try {
        store.getState().setAppMode(targetMode);
        // Wait for React to re-render
        await new Promise(r => setTimeout(r, 500));
        return {
          success: true,
          currentMode: store.getState().appMode,
        };
      } catch (e) { return { error: e.message }; }
    }, mode);

    if (switchResult.error) {
      console.log(`    ❌ Switch failed: ${switchResult.error}`);
      errors.push({ text: `Mode switch failed: ${mode} - ${switchResult.error}` });
      continue;
    }

    // Wait a bit more for rendering
    await page.waitForTimeout(1000);

    // Check for render errors
    const renderCheck = await page.evaluate(() => {
      // Check if error boundary triggered
      const errorBoundary = document.querySelector('[data-error-boundary]');
      const hasError = errorBoundary?.textContent?.includes('error') || false;

      // Check main content area
      const mainContent = document.querySelector('main') || document.querySelector('[role="main"]');
      const hasContent = mainContent ? mainContent.children.length > 0 : false;

      return { hasError, hasContent };
    });

    const screenshotName = `02-mode-${mode}.png`;
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, screenshotName) });

    console.log(`    ${renderCheck.hasError ? '❌ Error' : '✅ OK'} Content:${renderCheck.hasContent} Screenshot: ${screenshotName}`);
  }

  // ===== PHASE 3: Settings Dialog =====
  console.log('\n--- Phase 3: Settings Dialog ---');

  // Open settings
  const settingsOpened = await page.evaluate(async () => {
    try {
      // Try dispatching the settings event
      window.dispatchEvent(new CustomEvent('open-settings'));
      await new Promise(r => setTimeout(r, 500));

      // Check if dialog appeared
      const dialog = document.querySelector('[role="dialog"]');
      return { opened: !!dialog, dialogContent: dialog?.textContent?.substring(0, 200) };
    } catch (e) { return { error: e.message }; }
  });

  console.log('Settings dialog:', settingsOpened.opened ? 'Opened' : 'Failed');

  if (settingsOpened.opened) {
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-settings-dialog.png') });

    // Check available tabs
    const settingsTabs = await page.evaluate(() => {
      const tabs = document.querySelectorAll('[role="tab"], [data-settings-tab], button[class*="tab"]');
      const tabTexts = [];
      tabs.forEach(tab => {
        const text = tab.textContent?.trim();
        if (text && text.length < 50) tabTexts.push(text);
      });
      return tabTexts;
    });
    console.log(`Settings tabs found: ${settingsTabs.length}`);
    settingsTabs.forEach(t => console.log(`  - ${t}`));

    // Close settings
    await page.evaluate(() => {
      const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Close"]')
        || document.querySelector('[role="dialog"] button:has(svg)');
      if (closeBtn) closeBtn.click();
    });
  }

  // ===== PHASE 4: Chat Input Test =====
  console.log('\n--- Phase 4: Chat Input Test ---');

  // Switch back to default mode
  await page.evaluate(() => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (store) store.getState().setAppMode('editor');
  });
  await page.waitForTimeout(500);

  const chatInputCheck = await page.evaluate(() => {
    // Check for chat input
    const textarea = document.querySelector('textarea');
    const inputArea = document.querySelector('[data-chat-input]') || textarea;
    return {
      hasInput: !!inputArea,
      placeholder: textarea?.placeholder || '',
      isDisabled: textarea?.disabled || false,
    };
  });
  results.chatInput = chatInputCheck;
  console.log('Chat input:', chatInputCheck);

  // ===== PHASE 5: Thinking Mode Check =====
  console.log('\n--- Phase 5: Thinking Mode Options ---');

  const thinkingModes = await page.evaluate(() => {
    const store = window.__SEPILOT_SDK_STORE__;
    if (!store) return [];
    const state = store.getState();
    // Check if there's a thinkingMode selector
    return {
      current: state.thinkingMode,
      graphType: state.selectedGraphType,
      graphConfig: state.graphConfig,
    };
  });
  results.thinkingModes = thinkingModes;
  console.log('Thinking modes:', JSON.stringify(thinkingModes, null, 2));

  // ===== SUMMARY =====
  console.log('\n\n========== TEST SUMMARY ==========');
  console.log(`Total extensions: ${Array.isArray(extensionStatus) ? extensionStatus.length : 'N/A'}`);
  console.log(`Total skills: ${skillsStatus.totalCount || 'N/A'}`);
  console.log(`Console errors collected: ${errors.length}`);
  console.log(`Console warnings collected: ${warnings.length}`);

  if (errors.length > 0) {
    console.log('\n--- Console Errors ---');
    errors.forEach((err, i) => {
      console.log(`${i + 1}. ${err.text?.substring(0, 200)}`);
    });
  }

  if (warnings.length > 0) {
    console.log('\n--- Console Warnings (first 10) ---');
    warnings.slice(0, 10).forEach((w, i) => {
      console.log(`${i + 1}. ${w.substring(0, 200)}`);
    });
  }

  // Save full results
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, 'test-results.json'),
    JSON.stringify({ results, errors, warnings }, null, 2)
  );
  console.log('\nFull results saved to scripts/screenshots/test-results.json');

  await browser.close();
}

main().catch(err => {
  console.error('Test script failed:', err);
  process.exit(1);
});
