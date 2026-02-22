/**
 * IPC Channel Type Definitions
 *
 * 타입 안전한 IPC 통신을 위한 채널별 Request/Response 타입 정의
 */

import type { Message, AppConfig } from './index';
import type { ExtensionManifest } from '@sepilot/extension-sdk/types';

/**
 * IPC 채널 타입 맵
 *
 * 각 채널의 Request와 Response 타입을 정의합니다.
 * 사용 예:
 * ```typescript
 * const result = await invoke<'llm-chat'>('llm-chat', messages, options);
 * // result는 자동으로 LLMChatResponse 타입으로 추론됨
 * ```
 */
export interface IPCChannelMap {
  // ==================== LLM ====================
  'llm-chat': {
    request: [messages: Message[], options?: any];
    response: { content: string; usage?: any };
  };

  'llm-stream-chat': {
    request: [messages: Message[], options?: any];
    response: { conversationId: string };
  };

  'llm-init': {
    request: [config: AppConfig];
    response: { success: boolean };
  };

  'llm-validate': {
    request: [];
    response: { valid: boolean; provider: string };
  };

  'llm-abort': {
    request: [conversationId: string];
    response: { success: boolean };
  };

  'llm-clear-context': {
    request: [conversationId: string];
    response: { success: boolean };
  };

  // ==================== LangGraph ====================
  'langgraph-stream': {
    request: [graphConfig: any, messages: Message[], conversationId: string, checkpointId?: string];
    response: { success: boolean };
  };

  'langgraph-abort': {
    request: [conversationId: string];
    response: { success: boolean };
  };

  'langgraph-tool-approval-response': {
    request: [conversationId: string, approved: boolean];
    response: void;
  };

  'langgraph-list-graphs': {
    request: [];
    response: { graphs: string[] };
  };

  // ==================== Chat ====================
  'chat-save': {
    request: [conversationId: string, title: string, messages: Message[], metadata?: any];
    response: { success: boolean };
  };

  'chat-load': {
    request: [conversationId: string];
    response: {
      conversationId: string;
      title: string;
      messages: Message[];
      metadata?: any;
    } | null;
  };

  'chat-delete': {
    request: [conversationId: string];
    response: { success: boolean };
  };

  'chat-list': {
    request: [limit?: number, offset?: number];
    response: {
      conversations: Array<{
        conversationId: string;
        title: string;
        createdAt: number;
        updatedAt: number;
      }>;
    };
  };

  'chat-search': {
    request: [query: string, limit?: number];
    response: {
      results: Array<{
        conversationId: string;
        title: string;
        snippet: string;
        score: number;
      }>;
    };
  };

  // ==================== File ====================
  'file:read': {
    request: [filePath: string];
    response: { content: string };
  };

  'file:write': {
    request: [filePath: string, content: string];
    response: { success: boolean };
  };

  'file:delete': {
    request: [filePath: string];
    response: { success: boolean };
  };

  'file:exists': {
    request: [filePath: string];
    response: { exists: boolean };
  };

  'file:list': {
    request: [dirPath: string];
    response: { files: string[] };
  };

  'file:select-directory': {
    request: [];
    response: { path: string | null };
  };

  'file:select-file': {
    request: [options?: { filters?: any[]; multi?: boolean }];
    response: { paths: string[] | null };
  };

  'file:load-image': {
    request: [filePath: string];
    response: { dataUrl: string };
  };

  // ==================== Extension ====================
  'extension:discover': {
    request: [];
    response: { extensions: ExtensionManifest[] };
  };

  'extension:install': {
    request: [extensionId: string];
    response: { success: boolean };
  };

  'extension:install-from-file': {
    request: [filePath: string];
    response: { success: boolean; extensionId: string };
  };

  'extension:uninstall': {
    request: [extensionId: string];
    response: { success: boolean };
  };

  'extension:list-renderer-extensions': {
    request: [];
    response: { extensions: ExtensionManifest[] };
  };

  'extension:check-updates': {
    request: [];
    response: { updates: Array<{ id: string; version: string }> };
  };

  // ==================== MCP ====================
  'mcp-add-server': {
    request: [name: string, config: any];
    response: { success: boolean };
  };

  'mcp-remove-server': {
    request: [name: string];
    response: { success: boolean };
  };

  'mcp-list-servers': {
    request: [];
    response: { servers: Array<{ name: string; status: string }> };
  };

  'mcp-get-all-tools': {
    request: [];
    response: { tools: any[] };
  };

  'mcp-call-tool': {
    request: [serverName: string, toolName: string, args: any];
    response: { result: any };
  };

  // ==================== VectorDB ====================
  'vectordb-search': {
    request: [query: string, options?: any];
    response: { results: any[] };
  };

  'vectordb-insert': {
    request: [documents: any[]];
    response: { success: boolean };
  };

  'vectordb-delete': {
    request: [ids: string[]];
    response: { success: boolean };
  };

  'vectordb-index-documents': {
    request: [documents: any[], collectionName?: string];
    response: { success: boolean; count: number };
  };

  // ==================== Config ====================
  'config:get': {
    request: [key: string];
    response: { value: any };
  };

  'config:set': {
    request: [key: string, value: any];
    response: { success: boolean };
  };

  'config:delete': {
    request: [key: string];
    response: { success: boolean };
  };

  'config:get-all': {
    request: [];
    response: { config: Record<string, any> };
  };

  // ==================== Auth ====================
  'auth-initiate-login': {
    request: [];
    response: { authUrl: string };
  };

  'auth-exchange-code': {
    request: [code: string];
    response: { token: string };
  };

  'auth-get-token': {
    request: [];
    response: { token: string | null };
  };

  'auth-get-user-info': {
    request: [];
    response: { user: any | null };
  };

  'auth-logout': {
    request: [];
    response: { success: boolean };
  };

  // ==================== Terminal ====================
  'terminal:create-session': {
    request: [shell?: string, cols?: number, rows?: number];
    response: { sessionId: string; shell: string; cwd: string };
  };

  'terminal:write': {
    request: [sessionId: string, data: string];
    response: { success: boolean };
  };

  'terminal:resize': {
    request: [sessionId: string, cols: number, rows: number];
    response: { success: boolean };
  };

  'terminal:destroy': {
    request: [sessionId: string];
    response: { success: boolean };
  };

  'terminal:execute-command': {
    request: [sessionId: string, command: string];
    response: { success: boolean };
  };

  'terminal:get-history': {
    request: [sessionId: string];
    response: {
      success: boolean;
      data: Array<{ command: string; timestamp: number; exitCode: number }>;
    };
  };

  // ==================== Browser ====================
  'browser-view:create-tab': {
    request: [url?: string];
    response: { tabId: string };
  };

  'browser-view:load-url': {
    request: [tabId: string, url: string];
    response: { success: boolean };
  };

  'browser-view:close-tab': {
    request: [tabId: string];
    response: { success: boolean };
  };

  'browser-view:switch-tab': {
    request: [tabId: string];
    response: { success: boolean };
  };

  'browser-view:get-tabs': {
    request: [];
    response: { tabs: any[] };
  };

  'browser-view:reload': {
    request: [tabId: string];
    response: { success: boolean };
  };

  'browser-view:go-back': {
    request: [tabId: string];
    response: { success: boolean };
  };

  'browser-view:go-forward': {
    request: [tabId: string];
    response: { success: boolean };
  };

  // ==================== Notification ====================
  'notification:show': {
    request: [
      options: {
        conversationId: string;
        title: string;
        body: string;
        html?: string;
        imageUrl?: string;
        type?: 'os' | 'application';
      },
    ];
    response: { success: boolean; error?: string; type?: 'os' | 'application' };
  };

  'notification:close': {
    request: [];
    response: { success: boolean };
  };

  'notification:click': {
    request: [conversationId: string];
    response: { success: boolean };
  };

  'notification:ready': {
    request: [];
    response: { success: boolean };
  };

  // ==================== Update ====================
  'update:check': {
    request: [];
    response: { available: boolean; version?: string };
  };

  'update:download': {
    request: [];
    response: { success: boolean };
  };

  'update:install': {
    request: [];
    response: { success: boolean };
  };

  // ==================== Skills ====================
  'skills:list': {
    request: [];
    response: { skills: any[] };
  };

  'skills:get': {
    request: [skillId: string];
    response: { skill: any };
  };

  'skills:execute': {
    request: [skillId: string, args: any];
    response: { result: any };
  };
}

/**
 * IPC 채널 이름 타입
 */
export type IPCChannel = keyof IPCChannelMap;

/**
 * 특정 채널의 Request 타입 추출
 */
export type IPCRequest<T extends IPCChannel> = IPCChannelMap[T]['request'];

/**
 * 특정 채널의 Response 타입 추출
 */
export type IPCResponse<T extends IPCChannel> = IPCChannelMap[T]['response'];

/**
 * 타입 안전한 IPC invoke 시그니처
 */
export type TypedInvoke = <T extends IPCChannel>(
  channel: T,
  ...args: IPCRequest<T>
) => Promise<IPCResponse<T>>;

/**
 * 타입 안전한 IPC handle 시그니처
 */
export type TypedHandle = <T extends IPCChannel>(
  channel: T,
  handler: (
    event: import('electron').IpcMainInvokeEvent,
    ...args: IPCRequest<T>
  ) => Promise<IPCResponse<T>> | IPCResponse<T>
) => void;
