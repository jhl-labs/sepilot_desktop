import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 설정 파일
 * Electron 애플리케이션 E2E 테스트를 위한 설정
 *
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  // 테스트 파일 위치
  testDir: './specs',

  // 각 테스트의 최대 실행 시간
  // Electron 앱 시작 + 빌드 시간을 고려하여 증가
  timeout: 60000, // 60초

  // expect() assertion 타임아웃
  expect: {
    timeout: 10000, // 10초
  },

  // 테스트 병렬 실행 설정
  // Electron 앱은 리소스를 많이 사용하므로 제한적으로 병렬 실행
  fullyParallel: false,

  // 실패 시 재시도 횟수
  // CI 환경에서는 2번, 로컬에서는 재시도하지 않음
  retries: process.env.CI ? 2 : 0,

  // 워커 수 (동시 실행 테스트 수)
  // Electron 앱의 메모리 사용량을 고려하여 제한
  workers: process.env.CI ? 1 : 2,

  // 리포터 설정
  reporter: [
    // HTML 리포트: 테스트 결과를 시각적으로 확인
    ['html', { outputFolder: 'test-results/html-report', open: 'never' }],

    // 콘솔에 리스트 형태로 출력
    ['list'],

    // JUnit XML: CI/CD 통합용
    ['junit', { outputFile: 'test-results/junit.xml' }],

    // JSON 리포트: 프로그래밍 방식으로 결과 분석
    ['json', { outputFile: 'test-results/test-results.json' }],
  ],

  // 전역 설정
  use: {
    // 액션 타임아웃 (클릭, 입력 등)
    actionTimeout: 15000, // 15초

    // 스크린샷 설정
    // 실패한 테스트만 스크린샷 저장
    screenshot: 'only-on-failure',

    // 비디오 녹화 설정
    // 실패한 테스트만 비디오 저장 (첫 번째 재시도 시)
    video: 'retain-on-failure',

    // Trace 설정
    // 실패한 테스트의 전체 실행 흐름 기록
    trace: 'retain-on-failure',

    // 베이스 URL (필요시 사용)
    // Electron 앱은 로컬 파일 시스템을 사용하므로 일반적으로 불필요
    // baseURL: 'http://localhost:3000',
  },

  // 프로젝트별 설정 (옵션)
  // 여러 환경에서 테스트하려면 여기에 정의
  projects: [
    {
      name: 'electron-e2e',
      testMatch: '**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'], // Chromium 기반 설정 상속
      },
    },
  ],

  // 전역 Setup/Teardown (옵션)
  // globalSetup: require.resolve('./helpers/global-setup'),
  // globalTeardown: require.resolve('./helpers/global-teardown'),

  // Output 디렉토리
  outputDir: 'test-results/artifacts',

  // 최대 실패 허용 수
  // 이 수만큼 실패하면 테스트 중단 (빠른 실패)
  maxFailures: process.env.CI ? 10 : undefined,
});
