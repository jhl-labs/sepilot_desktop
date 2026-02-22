/**
 * Message 관련 타입 정의
 *
 * Extension에서 사용하는 메시지, 도구 호출, 이미지 첨부 등 공유 타입
 */

export interface ReferencedDocument {
  id: string;
  title: string;
  source: string;
  content: string;
}

export interface ImageAttachment {
  id: string;
  path?: string;
  filename: string;
  mimeType: string;
  base64?: string;
  provider?: 'comfyui' | 'nanobanana';
}

export interface FileChange {
  filePath: string;
  changeType: 'created' | 'modified' | 'deleted';
  oldContent?: string;
  newContent?: string;
  toolName: string;
}

export interface Message {
  id: string;
  conversation_id?: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  created_at: number;
  images?: ImageAttachment[];
  tool_calls?: ToolCall[];
  tool_results?: unknown[];
  referenced_documents?: ReferencedDocument[];
  tool_call_id?: string;
  name?: string;
  fileChanges?: FileChange[];
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}
