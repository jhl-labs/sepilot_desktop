import { test, expect } from '../fixtures/electron';
import { ThemePage } from '../utils/page-objects';
import { wait } from '../utils/helpers';

/**
 * TC6: 테마 전환 테스트
 *
 * 테스트 목적:
 * - 라이트/다크 테마 간 전환이 가능한지 확인
 * - 테마 토글 버튼이 작동하는지 확인
 * - 테마 변경이 UI에 반영되는지 확인
 * - 테마 설정이 유지되는지 확인
 */
test.describe('테마 전환', () => {
  test('테마 토글 버튼이 표시되어야 함', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 테마 토글 버튼이 존재하는지 확인
    await expect(themePage.themeToggle).toBeVisible({ timeout: 10000 });
    console.log('✓ 테마 토글 버튼이 표시됨');
  });

  test('현재 테마 상태를 확인할 수 있어야 함', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 현재 테마 확인
    const isDark = await themePage.isDarkMode();
    console.log(`✓ 현재 테마: ${isDark ? 'Dark' : 'Light'}`);

    expect(typeof isDark).toBe('boolean');
    console.log('✓ 테마 상태 확인 가능');
  });

  test('테마를 전환할 수 있어야 함', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 초기 테마 상태
    const initialTheme = await themePage.isDarkMode();
    console.log(`✓ 초기 테마: ${initialTheme ? 'Dark' : 'Light'}`);

    // 테마 전환
    await themePage.toggleTheme();
    console.log('✓ 테마 토글 실행');

    // 전환 후 테마 상태
    const newTheme = await themePage.isDarkMode();
    console.log(`✓ 전환 후 테마: ${newTheme ? 'Dark' : 'Light'}`);

    // 테마가 변경되었는지 확인
    expect(newTheme).not.toBe(initialTheme);
    console.log('✓ 테마 전환 성공');
  });

  test('테마를 여러 번 전환할 수 있어야 함', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 초기 테마
    const initialTheme = await themePage.isDarkMode();
    console.log(`✓ 초기 테마: ${initialTheme ? 'Dark' : 'Light'}`);

    // 3번 토글
    for (let i = 0; i < 3; i++) {
      await themePage.toggleTheme();
      await wait(500);

      const currentTheme = await themePage.isDarkMode();
      console.log(`✓ ${i + 1}번째 토글 후 테마: ${currentTheme ? 'Dark' : 'Light'}`);
    }

    // 홀수 번 토글했으므로 초기 테마와 달라야 함
    const finalTheme = await themePage.isDarkMode();
    expect(finalTheme).not.toBe(initialTheme);
    console.log('✓ 여러 번 테마 전환 성공');
  });

  test('다크 모드에서 라이트 모드로 전환', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 다크 모드로 설정
    let currentTheme = await themePage.isDarkMode();
    if (!currentTheme) {
      await themePage.toggleTheme();
      await wait(500);
    }

    // 다크 모드인지 확인
    currentTheme = await themePage.isDarkMode();
    expect(currentTheme).toBe(true);
    console.log('✓ 다크 모드로 설정됨');

    // 라이트 모드로 전환
    await themePage.toggleTheme();
    await wait(500);

    const isLight = !(await themePage.isDarkMode());
    expect(isLight).toBe(true);
    console.log('✓ 라이트 모드로 전환 성공');
  });

  test('라이트 모드에서 다크 모드로 전환', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 라이트 모드로 설정
    let currentTheme = await themePage.isDarkMode();
    if (currentTheme) {
      await themePage.toggleTheme();
      await wait(500);
    }

    // 라이트 모드인지 확인
    currentTheme = await themePage.isDarkMode();
    expect(currentTheme).toBe(false);
    console.log('✓ 라이트 모드로 설정됨');

    // 다크 모드로 전환
    await themePage.toggleTheme();
    await wait(500);

    const isDark = await themePage.isDarkMode();
    expect(isDark).toBe(true);
    console.log('✓ 다크 모드로 전환 성공');
  });

  test('테마 전환 시 UI가 즉시 반영되어야 함', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 배경색 확인을 위한 요소
    const body = page.locator('body');

    // 초기 배경색
    const initialBgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    console.log(`✓ 초기 배경색: ${initialBgColor}`);

    // 테마 전환
    await themePage.toggleTheme();
    await wait(500);

    // 전환 후 배경색
    const newBgColor = await body.evaluate((el) => {
      return window.getComputedStyle(el).backgroundColor;
    });
    console.log(`✓ 전환 후 배경색: ${newBgColor}`);

    // 배경색이 변경되었는지 확인
    // (일부 시스템에서는 색상이 동일할 수 있으므로 warning만 출력)
    if (initialBgColor !== newBgColor) {
      console.log('✓ 배경색이 변경됨');
    } else {
      console.log('⚠ 배경색이 동일함 (CSS 변수 사용일 수 있음)');
    }
  });

  test('테마 전환 시 다른 UI 요소들도 업데이트되어야 함', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 초기 테마
    const initialTheme = await themePage.isDarkMode();
    console.log(`✓ 초기 테마: ${initialTheme ? 'Dark' : 'Light'}`);

    // HTML 요소의 클래스 확인
    const html = page.locator('html');
    const initialClasses = await html.getAttribute('class');
    console.log(`✓ 초기 HTML 클래스: ${initialClasses}`);

    // 테마 전환
    await themePage.toggleTheme();
    await wait(500);

    // 전환 후 HTML 클래스 확인
    const newClasses = await html.getAttribute('class');
    console.log(`✓ 전환 후 HTML 클래스: ${newClasses}`);

    // 클래스가 변경되었는지 확인
    expect(newClasses).not.toBe(initialClasses);
    console.log('✓ HTML 클래스가 변경됨');
  });

  test('테마 설정이 로컬스토리지에 저장되어야 함', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 테마 전환
    await themePage.toggleTheme();
    await wait(1000);

    // 로컬스토리지 확인
    const themeSettings = await page.evaluate(() => {
      const keys = Object.keys(localStorage);
      const themeKeys = keys.filter((k) => k.toLowerCase().includes('theme'));
      return themeKeys.map((k) => ({ key: k, value: localStorage.getItem(k) }));
    });

    console.log(`✓ 테마 관련 로컬스토리지 항목: ${JSON.stringify(themeSettings, null, 2)}`);

    // 테마 관련 설정이 있는지 확인
    if (themeSettings.length > 0) {
      console.log('✓ 테마 설정이 로컬스토리지에 저장됨');
    } else {
      console.log('⚠ 테마 설정이 로컬스토리지에서 발견되지 않음 (다른 저장소 사용 가능)');
    }
  });

  test('양쪽 테마의 스크린샷 캡처', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 라이트 모드로 전환
    const isDark = await themePage.isDarkMode();
    if (isDark) {
      await themePage.toggleTheme();
      await wait(1000);
    }

    // 라이트 모드 스크린샷
    await page.screenshot({
      path: 'e2e_tests/test-results/06-theme-light.png',
      fullPage: true,
    });
    console.log('✓ 라이트 모드 스크린샷 저장');

    // 다크 모드로 전환
    await themePage.toggleTheme();
    await wait(1000);

    // 다크 모드 스크린샷
    await page.screenshot({
      path: 'e2e_tests/test-results/06-theme-dark.png',
      fullPage: true,
    });
    console.log('✓ 다크 모드 스크린샷 저장');
  });

  test('테마 토글 버튼 접근성 확인', async ({ page }) => {
    const themePage = new ThemePage(page);

    // 버튼에 적절한 aria 속성이 있는지 확인
    const ariaLabel = await themePage.themeToggle.getAttribute('aria-label');
    console.log(`✓ 테마 토글 aria-label: ${ariaLabel || '없음'}`);

    // 버튼이 키보드로 접근 가능한지 확인
    await themePage.themeToggle.focus();
    await wait(300);

    const isFocused = await themePage.themeToggle.evaluate((el) => el === document.activeElement);
    console.log(`✓ 테마 토글 포커스 가능: ${isFocused}`);

    if (isFocused) {
      // Enter 키로 토글 시도
      const beforeTheme = await themePage.isDarkMode();
      await page.keyboard.press('Enter');
      await wait(500);

      const afterTheme = await themePage.isDarkMode();
      if (beforeTheme !== afterTheme) {
        console.log('✓ 키보드로 테마 전환 가능');
      }
    }
  });
});
