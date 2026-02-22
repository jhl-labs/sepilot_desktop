/**
 * 메시지 구독 서비스
 *
 * 외부 API 서버에서 메시지를 polling하여 큐에 추가합니다.
 */

import { MessageQueueService } from './message-queue';
import { NatsSubscriptionService } from './nats-subscription';
import { logger } from './logger';
import type {
  MessageSubscriptionConfig,
  ExternalMessage,
  MessageAPIResponse,
  SubscriptionStatus,
} from '../../types/message-subscription';

export class MessageSubscriptionService {
  private static instance: MessageSubscriptionService;
  private config: MessageSubscriptionConfig | null = null;
  private queueService: MessageQueueService;
  private natsService: NatsSubscriptionService;
  private pollingTimer: NodeJS.Timeout | null = null;
  private isPolling: boolean = false;
  private lastPolled: number | undefined = undefined;
  private lastError: string | undefined = undefined;

  private constructor() {
    this.queueService = MessageQueueService.getInstance();
    this.natsService = new NatsSubscriptionService();
  }

  /**
   * 설정 정규화
   * - pollingInterval은 내부적으로 ms를 사용
   * - 기존(초 단위) 설정과 호환
   */
  private normalizeConfig(config: MessageSubscriptionConfig): MessageSubscriptionConfig {
    const { notificationType: _legacyNotificationType, ...effectiveConfig } = config;
    const rawInterval = Number(effectiveConfig.pollingInterval);
    let pollingInterval = Number.isFinite(rawInterval) && rawInterval > 0 ? rawInterval : 60000;

    // Backward compatibility: seconds -> ms
    if (pollingInterval < 1000) {
      pollingInterval *= 1000;
    }

    return {
      ...effectiveConfig,
      pollingInterval: Math.max(1000, Math.round(pollingInterval)),
    };
  }

  static getInstance(): MessageSubscriptionService {
    if (!MessageSubscriptionService.instance) {
      MessageSubscriptionService.instance = new MessageSubscriptionService();
    }
    return MessageSubscriptionService.instance;
  }

  /**
   * 서비스 시작
   */
  async start(config: MessageSubscriptionConfig): Promise<void> {
    try {
      const normalizedConfig = this.normalizeConfig(config);
      this.config = normalizedConfig;

      if (!normalizedConfig.enabled) {
        logger.info('[MessageSubscription] 구독이 비활성화되어 있습니다');
        return;
      }

      // 기존 연결 정리
      this.stop();

      if (normalizedConfig.connectionType === 'nats') {
        // NATS JetStream 모드
        if (!normalizedConfig.natsUrl) {
          throw new Error('NATS 서버 URL이 설정되지 않았습니다');
        }

        await this.natsService.connect(normalizedConfig);
        await this.natsService.fetchMessages(normalizedConfig);
        this.natsService.startFetching(normalizedConfig);

        logger.info(
          `[MessageSubscription] NATS 서비스 시작 (${normalizedConfig.pollingInterval / 1000}초 주기)`
        );
      } else {
        // HTTP Polling 모드
        if (!normalizedConfig.pollingUrl) {
          throw new Error('Polling URL이 설정되지 않았습니다');
        }

        // 즉시 한 번 실행
        await this.poll();

        // 정기적 polling 시작
        this.pollingTimer = setInterval(async () => {
          await this.poll();
        }, normalizedConfig.pollingInterval);

        logger.info(
          `[MessageSubscription] 서비스 시작 (${normalizedConfig.pollingInterval / 1000}초 주기)`
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러';
      this.lastError = errorMessage;
      logger.error('[MessageSubscription] 서비스 시작 실패:', error);
      throw error;
    }
  }

  /**
   * 서비스 중지
   */
  stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }

    // NATS 정리
    this.natsService.stopFetching();
    this.natsService.disconnect().catch((err) => {
      logger.warn('[MessageSubscription] NATS 연결 해제 중 에러:', err);
    });

    logger.info('[MessageSubscription] 서비스 중지');
  }

  /**
   * 설정 업데이트
   */
  async updateConfig(config: MessageSubscriptionConfig): Promise<void> {
    const normalizedConfig = this.normalizeConfig(config);
    this.config = normalizedConfig;

    if (normalizedConfig.enabled) {
      await this.start(normalizedConfig);
    } else {
      this.stop();
    }
  }

  /**
   * 수동 새로고침 (즉시 polling 실행)
   */
  async refresh(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
      if (!this.config || !this.config.enabled) {
        throw new Error('구독이 비활성화되어 있습니다');
      }

      let count: number;
      if (this.config.connectionType === 'nats') {
        count = await this.natsService.fetchMessages(this.config);
      } else {
        count = await this.poll();
      }
      return { success: true, count };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러';
      logger.error('[MessageSubscription] 수동 새로고침 실패:', error);
      return { success: false, count: 0, error: errorMessage };
    }
  }

  /**
   * HTTP Polling 실행
   */
  private async poll(): Promise<number> {
    if (this.isPolling) {
      logger.warn('[MessageSubscription] 이미 polling 중입니다');
      return 0;
    }

    this.isPolling = true;
    let addedCount = 0;

    try {
      if (!this.config) {
        throw new Error('설정이 없습니다');
      }

      const messages = await this.fetchMessages();

      // 각 메시지를 큐에 추가
      for (const message of messages) {
        const hash = await this.queueService.enqueue(message);
        if (hash) {
          addedCount++;
        }
      }

      this.lastPolled = Date.now();
      this.lastError = undefined;

      if (addedCount > 0) {
        logger.info(`[MessageSubscription] ${addedCount}개의 새 메시지 추가됨`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러';
      this.lastError = errorMessage;
      logger.error('[MessageSubscription] Polling 실패:', error);
    } finally {
      this.isPolling = false;
    }

    return addedCount;
  }

  /**
   * 메시지 fetch 및 파싱
   */
  private async fetchMessages(): Promise<ExternalMessage[]> {
    if (!this.config) {
      throw new Error('설정이 없습니다');
    }

    const { pollingUrl, authToken, customHeaders } = this.config;

    try {
      // HTTP GET 요청
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...customHeaders,
      };

      if (authToken) {
        headers['Authorization'] = authToken.startsWith('Bearer ')
          ? authToken
          : `Bearer ${authToken}`;
      }

      const response = await fetch(pollingUrl, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // 표준 형식으로 파싱
      const apiResponse = this.parseAPIResponse(data);
      return apiResponse.messages;
    } catch (error) {
      logger.error('[MessageSubscription] 메시지 fetch 실패:', error);
      throw error;
    }
  }

  /**
   * API 응답 파싱
   */
  private parseAPIResponse(data: unknown): MessageAPIResponse {
    // 표준 형식 검증
    if (!data || typeof data !== 'object') {
      throw new Error('유효하지 않은 API 응답 형식');
    }

    const response = data as Record<string, unknown>;

    if (!Array.isArray(response.messages)) {
      throw new Error('messages 배열이 없습니다');
    }

    // 각 메시지 검증
    const messages: ExternalMessage[] = [];
    for (const msg of response.messages) {
      try {
        const validated = this.validateMessage(msg);
        messages.push(validated);
      } catch (error) {
        logger.warn('[MessageSubscription] 유효하지 않은 메시지 무시:', error);
        // 개별 메시지 에러는 무시하고 계속 진행
      }
    }

    return {
      messages,
      hasMore: response.hasMore === true,
      nextCursor: typeof response.nextCursor === 'string' ? response.nextCursor : undefined,
    };
  }

  /**
   * 개별 메시지 검증
   */
  private validateMessage(data: unknown): ExternalMessage {
    if (!data || typeof data !== 'object') {
      throw new Error('유효하지 않은 메시지 형식');
    }

    const msg = data as Record<string, unknown>;

    // 필수 필드 검증
    if (typeof msg.type !== 'string' || !msg.type) {
      throw new Error('type 필드가 없거나 유효하지 않습니다');
    }

    if (typeof msg.source !== 'string' || !msg.source) {
      throw new Error('source 필드가 없거나 유효하지 않습니다');
    }

    if (typeof msg.title !== 'string' || !msg.title) {
      throw new Error('title 필드가 없거나 유효하지 않습니다');
    }

    if (typeof msg.body !== 'string' || !msg.body) {
      throw new Error('body 필드가 없거나 유효하지 않습니다');
    }

    if (typeof msg.content !== 'string' || !msg.content) {
      throw new Error('content 필드가 없거나 유효하지 않습니다');
    }

    if (typeof msg.timestamp !== 'number' || msg.timestamp <= 0) {
      throw new Error('timestamp 필드가 없거나 유효하지 않습니다');
    }

    // 타입 검증
    const validTypes = ['github_webhook', 'community_post', 'custom'];
    if (!validTypes.includes(msg.type)) {
      throw new Error(`유효하지 않은 type: ${msg.type}`);
    }

    return {
      id: typeof msg.id === 'string' ? msg.id : undefined,
      type: msg.type as ExternalMessage['type'],
      source: msg.source,
      title: msg.title,
      body: msg.body,
      content: msg.content,
      metadata:
        typeof msg.metadata === 'object' ? (msg.metadata as Record<string, unknown>) : undefined,
      timestamp: msg.timestamp,
    };
  }

  /**
   * 연결 상태 조회
   */
  getStatus(): SubscriptionStatus {
    if (this.config?.connectionType === 'nats') {
      return this.natsService.getStatus();
    }

    return {
      isConnected: this.config?.enabled === true && this.pollingTimer !== null,
      lastPolled: this.lastPolled,
      lastError: this.lastError,
    };
  }
}
