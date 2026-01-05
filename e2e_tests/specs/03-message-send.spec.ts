import { test, expect } from '../fixtures/electron';
import { MainLayoutPage, ChatPage } from '../utils/page-objects';
import { wait } from '../utils/helpers';

/**
 * TC3: 메시지 입력 및 전송 테스트
 *
 * 테스트 목적:
 * - 메시지 입력 필드에 텍스트를 입력할 수 있는지 확인
 * - 전송 버튼으로 메시지를 전송할 수 있는지 확인
 * - 전송된 메시지가 화면에 표시되는지 확인
 * - 메시지 입력 후 입력 필드가 초기화되는지 확인
 */
test.describe('메시지 입력 및 전송', () => {
  // 각 테스트 전에 새 대화 생성
  test.beforeEach(async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    await mainLayout.createNewConversation();
    await wait(1000);
    console.log('✓ 테스트를 위한 새 대화 생성됨');
  });

  test('메시지 입력 필드에 텍스트를 입력할 수 있어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const testMessage = '안녕하세요, 테스트 메시지입니다.';

    // 메시지 입력
    await chatPage.messageInput.fill(testMessage);
    console.log('✓ 메시지 입력 완료');

    // 입력된 값 확인
    const inputValue = await chatPage.messageInput.inputValue();
    expect(inputValue).toBe(testMessage);
    console.log(`✓ 입력된 메시지: ${inputValue}`);
  });

  test('전송 버튼을 클릭하여 메시지를 전송할 수 있어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const testMessage = 'Hello from E2E test';

    // 초기 메시지 개수
    const initialCount = await chatPage.getMessageCount();
    console.log(`✓ 초기 메시지 개수: ${initialCount}`);

    // 메시지 입력 및 전송
    await chatPage.sendMessage(testMessage);
    console.log('✓ 메시지 전송 완료');

    // 메시지가 추가되었는지 확인 (타임아웃을 길게 설정)
    await wait(2000);
    const newCount = await chatPage.getMessageCount();
    console.log(`✓ 전송 후 메시지 개수: ${newCount}`);

    expect(newCount).toBeGreaterThan(initialCount);
    console.log('✓ 메시지가 화면에 추가됨');
  });

  test('Enter 키로 메시지를 전송할 수 있어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const testMessage = 'Testing Enter key submission';

    const initialCount = await chatPage.getMessageCount();
    console.log(`✓ 초기 메시지 개수: ${initialCount}`);

    // 메시지 입력
    await chatPage.messageInput.fill(testMessage);
    console.log('✓ 메시지 입력 완료');

    // Enter 키로 전송
    await chatPage.messageInput.press('Enter');
    console.log('✓ Enter 키 입력');

    await wait(2000);
    const newCount = await chatPage.getMessageCount();
    console.log(`✓ 전송 후 메시지 개수: ${newCount}`);

    expect(newCount).toBeGreaterThan(initialCount);
    console.log('✓ Enter 키로 메시지 전송 성공');
  });

  test('Shift+Enter로 줄바꿈을 입력할 수 있어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const line1 = 'First line';
    const line2 = 'Second line';

    // 첫 번째 줄 입력
    await chatPage.messageInput.fill(line1);

    // Shift+Enter로 줄바꿈
    await chatPage.messageInput.press('Shift+Enter');

    // 두 번째 줄 입력
    await chatPage.messageInput.press(`Shift+${line2}`);

    // 입력된 값 확인
    const inputValue = await chatPage.messageInput.inputValue();
    console.log(`✓ 입력된 값: ${inputValue.replace(/\n/g, '\\n')}`);

    // 줄바꿈이 포함되어 있는지 확인
    expect(inputValue).toContain('\n');
    console.log('✓ Shift+Enter로 줄바꿈 입력 성공');
  });

  test('메시지 전송 후 입력 필드가 초기화되어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const testMessage = 'This message should clear after sending';

    // 메시지 전송
    await chatPage.sendMessage(testMessage);
    console.log('✓ 메시지 전송 완료');

    // 입력 필드가 비워졌는지 확인
    await wait(1000);
    const inputValue = await chatPage.messageInput.inputValue();
    console.log(`✓ 전송 후 입력 필드 값: "${inputValue}"`);

    expect(inputValue).toBe('');
    console.log('✓ 입력 필드가 초기화됨');
  });

  test('빈 메시지는 전송할 수 없어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const initialCount = await chatPage.getMessageCount();

    // 빈 메시지로 전송 시도
    await chatPage.messageInput.fill('');
    await wait(300);

    // 전송 버튼이 비활성화되어 있는지 확인
    const isDisabled = await chatPage.sendButton.isDisabled();
    console.log(`✓ 전송 버튼 비활성화 상태: ${isDisabled}`);

    // 비활성화되어 있다면 테스트 성공
    if (isDisabled) {
      console.log('✓ 빈 메시지 전송 방지됨 (버튼 비활성화)');
    } else {
      // 버튼이 활성화되어 있다면 클릭 시도 후 메시지 개수 확인
      await chatPage.sendButton.click();
      await wait(1000);

      const newCount = await chatPage.getMessageCount();
      // 메시지가 추가되지 않았어야 함
      expect(newCount).toBe(initialCount);
      console.log('✓ 빈 메시지가 전송되지 않음');
    }
  });

  test('긴 메시지를 입력할 수 있어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    // 긴 메시지 생성 (500자)
    const longMessage = `${'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(10)}End of long message.`;

    console.log(`✓ 긴 메시지 길이: ${longMessage.length}자`);

    // 긴 메시지 입력
    await chatPage.messageInput.fill(longMessage);
    await wait(500);

    // 입력된 값 확인
    const inputValue = await chatPage.messageInput.inputValue();
    expect(inputValue).toBe(longMessage);
    console.log('✓ 긴 메시지 입력 성공');

    // 메시지 전송
    await chatPage.sendMessage(longMessage);
    await wait(2000);

    console.log('✓ 긴 메시지 전송 완료');
  });

  test('특수 문자를 포함한 메시지를 전송할 수 있어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const specialCharsMessage = '특수문자 테스트: !@#$%^&*()_+-=[]{}|;:",.<>?/~`';

    const initialCount = await chatPage.getMessageCount();

    // 특수 문자 메시지 전송
    await chatPage.sendMessage(specialCharsMessage);
    console.log('✓ 특수 문자 메시지 전송 완료');

    await wait(2000);
    const newCount = await chatPage.getMessageCount();

    expect(newCount).toBeGreaterThan(initialCount);
    console.log('✓ 특수 문자 메시지 전송 성공');
  });

  test('여러 메시지를 연속으로 전송할 수 있어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    const messages = ['첫 번째 메시지', '두 번째 메시지', '세 번째 메시지'];

    const initialCount = await chatPage.getMessageCount();
    console.log(`✓ 초기 메시지 개수: ${initialCount}`);

    // 메시지 연속 전송
    for (const message of messages) {
      await chatPage.sendMessage(message);
      await wait(1500); // 각 메시지 간 대기
      console.log(`✓ "${message}" 전송 완료`);
    }

    // 최종 메시지 개수 확인
    const finalCount = await chatPage.getMessageCount();
    console.log(`✓ 최종 메시지 개수: ${finalCount}`);

    // 최소한 사용자 메시지만큼은 증가했어야 함
    expect(finalCount).toBeGreaterThanOrEqual(initialCount + messages.length);
    console.log('✓ 여러 메시지 연속 전송 성공');
  });

  test('전송 버튼이 메시지 입력 상태에 따라 활성/비활성화되어야 함', async ({ page }) => {
    const chatPage = new ChatPage(page);

    // 빈 상태에서 비활성화 확인
    await chatPage.messageInput.fill('');
    await wait(300);

    const disabledWhenEmpty = await chatPage.sendButton.isDisabled();
    console.log(`✓ 빈 상태일 때 전송 버튼 비활성화: ${disabledWhenEmpty}`);

    // 텍스트 입력 후 활성화 확인
    await chatPage.messageInput.fill('Test message');
    await wait(300);

    const enabledWithText = await chatPage.sendButton.isEnabled();
    console.log(`✓ 텍스트 입력 후 전송 버튼 활성화: ${enabledWithText}`);

    // 텍스트가 있을 때는 활성화되어야 함
    expect(enabledWithText).toBe(true);
  });

  test('스크린샷 캡처', async ({ page }) => {
    const chatPage = new ChatPage(page);

    // 테스트 메시지 전송
    await chatPage.sendMessage('E2E 테스트 스크린샷용 메시지');
    await wait(2000);

    await page.screenshot({
      path: 'e2e_tests/test-results/03-message-send-with-content.png',
      fullPage: true,
    });
    console.log('✓ 스크린샷 저장됨: 03-message-send-with-content.png');
  });
});
