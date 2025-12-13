import { test, expect } from '@playwright/test';
import { AppLauncher } from '../helpers/app-launcher';

test.describe('Comprehensive Features Test', () => {
  let launcher: AppLauncher;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  // 1. Editor Mode Feature Test
  test('Editor: Switch to editor mode and verify layout', async () => {
    const window = await launcher.getFirstWindow();

    // Mode switch
    const modeSelector = window.locator('[data-testid="mode-selector"]');
    await expect(modeSelector).toBeVisible();
    await modeSelector.click();

    // Wait for dropdown to appear
    const editorOption = window.locator('[data-testid="mode-editor"]');
    await expect(editorOption).toBeVisible();
    await editorOption.click();

    // Verify mode verification
    await expect(modeSelector).toHaveText(/Editor|에디터/i, { timeout: 10000 });

    // Switch back to chat for subsequent tests
    await modeSelector.click();
    const chatOption = window.locator('[data-testid="mode-chat"]');
    await expect(chatOption).toBeVisible();
    await chatOption.click();
    await expect(modeSelector).toHaveText(/Chat|채팅/i);
  });

  // 2. Thinking Mode Feature Test
  test('Thinking: Verify thinking mode options in chat', async () => {
    const window = await launcher.getFirstWindow();

    // Ensure we are in chat mode
    const modeSelector = window.locator('[data-testid="mode-selector"]');
    if (
      await modeSelector.textContent().then((t) => !t?.includes('Chat') && !t?.includes('채팅'))
    ) {
      await modeSelector.click();
      await window.locator('[data-testid="mode-chat"]').click();
    }

    // click thinking mode trigger
    const thinkingTrigger = window.locator('[data-testid="thinking-mode-trigger"]');
    await expect(thinkingTrigger).toBeVisible();
    await thinkingTrigger.click();

    // Verify options appear
    await expect(window.getByRole('menuitem', { name: /Instant/i }).first()).toBeVisible();
    await expect(window.getByRole('menuitem', { name: /Sequential/i }).first()).toBeVisible();
    await expect(window.getByRole('menuitem', { name: /Deep/i }).first()).toBeVisible();
  });

  // 3. RAG Feature Test
  test('RAG: Verify Document Management access', async () => {
    const window = await launcher.getFirstWindow();

    // Use data-testid selector
    const docsBtn = window.locator('[data-testid="sidebar-documents-btn"]');

    // Wait for it to be visible
    await expect(docsBtn).toBeVisible({ timeout: 5000 });

    await docsBtn.click();

    // Check if "Documents" title appears in the main area
    await expect(window.locator('h1', { hasText: '문서 관리' })).toBeVisible();

    // Check if "문서 추가" button exists
    await expect(window.getByRole('button', { name: /문서 추가/i })).toBeVisible();

    // Click back button to return to chat for subsequent tests (though this is the last one before productivity)
    // Or just let teardown handle it.
    // But better to return to consistent state generally.
    const backBtn = window.getByTitle('대화로 돌아가기');
    if (await backBtn.isVisible()) {
      await backBtn.click();
    }
  });

  // 4. Productivity Feature Test
  test('Productivity: Quick Search capability', async () => {
    const window = await launcher.getFirstWindow();
    await window.keyboard.press('Control+Shift+F');
    // Just verify app doesn't crash
    const title = await window.title();
    expect(title).toContain('SEPilot');
  });
});
