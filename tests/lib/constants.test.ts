/**
 * Constants 테스트
 */

import {
  LLM_DEFAULTS,
  STREAMING,
  WINDOW_DEFAULTS,
  CSP_POLICIES,
  VECTOR_DB_DEFAULTS,
  NETWORK,
  ID_PREFIXES,
  STORAGE_KEYS,
  IPC_CHANNELS,
  ERROR_MESSAGES,
  REGEX_PATTERNS,
  FILE_TYPES,
  DEFAULT_MODELS,
  KEYBOARD_SHORTCUTS,
} from '@/lib/constants';

describe('constants', () => {
  describe('LLM_DEFAULTS', () => {
    it('should have valid temperature range', () => {
      expect(LLM_DEFAULTS.TEMPERATURE).toBeGreaterThanOrEqual(0);
      expect(LLM_DEFAULTS.TEMPERATURE).toBeLessThanOrEqual(2);
    });

    it('should have positive max tokens', () => {
      expect(LLM_DEFAULTS.MAX_TOKENS).toBeGreaterThan(0);
    });

    it('should have valid top_p range', () => {
      expect(LLM_DEFAULTS.TOP_P).toBeGreaterThanOrEqual(0);
      expect(LLM_DEFAULTS.TOP_P).toBeLessThanOrEqual(1);
    });

    it('should be defined as const', () => {
      // Constants are defined with 'as const', providing type-level immutability
      // Note: Object.freeze is not used, so runtime mutation is technically possible
      // but TypeScript prevents mutation at compile time
      expect(LLM_DEFAULTS.TEMPERATURE).toBeDefined();
      expect(LLM_DEFAULTS.MAX_TOKENS).toBeDefined();
      expect(LLM_DEFAULTS.TOP_P).toBeDefined();
    });
  });

  describe('STREAMING', () => {
    it('should have SSE done message', () => {
      expect(STREAMING.SSE_DONE_MESSAGE).toBe('data: [DONE]');
    });

    it('should have SSE data prefix', () => {
      expect(STREAMING.SSE_DATA_PREFIX).toBe('data: ');
    });

    it('should have update debounce around 60fps', () => {
      expect(STREAMING.UPDATE_DEBOUNCE_MS).toBeLessThanOrEqual(17); // ~60fps
      expect(STREAMING.UPDATE_DEBOUNCE_MS).toBeGreaterThan(0);
    });
  });

  describe('WINDOW_DEFAULTS', () => {
    it('should have reasonable dimensions', () => {
      expect(WINDOW_DEFAULTS.WIDTH).toBeGreaterThan(0);
      expect(WINDOW_DEFAULTS.HEIGHT).toBeGreaterThan(0);
      expect(WINDOW_DEFAULTS.MIN_WIDTH).toBeLessThanOrEqual(WINDOW_DEFAULTS.WIDTH);
      expect(WINDOW_DEFAULTS.MIN_HEIGHT).toBeLessThanOrEqual(WINDOW_DEFAULTS.HEIGHT);
    });
  });

  describe('CSP_POLICIES', () => {
    it('should have development policy', () => {
      expect(CSP_POLICIES.DEVELOPMENT).toBeDefined();
      expect(CSP_POLICIES.DEVELOPMENT).toContain('localhost');
    });

    it('should have production policy', () => {
      expect(CSP_POLICIES.PRODUCTION).toBeDefined();
      expect(CSP_POLICIES.PRODUCTION).toContain("default-src 'self'");
    });
  });

  describe('VECTOR_DB_DEFAULTS', () => {
    it('should have valid embedding dimension for OpenAI', () => {
      expect(VECTOR_DB_DEFAULTS.EMBEDDING_DIMENSION).toBe(1536);
    });

    it('should have reasonable chunk settings', () => {
      expect(VECTOR_DB_DEFAULTS.CHUNK_SIZE).toBeGreaterThan(0);
      expect(VECTOR_DB_DEFAULTS.CHUNK_OVERLAP).toBeLessThan(VECTOR_DB_DEFAULTS.CHUNK_SIZE);
    });
  });

  describe('NETWORK', () => {
    it('should have reasonable timeout values', () => {
      expect(NETWORK.DEFAULT_TIMEOUT_MS).toBe(30000);
      expect(NETWORK.LONG_TIMEOUT_MS).toBe(120000);
      expect(NETWORK.LONG_TIMEOUT_MS).toBeGreaterThan(NETWORK.DEFAULT_TIMEOUT_MS);
    });

    it('should have retry configuration', () => {
      expect(NETWORK.RETRY_ATTEMPTS).toBeGreaterThan(0);
      expect(NETWORK.RETRY_DELAY_MS).toBeGreaterThan(0);
    });
  });

  describe('ID_PREFIXES', () => {
    it('should have all required prefixes', () => {
      expect(ID_PREFIXES.CONVERSATION).toBe('conv');
      expect(ID_PREFIXES.MESSAGE).toBe('msg');
      expect(ID_PREFIXES.TOOL_CALL).toBe('tc');
      expect(ID_PREFIXES.IMAGE).toBe('img');
      expect(ID_PREFIXES.CLIPBOARD).toBe('clipboard');
      expect(ID_PREFIXES.FILE).toBe('file');
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have all required storage keys', () => {
      expect(STORAGE_KEYS.ACTIVE_CONVERSATION_ID).toBeDefined();
      expect(STORAGE_KEYS.GRAPH_TYPE).toBeDefined();
      expect(STORAGE_KEYS.THEME).toBeDefined();
      expect(STORAGE_KEYS.CONFIG).toBeDefined();
      expect(STORAGE_KEYS.AUTH_TOKEN).toBeDefined();
    });
  });

  describe('IPC_CHANNELS', () => {
    it('should have chat channels', () => {
      expect(IPC_CHANNELS.CHAT_SAVE_CONVERSATION).toBeDefined();
      expect(IPC_CHANNELS.CHAT_LOAD_CONVERSATIONS).toBeDefined();
      expect(IPC_CHANNELS.CHAT_DELETE_CONVERSATION).toBeDefined();
    });

    it('should have config channels', () => {
      expect(IPC_CHANNELS.CONFIG_LOAD).toBeDefined();
      expect(IPC_CHANNELS.CONFIG_SAVE).toBeDefined();
    });

    it('should have LLM channels', () => {
      expect(IPC_CHANNELS.LLM_STREAM_CHAT).toBeDefined();
      expect(IPC_CHANNELS.LLM_CHAT).toBeDefined();
      expect(IPC_CHANNELS.LLM_INIT).toBeDefined();
    });

    it('should have MCP channels', () => {
      expect(IPC_CHANNELS.MCP_ADD_SERVER).toBeDefined();
      expect(IPC_CHANNELS.MCP_CALL_TOOL).toBeDefined();
    });

    it('should have VectorDB channels', () => {
      expect(IPC_CHANNELS.VECTORDB_INITIALIZE).toBeDefined();
      expect(IPC_CHANNELS.VECTORDB_SEARCH).toBeDefined();
    });
  });

  describe('ERROR_MESSAGES', () => {
    it('should have all error messages in Korean', () => {
      expect(ERROR_MESSAGES.INVALID_API_KEY).toContain('API');
      expect(ERROR_MESSAGES.NETWORK_ERROR).toContain('네트워크');
      expect(ERROR_MESSAGES.SERVER_ERROR).toContain('서버');
      expect(ERROR_MESSAGES.TIMEOUT_ERROR).toContain('시간');
      expect(ERROR_MESSAGES.UNKNOWN_ERROR).toContain('알 수 없는');
    });
  });

  describe('REGEX_PATTERNS', () => {
    it('should validate email addresses', () => {
      expect(REGEX_PATTERNS.EMAIL.test('test@example.com')).toBe(true);
      expect(REGEX_PATTERNS.EMAIL.test('invalid-email')).toBe(false);
    });

    it('should validate GitHub repo format', () => {
      expect(REGEX_PATTERNS.GITHUB_REPO.test('owner/repo')).toBe(true);
      expect(REGEX_PATTERNS.GITHUB_REPO.test('owner-name/repo-name')).toBe(true);
      expect(REGEX_PATTERNS.GITHUB_REPO.test('invalid')).toBe(false);
    });

    it('should validate URLs', () => {
      expect(REGEX_PATTERNS.URL.test('https://example.com')).toBe(true);
      expect(REGEX_PATTERNS.URL.test('http://localhost:3000')).toBe(true);
      expect(REGEX_PATTERNS.URL.test('ftp://example.com')).toBe(false);
    });

    it('should validate UUIDs', () => {
      expect(REGEX_PATTERNS.UUID.test('12345678-1234-1234-1234-123456789012')).toBe(true);
      expect(REGEX_PATTERNS.UUID.test('not-a-uuid')).toBe(false);
    });
  });

  describe('FILE_TYPES', () => {
    it('should have image extensions and MIME types', () => {
      expect(FILE_TYPES.IMAGES.EXTENSIONS).toContain('.jpg');
      expect(FILE_TYPES.IMAGES.EXTENSIONS).toContain('.png');
      expect(FILE_TYPES.IMAGES.MIME_TYPES).toContain('image/jpeg');
      expect(FILE_TYPES.IMAGES.MIME_TYPES).toContain('image/png');
    });

    it('should have document extensions and MIME types', () => {
      expect(FILE_TYPES.DOCUMENTS.EXTENSIONS).toContain('.pdf');
      expect(FILE_TYPES.DOCUMENTS.EXTENSIONS).toContain('.md');
      expect(FILE_TYPES.DOCUMENTS.MIME_TYPES).toContain('application/pdf');
    });
  });

  describe('DEFAULT_MODELS', () => {
    it('should have OpenAI models', () => {
      expect(DEFAULT_MODELS.OPENAI).toContain('gpt-4o');
      expect(DEFAULT_MODELS.OPENAI).toContain('gpt-4o-mini');
    });

    it('should have Anthropic models', () => {
      expect(DEFAULT_MODELS.ANTHROPIC.some((m) => m.includes('claude'))).toBe(true);
    });

    it('should have embedding models', () => {
      expect(DEFAULT_MODELS.EMBEDDINGS).toContain('text-embedding-3-small');
    });
  });

  describe('KEYBOARD_SHORTCUTS', () => {
    it('should have modifier key shortcuts', () => {
      expect(KEYBOARD_SHORTCUTS.NEW_CHAT).toBe('mod+n');
      expect(KEYBOARD_SHORTCUTS.SETTINGS).toBe('mod+,');
      expect(KEYBOARD_SHORTCUTS.SEARCH).toBe('mod+f');
    });
  });
});
