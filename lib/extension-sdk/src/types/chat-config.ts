/**
 * Chat 설정 타입
 *
 * Extension에서 Chat 컴포넌트를 구성할 때 사용하는 타입 정의
 */

import type { Message, ImageAttachment } from './message';
import type { ThinkingMode } from './graph';

/**
 * Chat 모드
 */
export type ChatMode = 'main' | 'browser' | 'editor' | 'terminal';

/**
 * Chat 기능 플래그
 */
export interface ChatFeatures {
  enableEdit?: boolean;
  enableRegenerate?: boolean;
  enableCopy?: boolean;
  enableImageUpload?: boolean;
  enableFileUpload?: boolean;
  enableToolApproval?: boolean;
  enableFontScale?: boolean;
  enablePersona?: boolean;
  enableAgentLogs?: boolean;
  enableAgentProgress?: boolean;
  enableThinkingModeSelector?: boolean;
  enableRAGToggle?: boolean;
  enableToolsToggle?: boolean;
  enableImageGeneration?: boolean;
}

/**
 * Chat 스타일 설정
 */
export interface ChatStyle {
  compact?: boolean;
  fontSize?: string;
  maxWidth?: string;
  showAvatar?: boolean;
  theme?: 'default' | 'minimal' | 'comfortable';
}

/**
 * Chat 데이터 소스
 */
export interface ChatDataSource {
  messages: Message[];
  streamingState: string | null;
  agentLogs?: any[];
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
  workingDirectory?: string;
  conversationId?: string;
  systemMessage?: string;
  activePersona?: any | null;
  thinkingMode?: ThinkingMode;
  enableRAG?: boolean;
  enableTools?: boolean;
  enableImageGeneration?: boolean;
  onSend?: (message: string, images?: ImageAttachment[]) => Promise<void>;
  onStop?: () => void;
  onThinkingModeChange?: (mode: ThinkingMode) => void;
  onRAGToggle?: (enabled: boolean) => void;
  onToolsToggle?: (enabled: boolean) => void;
  onImageGenerationToggle?: (enabled: boolean) => void;
  onCodeRun?: (code: string, language: string) => Promise<void>;
}
