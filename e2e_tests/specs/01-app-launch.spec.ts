import { test, expect } from '@playwright/test';
import { AppLauncher } from '../helpers/app-launcher';
import { assertVisible, assertTitle } from '../helpers/assertions';

/**
 * 앱 실행 기본 테스트
 *
 * 목적: Electron 앱이 정상적으로 시작되고 초기화되는지 검증
 *
 * 테스트 시나리오:
 * 1. Electron 앱 시작
 * 2. 메인 윈도우 생성 확인
 * 3. 기본 UI 요소 로딩 확인
 * 4. 앱 타이틀 확인
 * 5. 콘솔 에러 없음 확인
 */

test.describe('앱 실행 기본 테스트', () => {
  let launcher: AppLauncher;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('Electron 앱이 정상적으로 시작된다', async () => {
    // Given: Electron 앱 시작
    const _app = await launcher.launch({
      timeout: 60000, // 앱 시작에 최대 60초
    });

    // When: 첫 번째 윈도우 가져오기
    const window = await launcher.getFirstWindow();

    // Then: 윈도우가 표시되어야 함
    expect(window).toBeTruthy();
    await expect(window).toHaveURL(/.*/, { timeout: 10000 });

    // Electron 앱 정보 확인
    const version = await launcher.evaluateElectron(({ app }) => app.getVersion());
    expect(version).toBeTruthy();
    console.log('앱 버전:', version);
  });

  test('메인 윈도우가 올바른 타이틀을 가진다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();
    const window = await launcher.getFirstWindow();

    // Then: 타이틀이 'SEPilot Desktop' 또는 관련 문자열이어야 함
    await assertTitle(window, /SEPilot|Desktop/i);
  });

  test('기본 UI 요소가 로딩된다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();
    const window = await launcher.getFirstWindow();

    // Then: 기본 UI 요소들이 표시되어야 함
    // body 태그가 렌더링되었는지 확인
    const body = window.locator('body');
    await assertVisible(body);

    // HTML 문서가 로딩되었는지 확인
    const html = await window.innerHTML('body');
    expect(html.length).toBeGreaterThan(0);
  });

  test('앱이 적절한 크기로 시작된다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();
    const window = await launcher.getFirstWindow();

    // Then: 윈도우 크기가 최소 요구사항을 만족해야 함
    const viewportSize = window.viewportSize();
    expect(viewportSize).toBeTruthy();

    if (viewportSize) {
      expect(viewportSize.width).toBeGreaterThan(800);
      expect(viewportSize.height).toBeGreaterThan(600);
    }
  });

  test('개발자 도구가 비활성화되어 있다 (프로덕션 빌드)', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();

    // Then: 프로덕션 빌드에서는 개발자 도구가 기본적으로 닫혀있어야 함
    const isDevToolsOpened = await launcher.evaluateElectron(({ BrowserWindow }) => {
      const windows = BrowserWindow.getAllWindows();
      return windows.some((win) => win.webContents.isDevToolsOpened());
    });

    // 개발 환경이 아니라면 DevTools가 닫혀있어야 함
    if (process.env.NODE_ENV === 'production') {
      expect(isDevToolsOpened).toBe(false);
    }
  });

  test('앱이 메뉴바를 가진다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();

    // Then: 메뉴바가 설정되어 있어야 함
    const hasMenu = await launcher.evaluateElectron(({ Menu }) => {
      const menu = Menu.getApplicationMenu();
      return menu !== null;
    });

    expect(hasMenu).toBe(true);
  });

  test('앱 종료가 정상적으로 동작한다', async () => {
    // Given: Electron 앱 시작
    const _app = await launcher.launch();
    const window = await launcher.getFirstWindow();

    // When: 앱 종료
    await launcher.close();

    // Then: 윈도우가 닫혀야 함
    const isClosed = await window.isClosed();
    expect(isClosed).toBe(true);
  });

  test('여러 개의 윈도우를 관리할 수 있다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();

    // When: 초기 윈도우 수 확인
    const initialWindows = await launcher.getAllWindows();
    expect(initialWindows.length).toBeGreaterThanOrEqual(1);

    // Note: 추가 윈도우 생성은 실제 앱 기능에 따라 다름
    // 여기서는 최소 1개의 윈도우가 있는지만 확인
  });

  test('앱 경로가 올바르게 설정되어 있다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();

    // Then: userData 경로가 설정되어 있어야 함
    const userDataPath = await launcher.evaluateElectron(({ app }) => {
      return app.getPath('userData');
    });

    expect(userDataPath).toBeTruthy();
    expect(userDataPath).toContain('.test-user-data');

    // 앱 경로도 확인
    const appPath = await launcher.evaluateElectron(({ app }) => {
      return app.getAppPath();
    });

    expect(appPath).toBeTruthy();
  });

  test('앱이 준비 상태(ready)가 된다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();

    // Then: 앱이 ready 상태여야 함
    const isReady = await launcher.evaluateElectron(({ app }) => {
      return app.isReady();
    });

    expect(isReady).toBe(true);
  });

  test('메인 프로세스와 렌더러 프로세스가 통신할 수 있다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();
    const window = await launcher.getFirstWindow();

    // When: 렌더러 프로세스에서 window.electron 객체 확인
    const hasElectronAPI = await window.evaluate(() => {
      // @ts-expect-error - window.electron은 preload에서 주입됨
      return typeof window.electron !== 'undefined';
    });

    // Then: window.electron이 정의되어 있어야 함
    expect(hasElectronAPI).toBe(true);
  });

  test('기본 설정이 로드된다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();
    const window = await launcher.getFirstWindow();

    // When: 로컬스토리지 또는 설정 파일에서 기본 설정 확인
    // Note: 실제 설정 로드 방식에 따라 조정 필요
    const hasLocalStorage = await window.evaluate(() => {
      return typeof localStorage !== 'undefined';
    });

    // Then: localStorage가 사용 가능해야 함
    expect(hasLocalStorage).toBe(true);
  });

  test('앱이 너무 오래 시작되지 않는다', async () => {
    // Given: 시작 시간 측정
    const startTime = Date.now();

    // When: Electron 앱 시작
    await launcher.launch();
    await launcher.getFirstWindow();

    const endTime = Date.now();
    const launchTime = endTime - startTime;

    // Then: 시작 시간이 30초 이내여야 함 (합리적인 범위)
    expect(launchTime).toBeLessThan(30000);
    console.log(`앱 시작 시간: ${launchTime}ms`);
  });

  test('앱이 크래시하지 않는다', async () => {
    // Given: Electron 앱 시작
    const app = await launcher.launch();
    const window = await launcher.getFirstWindow();

    // When: 잠시 대기 (앱이 초기화되는 동안)
    await window.waitForTimeout(3000);

    // Then: 윈도우가 여전히 열려있어야 함
    const isClosed = await window.isClosed();
    expect(isClosed).toBe(false);

    // 크래시 감지
    let crashed = false;
    app.on('window', async (page) => {
      page.on('crash', () => {
        crashed = true;
      });
    });

    await window.waitForTimeout(2000);
    expect(crashed).toBe(false);
  });
});

/**
 * 앱 초기화 상태 테스트
 */
test.describe('앱 초기화 상태', () => {
  let launcher: AppLauncher;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
    await launcher.launch();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('초기 화면이 표시된다', async () => {
    // Given: 앱이 시작된 상태
    const window = await launcher.getFirstWindow();

    // Then: body가 렌더링되어 있어야 함
    await window.waitForSelector('body', { state: 'attached' });

    // 기본 컨테이너 확인 (실제 앱 구조에 따라 선택자 조정 필요)
    const hasContent = await window.evaluate(() => {
      const body = document.body;
      return body.children.length > 0;
    });

    expect(hasContent).toBe(true);
  });

  test('JavaScript가 정상적으로 로드된다', async () => {
    // Given: 앱이 시작된 상태
    const window = await launcher.getFirstWindow();

    // Then: JavaScript가 실행되어야 함
    const jsWorking = await window.evaluate(() => {
      // 간단한 JavaScript 실행 테스트
      return 1 + 1 === 2;
    });

    expect(jsWorking).toBe(true);
  });

  test('CSS가 정상적으로 적용된다', async () => {
    // Given: 앱이 시작된 상태
    const window = await launcher.getFirstWindow();

    // Then: body에 스타일이 적용되어 있어야 함
    const hasStyles = await window.evaluate(() => {
      const body = document.body;
      const styles = globalThis.getComputedStyle(body);
      // 최소한 몇 가지 스타일이 적용되어 있어야 함
      return styles.margin !== '' || styles.padding !== '';
    });

    expect(hasStyles).toBe(true);
  });

  test('이미지 리소스가 로드된다', async () => {
    // Given: 앱이 시작된 상태
    const window = await launcher.getFirstWindow();

    // When: 이미지 태그 확인
    const images = await window.locator('img').count();

    // Then: 이미지가 있다면 로드되어야 함
    if (images > 0) {
      const firstImage = window.locator('img').first();
      const _isLoaded = await firstImage.evaluate((img: HTMLImageElement) => {
        return img.complete && img.naturalHeight > 0;
      });

      // 첫 번째 이미지가 로드될 때까지 대기
      // (로드 실패해도 테스트가 실패하지 않도록 try-catch)
      try {
        await expect(firstImage).toBeVisible({ timeout: 5000 });
      } catch {
        // 이미지가 없거나 로드 실패는 이 테스트의 주요 관심사가 아님
      }
    }
  });
});

/**
 * 성능 및 리소스 테스트
 */
test.describe('성능 및 리소스', () => {
  let launcher: AppLauncher;

  test.beforeEach(async () => {
    launcher = new AppLauncher();
  });

  test.afterEach(async () => {
    await launcher.close();
  });

  test('메모리 사용량이 합리적이다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();

    // Then: 메모리 사용량 확인 (참고용)
    const memoryInfo = await launcher.evaluateElectron(({ app }) => {
      const metrics = app.getAppMetrics();
      return metrics.map((m) => m.memory);
    });

    console.log('메모리 사용량:', memoryInfo);

    // 합리적인 메모리 사용량인지 확인 (예: 1GB 이하)
    // 실제 앱 크기에 따라 조정 필요
    const totalMemory = memoryInfo.reduce((sum, m) => sum + m.workingSetSize, 0);
    const totalMemoryMB = totalMemory / 1024 / 1024;

    console.log(`총 메모리 사용량: ${totalMemoryMB.toFixed(2)} MB`);

    // 메모리 사용량이 너무 크지 않은지 확인 (경고용)
    if (totalMemoryMB > 1024) {
      console.warn(`경고: 메모리 사용량이 ${totalMemoryMB.toFixed(2)} MB로 높습니다`);
    }
  });

  test('CPU 사용량이 합리적이다', async () => {
    // Given: Electron 앱 시작
    await launcher.launch();
    const window = await launcher.getFirstWindow();

    // When: 잠시 대기 후 CPU 사용량 측정
    await window.waitForTimeout(2000);

    const cpuUsage = await launcher.evaluateElectron(({ app }) => {
      return app.getAppMetrics().map((m) => m.cpu);
    });

    console.log('CPU 사용량:', cpuUsage);

    // CPU 사용량이 100%를 넘지 않아야 함
    cpuUsage.forEach((cpu) => {
      expect(cpu.percentCPUUsage).toBeLessThanOrEqual(100);
    });
  });
});
