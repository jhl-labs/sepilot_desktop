import { _electron as electron, ElectronApplication, Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';

/**
 * Electron 앱 시작/종료를 관리하는 헬퍼 클래스
 *
 * 주요 기능:
 * - Electron 앱 시작 (독립적인 사용자 데이터 디렉토리)
 * - 앱 초기화 대기
 * - 앱 정상 종료 및 정리
 */

export interface AppLauncherOptions {
  /** 사용자 데이터 디렉토리 (기본값: 자동 생성) */
  userDataDir?: string;
  /** 추가 환경 변수 */
  env?: Record<string, string>;
  /** 디버그 모드 활성화 */
  debug?: boolean;
  /** 앱 시작 타임아웃 (ms) */
  timeout?: number;
}

export class AppLauncher {
  private app: ElectronApplication | null = null;
  private userDataDir: string | null = null;
  private shouldCleanup = true;

  /**
   * Electron 앱을 시작합니다.
   *
   * @param options - 앱 시작 옵션
   * @returns Electron 앱 인스턴스
   */
  async launch(options: AppLauncherOptions = {}): Promise<ElectronApplication> {
    const {
      userDataDir,
      env = {},
      debug = false,
      timeout = 60000,
    } = options;

    // 사용자 데이터 디렉토리 설정
    this.userDataDir = userDataDir || this.generateUserDataDir();
    this.shouldCleanup = !userDataDir; // 자동 생성된 경우에만 정리

    // 사용자 데이터 디렉토리 생성
    await fs.mkdir(this.userDataDir, { recursive: true });

    // Electron 앱 경로
    const electronPath = path.join(__dirname, '../../dist/electron/electron/main.js');

    // Electron 앱 시작
    this.app = await electron.launch({
      args: [electronPath],
      env: {
        ...process.env,
        // 테스트용 사용자 데이터 디렉토리
        ELECTRON_USER_DATA_PATH: this.userDataDir,
        // 디버그 모드
        ...(debug ? { DEBUG: '*' } : {}),
        // 추가 환경 변수
        ...env,
        // 테스트 환경임을 명시
        NODE_ENV: 'test',
        E2E_TEST: 'true',
      },
      timeout,
    });

    // 앱 초기화 대기
    await this.waitForAppReady();

    return this.app;
  }

  /**
   * 첫 번째 윈도우를 가져옵니다.
   *
   * @returns 첫 번째 윈도우 (Page)
   */
  async getFirstWindow(): Promise<Page> {
    if (!this.app) {
      throw new Error('앱이 시작되지 않았습니다. launch()를 먼저 호출하세요.');
    }

    const window = await this.app.firstWindow();
    return window;
  }

  /**
   * 모든 윈도우를 가져옵니다.
   *
   * @returns 모든 윈도우 배열
   */
  async getAllWindows(): Promise<Page[]> {
    if (!this.app) {
      throw new Error('앱이 시작되지 않았습니다. launch()를 먼저 호출하세요.');
    }

    return this.app.windows();
  }

  /**
   * 새 윈도우가 열릴 때까지 대기합니다.
   *
   * @param timeout - 타임아웃 (ms)
   * @returns 새로 열린 윈도우
   */
  async waitForNewWindow(timeout = 10000): Promise<Page> {
    if (!this.app) {
      throw new Error('앱이 시작되지 않았습니다. launch()를 먼저 호출하세요.');
    }

    const [newWindow] = await Promise.all([
      this.app.waitForEvent('window', { timeout }),
    ]);

    return newWindow;
  }

  /**
   * Electron 앱을 종료하고 정리합니다.
   */
  async close(): Promise<void> {
    if (this.app) {
      try {
        await this.app.close();
      } catch (error) {
        console.error('앱 종료 중 오류:', error);
      }
      this.app = null;
    }

    // 사용자 데이터 디렉토리 정리
    if (this.shouldCleanup && this.userDataDir) {
      try {
        await fs.rm(this.userDataDir, { recursive: true, force: true });
      } catch (error) {
        console.error('사용자 데이터 디렉토리 정리 중 오류:', error);
      }
      this.userDataDir = null;
    }
  }

  /**
   * 앱이 완전히 초기화될 때까지 대기합니다.
   *
   * 확인 사항:
   * - 첫 번째 윈도우 생성
   * - 윈도우 로딩 완료
   * - 기본 설정 로드
   */
  private async waitForAppReady(): Promise<void> {
    if (!this.app) {
      throw new Error('앱이 시작되지 않았습니다.');
    }

    // 첫 번째 윈도우 대기
    const window = await this.app.firstWindow();

    // 윈도우 로딩 완료 대기
    await window.waitForLoadState('domcontentloaded');

    // React 앱 렌더링 완료 대기
    // (최소한 body 태그가 렌더링될 때까지)
    await window.waitForSelector('body', { state: 'attached' });

    // 추가 대기: 초기 데이터 로딩 등
    // 필요에 따라 특정 요소가 나타날 때까지 대기할 수 있음
    // await window.waitForSelector('[data-testid="app-ready"]', { timeout: 5000 }).catch(() => {});
  }

  /**
   * 고유한 사용자 데이터 디렉토리 경로를 생성합니다.
   *
   * @returns 사용자 데이터 디렉토리 경로
   */
  private generateUserDataDir(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return path.join(__dirname, `../.test-user-data-${timestamp}-${random}`);
  }

  /**
   * Main Process를 평가합니다.
   *
   * @param pageFunction - Main Process에서 실행할 함수
   * @param arg - 함수에 전달할 인자
   * @returns 함수 실행 결과
   */
  async evaluateInMainProcess<T>(
    pageFunction: (arg: unknown) => T | Promise<T>,
    arg?: unknown
  ): Promise<T> {
    if (!this.app) {
      throw new Error('앱이 시작되지 않았습니다. launch()를 먼저 호출하세요.');
    }

    return this.app.evaluate(pageFunction, arg);
  }

  /**
   * Electron API에 접근합니다.
   *
   * 예시:
   * ```typescript
   * const version = await launcher.evaluateElectron(({ app }) => app.getVersion());
   * ```
   */
  async evaluateElectron<T>(
    pageFunction: (electron: typeof import('electron')) => T | Promise<T>
  ): Promise<T> {
    if (!this.app) {
      throw new Error('앱이 시작되지 않았습니다. launch()를 먼저 호출하세요.');
    }

    return this.app.evaluate(pageFunction);
  }
}

/**
 * 간편한 앱 시작 헬퍼 함수
 *
 * @param options - 앱 시작 옵션
 * @returns AppLauncher 인스턴스와 첫 번째 윈도우
 */
export async function launchApp(
  options: AppLauncherOptions = {}
): Promise<{ launcher: AppLauncher; window: Page; app: ElectronApplication }> {
  const launcher = new AppLauncher();
  const app = await launcher.launch(options);
  const window = await launcher.getFirstWindow();

  return { launcher, window, app };
}

/**
 * 테스트 픽스처용 헬퍼
 *
 * Playwright의 test.extend()와 함께 사용하기 위한 팩토리 함수
 */
export function createAppFixture() {
   
  return async (_fixtures: unknown, use: (launcher: AppLauncher) => Promise<void>) => {
    const launcher = new AppLauncher();
    await launcher.launch();
    await use(launcher);
    await launcher.close();
  };
}
