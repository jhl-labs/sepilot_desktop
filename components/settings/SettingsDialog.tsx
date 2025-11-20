'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AppConfig, ComfyUIConfig, LLMConfig, VisionModelConfig, NetworkConfig } from '@/types';
import { initializeLLMClient } from '@/lib/llm/client';
import { VectorDBSettings } from '@/components/rag/VectorDBSettings';
import { VectorDBConfig, EmbeddingConfig } from '@/lib/vectordb/types';
import { initializeVectorDB } from '@/lib/vectordb/client';
import { initializeEmbedding } from '@/lib/vectordb/embeddings/client';
import { MCPServerList } from '@/components/mcp/MCPServerList';
import { MCPServerConfigComponent } from '@/components/mcp/MCPServerConfig';
import { isElectron } from '@/lib/platform';
import { configureWebLLMClient } from '@/lib/llm/web-client';
import { Textarea } from '@/components/ui/textarea';
import { RefreshCw } from 'lucide-react';
import { GitHubOAuthSettings } from '@/components/settings/GitHubOAuthSettings';
import { GitHubOAuthConfig } from '@/types';
import { BackupRestoreSettings } from '@/components/settings/BackupRestoreSettings';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

const createDefaultNetworkConfig = (): NetworkConfig => ({
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

const createDefaultVisionConfig = (): VisionModelConfig => ({
  enabled: false,
  provider: 'openai',
  baseURL: DEFAULT_BASE_URL,
  apiKey: '',
  model: 'gpt-4o-mini',
  maxImageTokens: 4096,
  enableStreaming: false, // Default: false (LiteLLM + Ollama streaming compatibility issues)
});

const createDefaultLLMConfig = (): LLMConfig => ({
  provider: 'openai',
  baseURL: DEFAULT_BASE_URL,
  apiKey: '',
  model: 'gpt-4',
  temperature: 0.7,
  maxTokens: 2000,
  vision: createDefaultVisionConfig(),
});

const createDefaultComfyUIConfig = (): ComfyUIConfig => ({
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

const mergeLLMConfig = (incoming?: Partial<LLMConfig>): LLMConfig => {
  const base = createDefaultLLMConfig();
  if (!incoming) {
    return base;
  }

  const visionBase = base.vision ?? createDefaultVisionConfig();

  const mergedVision: VisionModelConfig = {
    enabled: incoming.vision?.enabled ?? visionBase.enabled,
    provider: incoming.vision?.provider ?? visionBase.provider,
    baseURL: incoming.vision?.baseURL ?? visionBase.baseURL,
    apiKey: incoming.vision?.apiKey ?? visionBase.apiKey,
    model: incoming.vision?.model ?? visionBase.model,
    maxImageTokens: incoming.vision?.maxImageTokens ?? visionBase.maxImageTokens,
    enableStreaming: incoming.vision?.enableStreaming ?? visionBase.enableStreaming,
  };

  return {
    ...base,
    ...incoming,
    vision: mergedVision,
  };
};

const mergeNetworkConfig = (incoming?: Partial<NetworkConfig>): NetworkConfig => {
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

const mergeComfyConfig = (incoming?: Partial<ComfyUIConfig>): ComfyUIConfig => {
  const base = createDefaultComfyUIConfig();
  if (!incoming) {
    return base;
  }
  return {
    ...base,
    ...incoming,
  };
};

const normalizeBaseUrl = (baseURL?: string) => {
  const target = baseURL && baseURL.trim().length > 0 ? baseURL : DEFAULT_BASE_URL;
  return target.replace(/\/$/, '');
};

const extractModelIds = (payload: any): string[] => {
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

const fetchAvailableModels = async ({
  provider,
  baseURL,
  apiKey,
  networkConfig,
}: {
  provider: LLMConfig['provider'];
  baseURL?: string;
  apiKey: string;
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

  if (networkConfig?.customHeaders) {
    Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
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

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'llm' | 'network' | 'vectordb' | 'comfyui' | 'mcp' | 'github' | 'backup'>('llm');
  const [mcpRefreshKey, setMcpRefreshKey] = useState(0);

  const [config, setConfig] = useState<LLMConfig>(createDefaultLLMConfig());
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>(createDefaultNetworkConfig());
  const [githubConfig, setGithubConfig] = useState<GitHubOAuthConfig | null>(null);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isComfySaving, setIsComfySaving] = useState(false);
  const [comfyMessage, setComfyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isTestingComfy, setIsTestingComfy] = useState(false);

  // VectorDB & Embedding 설정 상태
  const [vectorDBConfig, setVectorDBConfig] = useState<VectorDBConfig | null>(null);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig | null>(null);
  const [comfyConfig, setComfyConfig] = useState<ComfyUIConfig>(createDefaultComfyUIConfig());
  const [appConfigSnapshot, setAppConfigSnapshot] = useState<AppConfig | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [visionModelOptions, setVisionModelOptions] = useState<string[]>([]);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isVisionModelLoading, setIsVisionModelLoading] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);
  const [visionModelFetchError, setVisionModelFetchError] = useState<string | null>(null);
  const customHeadersKey = useMemo(
    () => JSON.stringify(networkConfig.customHeaders || {}),
    [networkConfig.customHeaders]
  );

  const updateVisionConfig = (partial: Partial<VisionModelConfig>) => {
    setConfig((prev) => ({
      ...prev,
      vision: {
        ...(prev.vision ?? createDefaultVisionConfig()),
        ...partial,
      },
    }));
  };

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        if (isElectron() && window.electronAPI) {
          // Electron: SQLite에서 로드
          const result = await window.electronAPI.config.load();
          if (result.success && result.data) {
            const normalizedConfig: AppConfig = {
              llm: mergeLLMConfig(result.data.llm),
              network: mergeNetworkConfig(result.data.network),
              mcp: result.data.mcp ?? [],
              vectorDB: result.data.vectorDB,
              comfyUI: result.data.comfyUI ? mergeComfyConfig(result.data.comfyUI) : undefined,
              github: result.data.github,
            };
            setAppConfigSnapshot(normalizedConfig);
            setConfig(normalizedConfig.llm);
            setNetworkConfig(normalizedConfig.network ?? createDefaultNetworkConfig());
            setComfyConfig(normalizedConfig.comfyUI ?? createDefaultComfyUIConfig());
            setGithubConfig(normalizedConfig.github ?? null);
          }
        } else {
          // Web: localStorage에서 로드
          const savedConfig = localStorage.getItem('sepilot_llm_config');
          if (savedConfig) {
            setConfig(mergeLLMConfig(JSON.parse(savedConfig)));
          } else {
            setConfig(createDefaultLLMConfig());
          }

          const savedNetworkConfig = localStorage.getItem('sepilot_network_config');
          if (savedNetworkConfig) {
            setNetworkConfig(mergeNetworkConfig(JSON.parse(savedNetworkConfig)));
          } else {
            setNetworkConfig(createDefaultNetworkConfig());
          }

          const savedComfyConfig = localStorage.getItem('sepilot_comfyui_config');
          if (savedComfyConfig) {
            setComfyConfig(mergeComfyConfig(JSON.parse(savedComfyConfig)));
          } else {
            setComfyConfig(createDefaultComfyUIConfig());
          }
        }

        // VectorDB 설정 로드 및 초기화
        const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
        if (savedVectorDBConfig) {
          const parsedVectorDBConfig = JSON.parse(savedVectorDBConfig);
          setVectorDBConfig(parsedVectorDBConfig);

          // SQLite-vec는 브라우저에서 건너뛰기
          if (parsedVectorDBConfig.type === 'sqlite-vec' && !isElectron()) {
            console.log('Skipping SQLite-vec in browser environment');
          } else {
            // VectorDB 자동 초기화
            try {
              await initializeVectorDB(parsedVectorDBConfig);
              console.log('VectorDB auto-initialized');
            } catch (error) {
              console.error('Failed to auto-initialize VectorDB:', error);
            }
          }
        }

        // Embedding 설정 로드 및 초기화
        const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');
        if (savedEmbeddingConfig) {
          const parsedEmbeddingConfig = JSON.parse(savedEmbeddingConfig);
          setEmbeddingConfig(parsedEmbeddingConfig);

          // Embedding 자동 초기화
          try {
            initializeEmbedding(parsedEmbeddingConfig);
            console.log('Embedding auto-initialized');
          } catch (error) {
            console.error('Failed to auto-initialize Embedding:', error);
          }
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    if (open) {
      loadConfig();
      setMessage(null);
      setComfyMessage(null);
    }
  }, [open]);

  // 수동 모델 목록 갱신 함수
  const handleRefreshModels = async () => {
    if (!config.apiKey.trim()) {
      setModelFetchError('API 키를 먼저 입력해주세요.');
      return;
    }

    setIsModelLoading(true);
    setModelFetchError(null);

    try {
      const models = await fetchAvailableModels({
        provider: config.provider,
        baseURL: config.baseURL,
        apiKey: config.apiKey,
        networkConfig, // 전체 Network Config 전달 (proxy, SSL, customHeaders)
      });
      setModelOptions(models);
    } catch (error: any) {
      setModelFetchError(error.message || '모델 정보를 불러오지 못했습니다.');
      setModelOptions([]);
    } finally {
      setIsModelLoading(false);
    }
  };

  // 수동 Vision 모델 목록 갱신 함수
  const handleRefreshVisionModels = async () => {
    const visionApiKey = config.vision?.apiKey || config.apiKey;

    if (!visionApiKey.trim()) {
      setVisionModelFetchError('API 키를 먼저 입력해주세요.');
      return;
    }

    setIsVisionModelLoading(true);
    setVisionModelFetchError(null);

    try {
      const models = await fetchAvailableModels({
        provider: config.vision?.provider || config.provider,
        baseURL: config.vision?.baseURL || config.baseURL,
        apiKey: visionApiKey,
        networkConfig, // 전체 Network Config 전달 (proxy, SSL, customHeaders)
      });
      setVisionModelOptions(models);
    } catch (error: any) {
      setVisionModelFetchError(error.message || 'Vision 모델 정보를 불러오지 못했습니다.');
      setVisionModelOptions([]);
    } finally {
      setIsVisionModelLoading(false);
    }
  };

  const persistAppConfig = async (partial: Partial<AppConfig>) => {
    if (typeof window === 'undefined' || !isElectron() || !window.electronAPI) {
      return false;
    }

    const merged: AppConfig = {
      llm: partial.llm ?? appConfigSnapshot?.llm ?? mergeLLMConfig(),
      network: partial.network ?? appConfigSnapshot?.network ?? mergeNetworkConfig(),
      vectorDB: partial.vectorDB ?? appConfigSnapshot?.vectorDB,
      mcp: partial.mcp ?? appConfigSnapshot?.mcp ?? [],
      comfyUI: partial.comfyUI ?? appConfigSnapshot?.comfyUI,
      github: partial.github ?? appConfigSnapshot?.github,
    };

    const result = await window.electronAPI.config.save(merged);
    if (result.success) {
      setAppConfigSnapshot(merged);
    } else {
      console.error('Failed to save config to DB:', result.error);
    }

    return result.success;
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      // Validate API key
      if (!config.apiKey.trim()) {
        setMessage({ type: 'error', text: 'API 키를 입력해주세요.' });
        setIsSaving(false);
        return;
      }
      if (!config.model.trim()) {
        setMessage({ type: 'error', text: '기본 모델을 선택하거나 입력해주세요.' });
        setIsSaving(false);
        return;
      }
      if (config.vision?.enabled && !config.vision.model.trim()) {
        setMessage({ type: 'error', text: 'Vision 모델 ID를 입력해주세요.' });
        setIsSaving(false);
        return;
      }

      // Save to database or localStorage
      let saved = false;
      if (isElectron() && window.electronAPI) {
        try {
          saved = await persistAppConfig({ llm: config, network: networkConfig });
          if (saved) {
            await window.electronAPI.llm.init(config);
          }
        } catch (error) {
          console.error('Error saving config to DB:', error);
        }
      }

      // Fallback to localStorage if not saved
      if (!saved) {
        // Web or Electron DB save failed: localStorage에 저장
        localStorage.setItem('sepilot_llm_config', JSON.stringify(config));
        localStorage.setItem('sepilot_network_config', JSON.stringify(networkConfig));

        // Initialize Web LLM client
        configureWebLLMClient(config);
      }

      setMessage({ type: 'success', text: '설정이 저장되었습니다!' });
    } catch (error: any) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: error.message || '설정 저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleComfySave = async () => {
    setIsComfySaving(true);
    setComfyMessage(null);

    try {
      if (comfyConfig.enabled) {
        if (!comfyConfig.httpUrl.trim()) {
          throw new Error('ComfyUI HTTP URL을 입력해주세요.');
        }
        if (!comfyConfig.workflowId.trim()) {
          throw new Error('기본 워크플로우 ID를 입력해주세요.');
        }
      }

      let saved = false;
      if (isElectron() && window.electronAPI) {
        try {
          saved = await persistAppConfig({ comfyUI: comfyConfig });
        } catch (error) {
          console.error('Error saving ComfyUI config to DB:', error);
        }
      }

      if (!saved) {
        localStorage.setItem('sepilot_comfyui_config', JSON.stringify(comfyConfig));
      }

      // Notify InputBox and other components about config update
      window.dispatchEvent(new CustomEvent('sepilot:config-updated', {
        detail: { comfyUI: comfyConfig }
      }));

      setComfyMessage({ type: 'success', text: 'ComfyUI 설정이 저장되었습니다!' });
    } catch (error: any) {
      console.error('Failed to save ComfyUI config:', error);
      setComfyMessage({
        type: 'error',
        text: error.message || 'ComfyUI 설정 저장에 실패했습니다.',
      });
    } finally {
      setIsComfySaving(false);
    }
  };

  const handleTestComfyConnection = async () => {
    setIsTestingComfy(true);
    setComfyMessage(null);

    try {
      if (!comfyConfig.httpUrl.trim()) {
        throw new Error('ComfyUI HTTP URL을 입력해주세요.');
      }

      // Electron 환경: IPC를 통해 Main Process에서 호출 (CORS 없음, Network Config 사용)
      if (typeof window !== 'undefined' && window.electronAPI?.comfyui) {
        const result = await window.electronAPI.comfyui.testConnection(
          comfyConfig.httpUrl,
          comfyConfig.apiKey,
          networkConfig
        );

        if (!result.success) {
          throw new Error(result.error || 'ComfyUI 서버 연결 테스트에 실패했습니다.');
        }

        setComfyMessage({ type: 'success', text: 'ComfyUI 서버와 연결되었습니다.' });
      } else {
        // 브라우저 환경 (fallback): 직접 fetch
        console.warn('[ComfyUI] Running in browser mode - CORS may occur, Network Config not applied');
        const normalizedUrl = comfyConfig.httpUrl.replace(/\/$/, '');
        const response = await fetch(`${normalizedUrl}/system_stats`, {
          headers: comfyConfig.apiKey
            ? {
                Authorization: `Bearer ${comfyConfig.apiKey}`,
              }
            : undefined,
        });

        if (!response.ok) {
          throw new Error(`ComfyUI 서버 응답이 올바르지 않습니다. (HTTP ${response.status})`);
        }

        setComfyMessage({ type: 'success', text: 'ComfyUI 서버와 연결되었습니다.' });
      }
    } catch (error: any) {
      console.error('Failed to test ComfyUI connection:', error);
      setComfyMessage({
        type: 'error',
        text: error.message || 'ComfyUI 서버 연결 테스트에 실패했습니다.',
      });
    } finally {
      setIsTestingComfy(false);
    }
  };

  const handleVectorDBSave = async (
    vectorDBConfig: VectorDBConfig,
    embeddingConfig: EmbeddingConfig
  ) => {
    try {
      // Network Config를 EmbeddingConfig에 포함
      const embeddingConfigWithNetwork = {
        ...embeddingConfig,
        networkConfig, // Network 탭의 proxy, SSL, customHeaders 설정 포함
      };

      console.log('[SettingsDialog] Saving embedding config with model:', embeddingConfig.model, 'networkConfig:', !!networkConfig);

      // 설정 저장 (localStorage)
      localStorage.setItem('sepilot_vectordb_config', JSON.stringify(vectorDBConfig));
      localStorage.setItem('sepilot_embedding_config', JSON.stringify(embeddingConfigWithNetwork));

      // State 업데이트
      setVectorDBConfig(vectorDBConfig);
      setEmbeddingConfig(embeddingConfigWithNetwork);

      // Embedding 초기화 (브라우저에서도 가능)
      initializeEmbedding(embeddingConfigWithNetwork);

      // VectorDB 초기화 - SQLite-vec는 Electron에서만 초기화
      if (vectorDBConfig.type === 'sqlite-vec') {
        // SQLite-vec는 Node.js 환경에서만 사용 가능
        if (isElectron() && typeof window !== 'undefined' && window.electronAPI) {
          // Electron 환경: 메인 프로세스에 초기화 요청
          // TODO: Electron IPC로 VectorDB 초기화 요청
          console.log('SQLite-vec는 Electron 환경에서만 초기화됩니다.');
        } else {
          // 브라우저 환경: 설정만 저장, 초기화는 건너뛰기
          console.log('브라우저 환경에서는 SQLite-vec를 사용할 수 없습니다. 설정만 저장됩니다.');
        }
      } else {
        // OpenSearch, Elasticsearch, pgvector 등은 브라우저에서도 초기화 가능
        await initializeVectorDB(vectorDBConfig);
      }

      // console.log('VectorDB and Embedding configuration saved successfully');
    } catch (error: any) {
      console.error('Failed to save VectorDB config:', error);
      throw error;
    }
  };

  const baseModelSelectValue =
    modelOptions.includes(config.model) && config.model ? config.model : '__custom__';
  const showCustomModelInput = baseModelSelectValue === '__custom__';
  const visionModelSelectValue =
    config.vision?.model && visionModelOptions.includes(config.vision.model)
      ? config.vision.model
      : '__vision_custom__';
  const showCustomVisionModelInput =
    !config.vision?.model || visionModelSelectValue === '__vision_custom__';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] overflow-y-auto"
        onClose={() => onOpenChange(false)}
      >
        <DialogHeader>
          <DialogTitle>설정</DialogTitle>
          <DialogDescription>
            LLM, VectorDB, MCP 등의 설정을 구성하세요.
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-2 border-b overflow-x-auto">
          <button
            onClick={() => setActiveTab('llm')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'llm'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            LLM
          </button>
          <button
            onClick={() => setActiveTab('network')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'network'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Network
          </button>
          <button
            onClick={() => setActiveTab('vectordb')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'vectordb'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            VectorDB
          </button>
          <button
            onClick={() => setActiveTab('comfyui')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'comfyui'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ComfyUI
          </button>
          <button
            onClick={() => setActiveTab('mcp')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'mcp'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            MCP 서버
          </button>
          <button
            onClick={() => setActiveTab('github')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'github'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            GitHub
          </button>
          <button
            onClick={() => setActiveTab('backup')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            백업/복구
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'llm' && (
          <div className="space-y-4">
          {/* Provider */}
          <div className="space-y-2">
            <Label htmlFor="provider">Provider</Label>
            <select
              id="provider"
              value={config.provider}
              onChange={(e) =>
                setConfig({ ...config, provider: e.target.value as any })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
            >
              <option value="openai" className="bg-background text-foreground">OpenAI</option>
              <option value="anthropic" className="bg-background text-foreground">Anthropic (Claude)</option>
              <option value="custom" className="bg-background text-foreground">Custom (OpenAI Compatible)</option>
            </select>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="baseURL">Base URL</Label>
            <div className="flex gap-2">
              <Input
                id="baseURL"
                value={config.baseURL}
                onChange={(e) => setConfig({ ...config, baseURL: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleRefreshModels}
                disabled={isModelLoading || !config.apiKey.trim()}
                title="모델 목록 새로고침"
              >
                <RefreshCw className={`h-4 w-4 ${isModelLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="apiKey">API Key</Label>
            <Input
              id="apiKey"
              type="password"
              value={config.apiKey}
              onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
              placeholder="sk-..."
            />
          </div>

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="modelSelect">Model</Label>
            <select
              id="modelSelect"
              value={baseModelSelectValue}
              onChange={(e) => {
                if (e.target.value === '__custom__') {
                  setConfig({ ...config, model: '' });
                } else {
                  setConfig({ ...config, model: e.target.value });
                }
              }}
              className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
            >
              {modelOptions.length > 0 ? (
                <>
                  <option value="" disabled className="bg-background text-foreground">
                    모델을 선택하세요
                  </option>
                  {modelOptions.map((modelId) => (
                    <option key={modelId} value={modelId} className="bg-background text-foreground">
                      {modelId}
                    </option>
                  ))}
                </>
              ) : (
                <option value="" disabled className="bg-background text-foreground">
                  모델 목록을 불러오려면 API 키가 필요합니다
                </option>
              )}
              <option value="__custom__" className="bg-background text-foreground">직접 입력</option>
            </select>
            {isModelLoading && (
              <p className="text-xs text-muted-foreground">모델 목록을 불러오는 중입니다...</p>
            )}
            {modelFetchError && (
              <p className="text-xs text-destructive">{modelFetchError}</p>
            )}
            {!config.apiKey.trim() && !isModelLoading && (
              <p className="text-xs text-muted-foreground">
                API 키와 Base URL을 입력한 후 새로고침 버튼을 클릭하면 모델 목록을 가져옵니다.
              </p>
            )}
            {config.apiKey.trim() && modelOptions.length === 0 && !isModelLoading && !modelFetchError && (
              <p className="text-xs text-muted-foreground">
                새로고침 버튼을 클릭하여 모델 목록을 불러오세요.
              </p>
            )}
            {showCustomModelInput && (
              <Input
                id="model"
                value={config.model}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                placeholder="gpt-4o, gpt-4.1, claude-3-5-sonnet 등"
              />
            )}
          </div>

          {/* Temperature */}
          <div className="space-y-2">
            <Label htmlFor="temperature">
              Temperature ({config.temperature})
            </Label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={config.temperature}
              onChange={(e) =>
                setConfig({ ...config, temperature: parseFloat(e.target.value) })
              }
              className="w-full"
            />
          </div>

          {/* Max Tokens */}
          <div className="space-y-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            <Input
              id="maxTokens"
              type="number"
              value={config.maxTokens}
              onChange={(e) =>
                setConfig({ ...config, maxTokens: parseInt(e.target.value) })
              }
              placeholder="2000"
            />
          </div>

          {/* Network Settings Note */}
          <div className="pt-4 border-t">
            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
              <p className="font-medium">네트워크 설정</p>
              <p className="mt-1 text-xs">프록시, SSL 검증, 커스텀 헤더 등의 네트워크 설정은 상단의 <strong>Network</strong> 탭에서 관리할 수 있습니다.</p>
            </div>
          </div>

          {/* Vision Settings */}
          <div className="pt-6 border-t space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label className="text-base font-semibold">Vision 모델</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  이미지 이해/해석이 필요한 멀티모달 요청 시 사용할 Vision 모델을 별도로 지정할 수 있습니다.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={config.vision?.enabled ?? false}
                  onChange={(e) => updateVisionConfig({ enabled: e.target.checked })}
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>

            {config.vision?.enabled && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="visionProvider">Provider</Label>
                  <select
                    id="visionProvider"
                    value={config.vision?.provider || config.provider}
                    onChange={(e) =>
                      updateVisionConfig({
                        provider: e.target.value as LLMConfig['provider'],
                      })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="openai" className="bg-background text-foreground">OpenAI</option>
                    <option value="anthropic" className="bg-background text-foreground">Anthropic (Claude)</option>
                    <option value="custom" className="bg-background text-foreground">Custom (OpenAI Compatible)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visionBaseUrl">Base URL</Label>
                  <div className="flex gap-2">
                    <Input
                      id="visionBaseUrl"
                      value={config.vision?.baseURL || ''}
                      onChange={(e) =>
                        updateVisionConfig({
                          baseURL: e.target.value,
                        })
                      }
                      placeholder={config.baseURL}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleRefreshVisionModels}
                      disabled={isVisionModelLoading || (!config.vision?.apiKey && !config.apiKey.trim())}
                      title="Vision 모델 목록 새로고침"
                    >
                      <RefreshCw className={`h-4 w-4 ${isVisionModelLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visionApiKey">API Key (선택사항)</Label>
                  <Input
                    id="visionApiKey"
                    type="password"
                    value={config.vision?.apiKey || ''}
                    onChange={(e) =>
                      updateVisionConfig({
                        apiKey: e.target.value,
                      })
                    }
                    placeholder="비워두면 기본 API 키 사용"
                  />
                  <p className="text-xs text-muted-foreground">
                    Vision 모델에 다른 API 키를 사용하려면 입력하세요. 비워두면 기본 LLM API 키를 사용합니다.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visionModelSelect">Model</Label>
                  <select
                    id="visionModelSelect"
                    value={visionModelSelectValue}
                    onChange={(e) => {
                      if (e.target.value === '__vision_custom__') {
                        updateVisionConfig({ model: '' });
                      } else {
                        updateVisionConfig({ model: e.target.value });
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                  >
                    {visionModelOptions.length > 0 ? (
                      <>
                        <option value="" disabled className="bg-background text-foreground">
                          Vision 모델을 선택하세요
                        </option>
                        {visionModelOptions.map((modelId) => (
                          <option key={modelId} value={modelId} className="bg-background text-foreground">
                            {modelId}
                          </option>
                        ))}
                      </>
                    ) : (
                      <option value="" disabled className="bg-background text-foreground">
                        Vision 모델 목록을 불러오려면 API 키가 필요합니다
                      </option>
                    )}
                    <option value="__vision_custom__" className="bg-background text-foreground">직접 입력</option>
                  </select>
                  {isVisionModelLoading && (
                    <p className="text-xs text-muted-foreground">Vision 모델 목록을 불러오는 중입니다...</p>
                  )}
                  {visionModelFetchError && (
                    <p className="text-xs text-destructive">{visionModelFetchError}</p>
                  )}
                  {!config.vision?.apiKey && !config.apiKey.trim() && !isVisionModelLoading && (
                    <p className="text-xs text-muted-foreground">
                      API 키를 입력한 후 새로고침 버튼을 클릭하면 Vision 모델 목록을 가져옵니다.
                    </p>
                  )}
                  {(config.vision?.apiKey || config.apiKey.trim()) && visionModelOptions.length === 0 && !isVisionModelLoading && !visionModelFetchError && (
                    <p className="text-xs text-muted-foreground">
                      새로고침 버튼을 클릭하여 Vision 모델 목록을 불러오세요.
                    </p>
                  )}
                  {showCustomVisionModelInput && (
                    <Input
                      id="visionModel"
                      value={config.vision?.model || ''}
                      onChange={(e) =>
                        updateVisionConfig({
                          model: e.target.value,
                        })
                      }
                      placeholder="gpt-4o-mini, claude-3-5-sonnet 등"
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="visionMaxTokens">Max Image Tokens</Label>
                  <Input
                    id="visionMaxTokens"
                    type="number"
                    value={config.vision?.maxImageTokens ?? 4096}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      updateVisionConfig({
                        maxImageTokens: Number.isNaN(parsed) ? undefined : parsed,
                      });
                    }}
                    placeholder="4096"
                  />
                  <p className="text-xs text-muted-foreground">
                    비전 응답에서 사용할 최대 토큰 수를 지정합니다.
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      id="visionEnableStreaming"
                      type="checkbox"
                      checked={config.vision?.enableStreaming ?? false}
                      onChange={(e) => {
                        updateVisionConfig({
                          enableStreaming: e.target.checked,
                        });
                      }}
                      className="h-4 w-4 rounded border-input"
                    />
                    <Label htmlFor="visionEnableStreaming" className="font-normal cursor-pointer">
                      스트리밍 응답 활성화
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    ⚠️ LiteLLM + Ollama 비전 모델 조합에서는 스트리밍 파싱 오류가 발생할 수 있습니다. 기본값(비활성화) 권장.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Message */}
          {message && (
            <div
              className={`rounded-md px-3 py-2 text-sm ${
                message.type === 'success'
                  ? 'bg-green-500/10 text-green-500'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {message.text}
            </div>
          )}

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                프록시, SSL 인증서 검증, 커스텀 HTTP 헤더 등의 네트워크 설정을 관리합니다.
                이 설정은 LLM, ComfyUI, VectorDB, MCP 등 모든 외부 연결에 적용됩니다.
              </div>

              {/* Proxy Settings */}
              <div className="space-y-3 p-4 rounded-lg border">
                <div className="flex items-center justify-between">
                  <Label htmlFor="proxyEnabled" className="text-base font-semibold">프록시 설정</Label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="proxyEnabled"
                      type="checkbox"
                      checked={networkConfig.proxy?.enabled ?? false}
                      onChange={(e) =>
                        setNetworkConfig({
                          ...networkConfig,
                          proxy: {
                            ...networkConfig.proxy,
                            enabled: e.target.checked,
                            mode: networkConfig.proxy?.mode || 'none',
                          } as any,
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                  </label>
                </div>

                {networkConfig.proxy?.enabled && (
                  <div className="space-y-3 pl-4">
                    <div className="space-y-2">
                      <Label htmlFor="proxyMode">프록시 모드</Label>
                      <select
                        id="proxyMode"
                        value={networkConfig.proxy?.mode || 'none'}
                        onChange={(e) =>
                          setNetworkConfig({
                            ...networkConfig,
                            proxy: {
                              ...networkConfig.proxy,
                              enabled: networkConfig.proxy?.enabled ?? false,
                              mode: e.target.value as 'system' | 'manual' | 'none',
                            } as any,
                          })
                        }
                        className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="none" className="bg-background text-foreground">사용 안 함</option>
                        <option value="system" className="bg-background text-foreground">시스템 프록시 사용</option>
                        <option value="manual" className="bg-background text-foreground">수동 설정</option>
                      </select>
                    </div>

                    {networkConfig.proxy?.mode === 'manual' && (
                      <div className="space-y-2">
                        <Label htmlFor="proxyUrl">프록시 URL</Label>
                        <Input
                          id="proxyUrl"
                          value={networkConfig.proxy?.url || ''}
                          onChange={(e) =>
                            setNetworkConfig({
                              ...networkConfig,
                              proxy: {
                                ...networkConfig.proxy,
                                enabled: networkConfig.proxy?.enabled ?? false,
                                mode: networkConfig.proxy?.mode || 'manual',
                                url: e.target.value,
                              } as any,
                            })
                          }
                          placeholder="http://proxy.example.com:8080"
                        />
                        <p className="text-xs text-muted-foreground">
                          예: http://proxy.example.com:8080 또는 socks5://127.0.0.1:1080
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* SSL Verification */}
              <div className="space-y-2 p-4 rounded-lg border">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="sslVerify" className="text-base font-semibold">SSL 인증서 검증</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      자체 서명 인증서 사용 시 비활성화하세요
                    </p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      id="sslVerify"
                      type="checkbox"
                      checked={networkConfig.ssl?.verify ?? true}
                      onChange={(e) =>
                        setNetworkConfig({
                          ...networkConfig,
                          ssl: {
                            verify: e.target.checked,
                          },
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                  </label>
                </div>
                {!(networkConfig.ssl?.verify ?? true) && (
                  <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-500">
                    ⚠️ 보안 경고: SSL 검증을 비활성화하면 중간자 공격에 취약할 수 있습니다.
                  </div>
                )}
              </div>

              {/* Custom Headers */}
              <div className="space-y-3 p-4 rounded-lg border">
                <Label className="text-base font-semibold">커스텀 HTTP 헤더</Label>

                {/* Existing Headers */}
                {networkConfig.customHeaders && Object.keys(networkConfig.customHeaders).length > 0 && (
                  <div className="space-y-2">
                    {Object.entries(networkConfig.customHeaders).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2 p-2 rounded-md bg-background border">
                        <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                          <div className="font-mono text-xs break-all">{key}</div>
                          <div className="font-mono text-xs break-all text-muted-foreground">{value}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newHeaders = { ...networkConfig.customHeaders };
                            delete newHeaders[key];
                            setNetworkConfig({ ...networkConfig, customHeaders: newHeaders });
                          }}
                          className="p-1 hover:bg-destructive/10 rounded text-destructive"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add New Header */}
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={newHeaderKey}
                      onChange={(e) => setNewHeaderKey(e.target.value)}
                      placeholder="헤더 이름 (예: X-API-Version)"
                      className="text-sm"
                    />
                    <Input
                      value={newHeaderValue}
                      onChange={(e) => setNewHeaderValue(e.target.value)}
                      placeholder="헤더 값 (예: v1)"
                      className="text-sm"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (newHeaderKey.trim() && newHeaderValue.trim()) {
                        setNetworkConfig({
                          ...networkConfig,
                          customHeaders: {
                            ...networkConfig.customHeaders,
                            [newHeaderKey.trim()]: newHeaderValue.trim(),
                          },
                        });
                        setNewHeaderKey('');
                        setNewHeaderValue('');
                      }
                    }}
                    className="w-full"
                  >
                    헤더 추가
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    예: Authorization, X-API-Key, User-Agent 등
                  </p>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button
                onClick={async () => {
                  setIsSaving(true);
                  setMessage(null);
                  try {
                    let saved = false;
                    if (isElectron() && window.electronAPI) {
                      saved = await persistAppConfig({ network: networkConfig });
                    }
                    if (!saved) {
                      localStorage.setItem('sepilot_network_config', JSON.stringify(networkConfig));
                    }
                    setMessage({ type: 'success', text: '네트워크 설정이 저장되었습니다!' });
                  } catch (error: any) {
                    setMessage({ type: 'error', text: error.message || '설정 저장에 실패했습니다.' });
                  } finally {
                    setIsSaving(false);
                  }
                }}
                disabled={isSaving}
              >
                {isSaving ? '저장 중...' : '저장'}
              </Button>
            </div>

            {message && (
              <div
                className={`rounded-md px-4 py-3 text-sm ${
                  message.type === 'success'
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                    : 'bg-destructive/10 text-destructive border border-destructive/20'
                }`}
              >
                {message.text}
              </div>
            )}
          </div>
        )}

        {activeTab === 'vectordb' && (
          <VectorDBSettings
            onSave={handleVectorDBSave}
            initialVectorDBConfig={vectorDBConfig || undefined}
            initialEmbeddingConfig={embeddingConfig || undefined}
          />
        )}

        {activeTab === 'comfyui' && (
          <div className="space-y-6">
            <div className="rounded-md border bg-muted/40 p-4 space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold">ComfyUI 연결</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    이미지 생성을 위해 사용할 ComfyUI REST/WebSocket 엔드포인트와 기본 워크플로우를 설정합니다.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={comfyConfig.enabled}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        enabled: e.target.checked,
                      })
                    }
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                </label>
              </div>
              {!comfyConfig.enabled && (
                <p className="text-xs text-muted-foreground">
                  토글을 활성화하면 아래 설정을 편집할 수 있습니다.
                </p>
              )}
            </div>

            <div className={`space-y-4 ${!comfyConfig.enabled ? 'opacity-60 pointer-events-none' : ''}`}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comfyHttp">HTTP Endpoint</Label>
                  <Input
                    id="comfyHttp"
                    value={comfyConfig.httpUrl}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        httpUrl: e.target.value,
                      })
                    }
                    placeholder="http://127.0.0.1:8188"
                  />
                  <p className="text-xs text-muted-foreground">
                    ComfyUI REST API 기본 URL (예: http://localhost:8188)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comfyWs">WebSocket Endpoint</Label>
                  <Input
                    id="comfyWs"
                    value={comfyConfig.wsUrl}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        wsUrl: e.target.value,
                      })
                    }
                    placeholder="ws://127.0.0.1:8188/ws"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comfyWorkflow">기본 워크플로우 ID 또는 파일</Label>
                  <Input
                    id="comfyWorkflow"
                    value={comfyConfig.workflowId}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        workflowId: e.target.value,
                      })
                    }
                    placeholder="workflow.json 또는 prompt ID"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comfyClientId">Client ID</Label>
                  <Input
                    id="comfyClientId"
                    value={comfyConfig.clientId || ''}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        clientId: e.target.value,
                      })
                    }
                    placeholder="선택 사항"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comfyApiKey">API Key</Label>
                  <Input
                    id="comfyApiKey"
                    type="password"
                    value={comfyConfig.apiKey || ''}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        apiKey: e.target.value,
                      })
                    }
                    placeholder="인증 필요 시 입력"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comfySeed">Seed</Label>
                  <Input
                    id="comfySeed"
                    type="number"
                    value={comfyConfig.seed ?? -1}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      setComfyConfig({
                        ...comfyConfig,
                        seed: Number.isNaN(parsed) ? undefined : parsed,
                      });
                    }}
                    placeholder="-1"
                  />
                  <p className="text-xs text-muted-foreground">-1이면 ComfyUI가 자동 Seed를 사용합니다.</p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="comfySteps">Steps</Label>
                  <Input
                    id="comfySteps"
                    type="number"
                    value={comfyConfig.steps ?? 30}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      setComfyConfig({
                        ...comfyConfig,
                        steps: Number.isNaN(parsed) ? undefined : parsed,
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comfyCfg">CFG Scale</Label>
                  <Input
                    id="comfyCfg"
                    type="number"
                    value={comfyConfig.cfgScale ?? 7}
                    onChange={(e) => {
                      const parsed = parseFloat(e.target.value);
                      setComfyConfig({
                        ...comfyConfig,
                        cfgScale: Number.isNaN(parsed) ? undefined : parsed,
                      });
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>워크플로우 경로 참고</Label>
                  <p className="text-xs text-muted-foreground">
                    ComfyUI API 호출 시 사용할 기본 하이퍼파라미터를 정의합니다.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="comfyPositive">기본 프롬프트</Label>
                  <Textarea
                    id="comfyPositive"
                    value={comfyConfig.positivePrompt || ''}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        positivePrompt: e.target.value,
                      })
                    }
                    placeholder="이미지 생성 시 기본으로 사용할 포지티브 프롬프트"
                    className="min-h-[100px]"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comfyNegative">네거티브 프롬프트</Label>
                  <Textarea
                    id="comfyNegative"
                    value={comfyConfig.negativePrompt || ''}
                    onChange={(e) =>
                      setComfyConfig({
                        ...comfyConfig,
                        negativePrompt: e.target.value,
                      })
                    }
                    placeholder="불필요한 요소를 제거하기 위한 네거티브 프롬프트"
                    className="min-h-[100px]"
                  />
                </div>
              </div>
            </div>

            {comfyMessage && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  comfyMessage.type === 'success'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {comfyMessage.text}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={handleTestComfyConnection}
                disabled={!comfyConfig.httpUrl.trim() || isTestingComfy || !comfyConfig.enabled}
              >
                {isTestingComfy ? '테스트 중...' : '연결 테스트'}
              </Button>
              <Button onClick={handleComfySave} disabled={isComfySaving || (comfyConfig.enabled && !comfyConfig.httpUrl.trim())}>
                {isComfySaving ? '저장 중...' : '저장'}
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'mcp' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">MCP 서버 추가</h3>
              <MCPServerConfigComponent
                onAdd={() => {
                  setMcpRefreshKey((prev) => prev + 1);
                }}
              />
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-4">등록된 MCP 서버</h3>
              <MCPServerList
                key={mcpRefreshKey}
                onRefresh={() => {
                  setMcpRefreshKey((prev) => prev + 1);
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'github' && (
          <GitHubOAuthSettings
            config={githubConfig}
            onSave={async (newConfig) => {
              setGithubConfig(newConfig);
              let saved = false;
              if (isElectron() && window.electronAPI) {
                saved = await persistAppConfig({ github: newConfig });
              }
              if (!saved) {
                const currentAppConfig = localStorage.getItem('sepilot_app_config');
                const appConfig = currentAppConfig ? JSON.parse(currentAppConfig) : {};
                appConfig.github = newConfig;
                localStorage.setItem('sepilot_app_config', JSON.stringify(appConfig));
              }
            }}
          />
        )}

        {activeTab === 'backup' && (
          <BackupRestoreSettings />
        )}
      </DialogContent>
    </Dialog>
  );
}
