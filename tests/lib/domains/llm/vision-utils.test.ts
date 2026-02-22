/**
 * Vision Utilities 테스트
 */

import type { Message, LLMConfig } from '@/types';

jest.mock('@/lib/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// Must mock providers before importing vision-utils
jest.mock('@/lib/domains/llm/providers/openai', () => ({
  OpenAIProvider: jest.fn().mockImplementation((baseURL, apiKey, model, options, config) => ({
    _type: 'openai',
    baseURL,
    apiKey,
    model,
    options,
    config,
  })),
}));

jest.mock('@/lib/domains/llm/providers/ollama', () => ({
  OllamaProvider: jest.fn().mockImplementation((baseURL, apiKey, model, options, config) => ({
    _type: 'ollama',
    baseURL,
    apiKey,
    model,
    options,
    config,
  })),
}));

import {
  hasImages,
  createVisionProvider,
  getVisionProviderFromConfig,
} from '@/lib/domains/llm/vision-utils';
import { OpenAIProvider } from '@/lib/domains/llm/providers/openai';
import { OllamaProvider } from '@/lib/domains/llm/providers/ollama';

const MockOpenAIProvider = OpenAIProvider as jest.MockedClass<typeof OpenAIProvider>;
const MockOllamaProvider = OllamaProvider as jest.MockedClass<typeof OllamaProvider>;

describe('Vision Utils', () => {
  describe('hasImages', () => {
    it('should return false for messages without images', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
        { id: '2', role: 'assistant', content: 'Hi', created_at: Date.now() },
      ];

      expect(hasImages(messages)).toBe(false);
    });

    it('should return false for empty messages', () => {
      expect(hasImages([])).toBe(false);
    });

    it('should return true when a message has images', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is this?',
          images: [
            {
              id: 'img1',
              path: '/test.png',
              filename: 'test.png',
              mimeType: 'image/png',
              base64: 'data:image/png;base64,abc123',
            },
          ],
          created_at: Date.now(),
        },
      ];

      expect(hasImages(messages)).toBe(true);
    });

    it('should return false when images array is empty', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Hello',
          images: [],
          created_at: Date.now(),
        },
      ];

      expect(hasImages(messages)).toBe(false);
    });

    it('should return true when any message has images', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello', created_at: Date.now() },
        {
          id: '2',
          role: 'user',
          content: 'Look at this',
          images: [
            {
              id: 'img1',
              path: '/test.png',
              filename: 'test.png',
              mimeType: 'image/png',
              base64: 'data:image/png;base64,abc123',
            },
          ],
          created_at: Date.now(),
        },
      ];

      expect(hasImages(messages)).toBe(true);
    });

    it('should return true for messages with multiple images', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'Compare',
          images: [
            {
              id: 'img1',
              path: '/a.png',
              filename: 'a.png',
              mimeType: 'image/png',
              base64: 'data:image/png;base64,aaa',
            },
            {
              id: 'img2',
              path: '/b.jpg',
              filename: 'b.jpg',
              mimeType: 'image/jpeg',
              base64: 'data:image/jpeg;base64,bbb',
            },
          ],
          created_at: Date.now(),
        },
      ];

      expect(hasImages(messages)).toBe(true);
    });
  });

  describe('createVisionProvider', () => {
    const baseLLMConfig: LLMConfig = {
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 2000,
    };

    beforeEach(() => {
      MockOpenAIProvider.mockClear();
      MockOllamaProvider.mockClear();
    });

    it('should return null when vision is not configured', () => {
      const config: LLMConfig = { ...baseLLMConfig };

      const result = createVisionProvider(config);

      expect(result).toBeNull();
    });

    it('should return null when vision is disabled', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: false,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
        },
      };

      const result = createVisionProvider(config);

      expect(result).toBeNull();
    });

    it('should return null when vision model is empty', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: '',
          baseURL: 'https://api.openai.com/v1',
        },
      };

      const result = createVisionProvider(config);

      expect(result).toBeNull();
    });

    it('should create OpenAIProvider for non-Ollama URLs', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'sk-vision',
        },
      };

      const result = createVisionProvider(config);

      expect(result).not.toBeNull();
      expect(MockOpenAIProvider).toHaveBeenCalledWith(
        'https://api.openai.com/v1',
        'sk-vision',
        'gpt-4-vision',
        expect.objectContaining({ temperature: 0.7 }),
        config
      );
    });

    it('should create OllamaProvider for URLs with :11434', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'llava',
          baseURL: 'http://localhost:11434/v1',
        },
      };

      const result = createVisionProvider(config);

      expect(result).not.toBeNull();
      expect(MockOllamaProvider).toHaveBeenCalledWith(
        'http://localhost:11434',
        'sk-test',
        'llava',
        expect.objectContaining({ temperature: 0.7 }),
        config
      );
    });

    it('should create OllamaProvider for URLs with "ollama" in path', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'llava',
          baseURL: 'http://ollama.local:8080/v1',
        },
      };

      const result = createVisionProvider(config);

      expect(result).not.toBeNull();
      expect(MockOllamaProvider).toHaveBeenCalled();
    });

    it('should create OllamaProvider for URLs with /api/chat', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'llava',
          baseURL: 'http://localhost:8080/api/chat',
        },
      };

      const result = createVisionProvider(config);

      expect(result).not.toBeNull();
      expect(MockOllamaProvider).toHaveBeenCalled();
    });

    it('should normalize Ollama URL by removing /v1 suffix', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'llava',
          baseURL: 'http://localhost:11434/v1',
        },
      };

      createVisionProvider(config);

      expect(MockOllamaProvider).toHaveBeenCalledWith(
        'http://localhost:11434',
        expect.any(String),
        'llava',
        expect.any(Object),
        config
      );
    });

    it('should normalize Ollama URL by removing /v1/chat/completions suffix', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'llava',
          baseURL: 'http://localhost:11434/v1/chat/completions',
        },
      };

      createVisionProvider(config);

      expect(MockOllamaProvider).toHaveBeenCalledWith(
        'http://localhost:11434',
        expect.any(String),
        'llava',
        expect.any(Object),
        config
      );
    });

    it('should fall back to main LLM baseURL when vision baseURL is not set', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
        },
      };

      createVisionProvider(config);

      expect(MockOpenAIProvider).toHaveBeenCalledWith(
        'https://api.openai.com/v1',
        expect.any(String),
        'gpt-4-vision',
        expect.any(Object),
        config
      );
    });

    it('should fall back to main LLM apiKey when vision apiKey is not set', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
        },
      };

      createVisionProvider(config);

      expect(MockOpenAIProvider).toHaveBeenCalledWith(
        expect.any(String),
        'sk-test', // Falls back to main apiKey
        'gpt-4-vision',
        expect.any(Object),
        config
      );
    });

    it('should limit maxTokens based on options', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        maxTokens: 8000,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
        },
      };

      createVisionProvider(config, { maxImageTokens: 2048 });

      expect(MockOpenAIProvider).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'gpt-4-vision',
        expect.objectContaining({ maxTokens: 2048 }),
        config
      );
    });

    it('should use default 4096 maxTokens limit', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        maxTokens: 8000,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
        },
      };

      createVisionProvider(config);

      expect(MockOpenAIProvider).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'gpt-4-vision',
        expect.objectContaining({ maxTokens: 4096 }),
        config
      );
    });

    it('should use maxImageTokens from vision config', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        maxTokens: 8000,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
          maxImageTokens: 1024,
        },
      };

      createVisionProvider(config);

      expect(MockOpenAIProvider).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'gpt-4-vision',
        expect.objectContaining({ maxTokens: 1024 }),
        config
      );
    });

    it('should set streamingEnabled from vision config', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
          enableStreaming: true,
        },
      };

      const result = createVisionProvider(config) as any;

      expect(result).not.toBeNull();
      expect(result.streamingEnabled).toBe(true);
    });

    it('should set streamingEnabled from options', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
        },
      };

      const result = createVisionProvider(config, { enableStreaming: true }) as any;

      expect(result).not.toBeNull();
      expect(result.streamingEnabled).toBe(true);
    });

    it('should default streamingEnabled to false', () => {
      const config: LLMConfig = {
        ...baseLLMConfig,
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
          baseURL: 'https://api.openai.com/v1',
        },
      };

      const result = createVisionProvider(config) as any;

      expect(result).not.toBeNull();
      expect(result.streamingEnabled).toBe(false);
    });
  });

  describe('getVisionProviderFromConfig', () => {
    it('should return null in non-window context', async () => {
      // The test setup defines window, but we can test by temporarily removing it
      const originalWindow = (global as any).window;
      delete (global as any).window;

      const result = await getVisionProviderFromConfig();
      expect(result).toBeNull();

      (global as any).window = originalWindow;
    });

    it('should load config from Electron API when available', async () => {
      const originalWindow = (global as any).window;
      (global as any).window = {
        ...originalWindow,
        electronAPI: {
          config: {
            load: jest.fn().mockResolvedValue({
              success: true,
              data: {
                llm: {
                  provider: 'openai',
                  baseURL: 'https://api.openai.com/v1',
                  apiKey: 'sk-test',
                  model: 'gpt-4',
                  temperature: 0.7,
                  maxTokens: 2000,
                  vision: {
                    enabled: true,
                    model: 'gpt-4-vision',
                    baseURL: 'https://api.openai.com/v1',
                  },
                },
              },
            }),
          },
        },
      };

      const result = await getVisionProviderFromConfig();
      expect(result).not.toBeNull();

      (global as any).window = originalWindow;
    });

    it('should load config from localStorage when Electron is not available', async () => {
      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue(
          JSON.stringify({
            provider: 'openai',
            baseURL: 'https://api.openai.com/v1',
            apiKey: 'sk-test',
            model: 'gpt-4',
            temperature: 0.7,
            maxTokens: 2000,
            vision: {
              enabled: true,
              model: 'gpt-4-vision',
              baseURL: 'https://api.openai.com/v1',
            },
          })
        ),
      };

      (global as any).window = {
        ...originalWindow,
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getVisionProviderFromConfig();
      expect(result).not.toBeNull();

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should return null when no LLM config found', async () => {
      const originalWindow = (global as any).window;
      const originalLocalStorage = (global as any).localStorage;
      const mockLocalStorage = {
        getItem: jest.fn().mockReturnValue(null),
      };

      (global as any).window = {
        ...originalWindow,
        electronAPI: undefined,
        localStorage: mockLocalStorage,
      };
      (global as any).localStorage = mockLocalStorage;

      const result = await getVisionProviderFromConfig();
      expect(result).toBeNull();

      (global as any).window = originalWindow;
      (global as any).localStorage = originalLocalStorage;
    });

    it('should return null on error', async () => {
      const originalWindow = (global as any).window;
      (global as any).window = {
        ...originalWindow,
        electronAPI: {
          config: {
            load: jest.fn().mockRejectedValue(new Error('IPC error')),
          },
        },
      };

      const result = await getVisionProviderFromConfig();
      expect(result).toBeNull();

      (global as any).window = originalWindow;
    });

    it('should return null when Electron API load fails', async () => {
      const originalWindow = (global as any).window;
      (global as any).window = {
        ...originalWindow,
        electronAPI: {
          config: {
            load: jest.fn().mockResolvedValue({
              success: true,
              data: { llm: null },
            }),
          },
        },
      };

      const result = await getVisionProviderFromConfig();
      expect(result).toBeNull();

      (global as any).window = originalWindow;
    });
  });
});
