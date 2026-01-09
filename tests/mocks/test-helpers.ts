/**
 * Test Helper Functions
 * setup.ts와 setup.backend.ts에서 공통 사용
 */

/**
 * Console mock 설정 - 테스트 노이즈 감소
 */
export function setupConsoleMock() {
  const originalConsole = { ...console };

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
  });
}

/**
 * Mock 리셋 - 각 테스트 전에 실행
 */
export function setupMockReset(
  mocks: {
    disableElectronMode?: () => void;
    mockLocalStorage?: any;
    mockSessionStorage?: any;
  } = {}
) {
  beforeEach(() => {
    jest.clearAllMocks();

    // Electron mode 비활성화
    if (mocks.disableElectronMode) {
      mocks.disableElectronMode();
    }

    // localStorage mock reset
    if (mocks.mockLocalStorage) {
      mocks.mockLocalStorage.getItem?.mockReset();
      mocks.mockLocalStorage.setItem?.mockReset();
      mocks.mockLocalStorage.removeItem?.mockReset();
      mocks.mockLocalStorage.clear?.mockReset();
    }

    // sessionStorage mock reset
    if (mocks.mockSessionStorage) {
      mocks.mockSessionStorage.getItem?.mockReset();
      mocks.mockSessionStorage.setItem?.mockReset();
      mocks.mockSessionStorage.removeItem?.mockReset();
      mocks.mockSessionStorage.clear?.mockReset();
    }

    // crypto.randomUUID mock reset (backend only)
    if ((global as any).crypto && (global as any).crypto.randomUUID) {
      ((global as any).crypto.randomUUID as jest.Mock).mockReturnValue(
        '12345678-1234-4567-8901-123456789012'
      );
    }
  });
}
