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
  activate?: () => void | Promise<void>;

  /** Extension 비활성화 시 호출되는 함수 */
  deactivate?: () => void | Promise<void>;
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
