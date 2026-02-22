/**
 * 애플리케이션 전역 상수
 *
 * 매직 넘버와 매직 스트링을 제거하고 의미있는 이름으로 관리
 */

// ========================================
// LLM 기본 설정
// ========================================

export const LLM_DEFAULTS = {
  TEMPERATURE: 0.7,
  MAX_TOKENS: 2000,
  TOP_P: 1.0,
  FREQUENCY_PENALTY: 0,
  PRESENCE_PENALTY: 0,
} as const;

// ========================================
// 스트리밍 관련 상수
// ========================================

export const STREAMING = {
  SSE_DONE_MESSAGE: 'data: [DONE]',
  SSE_DATA_PREFIX: 'data: ',
  CHUNK_DELIMITER: '\n\n',
  UPDATE_DEBOUNCE_MS: 16, // 60fps (1000ms / 60 ≈ 16ms)
} as const;

// ========================================
// 윈도우 기본 설정
// ========================================

export const WINDOW_DEFAULTS = {
  WIDTH: 1200,
  HEIGHT: 800,
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,
} as const;

// ========================================
// CSP (Content Security Policy)
// ========================================

export const CSP_POLICIES = {
  DEVELOPMENT: [
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:*",
    'http://localhost:* ws://localhost:*',
    'https://api.openai.com',
    'https://api.anthropic.com',
    'https://*.githubusercontent.com',
    'https://github.com',
    'data: blob:',
  ].join(' '),

  PRODUCTION: [
    "default-src 'self' data: blob:",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    'connect-src https://api.openai.com https://api.anthropic.com https://*.googleapis.com https://github.com https://*.githubusercontent.com',
    'frame-src https://github.com',
  ].join('; '),
} as const;

// ========================================
// 벡터 DB 기본 설정
// ========================================

export const VECTOR_DB_DEFAULTS = {
  EMBEDDING_DIMENSION: 1536, // OpenAI text-embedding-3-small
  DEFAULT_INDEX_NAME: 'default',
  DEFAULT_TOP_K: 5,
  CHUNK_SIZE: 1000,
  CHUNK_OVERLAP: 200,
} as const;

// ========================================
// 네트워크 설정
// ========================================

export const NETWORK = {
  DEFAULT_TIMEOUT_MS: 30000, // 30초
  LONG_TIMEOUT_MS: 120000, // 2분 (스트리밍용)
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
} as const;

// ========================================
// ID 생성 접두사
// ========================================

export const ID_PREFIXES = {
  CONVERSATION: 'conv',
  MESSAGE: 'msg',
  TOOL_CALL: 'tc',
  IMAGE: 'img',
  CLIPBOARD: 'clipboard',
  FILE: 'file',
} as const;

// ========================================
// 로컬 스토리지 키
// ========================================

export const STORAGE_KEYS = {
  ACTIVE_CONVERSATION_ID: 'activeConversationId',
  GRAPH_TYPE: 'graphType',
  THEME: 'theme',
  CONFIG: 'config',
  AUTH_TOKEN: 'authToken',
  CODE_VERIFIER: 'codeVerifier',
} as const;

// ========================================
// IPC 채널 이름
// ========================================

export const IPC_CHANNELS = {
  // Chat
  CHAT_SAVE_CONVERSATION: 'chat-save-conversation',
  CHAT_LOAD_CONVERSATIONS: 'chat-load-conversations',
  CHAT_DELETE_CONVERSATION: 'chat-delete-conversation',
  CHAT_UPDATE_TITLE: 'chat-update-conversation-title',
  CHAT_SAVE_MESSAGE: 'chat-save-message',
  CHAT_LOAD_MESSAGES: 'chat-load-messages',
  CHAT_DELETE_MESSAGE: 'chat-delete-message',

  // Config
  CONFIG_LOAD: 'config-load',
  CONFIG_SAVE: 'config-save',
  CONFIG_UPDATE_SETTING: 'config-update-setting',
  CONFIG_GET_SETTING: 'config-get-setting',

  // LLM
  LLM_STREAM_CHAT: 'llm-stream-chat',
  LLM_CHAT: 'llm-chat',
  LLM_INIT: 'llm-init',
  LLM_VALIDATE: 'llm-validate',
  LLM_FETCH_MODELS: 'llm-fetch-models',
  LLM_STREAM_CHUNK: 'llm-stream-chunk',
  LLM_STREAM_DONE: 'llm-stream-done',
  LLM_STREAM_ERROR: 'llm-stream-error',

  // MCP
  MCP_ADD_SERVER: 'mcp-add-server',
  MCP_REMOVE_SERVER: 'mcp-remove-server',
  MCP_LIST_SERVERS: 'mcp-list-servers',
  MCP_GET_ALL_TOOLS: 'mcp-get-all-tools',
  MCP_CALL_TOOL: 'mcp-call-tool',
  MCP_TOGGLE_SERVER: 'mcp-toggle-server',

  // GitHub
  GITHUB_SET_PRIVATE_KEY: 'github-set-private-key',
  GITHUB_HAS_PRIVATE_KEY: 'github-has-private-key',
  GITHUB_GET_REPOSITORIES: 'github-get-repositories',
  GITHUB_SYNC_FROM: 'github-sync-from-github',
  GITHUB_SYNC_TO: 'github-sync-to-github',

  // File
  FILE_SELECT_IMAGES: 'file-select-images',
  FILE_LOAD_IMAGE: 'file-load-image',

  // Shell
  SHELL_OPEN_EXTERNAL: 'shell-open-external',

  // VectorDB
  VECTORDB_INITIALIZE: 'vectordb-initialize',
  VECTORDB_CREATE_INDEX: 'vectordb-create-index',
  VECTORDB_DELETE_INDEX: 'vectordb-delete-index',
  VECTORDB_INDEX_EXISTS: 'vectordb-index-exists',
  VECTORDB_INSERT: 'vectordb-insert',
  VECTORDB_SEARCH: 'vectordb-search',
  VECTORDB_DELETE: 'vectordb-delete',
  VECTORDB_COUNT: 'vectordb-count',
  VECTORDB_GET_ALL: 'vectordb-get-all',

  // Embeddings
  EMBEDDINGS_GENERATE: 'embeddings-generate',
  EMBEDDINGS_GENERATE_BATCH: 'embeddings-generate-batch',
  EMBEDDINGS_VALIDATE: 'embeddings-validate',

  // ComfyUI
  COMFYUI_TEST_CONNECTION: 'comfyui-test-connection',
  COMFYUI_QUEUE_PROMPT: 'comfyui-queue-prompt',
  COMFYUI_FETCH_IMAGE: 'comfyui-fetch-image',
  NANOBANANA_TEST_CONNECTION: 'nanobanana-test-connection',
} as const;

// ========================================
// 에러 메시지
// ========================================

export const ERROR_MESSAGES = {
  INVALID_API_KEY: 'API 키가 유효하지 않습니다.',
  NETWORK_ERROR: '네트워크 오류가 발생했습니다.',
  SERVER_ERROR: '서버 오류가 발생했습니다.',
  TIMEOUT_ERROR: '요청 시간이 초과되었습니다.',
  UNKNOWN_ERROR: '알 수 없는 오류가 발생했습니다.',
  CONVERSATION_NOT_FOUND: '대화를 찾을 수 없습니다.',
  MESSAGE_NOT_FOUND: '메시지를 찾을 수 없습니다.',
  INVALID_INPUT: '입력값이 올바르지 않습니다.',
  PERMISSION_DENIED: '권한이 없습니다.',
} as const;

// ========================================
// 정규식 패턴
// ========================================

export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  GITHUB_REPO: /^[\w-]+\/[\w-]+$/, // owner/repo
  URL: /^https?:\/\/.+/,
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

// ========================================
// 파일 확장자 및 MIME 타입
// ========================================

export const FILE_TYPES = {
  IMAGES: {
    EXTENSIONS: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    MIME_TYPES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
  },
  DOCUMENTS: {
    EXTENSIONS: ['.pdf', '.doc', '.docx', '.txt', '.md'],
    MIME_TYPES: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
    ],
  },
} as const;

// ========================================
// 기본 모델 목록
// ========================================

export const DEFAULT_MODELS = {
  OPENAI: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'],
  ANTHROPIC: [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
  ],
  EMBEDDINGS: ['text-embedding-3-small', 'text-embedding-3-large', 'text-embedding-ada-002'],
} as const;

// ========================================
// 키보드 단축키
// ========================================

export const KEYBOARD_SHORTCUTS = {
  NEW_CHAT: 'mod+n', // Cmd/Ctrl + N
  SETTINGS: 'mod+,', // Cmd/Ctrl + ,
  COPY_CODE: 'mod+shift+c', // Cmd/Ctrl + Shift + C
  SEARCH: 'mod+f', // Cmd/Ctrl + F
  TOGGLE_SIDEBAR: 'mod+b', // Cmd/Ctrl + B
} as const;
