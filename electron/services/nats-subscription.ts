/**
 * NATS JetStream 구독 서비스
 *
 * Webhook Broker(NATS JetStream)에서 메시지를 pull-subscribe하여 큐에 추가합니다.
 */

import {
  connect,
  AckPolicy,
  DeliverPolicy,
  type NatsConnection,
  type JetStreamClient,
  type Consumer,
} from 'nats';
import { MessageQueueService } from './message-queue';
import { logger } from './logger';
import type {
  MessageSubscriptionConfig,
  ExternalMessage,
  SubscriptionStatus,
} from '../../types/message-subscription';

/** Webhook Broker가 전달하는 메시지 구조 */
interface WebhookBrokerMessage {
  id?: string;
  source?: string;
  eventType?: string;
  timestamp?: number;
  headers?: Record<string, string>;
  payload?: Record<string, unknown>;
}

/** source → ExternalMessage.type 매핑 */
function mapSourceToType(source?: string): ExternalMessage['type'] {
  if (source?.toLowerCase() === 'github') return 'github_webhook';
  return 'custom';
}

export class NatsSubscriptionService {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private consumer: Consumer | null = null;
  private queueService: MessageQueueService;
  private fetchTimer: NodeJS.Timeout | null = null;
  private isFetching: boolean = false;
  private lastPolled: number | undefined = undefined;
  private lastError: string | undefined = undefined;

  constructor() {
    this.queueService = MessageQueueService.getInstance();
  }

  /**
   * NATS 서버에 연결하고 JetStream Consumer를 설정합니다.
   */
  async connect(config: MessageSubscriptionConfig): Promise<void> {
    const {
      natsUrl,
      natsConsumerId,
      natsConsumerSecret,
      natsStreamName = 'WEBHOOKS',
      natsSubject = 'webhooks.>',
    } = config;

    if (!natsUrl) {
      throw new Error('NATS 서버 URL이 설정되지 않았습니다');
    }

    try {
      // NATS 연결 옵션
      const connectOpts: Record<string, unknown> = {
        servers: natsUrl,
        maxReconnectAttempts: 10,
        reconnectTimeWait: 2000,
      };

      // Consumer 인증 설정 (ID/Secret이 있으면 user/pass 인증)
      if (natsConsumerId && natsConsumerSecret) {
        connectOpts.user = natsConsumerId;
        connectOpts.pass = natsConsumerSecret;
      }

      this.nc = await connect(connectOpts);
      this.js = this.nc.jetstream();

      // JetStream Consumer 구독 (Pull)
      const jsm = await this.nc.jetstreamManager();

      // Stream 존재 확인 (없으면 에러)
      try {
        await jsm.streams.info(natsStreamName);
      } catch {
        throw new Error(
          `NATS Stream "${natsStreamName}"을(를) 찾을 수 없습니다. Webhook Broker에서 Stream이 생성되어 있는지 확인하세요.`
        );
      }

      // Consumer 가져오기 또는 생성
      const consumerName = `sepilot-${Date.now()}`;
      await jsm.consumers.add(natsStreamName, {
        durable_name: consumerName,
        filter_subject: natsSubject,
        ack_policy: AckPolicy.Explicit,
        deliver_policy: DeliverPolicy.New,
      });

      this.consumer = await this.js.consumers.get(natsStreamName, consumerName);

      logger.info(`[NatsSubscription] NATS 연결 성공: ${natsUrl}, Stream: ${natsStreamName}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러';
      this.lastError = errorMessage;
      logger.error('[NatsSubscription] NATS 연결 실패:', error);
      throw error;
    }
  }

  /**
   * NATS 연결 해제
   */
  async disconnect(): Promise<void> {
    try {
      if (this.consumer) {
        this.consumer = null;
      }
      if (this.nc) {
        await this.nc.drain();
        this.nc = null;
        this.js = null;
      }
      logger.info('[NatsSubscription] NATS 연결 해제');
    } catch (error) {
      logger.error('[NatsSubscription] NATS 연결 해제 실패:', error);
    }
  }

  /**
   * 메시지 fetch 및 큐에 추가
   */
  async fetchMessages(config: MessageSubscriptionConfig): Promise<number> {
    if (this.isFetching) {
      logger.warn('[NatsSubscription] 이미 fetching 중입니다');
      return 0;
    }

    if (!this.consumer) {
      throw new Error('NATS Consumer가 연결되어 있지 않습니다');
    }

    this.isFetching = true;
    let addedCount = 0;

    try {
      const batchSize = config.natsBatchSize ?? 10;
      const fetchTimeout = config.natsFetchTimeout ?? 5000;

      const messages = await this.consumer.fetch({
        max_messages: batchSize,
        expires: fetchTimeout,
      });

      for await (const msg of messages) {
        try {
          const rawData = JSON.parse(new TextDecoder().decode(msg.data)) as WebhookBrokerMessage;
          const externalMessage = this.transformMessage(rawData);

          const hash = await this.queueService.enqueue(externalMessage);
          if (hash) {
            addedCount++;
          }

          // ACK: 정상 처리
          msg.ack();
        } catch (parseError) {
          logger.warn('[NatsSubscription] 메시지 파싱/처리 실패, NAK:', parseError);
          // NAK: 파싱 실패 → 재전송
          msg.nak();
        }
      }

      this.lastPolled = Date.now();
      this.lastError = undefined;

      if (addedCount > 0) {
        logger.info(`[NatsSubscription] ${addedCount}개의 새 메시지 추가됨`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 에러';
      this.lastError = errorMessage;
      logger.error('[NatsSubscription] 메시지 fetch 실패:', error);
    } finally {
      this.isFetching = false;
    }

    return addedCount;
  }

  /**
   * 주기적 fetch 시작
   */
  startFetching(config: MessageSubscriptionConfig): void {
    this.stopFetching();

    const interval = config.pollingInterval || 60000;

    this.fetchTimer = setInterval(async () => {
      await this.fetchMessages(config);
    }, interval);

    logger.info(`[NatsSubscription] 주기적 fetch 시작 (${interval / 1000}초 주기)`);
  }

  /**
   * 주기적 fetch 중지
   */
  stopFetching(): void {
    if (this.fetchTimer) {
      clearInterval(this.fetchTimer);
      this.fetchTimer = null;
      logger.info('[NatsSubscription] 주기적 fetch 중지');
    }
  }

  /**
   * 연결 상태 조회
   */
  getStatus(): SubscriptionStatus {
    return {
      isConnected: this.nc !== null && !this.nc.isClosed(),
      lastPolled: this.lastPolled,
      lastError: this.lastError,
    };
  }

  /**
   * Webhook Broker 메시지를 ExternalMessage로 변환
   */
  private transformMessage(raw: WebhookBrokerMessage): ExternalMessage {
    const payload = raw.payload ?? {};
    const source = raw.source ?? 'unknown';
    const eventType = raw.eventType ?? '';

    // payload에서 title/body/content 추출 (없으면 기본값)
    const title =
      (payload.title as string) || (payload.subject as string) || `${source}: ${eventType}`;
    const body = (payload.body as string) || (payload.summary as string) || title;
    const content =
      (payload.content as string) || (payload.body as string) || JSON.stringify(payload);

    return {
      id: raw.id,
      type: mapSourceToType(raw.source),
      source,
      title,
      body,
      content,
      metadata: {
        eventType,
        headers: raw.headers,
        ...payload,
      },
      timestamp: raw.timestamp ?? Date.now(),
    };
  }
}
