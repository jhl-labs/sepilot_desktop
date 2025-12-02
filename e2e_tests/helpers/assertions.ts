import { expect, Page, Locator } from '@playwright/test';

/**
 * 커스텀 assertion 헬퍼
 *
 * Playwright의 기본 assertion을 확장하여
 * E2E 테스트에 특화된 검증 함수를 제공합니다.
 */

/**
 * 요소가 정확한 텍스트를 포함하는지 확인합니다.
 *
 * @param locator - Locator 또는 Page
 * @param selector - CSS 선택자 (locator가 Page인 경우)
 * @param expectedText - 기대하는 텍스트
 */
export async function assertTextEquals(
  locator: Locator | Page,
  selectorOrText: string,
  expectedText?: string
): Promise<void> {
  // Page 타입인지 확인 (Page에만 있는 context 속성 확인)
  if ('context' in locator && typeof locator.context === 'function') {
    const element = locator.locator(selectorOrText);
    await expect(element).toHaveText(expectedText as string);
  } else {
    await expect(locator as Locator).toHaveText(selectorOrText);
  }
}

/**
 * 요소가 특정 텍스트를 포함하는지 확인합니다.
 *
 * @param locator - Locator
 * @param expectedText - 기대하는 텍스트 (부분 일치)
 */
export async function assertTextContains(locator: Locator, expectedText: string): Promise<void> {
  await expect(locator).toContainText(expectedText);
}

/**
 * 요소가 표시되는지 확인합니다.
 *
 * @param locator - Locator
 */
export async function assertVisible(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
}

/**
 * 요소가 숨겨져 있는지 확인합니다.
 *
 * @param locator - Locator
 */
export async function assertHidden(locator: Locator): Promise<void> {
  await expect(locator).toBeHidden();
}

/**
 * 요소가 활성화되어 있는지 확인합니다.
 *
 * @param locator - Locator
 */
export async function assertEnabled(locator: Locator): Promise<void> {
  await expect(locator).toBeEnabled();
}

/**
 * 요소가 비활성화되어 있는지 확인합니다.
 *
 * @param locator - Locator
 */
export async function assertDisabled(locator: Locator): Promise<void> {
  await expect(locator).toBeDisabled();
}

/**
 * 요소의 개수를 확인합니다.
 *
 * @param locator - Locator
 * @param expectedCount - 기대하는 개수
 */
export async function assertCount(locator: Locator, expectedCount: number): Promise<void> {
  await expect(locator).toHaveCount(expectedCount);
}

/**
 * 요소가 특정 속성 값을 가지는지 확인합니다.
 *
 * @param locator - Locator
 * @param attribute - 속성 이름
 * @param expectedValue - 기대하는 값
 */
export async function assertAttribute(
  locator: Locator,
  attribute: string,
  expectedValue: string | RegExp
): Promise<void> {
  await expect(locator).toHaveAttribute(attribute, expectedValue);
}

/**
 * 요소가 특정 클래스를 가지는지 확인합니다.
 *
 * @param locator - Locator
 * @param className - 클래스 이름
 */
export async function assertHasClass(locator: Locator, className: string): Promise<void> {
  await expect(locator).toHaveClass(new RegExp(className));
}

/**
 * URL이 특정 경로와 일치하는지 확인합니다.
 *
 * @param page - Page
 * @param expectedUrl - 기대하는 URL 또는 정규식
 */
export async function assertURL(page: Page, expectedUrl: string | RegExp): Promise<void> {
  await expect(page).toHaveURL(expectedUrl);
}

/**
 * 페이지 타이틀이 일치하는지 확인합니다.
 *
 * @param page - Page
 * @param expectedTitle - 기대하는 타이틀
 */
export async function assertTitle(page: Page, expectedTitle: string | RegExp): Promise<void> {
  await expect(page).toHaveTitle(expectedTitle);
}

/**
 * 체크박스/라디오 버튼이 체크되어 있는지 확인합니다.
 *
 * @param locator - Locator
 */
export async function assertChecked(locator: Locator): Promise<void> {
  await expect(locator).toBeChecked();
}

/**
 * 체크박스/라디오 버튼이 체크되어 있지 않은지 확인합니다.
 *
 * @param locator - Locator
 */
export async function assertNotChecked(locator: Locator): Promise<void> {
  await expect(locator).not.toBeChecked();
}

/**
 * 입력 필드가 특정 값을 가지는지 확인합니다.
 *
 * @param locator - Locator
 * @param expectedValue - 기대하는 값
 */
export async function assertInputValue(locator: Locator, expectedValue: string): Promise<void> {
  await expect(locator).toHaveValue(expectedValue);
}

/**
 * 입력 필드가 비어있는지 확인합니다.
 *
 * @param locator - Locator
 */
export async function assertInputEmpty(locator: Locator): Promise<void> {
  await expect(locator).toHaveValue('');
}

// ==================== E2E 테스트 특화 assertion ====================

/**
 * 채팅 메시지가 전송되었는지 확인합니다.
 *
 * @param page - Page
 * @param expectedMessage - 기대하는 메시지 내용
 */
export async function assertMessageSent(page: Page, expectedMessage: string): Promise<void> {
  const userMessages = page.locator('[data-testid="message-bubble"][data-role="user"]');
  await expect(userMessages.last()).toContainText(expectedMessage);
}

/**
 * AI 응답이 수신되었는지 확인합니다.
 *
 * @param page - Page
 */
export async function assertAIResponseReceived(page: Page): Promise<void> {
  const aiMessages = page.locator('[data-testid="message-bubble"][data-role="assistant"]');
  await expect(aiMessages.last()).toBeVisible();
}

/**
 * AI 응답에 특정 텍스트가 포함되어 있는지 확인합니다.
 *
 * @param page - Page
 * @param expectedText - 기대하는 텍스트
 */
export async function assertAIResponseContains(page: Page, expectedText: string): Promise<void> {
  const aiMessages = page.locator('[data-testid="message-bubble"][data-role="assistant"]');
  await expect(aiMessages.last()).toContainText(expectedText);
}

/**
 * 설정이 저장되었는지 확인합니다.
 *
 * @param page - Page
 */
export async function assertSettingsSaved(page: Page): Promise<void> {
  // 설정 다이얼로그가 닫혔는지 확인
  const settingsDialog = page.locator('[data-testid="settings-dialog"]');
  await expect(settingsDialog).toBeHidden();
}

/**
 * MCP 서버가 연결되었는지 확인합니다.
 *
 * @param page - Page
 * @param serverName - 서버 이름
 */
export async function assertMCPServerConnected(page: Page, serverName: string): Promise<void> {
  const server = page.locator(`[data-testid="mcp-server"][data-name="${serverName}"]`);
  await expect(server).toHaveAttribute('data-status', 'connected');
}

/**
 * 도구 호출 승인 다이얼로그가 표시되는지 확인합니다.
 *
 * @param page - Page
 */
export async function assertToolApprovalDialogVisible(page: Page): Promise<void> {
  const dialog = page.locator('[data-testid="tool-approval-dialog"]');
  await expect(dialog).toBeVisible();
}

/**
 * 로딩 인디케이터가 표시되는지 확인합니다.
 *
 * @param page - Page
 */
export async function assertLoading(page: Page): Promise<void> {
  const loading = page.locator('[data-testid="ai-thinking"], [data-testid="ai-streaming"]');
  await expect(loading.first()).toBeVisible();
}

/**
 * 로딩이 완료되었는지 확인합니다.
 *
 * @param page - Page
 */
export async function assertLoadingComplete(page: Page): Promise<void> {
  const loading = page.locator('[data-testid="ai-thinking"], [data-testid="ai-streaming"]');
  await expect(loading.first()).toBeHidden();
}

/**
 * 에러 메시지가 표시되는지 확인합니다.
 *
 * @param page - Page
 * @param expectedError - 기대하는 에러 메시지 (선택)
 */
export async function assertErrorVisible(page: Page, expectedError?: string): Promise<void> {
  const error = page.locator('[data-testid="error-message"]');
  await expect(error).toBeVisible();

  if (expectedError) {
    await expect(error).toContainText(expectedError);
  }
}

/**
 * 성공 메시지가 표시되는지 확인합니다.
 *
 * @param page - Page
 * @param expectedMessage - 기대하는 성공 메시지 (선택)
 */
export async function assertSuccessVisible(page: Page, expectedMessage?: string): Promise<void> {
  const success = page.locator('[data-testid="success-message"]');
  await expect(success).toBeVisible();

  if (expectedMessage) {
    await expect(success).toContainText(expectedMessage);
  }
}

/**
 * 파일이 업로드되었는지 확인합니다.
 *
 * @param page - Page
 * @param filename - 파일 이름
 */
export async function assertFileUploaded(page: Page, filename: string): Promise<void> {
  const uploadedFile = page.locator(`[data-testid="uploaded-file"][data-filename="${filename}"]`);
  await expect(uploadedFile).toBeVisible();
}

/**
 * 리스트 항목이 특정 순서로 정렬되어 있는지 확인합니다.
 *
 * @param page - Page
 * @param selector - 리스트 항목 선택자
 * @param expectedOrder - 기대하는 순서 (텍스트 배열)
 */
export async function assertListOrder(
  page: Page,
  selector: string,
  expectedOrder: string[]
): Promise<void> {
  const items = page.locator(selector);
  const actualOrder: string[] = [];

  const count = await items.count();
  for (let i = 0; i < count; i++) {
    const text = await items.nth(i).textContent();
    actualOrder.push(text?.trim() || '');
  }

  expect(actualOrder).toEqual(expectedOrder);
}

/**
 * 요소가 특정 시간 내에 나타나는지 확인합니다.
 *
 * @param locator - Locator
 * @param timeout - 타임아웃 (ms)
 */
export async function assertVisibleWithinTimeout(locator: Locator, timeout = 5000): Promise<void> {
  await expect(locator).toBeVisible({ timeout });
}

/**
 * 요소가 특정 시간 내에 사라지는지 확인합니다.
 *
 * @param locator - Locator
 * @param timeout - 타임아웃 (ms)
 */
export async function assertHiddenWithinTimeout(locator: Locator, timeout = 5000): Promise<void> {
  await expect(locator).toBeHidden({ timeout });
}

/**
 * 콘솔에 에러가 없는지 확인합니다.
 *
 * @param page - Page
 */
export async function assertNoConsoleErrors(page: Page): Promise<void> {
  const consoleErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  // 잠시 대기 후 확인
  await page.waitForTimeout(1000);

  expect(consoleErrors).toHaveLength(0);
}

/**
 * 스크린샷을 비교합니다 (시각적 회귀 테스트).
 *
 * @param page - Page
 * @param name - 스크린샷 이름
 */
export async function assertScreenshotMatches(page: Page, name: string): Promise<void> {
  await expect(page).toHaveScreenshot(`${name}.png`);
}

/**
 * 요소의 스크린샷을 비교합니다.
 *
 * @param locator - Locator
 * @param name - 스크린샷 이름
 */
export async function assertElementScreenshotMatches(
  locator: Locator,
  name: string
): Promise<void> {
  await expect(locator).toHaveScreenshot(`${name}.png`);
}
