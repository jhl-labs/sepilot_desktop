import { Page, Locator } from '@playwright/test';
import { BasePage } from './base-page';

/**
 * 채팅 페이지 Page Object
 *
 * 주요 기능:
 * - 새 채팅 세션 생성
 * - 메시지 입력 및 전송
 * - AI 응답 대기 및 확인
 * - 채팅 히스토리 관리
 */
export class ChatPage extends BasePage {
  // 선택자 정의
  private readonly selectors = {
    // 채팅 세션
    newChatButton: '[data-testid="new-chat"]',
    chatSessionList: '[data-testid="chat-session-list"]',
    chatSession: '[data-testid="chat-session"]',
    activeSession: '[data-testid="chat-session"][data-active="true"]',

    // 메시지 입력
    chatInput: '[data-testid="chat-input"]',
    sendButton: '[data-testid="send-message"]',
    attachFileButton: '[data-testid="attach-file"]',

    // 메시지 목록
    messageList: '[data-testid="message-list"]',
    messageBubble: '[data-testid="message-bubble"]',
    userMessage: '[data-testid="message-bubble"][data-role="user"]',
    aiMessage: '[data-testid="message-bubble"][data-role="assistant"]',
    lastMessage: '[data-testid="message-bubble"]:last-child',

    // AI 응답 상태
    aiThinking: '[data-testid="ai-thinking"]',
    aiStreaming: '[data-testid="ai-streaming"]',
    aiComplete: '[data-testid="ai-complete"]',

    // 도구 호출
    toolCall: '[data-testid="tool-call"]',
    toolApproval: '[data-testid="tool-approval-dialog"]',
    toolApproveButton: '[data-testid="approve-tool"]',
    toolRejectButton: '[data-testid="reject-tool"]',

    // 기타
    clearChatButton: '[data-testid="clear-chat"]',
    exportChatButton: '[data-testid="export-chat"]',
    chatTitle: '[data-testid="chat-title"]',
  };

  constructor(page: Page) {
    super(page);
  }

  /**
   * 새 채팅 세션을 생성합니다.
   */
  async createNewSession(): Promise<void> {
    await this.safeClick(this.selectors.newChatButton);
    // 입력 필드가 나타날 때까지 대기
    await this.waitForVisible(this.selectors.chatInput);
  }

  /**
   * 특정 채팅 세션을 선택합니다.
   *
   * @param index - 세션 인덱스 (0부터 시작)
   */
  async selectSession(index: number): Promise<void> {
    const sessions = this.page.locator(this.selectors.chatSession);
    await sessions.nth(index).click();
  }

  /**
   * 현재 활성 세션의 제목을 가져옵니다.
   *
   * @returns 채팅 세션 제목
   */
  async getChatTitle(): Promise<string> {
    return this.getText(this.selectors.chatTitle);
  }

  /**
   * 메시지를 입력합니다 (전송하지 않음).
   *
   * @param message - 입력할 메시지
   */
  async typeMessage(message: string): Promise<void> {
    await this.fillText(this.selectors.chatInput, message);
  }

  /**
   * 메시지를 전송합니다.
   */
  async sendMessage(): Promise<void> {
    await this.safeClick(this.selectors.sendButton);
  }

  /**
   * 메시지를 입력하고 전송합니다.
   *
   * @param message - 전송할 메시지
   */
  async sendMessageAndWait(message: string): Promise<void> {
    await this.typeMessage(message);
    await this.sendMessage();
  }

  /**
   * AI 응답을 대기합니다.
   *
   * @param timeout - 타임아웃 (ms), 기본값 30초
   */
  async waitForResponse(timeout = 30000): Promise<void> {
    // AI 생각 중 표시가 나타났다가 사라질 때까지 대기
    try {
      await this.waitForVisible(this.selectors.aiThinking, 5000);
    } catch {
      // AI 생각 표시가 너무 빨리 사라질 수 있음
    }

    // AI 응답 완료 대기
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const isThinking = await this.isVisible(this.selectors.aiThinking);
      const isStreaming = await this.isVisible(this.selectors.aiStreaming);

      if (!isThinking && !isStreaming) {
        // 추가로 새 메시지가 추가되었는지 확인
        const messageCount = await this.getMessageCount();
        if (messageCount > 0) {
          return;
        }
      }

      await this.wait(200);
    }

    throw new Error(`AI 응답 대기 타임아웃 (${timeout}ms)`);
  }

  /**
   * 마지막 메시지를 가져옵니다.
   *
   * @returns 마지막 메시지 내용
   */
  async getLastMessage(): Promise<string> {
    return this.getText(this.selectors.lastMessage);
  }

  /**
   * 마지막 AI 응답을 가져옵니다.
   *
   * @returns 마지막 AI 응답
   */
  async getLastAIResponse(): Promise<string> {
    const aiMessages = this.page.locator(this.selectors.aiMessage);
    const count = await aiMessages.count();

    if (count === 0) {
      return '';
    }

    return this.getText(aiMessages.nth(count - 1));
  }

  /**
   * 전체 메시지 개수를 가져옵니다.
   *
   * @returns 메시지 개수
   */
  async getMessageCount(): Promise<number> {
    return this.getCount(this.selectors.messageBubble);
  }

  /**
   * 사용자 메시지 개수를 가져옵니다.
   *
   * @returns 사용자 메시지 개수
   */
  async getUserMessageCount(): Promise<number> {
    return this.getCount(this.selectors.userMessage);
  }

  /**
   * AI 메시지 개수를 가져옵니다.
   *
   * @returns AI 메시지 개수
   */
  async getAIMessageCount(): Promise<number> {
    return this.getCount(this.selectors.aiMessage);
  }

  /**
   * 특정 인덱스의 메시지를 가져옵니다.
   *
   * @param index - 메시지 인덱스 (0부터 시작)
   * @returns 메시지 내용
   */
  async getMessageAt(index: number): Promise<string> {
    const messages = this.page.locator(this.selectors.messageBubble);
    return this.getText(messages.nth(index));
  }

  /**
   * 모든 메시지를 가져옵니다.
   *
   * @returns 메시지 배열
   */
  async getAllMessages(): Promise<string[]> {
    const messages = this.page.locator(this.selectors.messageBubble);
    const count = await messages.count();

    const messageTexts: string[] = [];
    for (let i = 0; i < count; i++) {
      const text = await this.getText(messages.nth(i));
      messageTexts.push(text);
    }

    return messageTexts;
  }

  /**
   * 파일을 첨부합니다.
   *
   * @param filePath - 첨부할 파일 경로
   */
  async attachFile(filePath: string): Promise<void> {
    await this.safeClick(this.selectors.attachFileButton);

    // 파일 입력 대화상자 처리
    const fileInput = this.page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
  }

  /**
   * 도구 호출 승인 대화상자가 표시되는지 확인합니다.
   *
   * @returns 승인 대화상자 표시 여부
   */
  async isToolApprovalVisible(): Promise<boolean> {
    return this.isVisible(this.selectors.toolApproval);
  }

  /**
   * 도구 호출을 승인합니다.
   */
  async approveToolCall(): Promise<void> {
    await this.safeClick(this.selectors.toolApproveButton);
  }

  /**
   * 도구 호출을 거부합니다.
   */
  async rejectToolCall(): Promise<void> {
    await this.safeClick(this.selectors.toolRejectButton);
  }

  /**
   * 도구 호출이 실행되었는지 확인합니다.
   *
   * @returns 도구 호출 개수
   */
  async getToolCallCount(): Promise<number> {
    return this.getCount(this.selectors.toolCall);
  }

  /**
   * 채팅을 초기화합니다.
   */
  async clearChat(): Promise<void> {
    await this.safeClick(this.selectors.clearChatButton);

    // 확인 대화상자가 있다면 승인
    const confirmButton = this.page.locator('button:has-text("확인")');
    if (await confirmButton.isVisible()) {
      await confirmButton.click();
    }

    // 메시지가 모두 제거될 때까지 대기
    await this.page.waitForFunction(
      (selector) => {
        const messages = document.querySelectorAll(selector);
        return messages.length === 0;
      },
      this.selectors.messageBubble,
      { timeout: 5000 }
    );
  }

  /**
   * 채팅을 내보냅니다.
   */
  async exportChat(): Promise<void> {
    await this.safeClick(this.selectors.exportChatButton);
  }

  /**
   * AI가 현재 응답 중인지 확인합니다.
   *
   * @returns AI 응답 중 여부
   */
  async isAIResponding(): Promise<boolean> {
    const isThinking = await this.isVisible(this.selectors.aiThinking);
    const isStreaming = await this.isVisible(this.selectors.aiStreaming);
    return isThinking || isStreaming;
  }

  /**
   * 입력 필드가 활성화되어 있는지 확인합니다.
   *
   * @returns 활성화 여부
   */
  async isInputEnabled(): Promise<boolean> {
    return this.isEnabled(this.selectors.chatInput);
  }

  /**
   * 전송 버튼이 활성화되어 있는지 확인합니다.
   *
   * @returns 활성화 여부
   */
  async isSendButtonEnabled(): Promise<boolean> {
    return this.isEnabled(this.selectors.sendButton);
  }

  /**
   * 특정 텍스트가 포함된 메시지가 있는지 확인합니다.
   *
   * @param text - 검색할 텍스트
   * @returns 메시지 존재 여부
   */
  async hasMessageContaining(text: string): Promise<boolean> {
    const messages = await this.getAllMessages();
    return messages.some((msg) => msg.includes(text));
  }

  /**
   * 메시지 목록을 맨 아래로 스크롤합니다.
   */
  async scrollToBottom(): Promise<void> {
    await this.page.evaluate((selector) => {
      const messageList = document.querySelector(selector);
      if (messageList) {
        messageList.scrollTop = messageList.scrollHeight;
      }
    }, this.selectors.messageList);
  }

  /**
   * 채팅 세션 개수를 가져옵니다.
   *
   * @returns 세션 개수
   */
  async getSessionCount(): Promise<number> {
    return this.getCount(this.selectors.chatSession);
  }

  /**
   * 메시지를 보내고 AI 응답을 대기하는 헬퍼 메서드.
   *
   * @param message - 전송할 메시지
   * @param timeout - 응답 대기 타임아웃
   * @returns AI 응답 내용
   */
  async sendAndWaitForResponse(
    message: string,
    timeout = 30000
  ): Promise<string> {
    await this.sendMessageAndWait(message);
    await this.waitForResponse(timeout);
    return this.getLastAIResponse();
  }
}
