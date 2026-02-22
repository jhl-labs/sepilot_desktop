/**
 * 메시지 처리 워커 서비스
 *
 * 큐에서 메시지를 가져와 순차적으로 처리합니다.
 * - 새 대화 생성
 * - AI Agent 처리 (선택사항)
 * - 알림 표시
 */

import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { MessageQueueService } from './message-queue';
import { databaseService } from './database';
import { logger } from './logger';
import { showAppNotification } from './notification-service';
import { GraphFactory } from '../../lib/domains/agent';
import type { QueuedMessage, MessageSubscriptionConfig } from '../../types/message-subscription';
import type { Conversation, Message } from '../../types';

export class MessageProcessorService {
  private static instance: MessageProcessorService;
  private queueService: MessageQueueService;
  private config: MessageSubscriptionConfig | null = null;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;
  private mainWindow: BrowserWindow | null = null;

  private constructor() {
    this.queueService = MessageQueueService.getInstance();
  }

  static getInstance(): MessageProcessorService {
    if (!MessageProcessorService.instance) {
      MessageProcessorService.instance = new MessageProcessorService();
    }
    return MessageProcessorService.instance;
  }

  /**
   * Main Window 설정 (알림 전송용)
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  /**
   * 워커 시작
   */
  async start(config: MessageSubscriptionConfig): Promise<void> {
    try {
      this.config = config;

      if (!config.autoProcess) {
        logger.info('[MessageProcessor] 자동 처리가 비활성화되어 있습니다');
        return;
      }

      // 기존 타이머 정리
      this.stop();

      // 즉시 한 번 실행
      await this.processNext();

      // 정기적으로 큐 확인 (5초마다)
      this.processingInterval = setInterval(async () => {
        await this.processNext();
      }, 5000);

      logger.info('[MessageProcessor] 워커 시작');
    } catch (error) {
      logger.error('[MessageProcessor] 워커 시작 실패:', error);
      throw error;
    }
  }

  /**
   * 워커 중지
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
      logger.info('[MessageProcessor] 워커 중지');
    }
  }

  /**
   * 설정 업데이트
   */
  async updateConfig(config: MessageSubscriptionConfig): Promise<void> {
    this.config = config;

    if (config.autoProcess) {
      await this.start(config);
    } else {
      this.stop();
    }
  }

  /**
   * 다음 메시지 처리
   */
  async processNext(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    if (!this.config) {
      return;
    }

    this.isProcessing = true;
    try {
      const message = await this.queueService.dequeue();
      if (!message) {
        return; // 큐가 비어있음
      }

      await this.processMessage(message);
    } catch (error) {
      logger.error('[MessageProcessor] 메시지 처리 중 에러:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 단일 메시지 처리
   */
  private async processMessage(message: QueuedMessage): Promise<void> {
    try {
      if (!this.config) {
        throw new Error('설정이 없습니다');
      }

      // 상태를 processing으로 변경
      await this.queueService.updateStatus(message.hash, 'processing');

      logger.info(`[MessageProcessor] 메시지 처리 시작: ${message.title}`);

      // 새 대화 생성
      const conversationId = await this.createConversation(message.title);

      // AI 처리 여부에 따라 분기
      if (this.config.useAIProcessing) {
        await this.processWithAI(message, conversationId);
      } else {
        await this.processWithoutAI(message, conversationId);
      }

      // 알림 표시
      if (this.config.showNotification) {
        await this.showNotification(conversationId, message.title, message.body);
      }

      // 상태를 completed로 변경
      await this.queueService.updateStatus(message.hash, 'completed', undefined, conversationId);

      logger.info(`[MessageProcessor] 메시지 처리 완료: ${message.title}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러';
      logger.error('[MessageProcessor] 메시지 처리 실패:', error);

      // 재시도 확인
      if (message.retryCount < (this.config?.retryAttempts || 3)) {
        // 재시도
        await this.queueService.updateStatus(message.hash, 'pending', errorMessage);
        logger.info(
          `[MessageProcessor] 재시도 예정: ${message.title} (${message.retryCount + 1}/${this.config?.retryAttempts})`
        );

        // 재시도 대기 시간
        await new Promise((resolve) => setTimeout(resolve, this.config?.retryDelay || 5000));
      } else {
        // 실패 처리
        await this.queueService.updateStatus(message.hash, 'failed', errorMessage);
        logger.error(`[MessageProcessor] 메시지 처리 실패 (재시도 초과): ${message.title}`);
      }
    }
  }

  /**
   * AI Agent로 요약 처리
   */
  private async processWithAI(message: QueuedMessage, conversationId: string): Promise<void> {
    if (!this.config) {
      throw new Error('설정이 없습니다');
    }

    try {
      // 프롬프트 생성
      const promptTemplate =
        this.config.aiPromptTemplate ||
        `다음은 외부 시스템에서 수신한 메시지입니다. 핵심 내용을 간결하게 요약해주세요.

타입: {type}
소스: {source}
제목: {title}
내용:
{content}`;

      const userContent = promptTemplate
        .replace('{type}', message.type)
        .replace('{source}', message.source)
        .replace('{title}', message.title)
        .replace('{content}', message.content);

      // User 메시지 추가
      const userMessage: Message = {
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'user',
        content: userContent,
        created_at: Date.now(),
      };
      databaseService.saveMessage(userMessage);

      // AI Agent 실행 (LangGraph)
      const graphConfig = {
        thinkingMode: this.config.thinkingMode,
        enableRAG: false,
        enableTools: false,
        enableImageGeneration: false,
      };

      let assistantContent = '';
      const assistantMessage: Message = {
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'assistant',
        content: '',
        created_at: Date.now(),
      };

      // 스트리밍으로 처리
      for await (const streamEvent of GraphFactory.streamWithConfig(graphConfig, [userMessage], {
        conversationId,
      })) {
        // Node 이벤트에서 메시지 추출
        if (streamEvent.type === 'node' && streamEvent.data?.messages) {
          const lastMessage = streamEvent.data.messages[streamEvent.data.messages.length - 1];
          if (lastMessage?.role === 'assistant' && lastMessage.content) {
            assistantContent = lastMessage.content;
          }
        }
      }

      // Assistant 메시지 저장
      assistantMessage.content = assistantContent;
      databaseService.saveMessage(assistantMessage);

      logger.info(`[MessageProcessor] AI 요약 완료: ${conversationId}`);
    } catch (error) {
      logger.error('[MessageProcessor] AI 처리 실패:', error);
      throw error;
    }
  }

  /**
   * 원본 그대로 표시 (AI 미사용)
   */
  private async processWithoutAI(message: QueuedMessage, conversationId: string): Promise<void> {
    try {
      // User 메시지로 원본 content 추가
      const userMessage: Message = {
        id: randomUUID(),
        conversation_id: conversationId,
        role: 'user',
        content: `**[${message.type}] ${message.source}**\n\n${message.content}`,
        created_at: Date.now(),
      };
      databaseService.saveMessage(userMessage);

      logger.info(`[MessageProcessor] 원본 메시지 저장 완료: ${conversationId}`);
    } catch (error) {
      logger.error('[MessageProcessor] 메시지 저장 실패:', error);
      throw error;
    }
  }

  /**
   * 새 대화 생성
   */
  private async createConversation(title: string): Promise<string> {
    try {
      const conversation: Conversation = {
        id: randomUUID(),
        title,
        created_at: Date.now(),
        updated_at: Date.now(),
        chatSettings: {
          thinkingMode: this.config?.thinkingMode || 'instant',
          enableRAG: false,
          enableTools: false,
          enableImageGeneration: false,
        },
      };

      databaseService.saveConversation(conversation);

      logger.info(`[MessageProcessor] 새 대화 생성: ${title} (${conversation.id})`);
      return conversation.id;
    } catch (error) {
      logger.error('[MessageProcessor] 대화 생성 실패:', error);
      throw error;
    }
  }

  /**
   * 알림 표시
   */
  private async showNotification(
    conversationId: string,
    title: string,
    body: string
  ): Promise<void> {
    try {
      const result = await showAppNotification(
        {
          conversationId,
          title,
          body,
        },
        {
          mainWindow: this.mainWindow,
        }
      );

      if (!result.success) {
        logger.warn(`[MessageProcessor] 알림 표시 실패: ${result.error}`);
        return;
      }

      logger.info(`[MessageProcessor] ${result.type} 알림 표시: ${title}`);
    } catch (error) {
      logger.error('[MessageProcessor] 알림 표시 실패:', error);
      // 알림 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
  }
}
