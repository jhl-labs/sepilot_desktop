import { Page, Locator } from '@playwright/test';

/**
 * 모든 Page Object의 기본 클래스
 *
 * 공통 기능:
 * - 선택자 헬퍼
 * - 대기 유틸리티
 * - 스크린샷/디버깅
 */
export class BasePage {
  protected page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * data-testid 속성으로 요소를 찾습니다.
   *
   * @param testId - data-testid 값
   * @returns Locator
   */
  protected getByTestId(testId: string): Locator {
    return this.page.locator(`[data-testid="${testId}"]`);
  }

  /**
   * 텍스트로 버튼을 찾습니다.
   *
   * @param text - 버튼 텍스트
   * @returns Locator
   */
  protected getButtonByText(text: string): Locator {
    return this.page.locator(`button:has-text("${text}")`);
  }

  /**
   * 요소가 표시될 때까지 대기합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param timeout - 타임아웃 (ms)
   */
  async waitForVisible(selector: string | Locator, timeout = 10000): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible', timeout });
  }

  /**
   * 요소가 숨겨질 때까지 대기합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param timeout - 타임아웃 (ms)
   */
  async waitForHidden(selector: string | Locator, timeout = 10000): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'hidden', timeout });
  }

  /**
   * 요소의 텍스트가 변경될 때까지 대기합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param expectedText - 기대하는 텍스트
   * @param timeout - 타임아웃 (ms)
   */
  async waitForText(
    selector: string | Locator,
    expectedText: string,
    timeout = 10000
  ): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible', timeout });

    // 텍스트가 일치할 때까지 대기
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const text = await locator.textContent();
      if (text?.includes(expectedText)) {
        return;
      }
      await this.page.waitForTimeout(100);
    }

    throw new Error(`텍스트가 "${expectedText}"로 변경되지 않았습니다 (타임아웃: ${timeout}ms)`);
  }

  /**
   * 요소를 클릭합니다 (안전한 클릭 - 요소가 준비될 때까지 대기).
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param options - 클릭 옵션
   */
  async safeClick(
    selector: string | Locator,
    options: { timeout?: number; force?: boolean } = {}
  ): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible', timeout: options.timeout });
    await locator.click(options);
  }

  /**
   * 입력 필드에 텍스트를 입력합니다 (기존 텍스트 제거 후).
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param text - 입력할 텍스트
   */
  async fillText(selector: string | Locator, text: string): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible' });
    await locator.fill(text);
  }

  /**
   * 입력 필드에 텍스트를 타이핑합니다 (실제 키보드 입력 시뮬레이션).
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param text - 타이핑할 텍스트
   * @param delay - 키 입력 사이 지연 (ms)
   */
  async typeText(selector: string | Locator, text: string, delay = 50): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible' });
    await locator.type(text, { delay });
  }

  /**
   * 키보드 키를 누릅니다.
   *
   * @param key - 키 이름 (예: 'Enter', 'Escape', 'Control+A')
   */
  async pressKey(key: string): Promise<void> {
    await this.page.keyboard.press(key);
  }

  /**
   * 요소가 활성화 상태인지 확인합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @returns 활성화 여부
   */
  async isEnabled(selector: string | Locator): Promise<boolean> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    return locator.isEnabled();
  }

  /**
   * 요소가 표시되는지 확인합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @returns 표시 여부
   */
  async isVisible(selector: string | Locator): Promise<boolean> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    return locator.isVisible();
  }

  /**
   * 요소의 텍스트를 가져옵니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @returns 텍스트 내용
   */
  async getText(selector: string | Locator): Promise<string> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    const text = await locator.textContent();
    return text?.trim() || '';
  }

  /**
   * 요소의 개수를 가져옵니다.
   *
   * @param selector - CSS 선택자
   * @returns 요소 개수
   */
  async getCount(selector: string): Promise<number> {
    return this.page.locator(selector).count();
  }

  /**
   * 스크린샷을 저장합니다.
   *
   * @param name - 파일 이름 (확장자 제외)
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({
      path: `screenshots/${name}-${Date.now()}.png`,
      fullPage: true,
    });
  }

  /**
   * 특정 요소의 스크린샷을 저장합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param name - 파일 이름 (확장자 제외)
   */
  async takeElementScreenshot(selector: string | Locator, name: string): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.screenshot({
      path: `screenshots/${name}-${Date.now()}.png`,
    });
  }

  /**
   * 페이지 로딩 상태를 대기합니다.
   *
   * @param state - 로딩 상태 ('load', 'domcontentloaded', 'networkidle')
   * @param timeout - 타임아웃 (ms)
   */
  async waitForLoadState(
    state: 'load' | 'domcontentloaded' | 'networkidle' = 'load',
    timeout = 30000
  ): Promise<void> {
    await this.page.waitForLoadState(state, { timeout });
  }

  /**
   * 고정 시간만큼 대기합니다 (최후의 수단으로만 사용).
   *
   * @param ms - 대기 시간 (ms)
   */
  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /**
   * 요소를 스크롤하여 화면에 보이게 합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   */
  async scrollIntoView(selector: string | Locator): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.scrollIntoViewIfNeeded();
  }

  /**
   * 선택 박스에서 옵션을 선택합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param value - 선택할 값 (value, label, 또는 index)
   */
  async selectOption(selector: string | Locator, value: string | number): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.waitFor({ state: 'visible' });

    if (typeof value === 'number') {
      await locator.selectOption({ index: value });
    } else {
      // value 또는 label로 시도
      try {
        await locator.selectOption({ value });
      } catch {
        await locator.selectOption({ label: value });
      }
    }
  }

  /**
   * 체크박스/라디오 버튼을 선택합니다.
   *
   * @param selector - CSS 선택자 또는 Locator
   * @param checked - 체크 여부
   */
  async setChecked(selector: string | Locator, checked: boolean): Promise<void> {
    const locator = typeof selector === 'string' ? this.page.locator(selector) : selector;
    await locator.setChecked(checked);
  }

  /**
   * 현재 페이지의 URL을 가져옵니다.
   *
   * @returns 현재 URL
   */
  async getCurrentUrl(): Promise<string> {
    return this.page.url();
  }

  /**
   * 페이지 타이틀을 가져옵니다.
   *
   * @returns 페이지 타이틀
   */
  async getTitle(): Promise<string> {
    return this.page.title();
  }

  /**
   * JavaScript를 실행합니다.
   *
   * @param script - 실행할 스크립트
   * @param arg - 스크립트에 전달할 인자
   * @returns 실행 결과
   */
  async evaluate<T>(script: (arg: unknown) => T | Promise<T>, arg?: unknown): Promise<T> {
    return this.page.evaluate(script, arg);
  }

  /**
   * IPC 이벤트를 발생시킵니다 (Electron 특화).
   *
   * @param channel - IPC 채널 이름
   * @param data - 전송할 데이터
   */
  async invokeIPC<T>(channel: string, data?: unknown): Promise<T> {
    return this.page.evaluate(
      ({ channel, data }) => {
        // @ts-expect-error - window.electron은 preload에서 주입됨
        return window.electron.invoke(channel, data);
      },
      { channel, data }
    );
  }

  /**
   * IPC 이벤트 리스너를 등록합니다 (Electron 특화).
   *
   * @param channel - IPC 채널 이름
   * @param callback - 콜백 함수
   */
  async onIPC(channel: string, callback: (data: unknown) => void): Promise<void> {
    await this.page.exposeFunction(`ipc_${channel}`, callback);

    await this.page.evaluate((channel) => {
      // @ts-expect-error - window.electron은 preload에서 주입됨
      window.electron.on(channel, (data: unknown) => {
        // @ts-expect-error - exposeFunction으로 노출된 함수
        window[`ipc_${channel}`](data);
      });
    }, channel);
  }
}
