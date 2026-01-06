/**
 * Extension System Types
 *
 * SEPilot Desktop의 확장 기능 시스템을 위한 타입 정의
 */

import type { ComponentType } from 'react';

/**
 * Extension Manifest
 * 모든 extension이 반드시 제공해야 하는 메타데이터
 */
export interface ExtensionManifest {
  /** 확장 기능 고유 식별자 (예: 'presentation', 'diagram', 'mindmap') */
  id: string;
  /** 표시 이름 */
  name: string;
  /** 설명 */
  description: string;
  /** 버전 (semver) */
  version: string;
  /** 작성자 */
  author: string;
  /** 아이콘 (lucide-react 아이콘 이름) */
  icon: string;
  /** 이 extension이 활성화할 앱 모드 */
  mode: string;
  /** 사이드바에 표시할지 여부 */
  showInSidebar: boolean;
  /** 의존하는 다른 extension ID 목록 */
  dependencies?: string[];
  /** 설정 스키마 (옵션) */
  settingsSchema?: Record<string, unknown>;
  /** extension이 활성화되어 있는지 여부 */
  enabled?: boolean;
  /** 모드 선택 드롭다운에서의 표시 순서 (낮을수록 위) */
  order?: number;
  /** 베타 기능 플래그 키 (예: 'enablePresentationMode') */
  betaFlag?: string;
  /** IPC 채널 등록 정보 (Main Process에서 사용) */
  ipcChannels?: {
    /** Extension이 등록할 IPC handler 채널 목록 */
    handlers: string[];
  };
  /** Settings 탭 표시 정보 (Settings Dialog에 표시할 경우) */
  settingsTab?: {
    /** Settings 탭 ID (SettingSection에 추가될 값) */
    id: string;
    /** Settings 탭 레이블 (다국어 키 또는 직접 텍스트) */
    label: string;
    /** Settings 탭 설명 */
    description: string;
    /** Settings 탭 아이콘 (lucide-react 아이콘 이름) */
    icon: string;
  };
}

/**
 * Extension Definition
 * Extension의 실제 구현체를 포함하는 인터페이스
 */
export interface ExtensionDefinition {
  /** Extension 메타데이터 */
  manifest: ExtensionManifest;

  /** 메인 컴포넌트 (Studio/Workspace) */
  MainComponent?: ComponentType;

  /** 사이드바 컴포넌트 */
  SidebarComponent?: ComponentType;

  /** 사이드바 헤더 액션 버튼 (Plus 버튼 등) */
  HeaderActionsComponent?: ComponentType<any>;

  /** 설정 페이지 컴포넌트 (Beta Settings에 표시될 설정 UI) */
  SettingsComponent?: ComponentType<{
    enabled: boolean;
    onEnabledChange: (enabled: boolean) => void;
  }>;

  /** Settings 탭 컴포넌트 (Settings Dialog에 표시될 전체 설정 탭) */
  SettingsTabComponent?: ComponentType<{
    onSave: () => void;
    isSaving: boolean;
    message: { type: 'success' | 'error'; text: string } | null;
  }>;

  /** Store slice 생성 함수 */
  createStoreSlice?: (set: any, get: any) => any;

  /** IPC Handler 등록 함수 (Main Process에서 실행) */
  setupIpcHandlers?: () => void;

  /** 세션 초기화 함수 (새 세션 시작 시 호출) */
  clearSession?: () => void;

  /** Extension 활성화 시 호출되는 함수 */
  activate?: (context?: ExtensionContext) => void | Promise<void>;

  /** Extension 비활성화 시 호출되는 함수 */
  deactivate?: (context?: ExtensionContext) => void | Promise<void>;
}

/**
 * Extension Registry Entry
 */
export interface ExtensionRegistryEntry {
  /** Extension 정의 */
  definition: ExtensionDefinition;
  /** 로드 시간 */
  loadedAt: number;
  /** 활성화 여부 */
  isActive: boolean;
}

/**
 * Extension Context API
 *
 * Extension이 앱 상태와 상호작용할 수 있는 안전한 API를 제공합니다.
 * chat-store를 직접 import하지 않고도 필요한 기능에 접근할 수 있습니다.
 *
 * @example
 * ```typescript
 * // Extension activate 함수에서 context 사용
 * export async function activate(context: ExtensionContext) {
 *   const mode = context.getAppMode();
 *   context.on('app:mode-changed', (newMode) => {
 *     console.log('Mode changed to:', newMode);
 *   });
 * }
 * ```
 */
export interface ExtensionContext {
  /** Extension ID */
  readonly extensionId: string;

  // ==================== 앱 상태 조회 (읽기 전용) ====================

  /** 현재 앱 모드 조회 */
  getAppMode: () => string;

  /** 현재 활성 세션 ID 조회 */
  getActiveSessionId: () => string | null;

  /** 특정 세션 조회 */
  getSession: (sessionId: string) => any | null;

  // ==================== Extension 상태 관리 ====================

  /** Extension 전용 스토리지에 데이터 저장 */
  setState: <T = any>(key: string, value: T) => void;

  /** Extension 전용 스토리지에서 데이터 조회 */
  getState: <T = any>(key: string) => T | undefined;

  /** Extension 전용 스토리지에서 데이터 삭제 */
  removeState: (key: string) => void;

  // ==================== 이벤트 시스템 ====================

  /** 이벤트 구독 */
  on: <T = any>(event: ExtensionEventType, handler: (data: T) => void) => () => void;

  /** 이벤트 발행 (다른 Extension에게 전달) */
  emit: <T = any>(event: ExtensionEventType, data: T) => void;

  // ==================== 로깅 ====================

  /** Extension 전용 로거 */
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, meta?: Record<string, unknown>) => void;
    debug: (message: string, meta?: Record<string, unknown>) => void;
  };
}

/**
 * Extension Event Type
 *
 * Extension 간 통신을 위한 이벤트 타입 정의
 */
export type ExtensionEventType =
  // 앱 상태 변경 이벤트
  | 'app:mode-changed'
  | 'app:session-created'
  | 'app:session-deleted'
  | 'app:session-switched'
  // Extension 생명주기 이벤트
  | 'extension:activated'
  | 'extension:deactivated'
  // 사용자 정의 이벤트 (extension-id:event-name 형식)
  | `${string}:${string}`;

/**
 * Extension Event Payload
 */
export interface ExtensionEvent<T = any> {
  /** 이벤트 타입 */
  type: ExtensionEventType;
  /** 이벤트를 발행한 Extension ID */
  source: string;
  /** 이벤트 데이터 */
  data: T;
  /** 이벤트 발생 시간 */
  timestamp: number;
}
