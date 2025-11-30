/**
 * settingsUtils 유틸리티 함수 테스트
 */

import {
  DEFAULT_BASE_URL,
  createDefaultNetworkConfig,
  createDefaultVisionConfig,
  createDefaultAutocompleteConfig,
  createDefaultLLMConfig,
  createDefaultComfyUIConfig,
  mergeLLMConfig,
  mergeNetworkConfig,
  mergeComfyConfig,
  normalizeBaseUrl,
  extractModelIds,
} from '@/components/settings/settingsUtils';

describe('settingsUtils', () => {
  describe('createDefaultNetworkConfig', () => {
    it('should create default network config', () => {
      const config = createDefaultNetworkConfig();

      expect(config).toEqual({
        proxy: {
          enabled: false,
          mode: 'none',
          url: '',
        },
        ssl: {
          verify: true,
        },
        customHeaders: {},
      });
    });
  });

  describe('createDefaultVisionConfig', () => {
    it('should create default vision config', () => {
      const config = createDefaultVisionConfig();

      expect(config).toEqual({
        enabled: false,
        provider: 'openai',
        baseURL: DEFAULT_BASE_URL,
        apiKey: '',
        model: 'gpt-4o-mini',
        maxImageTokens: 4096,
        enableStreaming: false,
      });
    });
  });

  describe('createDefaultAutocompleteConfig', () => {
    it('should create default autocomplete config', () => {
      const config = createDefaultAutocompleteConfig();

      expect(config).toEqual({
        enabled: false,
        provider: 'openai',
        baseURL: DEFAULT_BASE_URL,
        apiKey: '',
        model: 'gpt-4o-mini',
        maxTokens: 500,
        temperature: 0.2,
        debounceMs: 300,
      });
    });
  });

  describe('createDefaultLLMConfig', () => {
    it('should create default LLM config with vision and autocomplete', () => {
      const config = createDefaultLLMConfig();

      expect(config).toEqual({
        provider: 'openai',
        baseURL: DEFAULT_BASE_URL,
        apiKey: '',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
        vision: createDefaultVisionConfig(),
        autocomplete: createDefaultAutocompleteConfig(),
        customHeaders: {},
      });
    });
  });

  describe('createDefaultComfyUIConfig', () => {
    it('should create default ComfyUI config', () => {
      const config = createDefaultComfyUIConfig();

      expect(config).toEqual({
        enabled: false,
        httpUrl: 'http://127.0.0.1:8188',
        wsUrl: 'ws://127.0.0.1:8188/ws',
        workflowId: '',
        clientId: '',
        apiKey: '',
        positivePrompt: '',
        negativePrompt: '',
        steps: 30,
        cfgScale: 7,
        seed: -1,
      });
    });
  });

  describe('mergeLLMConfig', () => {
    it('should return default config when no incoming config', () => {
      const config = mergeLLMConfig();

      expect(config).toEqual(createDefaultLLMConfig());
    });

    it('should merge partial incoming config', () => {
      const incoming = {
        provider: 'anthropic' as const,
        model: 'claude-3',
      };

      const config = mergeLLMConfig(incoming);

      expect(config.provider).toBe('anthropic');
      expect(config.model).toBe('claude-3');
      expect(config.baseURL).toBe(DEFAULT_BASE_URL); // Should keep default
    });

    it('should merge vision config', () => {
      const incoming = {
        vision: {
          enabled: true,
          model: 'gpt-4-vision',
        },
      };

      const config = mergeLLMConfig(incoming);

      expect(config.vision?.enabled).toBe(true);
      expect(config.vision?.model).toBe('gpt-4-vision');
      expect(config.vision?.provider).toBe('openai'); // Default value
    });

    it('should merge autocomplete config', () => {
      const incoming = {
        autocomplete: {
          enabled: true,
          maxTokens: 1000,
        },
      };

      const config = mergeLLMConfig(incoming);

      expect(config.autocomplete?.enabled).toBe(true);
      expect(config.autocomplete?.maxTokens).toBe(1000);
      expect(config.autocomplete?.temperature).toBe(0.2); // Default value
    });

    it('should merge custom headers', () => {
      const incoming = {
        customHeaders: {
          'X-Custom': 'value',
        },
      };

      const config = mergeLLMConfig(incoming);

      expect(config.customHeaders).toEqual({ 'X-Custom': 'value' });
    });
  });

  describe('mergeNetworkConfig', () => {
    it('should return default config when no incoming config', () => {
      const config = mergeNetworkConfig();

      expect(config).toEqual(createDefaultNetworkConfig());
    });

    it('should merge proxy config', () => {
      const incoming = {
        proxy: {
          enabled: true,
          mode: 'http' as const,
          url: 'http://proxy.example.com:8080',
        },
      };

      const config = mergeNetworkConfig(incoming);

      expect(config.proxy?.enabled).toBe(true);
      expect(config.proxy?.mode).toBe('http');
      expect(config.proxy?.url).toBe('http://proxy.example.com:8080');
    });

    it('should merge SSL config', () => {
      const incoming = {
        ssl: {
          verify: false,
        },
      };

      const config = mergeNetworkConfig(incoming);

      expect(config.ssl?.verify).toBe(false);
    });

    it('should merge custom headers', () => {
      const incoming = {
        customHeaders: {
          'X-Network': 'test',
        },
      };

      const config = mergeNetworkConfig(incoming);

      expect(config.customHeaders).toEqual({ 'X-Network': 'test' });
    });
  });

  describe('mergeComfyConfig', () => {
    it('should return default config when no incoming config', () => {
      const config = mergeComfyConfig();

      expect(config).toEqual(createDefaultComfyUIConfig());
    });

    it('should merge partial incoming config', () => {
      const incoming = {
        enabled: true,
        httpUrl: 'http://custom:8188',
        steps: 50,
      };

      const config = mergeComfyConfig(incoming);

      expect(config.enabled).toBe(true);
      expect(config.httpUrl).toBe('http://custom:8188');
      expect(config.steps).toBe(50);
      expect(config.cfgScale).toBe(7); // Default value
    });
  });

  describe('normalizeBaseUrl', () => {
    it('should remove trailing slash', () => {
      expect(normalizeBaseUrl('https://api.example.com/')).toBe('https://api.example.com');
    });

    it('should not modify URL without trailing slash', () => {
      expect(normalizeBaseUrl('https://api.example.com')).toBe('https://api.example.com');
    });

    it('should use default URL when empty', () => {
      expect(normalizeBaseUrl('')).toBe(DEFAULT_BASE_URL);
    });

    it('should use default URL when undefined', () => {
      expect(normalizeBaseUrl(undefined)).toBe(DEFAULT_BASE_URL);
    });

    it('should use default URL when only whitespace', () => {
      expect(normalizeBaseUrl('   ')).toBe(DEFAULT_BASE_URL);
    });
  });

  describe('extractModelIds', () => {
    it('should extract from payload.data array with id', () => {
      const payload = {
        data: [{ id: 'model-1' }, { id: 'model-2' }],
      };

      expect(extractModelIds(payload)).toEqual(['model-1', 'model-2']);
    });

    it('should extract from payload.data array with name', () => {
      const payload = {
        data: [{ name: 'model-1' }, { name: 'model-2' }],
      };

      expect(extractModelIds(payload)).toEqual(['model-1', 'model-2']);
    });

    it('should extract from payload.data array with slug', () => {
      const payload = {
        data: [{ slug: 'model-1' }, { slug: 'model-2' }],
      };

      expect(extractModelIds(payload)).toEqual(['model-1', 'model-2']);
    });

    it('should extract from payload.models array', () => {
      const payload = {
        models: [{ id: 'model-1' }, { id: 'model-2' }],
      };

      expect(extractModelIds(payload)).toEqual(['model-1', 'model-2']);
    });

    it('should extract from array payload', () => {
      const payload = [{ id: 'model-1' }, { id: 'model-2' }];

      expect(extractModelIds(payload)).toEqual(['model-1', 'model-2']);
    });

    it('should extract string entries', () => {
      const payload = {
        data: ['model-1', 'model-2'],
      };

      expect(extractModelIds(payload)).toEqual(['model-1', 'model-2']);
    });

    it('should filter out null/undefined entries', () => {
      const payload = {
        data: [{ id: 'model-1' }, {}, { id: 'model-2' }],
      };

      expect(extractModelIds(payload)).toEqual(['model-1', 'model-2']);
    });

    it('should return empty array for null payload', () => {
      expect(extractModelIds(null)).toEqual([]);
    });

    it('should return empty array for undefined payload', () => {
      expect(extractModelIds(undefined)).toEqual([]);
    });

    it('should return empty array for payload without data or models', () => {
      const payload = { other: 'field' };

      expect(extractModelIds(payload)).toEqual([]);
    });
  });

  describe('fetchAvailableModels', () => {
    const { fetchAvailableModels } = require('@/components/settings/settingsUtils');

    beforeEach(() => {
      jest.clearAllMocks();
      global.fetch = jest.fn();
      (window as any).electronAPI = undefined;
    });

    afterEach(() => {
      delete (global as any).fetch;
      delete (window as any).electronAPI;
    });

    it('should return empty array when apiKey is empty', async () => {
      const result = await fetchAvailableModels({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: '',
      });

      expect(result).toEqual([]);
    });

    it('should return empty array when apiKey is only whitespace', async () => {
      const result = await fetchAvailableModels({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: '   ',
      });

      expect(result).toEqual([]);
    });

    it('should use electronAPI when available', async () => {
      const mockElectronAPI = {
        llm: {
          fetchModels: jest.fn().mockResolvedValue({
            success: true,
            data: ['model-1', 'model-2'],
          }),
        },
      };

      (window as any).electronAPI = mockElectronAPI;

      const result = await fetchAvailableModels({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
      });

      expect(result).toEqual(['model-1', 'model-2']);
      expect(mockElectronAPI.llm.fetchModels).toHaveBeenCalledWith({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        customHeaders: undefined,
        networkConfig: undefined,
      });
    });

    it('should throw error when electronAPI returns error', async () => {
      const mockElectronAPI = {
        llm: {
          fetchModels: jest.fn().mockResolvedValue({
            success: false,
            error: 'API Error',
          }),
        },
      };

      (window as any).electronAPI = mockElectronAPI;

      await expect(
        fetchAvailableModels({
          provider: 'openai',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'test-key',
        })
      ).rejects.toThrow('API Error');
    });

    it('should throw error when electronAPI returns no data', async () => {
      const mockElectronAPI = {
        llm: {
          fetchModels: jest.fn().mockResolvedValue({
            success: true,
            data: null,
          }),
        },
      };

      (window as any).electronAPI = mockElectronAPI;

      await expect(
        fetchAvailableModels({
          provider: 'openai',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'test-key',
        })
      ).rejects.toThrow('모델 목록을 불러오지 못했습니다.');
    });

    it('should use fetch in browser mode for OpenAI', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ id: 'gpt-4' }, { id: 'gpt-3.5-turbo' }],
        }),
        text: jest.fn(),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await fetchAvailableModels({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
      });

      expect(result).toEqual(['gpt-3.5-turbo', 'gpt-4']);
      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        },
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '[Settings] Running in browser mode - CORS may occur, Network Config not applied'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should use fetch in browser mode for Anthropic', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ id: 'claude-3-opus' }, { id: 'claude-3-sonnet' }],
        }),
        text: jest.fn(),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const result = await fetchAvailableModels({
        provider: 'anthropic',
        baseURL: 'https://api.anthropic.com/v1',
        apiKey: 'test-key',
      });

      expect(result).toEqual(['claude-3-opus', 'claude-3-sonnet']);
      expect(global.fetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/models', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': 'test-key',
          'anthropic-version': '2023-06-01',
        },
      });

      consoleWarnSpy.mockRestore();
    });

    it('should include custom headers in browser mode', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          data: [{ id: 'model-1' }],
        }),
        text: jest.fn(),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await fetchAvailableModels({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'test-key',
        customHeaders: {
          'X-Custom': 'value',
          'X-Another': 'header',
        },
      });

      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
          'X-Custom': 'value',
          'X-Another': 'header',
        },
      });

      consoleWarnSpy.mockRestore();
    });

    it('should throw error when fetch fails', async () => {
      const mockResponse = {
        ok: false,
        status: 401,
        text: jest.fn().mockResolvedValue('Unauthorized'),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await expect(
        fetchAvailableModels({
          provider: 'openai',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'invalid-key',
        })
      ).rejects.toThrow('모델 목록을 불러오지 못했습니다. (401 Unauthorized)');

      consoleWarnSpy.mockRestore();
    });

    it('should normalize baseURL before fetching', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ data: [{ id: 'model-1' }] }),
        text: jest.fn(),
      };

      (global.fetch as jest.Mock).mockResolvedValue(mockResponse);
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await fetchAvailableModels({
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1/', // Trailing slash
        apiKey: 'test-key',
      });

      // Should remove trailing slash
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.openai.com/v1/models',
        expect.anything()
      );

      consoleWarnSpy.mockRestore();
    });
  });
});
