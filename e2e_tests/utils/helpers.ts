import { Page, Locator } from '@playwright/test';

/**
 * E2E 테스트를 위한 공통 헬퍼 함수
 */

/**
 * 요소가 나타날 때까지 대기
 */
export async function waitForElement(
  page: Page,
  selector: string,
  options?: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' }
): Promise<Locator> {
  const element = page.locator(selector);
  await element.waitFor({
    timeout: options?.timeout ?? 10000,
    state: options?.state ?? 'visible',
  });
  return element;
}

/**
 * 텍스트로 버튼 찾기
 */
export async function findButtonByText(page: Page, text: string): Promise<Locator> {
  return page.locator(`button:has-text("${text}")`);
}

/**
 * 플레이스홀더로 입력 필드 찾기
 */
export async function findInputByPlaceholder(page: Page, placeholder: string): Promise<Locator> {
  return page.locator(
    `input[placeholder*="${placeholder}"], textarea[placeholder*="${placeholder}"]`
  );
}

/**
 * data-testid로 요소 찾기
 */
export async function findByTestId(page: Page, testId: string): Promise<Locator> {
  return page.locator(`[data-testid="${testId}"]`);
}

/**
 * 특정 시간 대기
 */
export async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 스크린샷 저장
 */
export async function takeScreenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `e2e_tests/test-results/screenshots/${name}.png`, fullPage: true });
}

/**
 * 로컬스토리지 값 가져오기
 */
export async function getLocalStorageItem(page: Page, key: string): Promise<string | null> {
  return await page.evaluate((k) => localStorage.getItem(k), key);
}

/**
 * 로컬스토리지 값 설정
 */
export async function setLocalStorageItem(page: Page, key: string, value: string): Promise<void> {
  await page.evaluate(({ k, v }) => localStorage.setItem(k, v), { k: key, v: value });
}

/**
 * 로컬스토리지 초기화
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

/**
 * 클래스가 있는지 확인
 */
export async function hasClass(element: Locator, className: string): Promise<boolean> {
  const classes = await element.getAttribute('class');
  return classes?.includes(className) ?? false;
}

/**
 * 대화 목록에서 특정 인덱스의 대화 선택
 */
export async function selectConversationByIndex(page: Page, index: number): Promise<void> {
  const conversations = page.locator('.space-y-1 > button');
  await conversations.nth(index).click();
  await wait(500); // UI 업데이트 대기
}

/**
 * 메시지 전송
 */
export async function sendMessage(page: Page, message: string): Promise<void> {
  const textarea = page
    .locator('textarea[placeholder*="메시지"], textarea[placeholder*="message"]')
    .first();
  await textarea.fill(message);
  await wait(300);

  // 전송 버튼 찾기 (Send 아이콘 또는 Primary 버튼)
  const sendButton = page.locator('button[type="submit"]').first();
  await sendButton.click();
  await wait(500);
}

/**
 * 설정 다이얼로그 열기
 */
export async function openSettings(page: Page): Promise<void> {
  // Cmd+, 또는 Ctrl+, 단축키 사용
  const isMac = process.platform === 'darwin';
  if (isMac) {
    await page.keyboard.press('Meta+,');
  } else {
    await page.keyboard.press('Control+,');
  }
  await wait(500);
}

/**
 * 새 대화 생성
 */
export async function createNewConversation(page: Page): Promise<void> {
  // Cmd+N 또는 Ctrl+N 단축키 사용
  const isMac = process.platform === 'darwin';
  if (isMac) {
    await page.keyboard.press('Meta+N');
  } else {
    await page.keyboard.press('Control+N');
  }
  await wait(500);
}

/**
 * 모드 선택 (Chat, Editor, Browser 등)
 */
export async function selectMode(page: Page, mode: string): Promise<void> {
  const modeSelector = await findByTestId(page, 'mode-selector');
  await modeSelector.click();
  await wait(300);

  const modeItem = await findByTestId(page, `mode-${mode.toLowerCase()}`);
  await modeItem.click();
  await wait(500);
}

/**
 * 메시지 개수 확인
 */
export async function getMessageCount(page: Page): Promise<number> {
  // 메인 모드의 메시지 버블 카운트
  const messages = page.locator('.mx-auto.max-w-4xl > div');
  return await messages.count();
}

/**
 * 마지막 메시지 텍스트 가져오기
 */
export async function getLastMessageText(page: Page): Promise<string> {
  const messages = page.locator('.mx-auto.max-w-4xl > div');
  const lastMessage = messages.last();
  return (await lastMessage.textContent()) ?? '';
}
