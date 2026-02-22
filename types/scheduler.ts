import type { ThinkingMode } from '@/lib/domains/agent/types';

// Re-export ThinkingMode for convenience
export type { ThinkingMode };

/**
 * 스케줄 타입: 프리셋 또는 Cron 표현식
 */
export type ScheduleType = 'preset' | 'cron';

/**
 * 프리셋 스케줄 옵션
 */
export type SchedulePreset =
  | 'every-minute' // 테스트용
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly';

/**
 * 프리셋 스케줄 설정
 */
export interface PresetScheduleConfig {
  type: 'preset';
  preset: SchedulePreset;
  // 프리셋별 추가 설정
  time?: string; // daily, weekly, monthly용 (HH:mm 형식, 예: "09:00")
  dayOfWeek?: number; // weekly용 (0=일요일, 6=토요일)
  dayOfMonth?: number; // monthly용 (1-31)
}

/**
 * Cron 표현식 스케줄 설정
 */
export interface CronScheduleConfig {
  type: 'cron';
  expression: string; // Cron 표현식 (예: "0 9 * * 1-5")
}

export type ScheduleConfig = PresetScheduleConfig | CronScheduleConfig;

/**
 * 결과 처리 방식
 */
export type ResultHandlerType = 'conversation' | 'notification' | 'file';

/**
 * 새 대화 생성 핸들러
 */
export interface ConversationResultHandler {
  type: 'conversation';
  enabled: boolean;
}

/**
 * 알림 전송 핸들러
 */
export interface NotificationResultHandler {
  type: 'notification';
  enabled: boolean;
  title?: string; // 커스텀 알림 제목 (비어있으면 기본값 사용)
}

/**
 * 파일 저장 핸들러
 */
export interface FileResultHandler {
  type: 'file';
  enabled: boolean;
  directory: string; // 저장 디렉토리 (기본: userData/scheduler_results)
  filename?: string; // 파일명 템플릿 (예: "result_{timestamp}.md")
  format: 'txt' | 'md'; // 파일 형식
}

export type ResultHandler =
  | ConversationResultHandler
  | NotificationResultHandler
  | FileResultHandler;

/**
 * 스케줄 작업 정의
 */
export interface ScheduledTask {
  id: string;
  name: string; // 작업 이름
  description?: string; // 작업 설명
  enabled: boolean; // 활성화 여부

  // 스케줄 설정
  schedule: ScheduleConfig;

  // Agent 실행 설정
  prompt: string; // Agent에게 전달할 프롬프트
  thinkingMode: ThinkingMode;
  enableRAG: boolean;
  enableTools: boolean;
  allowedTools: string[]; // 허용할 Tool 목록 (빈 배열이면 모든 Tool 차단)

  // 결과 처리
  resultHandlers: ResultHandler[]; // 여러 핸들러 동시 사용 가능

  // 메타데이터
  created_at: number;
  updated_at: number;
  lastExecutedAt?: number; // 마지막 실행 시각
  nextExecutionAt?: number; // 다음 예정 실행 시각 (계산됨)
}

/**
 * 실행 상태
 */
export type ExecutionStatus = 'success' | 'error' | 'cancelled' | 'running';

export type ExecutionTrigger = 'manual' | 'schedule' | 'catch-up';

export interface ExecutionHistoryQuery {
  status?: ExecutionStatus;
  trigger?: ExecutionTrigger;
  startedAfter?: number;
  startedBefore?: number;
  limit?: number;
}

/**
 * 실행 기록
 */
export interface ExecutionRecord {
  id: string;
  taskId: string;
  taskName: string; // 작업 이름 (삭제된 작업 대비)
  status: ExecutionStatus;
  startedAt: number;
  trigger?: ExecutionTrigger;
  attemptCount?: number;
  completedAt?: number;
  duration?: number; // 실행 시간 (ms)

  // 실행 결과
  resultSummary?: string; // Agent 응답의 요약
  errorMessage?: string; // 에러 발생 시 메시지

  // 결과 처리 정보
  conversationId?: string; // 생성된 대화 ID
  savedFilePath?: string; // 저장된 파일 경로
  notificationSent?: boolean; // 알림 전송 여부

  // 실행 컨텍스트
  toolsExecuted?: string[]; // 실행된 Tool 목록
  toolsBlocked?: string[]; // 차단된 Tool 목록
}
