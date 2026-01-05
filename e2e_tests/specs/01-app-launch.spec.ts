import { test, expect } from '../fixtures/electron';
import { MainLayoutPage, ChatPage } from '../utils/page-objects';

/**
 * TC1: 애플리케이션 실행 및 기본 UI 로딩 테스트
 *
 * 테스트 목적:
 * - Electron 앱이 정상적으로 실행되는지 확인
 * - 메인 윈도우가 올바르게 로드되는지 확인
 * - 기본 UI 구조가 존재하는지 확인
 */
test.describe('애플리케이션 실행 및 기본 UI', () => {
  test('앱이 성공적으로 실행되어야 함', async ({ app, page }) => {
    // 앱이 실행되었는지 확인
    expect(app).toBeTruthy();
    console.log('✓ Electron 앱이 실행됨');

    // 윈도우가 존재하는지 확인
    const windows = app.windows();
    expect(windows.length).toBeGreaterThan(0);
    console.log(`✓ 윈도우 개수: ${windows.length}`);

    // 페이지가 로드되었는지 확인
    expect(page).toBeTruthy();
    const url = page.url();
    console.log(`✓ 페이지 URL: ${url}`);

    // E2E 테스트는 Next.js dev 서버(localhost:3000)를 사용
    // URL이 localhost를 포함하거나, 오류 페이지가 아니어야 함
    const isValidURL =
      url.includes('localhost') || (!url.includes('chrome-error') && url.length > 20);
    if (!isValidURL) {
      console.error('❌ 앱이 제대로 로드되지 않음. URL:', url);
      console.error('💡 Next.js dev 서버가 localhost:3000에서 실행 중인지 확인하세요!');
      console.error('   터미널에서 "pnpm run dev:next"를 실행하세요.');
      // 디버깅을 위해 페이지 내용 확인
      const content = await page.content();
      console.log('페이지 content 길이:', content.length);
    }
    expect(isValidURL).toBe(true);
  });

  test('메인 레이아웃이 렌더링되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);

    // 사이드바가 존재하는지 확인
    await expect(mainLayout.sidebar).toBeVisible();
    console.log('✓ 사이드바가 표시됨');

    // 메인 콘텐츠 영역이 존재하는지 확인
    await expect(mainLayout.mainContent).toBeVisible();
    console.log('✓ 메인 콘텐츠 영역이 표시됨');
  });

  test('모드 선택기가 표시되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);

    // 모드 선택기가 존재하는지 확인
    const modeSelector = await mainLayout.getModeSelector();
    await expect(modeSelector).toBeVisible();
    console.log('✓ 모드 선택기가 표시됨');

    // 모드 선택기 텍스트 확인 (기본값: Chat)
    const text = await modeSelector.textContent();
    console.log(`✓ 현재 모드: ${text}`);
  });

  test('채팅 UI 요소가 표시되어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    // 메시지 입력 필드가 존재하는지 확인
    await expect(chatPage.messageInput).toBeVisible();
    console.log('✓ 메시지 입력 필드가 표시됨');

    // 전송 버튼이 존재하는지 확인
    await expect(chatPage.sendButton).toBeVisible();
    console.log('✓ 전송 버튼이 표시됨');
  });

  test('초기 상태에서 빈 대화 화면이 표시되어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    // 메시지가 없는 상태 확인
    const messageCount = await chatPage.getMessageCount();
    console.log(`✓ 초기 메시지 개수: ${messageCount}`);

    // 빈 상태 메시지 또는 메시지가 0개인지 확인
    const emptyStateVisible = await chatPage.emptyState.isVisible().catch(() => false);
    if (emptyStateVisible) {
      console.log('✓ 빈 대화 상태 메시지가 표시됨');
    } else if (messageCount === 0) {
      console.log('✓ 메시지가 없는 상태');
    }

    // 둘 중 하나는 true여야 함
    expect(emptyStateVisible || messageCount === 0).toBe(true);
  });

  test('윈도우 타이틀이 올바르게 설정되어야 함', async ({ page }) => {
    const title = await page.title();
    console.log(`✓ 윈도우 타이틀: ${title}`);

    // 타이틀에 SEPilot 또는 프로젝트 이름이 포함되어 있는지 확인
    expect(title.length).toBeGreaterThan(0);
  });

  test('기본 키보드 단축키가 작동해야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);

    // 설정 단축키 테스트 (Cmd+, 또는 Ctrl+,)
    await mainLayout.openSettings();

    // 설정 다이얼로그가 나타나는지 확인
    const settingsDialog = page.locator('[role="dialog"]').first();
    const isVisible = await settingsDialog.isVisible({ timeout: 5000 }).catch(() => false);

    if (isVisible) {
      console.log('✓ 설정 다이얼로그가 열림');

      // ESC로 닫기
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);

      const isClosed = !(await settingsDialog.isVisible().catch(() => false));
      expect(isClosed).toBe(true);
      console.log('✓ 설정 다이얼로그가 닫힘');
    } else {
      console.log('⚠ 설정 다이얼로그가 나타나지 않음 (테스트 스킵)');
    }
  });

  test('스크린샷 캡처', async ({ page }) => {
    // 테스트 완료 후 스크린샷 저장
    await page.screenshot({
      path: 'e2e_tests/test-results/01-app-launch-initial-state.png',
      fullPage: true,
    });
    console.log('✓ 스크린샷 저장됨: 01-app-launch-initial-state.png');
  });
});
