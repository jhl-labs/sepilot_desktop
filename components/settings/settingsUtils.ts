import {
  LLMConfig,
  VisionModelConfig,
  AutocompleteConfig,
  NetworkConfig,
  ComfyUIConfig,
} from '@/types';

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

export const createDefaultNetworkConfig = (): NetworkConfig => ({
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

export const createDefaultVisionConfig = (): VisionModelConfig => ({
  enabled: false,
  provider: 'openai',
  baseURL: DEFAULT_BASE_URL,
  apiKey: '',
  model: 'gpt-4o-mini',
  maxImageTokens: 4096,
  enableStreaming: false,
});

export const createDefaultAutocompleteConfig = (): AutocompleteConfig => ({
  enabled: false,
  provider: 'openai',
  baseURL: DEFAULT_BASE_URL,
  apiKey: '',
  model: 'gpt-4o-mini',
  maxTokens: 500, // Increased to allow for prompt tokens + completion tokens
  temperature: 0.2, // Lower for more consistent completions
  debounceMs: 300,
});

export const createDefaultLLMConfig = (): LLMConfig => ({
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

export const createDefaultComfyUIConfig = (): ComfyUIConfig => ({
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

export const mergeLLMConfig = (incoming?: Partial<LLMConfig>): LLMConfig => {
  const base = createDefaultLLMConfig();
  if (!incoming) {
    return base;
  }

  const visionBase = base.vision ?? createDefaultVisionConfig();
  const autocompleteBase = base.autocomplete ?? createDefaultAutocompleteConfig();

  const mergedVision: VisionModelConfig = {
    enabled: incoming.vision?.enabled ?? visionBase.enabled,
    provider: incoming.vision?.provider ?? visionBase.provider,
    baseURL: incoming.vision?.baseURL ?? visionBase.baseURL,
    apiKey: incoming.vision?.apiKey ?? visionBase.apiKey,
    model: incoming.vision?.model ?? visionBase.model,
    maxImageTokens: incoming.vision?.maxImageTokens ?? visionBase.maxImageTokens,
    enableStreaming: incoming.vision?.enableStreaming ?? visionBase.enableStreaming,
  };

  const mergedAutocomplete: AutocompleteConfig = {
    enabled: incoming.autocomplete?.enabled ?? autocompleteBase.enabled,
    provider: incoming.autocomplete?.provider ?? autocompleteBase.provider,
    baseURL: incoming.autocomplete?.baseURL ?? autocompleteBase.baseURL,
    apiKey: incoming.autocomplete?.apiKey ?? autocompleteBase.apiKey,
    model: incoming.autocomplete?.model ?? autocompleteBase.model,
    maxTokens: incoming.autocomplete?.maxTokens ?? autocompleteBase.maxTokens,
    temperature: incoming.autocomplete?.temperature ?? autocompleteBase.temperature,
    debounceMs: incoming.autocomplete?.debounceMs ?? autocompleteBase.debounceMs,
  };

  return {
    ...base,
    ...incoming,
    vision: mergedVision,
    autocomplete: mergedAutocomplete,
    customHeaders: incoming.customHeaders ?? base.customHeaders,
  };
};

export const mergeNetworkConfig = (incoming?: Partial<NetworkConfig>): NetworkConfig => {
  const base = createDefaultNetworkConfig();
  if (!incoming) {
    return base;
  }

  const proxyBase = base.proxy ?? { enabled: false, mode: 'none' as const, url: '' };
  const sslBase = base.ssl ?? { verify: true };

  const mergedProxy = {
    enabled: incoming.proxy?.enabled ?? proxyBase.enabled,
    mode: incoming.proxy?.mode ?? proxyBase.mode,
    url: incoming.proxy?.url ?? proxyBase.url,
  };

  const mergedSsl = {
    verify: incoming.ssl?.verify ?? sslBase.verify,
  };

  return {
    ...base,
    proxy: mergedProxy,
    ssl: mergedSsl,
    customHeaders: incoming.customHeaders ?? base.customHeaders,
  };
};

export const mergeComfyConfig = (incoming?: Partial<ComfyUIConfig>): ComfyUIConfig => {
  const base = createDefaultComfyUIConfig();
  if (!incoming) {
    return base;
  }
  return {
    ...base,
    ...incoming,
  };
};

export const normalizeBaseUrl = (baseURL?: string) => {
  const target = baseURL && baseURL.trim().length > 0 ? baseURL : DEFAULT_BASE_URL;
  return target.replace(/\/$/, '');
};

export const extractModelIds = (payload: any): string[] => {
  if (!payload) {
    return [];
  }

  const normalize = (entry: any) =>
    entry?.id || entry?.name || entry?.slug || (typeof entry === 'string' ? entry : null);

  if (Array.isArray(payload.data)) {
    return payload.data.map(normalize).filter(Boolean);
  }

  if (Array.isArray(payload.models)) {
    return payload.models.map(normalize).filter(Boolean);
  }

  if (Array.isArray(payload)) {
    return payload.map(normalize).filter(Boolean);
  }

  return [];
};

export const fetchAvailableModels = async ({
  provider,
  baseURL,
  apiKey,
  customHeaders,
  networkConfig,
}: {
  provider: LLMConfig['provider'];
  baseURL?: string;
  apiKey: string;
  customHeaders?: Record<string, string>;
  networkConfig?: NetworkConfig;
}): Promise<string[]> => {
  if (!apiKey.trim()) {
    return [];
  }

  // Electron 환경: IPC를 통해 Main Process에서 호출 (CORS 없음, Network Config 사용)
  if (typeof window !== 'undefined' && window.electronAPI?.llm) {
    const result = await window.electronAPI.llm.fetchModels({
      provider,
      baseURL,
      apiKey,
      customHeaders,
      networkConfig,
    });

    if (!result.success || !result.data) {
      throw new Error(result.error || '모델 목록을 불러오지 못했습니다.');
    }

    return result.data;
  }

  // 브라우저 환경 (fallback): 직접 fetch (CORS 주의)
  console.warn('[Settings] Running in browser mode - CORS may occur, Network Config not applied');
  const endpoint = `${normalizeBaseUrl(baseURL)}/models`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (provider === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  if (customHeaders) {
    Object.entries(customHeaders).forEach(([key, value]) => {
      headers[key] = value;
    });
  }

  const response = await fetch(endpoint, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`모델 목록을 불러오지 못했습니다. (${response.status} ${errorText})`);
  }

  const payload = await response.json();
  const models = extractModelIds(payload);
  return Array.from(new Set(models)).sort();
};
