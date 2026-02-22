/**
 * 외부 API 메시지 구독 및 파일 기반 큐 시스템 타입 정의
 */

/**
 * 외부 시스템에서 수신하는 기본 메시지 구조
 */
export interface ExternalMessage {
  /** 메시지 ID (선택사항, 서버에서 제공하는 경우) */
  id?: string;
  /** 메시지 타입 */
  type: 'github_webhook' | 'community_post' | 'custom';
  /** 메시지 출처 */
  source: string;
  /** 메시지 제목 */
  title: string;
  /** 메시지 요약 (알림 표시용) */
  body: string;
  /** 메시지 전체 내용 */
  content: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
  /** 메시지 생성 시간 (Unix timestamp, ms) */
  timestamp: number;
}

/**
 * 큐에 저장되는 메시지 구조
 */
export interface QueuedMessage extends ExternalMessage {
  /** 메시지 해시 (SHA-256, 중복 방지용) */
  hash: string;
  /** 큐에 추가된 시간 (Unix timestamp, ms) */
  queuedAt: number;
  /** 처리 상태 */
  status: 'pending' | 'processing' | 'completed' | 'failed';
  /** 처리 완료/실패 시간 (Unix timestamp, ms) */
  processedAt?: number;
  /** 에러 메시지 (실패 시) */
  error?: string;
  /** 재시도 횟수 */
  retryCount: number;
  /** 생성된 대화 ID (처리 완료 시) */
  conversationId?: string;
}

/**
 * 메시지 구독 설정
 */
export interface MessageSubscriptionConfig {
  /** 구독 활성화 여부 */
  enabled: boolean;

  // API 설정
  /** 연결 타입 */
  connectionType: 'polling' | 'websocket' | 'nats';
  /** Polling API URL */
  pollingUrl: string;
  /** Polling 주기 (밀리초, 기본: 60000ms = 1분) */
  pollingInterval: number;
  /** 인증 토큰 (선택사항) */
  authToken?: string;
  /** 커스텀 HTTP 헤더 (선택사항) */
  customHeaders?: Record<string, string>;

  // NATS 전용 설정 (connectionType === 'nats'일 때 사용)
  /** NATS 서버 URL (예: nats://broker.example.com:4222) */
  natsUrl?: string;
  /** NATS Consumer ID */
  natsConsumerId?: string;
  /** NATS Consumer Secret */
  natsConsumerSecret?: string;
  /** NATS JetStream Stream 이름 (기본: WEBHOOKS) */
  natsStreamName?: string;
  /** NATS Subject 패턴 (기본: webhooks.>) */
  natsSubject?: string;
  /** NATS Fetch 배치 크기 (기본: 10) */
  natsBatchSize?: number;
  /** NATS Fetch 타임아웃 (밀리초, 기본: 5000) */
  natsFetchTimeout?: number;

  // 큐 설정
  /** 최대 큐 크기 (기본: 1000) */
  maxQueueSize: number;
  /** 완료된 메시지 보관 기간 (일, 기본: 7) */
  retentionDays: number;

  // 처리 설정
  /** 자동 처리 활성화 (기본: true) */
  autoProcess: boolean;
  /** 재시도 횟수 (기본: 3) */
  retryAttempts: number;
  /** 재시도 대기 시간 (밀리초, 기본: 5000ms) */
  retryDelay: number;

  // AI Agent 설정
  /** AI 처리 사용 여부 (기본: false) */
  useAIProcessing: boolean;
  /** AI 요약 프롬프트 템플릿 (선택사항, 기본 템플릿 사용) */
  aiPromptTemplate?: string;
  /** AI Agent Thinking Mode */
  thinkingMode: 'instant' | 'sequential';

  // 알림 설정
  /** 알림 표시 여부 (기본: true) */
  showNotification: boolean;
  /** @deprecated 알림 타입은 전역 설정(AppConfig.notification.type)에서 관리 */
  notificationType?: 'os' | 'application';
}

/**
 * 큐 상태 정보
 */
export interface MessageQueueStatus {
  /** 대기 중인 메시지 수 */
  pending: number;
  /** 처리 중인 메시지 수 */
  processing: number;
  /** 완료된 메시지 수 */
  completed: number;
  /** 실패한 메시지 수 */
  failed: number;
  /** 총 처리된 메시지 수 (completed + failed) */
  totalProcessed: number;
  /** 마지막 polling 시간 (Unix timestamp, ms) */
  lastPolled?: number;
  /** 마지막 처리 시간 (Unix timestamp, ms) */
  lastProcessed?: number;
}

/**
 * API 응답 표준 형식
 */
export interface MessageAPIResponse {
  /** 메시지 배열 */
  messages: ExternalMessage[];
  /** 더 많은 메시지가 있는지 여부 */
  hasMore: boolean;
  /** 다음 페이지 커서 (페이지네이션용, 선택사항) */
  nextCursor?: string;
}

/**
 * 구독 서비스 상태
 */
export interface SubscriptionStatus {
  /** 연결 상태 */
  isConnected: boolean;
  /** 마지막 polling 시간 */
  lastPolled?: number;
  /** 마지막 에러 메시지 */
  lastError?: string;
}

/**
 * 기본 설정값
 */
export const DEFAULT_MESSAGE_SUBSCRIPTION_CONFIG: MessageSubscriptionConfig = {
  enabled: false,
  connectionType: 'polling',
  pollingUrl: '',
  pollingInterval: 60000, // 1분
  maxQueueSize: 1000,
  retentionDays: 7,
  autoProcess: true,
  retryAttempts: 3,
  retryDelay: 5000,
  useAIProcessing: false,
  thinkingMode: 'instant',
  showNotification: true,
  // NATS 기본값
  natsStreamName: 'WEBHOOKS',
  natsSubject: 'webhooks.>',
  natsBatchSize: 10,
  natsFetchTimeout: 5000,
};
