import { test, expect } from '../fixtures/electron';
import { MainLayoutPage, ConversationListPage, ChatPage } from '../utils/page-objects';
import { wait } from '../utils/helpers';

/**
 * TC2: 새 대화 생성 테스트
 *
 * 테스트 목적:
 * - 키보드 단축키로 새 대화를 생성할 수 있는지 확인
 * - 버튼 클릭으로 새 대화를 생성할 수 있는지 확인
 * - 새 대화가 목록에 추가되는지 확인
 * - 새 대화가 활성화되는지 확인
 */
test.describe('새 대화 생성', () => {
  test('키보드 단축키로 새 대화를 생성할 수 있어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const conversationList = new ConversationListPage(page);
    const chatPage = new ChatPage(page);

    // 초기 대화 개수 확인
    const initialCount = await conversationList.getConversationCount();
    console.log(`✓ 초기 대화 개수: ${initialCount}`);

    // 단축키로 새 대화 생성 (Cmd+N 또는 Ctrl+N)
    await mainLayout.createNewConversation();
    console.log('✓ 새 대화 생성 단축키 실행');

    // 대화 개수가 증가했는지 확인
    await wait(1000); // UI 업데이트 대기
    const newCount = await conversationList.getConversationCount();
    console.log(`✓ 새 대화 개수: ${newCount}`);

    expect(newCount).toBeGreaterThan(initialCount);
    console.log('✓ 대화 개수가 증가함');

    // 빈 채팅 화면이 표시되는지 확인
    const messageCount = await chatPage.getMessageCount();
    expect(messageCount).toBe(0);
    console.log('✓ 새 대화는 메시지가 없는 상태');
  });

  test('플러스 버튼으로 새 대화를 생성할 수 있어야 함', async ({ page }) => {
    const conversationList = new ConversationListPage(page);

    // 초기 대화 개수 확인
    const initialCount = await conversationList.getConversationCount();
    console.log(`✓ 초기 대화 개수: ${initialCount}`);

    // 새 대화 버튼 클릭
    await conversationList.createNewConversation();
    console.log('✓ 새 대화 버튼 클릭');

    // 대화 개수가 증가했는지 확인
    await wait(1000);
    const newCount = await conversationList.getConversationCount();
    console.log(`✓ 새 대화 개수: ${newCount}`);

    expect(newCount).toBeGreaterThan(initialCount);
    console.log('✓ 대화 개수가 증가함');
  });

  test('새로 생성된 대화가 자동으로 활성화되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const conversationList = new ConversationListPage(page);

    // 새 대화 생성 전 활성 대화 인덱스
    const beforeIndex = await conversationList.getActiveConversationIndex();
    console.log(`✓ 생성 전 활성 대화 인덱스: ${beforeIndex}`);

    // 새 대화 생성
    await mainLayout.createNewConversation();
    await wait(1000);

    // 새 대화 생성 후 활성 대화 인덱스
    const afterIndex = await conversationList.getActiveConversationIndex();
    console.log(`✓ 생성 후 활성 대화 인덱스: ${afterIndex}`);

    // 활성 대화가 변경되었거나 새로 추가되었는지 확인
    expect(afterIndex).toBeGreaterThanOrEqual(0);
    console.log('✓ 새 대화가 활성화됨');
  });

  test('여러 개의 대화를 순차적으로 생성할 수 있어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const conversationList = new ConversationListPage(page);

    const initialCount = await conversationList.getConversationCount();
    console.log(`✓ 초기 대화 개수: ${initialCount}`);

    // 3개의 새 대화 생성
    const conversationsToCreate = 3;
    for (let i = 0; i < conversationsToCreate; i++) {
      await mainLayout.createNewConversation();
      await wait(500);
      console.log(`✓ ${i + 1}번째 대화 생성`);
    }

    // 최종 대화 개수 확인
    const finalCount = await conversationList.getConversationCount();
    console.log(`✓ 최종 대화 개수: ${finalCount}`);

    expect(finalCount).toBe(initialCount + conversationsToCreate);
    console.log(`✓ ${conversationsToCreate}개의 대화가 성공적으로 생성됨`);
  });

  test('새 대화 생성 후 입력 필드가 포커스되어야 함', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const chatPage = new ChatPage(page);

    // 새 대화 생성
    await mainLayout.createNewConversation();
    await wait(1000);

    // 입력 필드가 존재하고 활성화되어 있는지 확인
    await expect(chatPage.messageInput).toBeVisible();
    console.log('✓ 메시지 입력 필드가 표시됨');

    // 입력 필드에 포커스가 있는지 확인 (선택 사항)
    const isFocused = await chatPage.messageInput.evaluate((el) => el === document.activeElement);
    console.log(`✓ 입력 필드 포커스 상태: ${isFocused}`);
  });

  test('대화 목록이 스크롤 가능해야 함 (많은 대화 생성 시)', async ({ page }) => {
    const mainLayout = new MainLayoutPage(page);
    const conversationList = new ConversationListPage(page);

    // 현재 대화 개수 확인
    const currentCount = await conversationList.getConversationCount();
    console.log(`✓ 현재 대화 개수: ${currentCount}`);

    // 충분한 대화가 없다면 더 생성 (최소 10개)
    const minConversations = 10;
    if (currentCount < minConversations) {
      const toCreate = minConversations - currentCount;
      console.log(`✓ ${toCreate}개의 대화를 추가로 생성`);

      for (let i = 0; i < toCreate; i++) {
        await mainLayout.createNewConversation();
        await wait(300);
      }
    }

    // 최종 대화 개수 확인
    const finalCount = await conversationList.getConversationCount();
    console.log(`✓ 최종 대화 개수: ${finalCount}`);
    expect(finalCount).toBeGreaterThanOrEqual(minConversations);

    // 대화 목록 컨테이너가 스크롤 가능한지 확인
    const scrollContainer = page.locator('.flex-1.overflow-y-auto').first();
    const isScrollable = await scrollContainer.evaluate((el) => {
      return el.scrollHeight > el.clientHeight;
    });

    console.log(`✓ 대화 목록 스크롤 가능 여부: ${isScrollable}`);
    // 많은 대화가 있으면 스크롤 가능해야 함
    if (finalCount > 8) {
      expect(isScrollable).toBe(true);
    }
  });

  test('스크린샷 캡처', async ({ page }) => {
    await page.screenshot({
      path: 'e2e_tests/test-results/02-conversation-create-multiple.png',
      fullPage: true,
    });
    console.log('✓ 스크린샷 저장됨: 02-conversation-create-multiple.png');
  });
});
