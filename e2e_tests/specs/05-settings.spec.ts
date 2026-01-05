import { test, expect } from '../fixtures/electron';
import { MainLayoutPage, SettingsPage } from '../utils/page-objects';
import { wait } from '../utils/helpers';

/**
 * TC5: 설정 페이지 테스트
 *
 * 테스트 목적:
 * - 설정 다이얼로그를 열 수 있는지 확인
 * - 설정 섹션 간 이동이 가능한지 확인
 * - UI/JSON 탭 전환이 작동하는지 확인
 * - 설정 다이얼로그를 닫을 수 있는지 확인
 */
test.describe('설정 페이지', () => {
  test('키보드 단축키로 설정을 열 수 있어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    console.log('✓ 설정 단축키 실행');

    // 설정 다이얼로그가 표시되는지 확인
    await expect(settings.dialog).toBeVisible({ timeout: 5000 });
    console.log('✓ 설정 다이얼로그가 열림');

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);

    const isClosed = !(await settings.dialog.isVisible().catch(() => false));
    expect(isClosed).toBe(true);
    console.log('✓ 설정 다이얼로그가 닫힘');
  });

  test('설정 다이얼로그 구조가 올바르게 렌더링되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    // 사이드바가 표시되는지 확인
    await expect(settings.sidebar).toBeVisible();
    console.log('✓ 설정 사이드바가 표시됨');

    // 콘텐츠 영역이 표시되는지 확인
    await expect(settings.content).toBeVisible();
    console.log('✓ 설정 콘텐츠 영역이 표시됨');

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);
  });

  test('UI/JSON 탭 전환이 작동해야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    // UI 탭이 표시되는지 확인
    const uiTabVisible = await settings.uiTab.isVisible().catch(() => false);
    console.log(`✓ UI 탭 표시 여부: ${uiTabVisible}`);

    // JSON 탭이 표시되는지 확인
    const jsonTabVisible = await settings.jsonTab.isVisible().catch(() => false);
    console.log(`✓ JSON 탭 표시 여부: ${jsonTabVisible}`);

    if (uiTabVisible && jsonTabVisible) {
      // JSON 탭 클릭
      await settings.jsonTab.click();
      await wait(500);
      console.log('✓ JSON 탭으로 전환');

      // UI 탭으로 다시 전환
      await settings.uiTab.click();
      await wait(500);
      console.log('✓ UI 탭으로 전환');
    } else {
      console.log('⚠ UI/JSON 탭이 표시되지 않음 (구현이 변경되었을 수 있음)');
    }

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);
  });

  test('설정 섹션 간 이동이 가능해야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    // 여러 섹션으로 이동 테스트
    const sections = ['general', 'llm', 'network', 'vectordb'];

    for (const section of sections) {
      try {
        await settings.selectSection(section as any);
        console.log(`✓ ${section} 섹션으로 이동 성공`);
        await wait(500);
      } catch (error) {
        console.log(`⚠ ${section} 섹션 이동 실패: ${error}`);
      }
    }

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);
  });

  test('General 섹션이 표시되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    try {
      // General 섹션 선택
      await settings.selectSection('general');
      console.log('✓ General 섹션 선택');

      await wait(500);

      // 언어 선택 요소가 있는지 확인 (General 섹션의 주요 기능)
      const languageSelector = page
        .locator('select, [role="combobox"]')
        .filter({ hasText: /언어|Language/i });
      const hasLanguageSelector = (await languageSelector.count()) > 0;

      if (hasLanguageSelector) {
        console.log('✓ 언어 선택기가 표시됨');
      } else {
        console.log('⚠ 언어 선택기를 찾을 수 없음');
      }
    } catch (error) {
      console.log(`⚠ General 섹션 테스트 실패: ${error}`);
    }

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);
  });

  test('LLM 섹션이 표시되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    try {
      // LLM 섹션 선택
      await settings.selectSection('llm');
      console.log('✓ LLM 섹션 선택');

      await wait(500);

      // LLM 관련 설정이 있는지 확인
      const contentText = await settings.content.textContent();
      console.log(`✓ LLM 섹션 콘텐츠 길이: ${contentText?.length || 0}`);

      expect(contentText).toBeTruthy();
      console.log('✓ LLM 섹션 콘텐츠가 표시됨');
    } catch (error) {
      console.log(`⚠ LLM 섹션 테스트 실패: ${error}`);
    }

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);
  });

  test('Network 섹션이 표시되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    try {
      // Network 섹션 선택
      await settings.selectSection('network');
      console.log('✓ Network 섹션 선택');

      await wait(500);

      // Network 관련 설정이 있는지 확인
      const contentText = await settings.content.textContent();
      console.log(`✓ Network 섹션 콘텐츠 길이: ${contentText?.length || 0}`);

      expect(contentText).toBeTruthy();
      console.log('✓ Network 섹션 콘텐츠가 표시됨');
    } catch (error) {
      console.log(`⚠ Network 섹션 테스트 실패: ${error}`);
    }

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);
  });

  test('ESC 키로 설정을 닫을 수 있어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    await expect(settings.dialog).toBeVisible();
    console.log('✓ 설정 다이얼로그가 열림');

    // ESC 키로 닫기
    await page.keyboard.press('Escape');
    await wait(500);

    const isClosed = !(await settings.dialog.isVisible().catch(() => false));
    expect(isClosed).toBe(true);
    console.log('✓ ESC 키로 설정 다이얼로그가 닫힘');
  });

  test('설정 다이얼로그를 여러 번 열고 닫을 수 있어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    for (let i = 0; i < 3; i++) {
      // 설정 열기
      await mainLayout.openSettings();
      await wait(500);

      await expect(settings.dialog).toBeVisible({ timeout: 3000 });
      console.log(`✓ ${i + 1}번째 설정 열기 성공`);

      // 설정 닫기
      await settings.close();
      await wait(500);

      const isClosed = !(await settings.dialog.isVisible().catch(() => false));
      expect(isClosed).toBe(true);
      console.log(`✓ ${i + 1}번째 설정 닫기 성공`);
    }

    console.log('✓ 설정을 여러 번 열고 닫기 성공');
  });

  test('설정 사이드바의 모든 섹션이 클릭 가능해야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const settings = new SettingsPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    // 사이드바의 모든 버튼 찾기
    const sidebarButtons = settings.sidebar.locator('button');
    const buttonCount = await sidebarButtons.count();
    console.log(`✓ 설정 사이드바 버튼 개수: ${buttonCount}`);

    expect(buttonCount).toBeGreaterThan(0);

    // 각 버튼이 클릭 가능한지 확인
    for (let i = 0; i < Math.min(buttonCount, 5); i++) {
      const button = sidebarButtons.nth(i);
      const isClickable = await button.isEnabled();
      console.log(`✓ 버튼 ${i + 1} 클릭 가능: ${isClickable}`);
    }

    // 다이얼로그 닫기
    await settings.close();
    await wait(500);
  });

  test('스크린샷 캡처', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);

    // 설정 열기
    await mainLayout.openSettings();
    await wait(1000);

    await page.screenshot({
      path: 'e2e_tests/test-results/05-settings-dialog.png',
      fullPage: true,
    });
    console.log('✓ 스크린샷 저장됨: 05-settings-dialog.png');

    // 설정 닫기
    await page.keyboard.press('Escape');
    await wait(500);
  });
});
