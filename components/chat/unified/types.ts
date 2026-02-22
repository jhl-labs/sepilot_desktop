/**
 * Unified Chat Component Types
 *
 * 통합 Chat 컴포넌트의 공통 타입 정의
 * Main Chat, Browser Chat, Editor Chat 모두에서 사용
 */

import type { Message, ImageAttachment } from '@/types';
import type { Persona } from '@/types/persona';
import type { ThinkingMode } from '@/lib/domains/agent';
import type { BrowserAgentLogEntry } from '@sepilot/extension-browser';

/**
 * Chat 모드
 */
export type ChatMode = 'main' | 'browser' | 'editor' | 'terminal';

/**
 * Chat 기능 플래그
 * 각 모드별로 필요한 기능을 선택적으로 활성화
 */
export interface ChatFeatures {
  // 메시지 기능
  enableEdit?: boolean; // 메시지 수정
  enableRegenerate?: boolean; // 응답 재생성
  enableCopy?: boolean; // 메시지 복사

  // 입력 기능
  enableImageUpload?: boolean; // 이미지 첨부
  enableFileUpload?: boolean; // 파일 업로드
  enableToolApproval?: boolean; // Tool approval (Human-in-the-loop)

  // UI 기능
  enableFontScale?: boolean; // 폰트 크기 조절
  enablePersona?: boolean; // Persona 표시/선택
  enableAgentLogs?: boolean; // Agent 실행 로그
  enableAgentProgress?: boolean; // Agent 진행 상태

  // 고급 기능
  enableThinkingModeSelector?: boolean; // Thinking mode 선택
  enableRAGToggle?: boolean; // RAG on/off
  enableToolsToggle?: boolean; // Tools on/off
  enableImageGeneration?: boolean; // 이미지 생성
}

/**
 * Chat 스타일 설정
 */
export interface ChatStyle {
  compact?: boolean; // Compact mode (smaller fonts, padding)
  fontSize?: string; // Base font size (e.g., '14px', '12px')
  maxWidth?: string; // Max content width (e.g., '4xl', '2xl')
  showAvatar?: boolean; // Show user/assistant avatars
  theme?: 'default' | 'minimal' | 'comfortable';
}

/**
 * Chat 데이터 소스
 * Store와의 연결을 추상화
 */
export interface ChatDataSource {
  // 데이터
  messages: Message[];
  streamingState: string | null; // streaming messageId or null
  agentLogs?: BrowserAgentLogEntry[]; // Browser Agent logs (optional)

  // 액션
  addMessage: (message: Omit<Message, 'id' | 'created_at'>) => Promise<Message>;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  startStreaming: (messageId: string) => void;
  stopStreaming: () => void;
}

/**
 * Chat 설정
 */
export interface ChatConfig {
  mode: ChatMode;
  features: ChatFeatures;
  style?: ChatStyle;
  dataSource: ChatDataSource;

  // 모드별 설정
  workingDirectory?: string; // Coding/Editor agent용
  conversationId?: string; // Main chat용 (필수)
  systemMessage?: string; // Custom system message

  // Persona (Main chat용)
  activePersona?: Persona | null;

  // Thinking mode & toggles (Main chat용)
  thinkingMode?: ThinkingMode;
  enableRAG?: boolean;
  enableTools?: boolean;
  enableImageGeneration?: boolean;

  // Callbacks
  onSend?: (message: string, images?: ImageAttachment[]) => Promise<void>;
  onStop?: () => void;
  onThinkingModeChange?: (mode: ThinkingMode) => void;
  onRAGToggle?: (enabled: boolean) => void;
  onToolsToggle?: (enabled: boolean) => void;
  onImageGenerationToggle?: (enabled: boolean) => void;
  onCodeRun?: (code: string, language: string) => Promise<void>;
}

/**
 * Plugin Props
 * 모든 플러그인이 받는 공통 props
 */
export interface PluginProps {
  mode: ChatMode;
  config: ChatConfig;
}

export interface TextFileAttachment {
  id: string;
  filename: string;
  content: string; // The text content of the file
  size: number;
}
