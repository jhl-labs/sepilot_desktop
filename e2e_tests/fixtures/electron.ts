import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

/**
 * Electron 앱 테스트를 위한 픽스처
 * 앱 실행 및 종료를 자동으로 처리
 */
type ElectronFixtures = {
  app: ElectronApplication;
  page: Page;
};

export const test = base.extend<ElectronFixtures>({
  // Electron 앱 픽스처
  // eslint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    // Electron 앱 빌드 경로
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electronPath = require('electron') as unknown as string;
    const appPath = path.join(__dirname, '../../');

    // 앱 실행 전 빌드 확인
    const mainPath = path.join(appPath, 'dist/electron/electron/main.js');

    console.log('Starting Electron app...');
    console.log('Electron path:', electronPath);
    console.log('App path:', appPath);
    console.log('Main path:', mainPath);

    // Electron 앱 실행
    // E2E 테스트는 Next.js dev 서버와 함께 개발 모드로 실행됩니다
    // Next.js dev 서버가 localhost:3000에서 실행 중이어야 합니다
    const app = await electron.launch({
      args: [mainPath, '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'development', // 개발 모드로 설정
        // 테스트 중 업데이트 체크 비활성화
        DISABLE_AUTO_UPDATE: 'true',
      },
      // executablePath를 지정하지 않으면 electron 패키지의 바이너리 사용
    });

    // 앱이 준비될 때까지 대기
    await app.waitForEvent('window');
    console.log('Electron app started');

    // 테스트에서 앱 사용
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(app);

    // 테스트 완료 후 앱 종료
    console.log('Closing Electron app...');
    await app.close();
  },

  // 메인 페이지 픽스처
  page: async ({ app }, use) => {
    // 첫 번째 윈도우 가져오기
    const page = await app.firstWindow();
    console.log('Main window obtained');

    // 페이지 로드 대기
    await page.waitForLoadState('domcontentloaded');
    console.log('Page loaded');

    // 테스트에서 페이지 사용
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect } from '@playwright/test';
