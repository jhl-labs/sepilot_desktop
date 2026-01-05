import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E 테스트 설정
 * Electron 앱 테스트를 위한 구성
 */
export default defineConfig({
  testDir: './e2e_tests',

  // 테스트 타임아웃 설정 (Electron 앱 시작에 시간이 걸릴 수 있음)
  timeout: 60000,
  expect: {
    timeout: 10000,
  },

  // 병렬 실행 비활성화 (Electron 앱은 한 번에 하나만 실행)
  fullyParallel: false,
  workers: 1,

  // 실패 시 재시도
  retries: process.env.CI ? 2 : 0,

  // 리포터 설정
  reporter: [
    ['html', { outputFolder: 'e2e_tests/test-results/html' }],
    ['json', { outputFile: 'e2e_tests/test-results/results.json' }],
    ['junit', { outputFile: 'e2e_tests/test-results/junit.xml' }],
    ['list'],
  ],

  // 스크린샷 및 비디오 설정
  use: {
    // 스크린샷: 실패 시에만
    screenshot: 'only-on-failure',

    // 비디오: 실패 시에만
    video: 'retain-on-failure',

    // 트레이스: 실패 시에만
    trace: 'retain-on-failure',
  },

  // Electron 프로젝트는 별도 설정 필요
  projects: [
    {
      name: 'electron',
      testMatch: '**/*.spec.ts',
    },
  ],

  // 출력 디렉토리
  outputDir: 'e2e_tests/test-results',
});
