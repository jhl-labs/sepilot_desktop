'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { AppConfig, ComfyUIConfig, LLMConfig, NetworkConfig, QuickInputConfig } from '@/types';
import { initializeLLMClient } from '@/lib/llm/client';
import { VectorDBSettings } from '@/components/rag/VectorDBSettings';
import { VectorDBConfig, EmbeddingConfig } from '@/lib/vectordb/types';
import { initializeVectorDB } from '@/lib/vectordb/client';
import { initializeEmbedding } from '@/lib/vectordb/embeddings/client';
import { isElectron } from '@/lib/platform';
import { configureWebLLMClient } from '@/lib/llm/web-client';
import { GitHubOAuthSettings } from '@/components/settings/GitHubOAuthSettings';
import { GitHubOAuthConfig } from '@/types';
import { BackupRestoreSettings } from '@/components/settings/BackupRestoreSettings';
import { LLMSettingsTab } from './LLMSettingsTab';
import { NetworkSettingsTab } from './NetworkSettingsTab';
import { ComfyUISettingsTab } from './ComfyUISettingsTab';
import { MCPSettingsTab } from './MCPSettingsTab';
import { QuickInputSettingsTab } from './QuickInputSettingsTab';
import {
  createDefaultLLMConfig,
  createDefaultNetworkConfig,
  createDefaultComfyUIConfig,
  mergeLLMConfig,
  mergeNetworkConfig,
  mergeComfyConfig,
} from './settingsUtils';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createDefaultQuickInputConfig = (): QuickInputConfig => ({
  quickInputShortcut: 'CommandOrControl+Shift+Space',
  quickQuestions: [],
});

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<'llm' | 'network' | 'vectordb' | 'comfyui' | 'mcp' | 'github' | 'backup' | 'quickinput'>('llm');

  const [config, setConfig] = useState<LLMConfig>(createDefaultLLMConfig());
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>(createDefaultNetworkConfig());
  const [githubConfig, setGithubConfig] = useState<GitHubOAuthConfig | null>(null);
  const [quickInputConfig, setQuickInputConfig] = useState<QuickInputConfig>(createDefaultQuickInputConfig());

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isComfySaving, setIsComfySaving] = useState(false);
  const [comfyMessage, setComfyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // VectorDB & Embedding 설정 상태
  const [vectorDBConfig, setVectorDBConfig] = useState<VectorDBConfig | null>(null);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig | null>(null);
  const [comfyConfig, setComfyConfig] = useState<ComfyUIConfig>(createDefaultComfyUIConfig());
  const [appConfigSnapshot, setAppConfigSnapshot] = useState<AppConfig | null>(null);

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
              embedding: result.data.embedding,
              comfyUI: result.data.comfyUI ? mergeComfyConfig(result.data.comfyUI) : undefined,
              github: result.data.github,
              quickInput: result.data.quickInput ?? createDefaultQuickInputConfig(),
            };
            setAppConfigSnapshot(normalizedConfig);
            setConfig(normalizedConfig.llm);
            setNetworkConfig(normalizedConfig.network ?? createDefaultNetworkConfig());
            setComfyConfig(normalizedConfig.comfyUI ?? createDefaultComfyUIConfig());
            setGithubConfig(normalizedConfig.github ?? null);
            setQuickInputConfig(normalizedConfig.quickInput ?? createDefaultQuickInputConfig());

            // VectorDB 설정 로드 (DB에서)
            if (result.data.vectorDB) {
              setVectorDBConfig(result.data.vectorDB);

              // VectorDB 자동 초기화
              try {
                await initializeVectorDB(result.data.vectorDB);
                console.log('VectorDB auto-initialized from DB');
              } catch (error) {
                console.error('Failed to auto-initialize VectorDB:', error);
              }
            }

            // Embedding 설정 로드 (DB에서)
            if (result.data.embedding) {
              setEmbeddingConfig(result.data.embedding);

              // Embedding 자동 초기화
              try {
                initializeEmbedding(result.data.embedding);
                console.log('Embedding auto-initialized from DB');
              } catch (error) {
                console.error('Failed to auto-initialize Embedding:', error);
              }
            }
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

          const savedQuickInputConfig = localStorage.getItem('sepilot_quickinput_config');
          if (savedQuickInputConfig) {
            setQuickInputConfig(JSON.parse(savedQuickInputConfig));
          } else {
            setQuickInputConfig(createDefaultQuickInputConfig());
          }

          // VectorDB 설정 로드 및 초기화 (Web 환경에서만, Electron은 위에서 DB에서 로드함)
          const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
          if (savedVectorDBConfig) {
            const parsedVectorDBConfig = JSON.parse(savedVectorDBConfig);
            setVectorDBConfig(parsedVectorDBConfig);

            // SQLite-vec는 브라우저에서 건너뛰기
            if (parsedVectorDBConfig.type === 'sqlite-vec') {
              console.log('Skipping SQLite-vec in browser environment');
            } else {
              // VectorDB 자동 초기화
              try {
                await initializeVectorDB(parsedVectorDBConfig);
                console.log('VectorDB auto-initialized from localStorage');
              } catch (error) {
                console.error('Failed to auto-initialize VectorDB:', error);
              }
            }
          }

          // Web 환경: Embedding 설정 로드 및 초기화 (localStorage에서)
          const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');
          if (savedEmbeddingConfig) {
            const parsedEmbeddingConfig = JSON.parse(savedEmbeddingConfig);
            setEmbeddingConfig(parsedEmbeddingConfig);

            // Embedding 자동 초기화
            try {
              initializeEmbedding(parsedEmbeddingConfig);
              console.log('Embedding auto-initialized from localStorage');
            } catch (error) {
              console.error('Failed to auto-initialize Embedding:', error);
            }
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

  const persistAppConfig = async (partial: Partial<AppConfig>): Promise<AppConfig | null> => {
    if (typeof window === 'undefined' || !isElectron() || !window.electronAPI) {
      return null;
    }

    const merged: AppConfig = {
      llm: partial.llm ?? appConfigSnapshot?.llm ?? mergeLLMConfig(),
      network: partial.network ?? appConfigSnapshot?.network ?? mergeNetworkConfig(),
      vectorDB: partial.vectorDB ?? appConfigSnapshot?.vectorDB,
      embedding: partial.embedding ?? appConfigSnapshot?.embedding,
      mcp: partial.mcp ?? appConfigSnapshot?.mcp ?? [],
      comfyUI: partial.comfyUI ?? appConfigSnapshot?.comfyUI,
      github: partial.github ?? appConfigSnapshot?.github,
      quickInput: partial.quickInput ?? appConfigSnapshot?.quickInput,
    };

    const result = await window.electronAPI.config.save(merged);
    if (result.success) {
      setAppConfigSnapshot(merged);
      return merged;
    } else {
      console.error('Failed to save config to DB:', result.error);
      return null;
    }
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
      let savedConfig: AppConfig | null = null;
      if (isElectron() && window.electronAPI) {
        try {
          savedConfig = await persistAppConfig({ llm: config, network: networkConfig });
          if (savedConfig) {
            // Initialize Main Process LLM client
            await window.electronAPI.llm.init(savedConfig);
          }
        } catch (error) {
          console.error('Error saving config to DB:', error);
        }
      }

      // Fallback to localStorage if not saved
      if (!savedConfig) {
        // Web or Electron DB save failed: localStorage에 저장
        localStorage.setItem('sepilot_llm_config', JSON.stringify(config));
        localStorage.setItem('sepilot_network_config', JSON.stringify(networkConfig));
      }

      // Initialize Renderer Process LLM client (for both Electron and Web)
      try {
        if (isElectron() && typeof initializeLLMClient !== 'undefined') {
          initializeLLMClient(config);
        } else {
          configureWebLLMClient(config);
        }
      } catch (error) {
        console.error('Failed to initialize LLM client:', error);
      }

      // Notify other components about config update
      window.dispatchEvent(new CustomEvent('sepilot:config-updated', {
        detail: { llm: config, network: networkConfig }
      }));

      setMessage({ type: 'success', text: '설정이 저장되었습니다!' });
    } catch (error: any) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: error.message || '설정 저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleNetworkSave = async () => {
    setIsSaving(true);
    setMessage(null);
    try {
      let savedConfig: AppConfig | null = null;
      if (isElectron() && window.electronAPI) {
        savedConfig = await persistAppConfig({ network: networkConfig });
        // Reinitialize Main Process LLM client with updated network config
        if (savedConfig && config && config.apiKey) {
          try {
            await window.electronAPI.llm.init(savedConfig);
          } catch (error) {
            console.error('Failed to reinitialize LLM client:', error);
          }
        }
      }
      if (!savedConfig) {
        localStorage.setItem('sepilot_network_config', JSON.stringify(networkConfig));
      }

      // Reinitialize Renderer Process LLM client with updated network config
      if (config && config.apiKey) {
        try {
          if (isElectron() && typeof initializeLLMClient !== 'undefined') {
            initializeLLMClient(config);
          } else {
            configureWebLLMClient(config);
          }
        } catch (error) {
          console.error('Failed to initialize LLM client:', error);
        }
      }

      // Notify other components about network config update
      window.dispatchEvent(new CustomEvent('sepilot:config-updated', {
        detail: { network: networkConfig }
      }));

      setMessage({ type: 'success', text: '네트워크 설정이 저장되었습니다!' });
    } catch (error: any) {
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

      let savedConfig: AppConfig | null = null;
      if (isElectron() && window.electronAPI) {
        try {
          savedConfig = await persistAppConfig({ comfyUI: comfyConfig });
        } catch (error) {
          console.error('Error saving ComfyUI config to DB:', error);
        }
      }

      if (!savedConfig) {
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

  const handleQuickInputSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      // Validation
      if (!quickInputConfig.quickInputShortcut.trim()) {
        setMessage({ type: 'error', text: 'Quick Input 단축키를 입력해주세요.' });
        setIsSaving(false);
        return;
      }

      // Validate Quick Questions
      for (const question of quickInputConfig.quickQuestions) {
        if (!question.name.trim()) {
          setMessage({ type: 'error', text: 'Quick Question의 이름을 입력해주세요.' });
          setIsSaving(false);
          return;
        }
        if (!question.shortcut.trim()) {
          setMessage({ type: 'error', text: 'Quick Question의 단축키를 입력해주세요.' });
          setIsSaving(false);
          return;
        }
        if (!question.prompt.trim()) {
          setMessage({ type: 'error', text: 'Quick Question의 프롬프트를 입력해주세요.' });
          setIsSaving(false);
          return;
        }
      }

      let savedConfig: AppConfig | null = null;
      if (isElectron() && window.electronAPI) {
        try {
          savedConfig = await persistAppConfig({ quickInput: quickInputConfig });
        } catch (error) {
          console.error('Error saving QuickInput config to DB:', error);
        }
      }

      if (!savedConfig) {
        localStorage.setItem('sepilot_quickinput_config', JSON.stringify(quickInputConfig));
      }

      // Notify other components about config update
      window.dispatchEvent(new CustomEvent('sepilot:config-updated', {
        detail: { quickInput: quickInputConfig }
      }));

      setMessage({ type: 'success', text: 'Quick Input 설정이 저장되었습니다!' });
    } catch (error: any) {
      console.error('Failed to save QuickInput config:', error);
      setMessage({
        type: 'error',
        text: error.message || 'Quick Input 설정 저장에 실패했습니다.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleVectorDBSave = async (
    vectorDBConfig: VectorDBConfig,
    embeddingConfig: EmbeddingConfig
  ) => {
    try {
      // Network Config를 EmbeddingConfig에 포함 (customHeaders 제외 - LLM 전용)
      const { customHeaders, ...networkConfigWithoutCustomHeaders } = networkConfig;
      const embeddingConfigWithNetwork = {
        ...embeddingConfig,
        networkConfig: networkConfigWithoutCustomHeaders,
      };

      console.log('[SettingsDialog] Saving embedding config with model:', embeddingConfig.model, 'networkConfig:', !!networkConfig);

      // Save to database or localStorage (LLM 설정과 동일한 방식)
      let savedConfig: AppConfig | null = null;
      if (isElectron() && window.electronAPI) {
        try {
          savedConfig = await persistAppConfig({
            vectorDB: vectorDBConfig,
            embedding: embeddingConfigWithNetwork,
          });
          console.log('[SettingsDialog] Saved to DB successfully');
        } catch (error) {
          console.error('Error saving vectorDB config to DB:', error);
        }
      }

      // Always save to localStorage (for DocumentsPage and other components)
      console.log('[SettingsDialog] Saving to localStorage:', {
        vectorDB: vectorDBConfig,
        embedding: embeddingConfigWithNetwork,
      });
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
          // Electron 환경: VectorDB 초기화
          await initializeVectorDB(vectorDBConfig);
          console.log('SQLite-vec initialized in Electron environment');
        } else {
          // 브라우저 환경: 설정만 저장, 초기화는 건너뛰기
          console.log('브라우저 환경에서는 SQLite-vec를 사용할 수 없습니다. 설정만 저장됩니다.');
        }
      } else {
        // OpenSearch, Elasticsearch, pgvector 등은 브라우저에서도 초기화 가능
        await initializeVectorDB(vectorDBConfig);
      }

      // Notify other components about VectorDB config update
      window.dispatchEvent(new CustomEvent('sepilot:config-updated', {
        detail: { vectorDB: vectorDBConfig, embedding: embeddingConfigWithNetwork }
      }));

      console.log('VectorDB and Embedding configuration saved and initialized successfully');
    } catch (error: any) {
      console.error('Failed to save VectorDB config:', error);
      throw error;
    }
  };

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
          <button
            onClick={() => setActiveTab('quickinput')}
            className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === 'quickinput'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Quick Input
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'llm' && (
          <LLMSettingsTab
            config={config}
            setConfig={setConfig}
            networkConfig={networkConfig}
            onSave={handleSave}
            isSaving={isSaving}
            message={message}
          />
        )}

        {activeTab === 'network' && (
          <NetworkSettingsTab
            networkConfig={networkConfig}
            setNetworkConfig={setNetworkConfig}
            onSave={handleNetworkSave}
            isSaving={isSaving}
            message={message}
          />
        )}

        {activeTab === 'vectordb' && (
          <VectorDBSettings
            onSave={handleVectorDBSave}
            initialVectorDBConfig={vectorDBConfig || undefined}
            initialEmbeddingConfig={embeddingConfig || undefined}
          />
        )}

        {activeTab === 'comfyui' && (
          <ComfyUISettingsTab
            comfyConfig={comfyConfig}
            setComfyConfig={setComfyConfig}
            networkConfig={networkConfig}
            onSave={handleComfySave}
            isSaving={isComfySaving}
            message={comfyMessage}
            setMessage={setComfyMessage}
          />
        )}

        {activeTab === 'mcp' && (
          <MCPSettingsTab />
        )}

        {activeTab === 'github' && (
          <GitHubOAuthSettings
            config={githubConfig}
            onSave={async (newConfig) => {
              setGithubConfig(newConfig);
              let savedConfig: AppConfig | null = null;
              if (isElectron() && window.electronAPI) {
                savedConfig = await persistAppConfig({ github: newConfig });
              }
              if (!savedConfig) {
                const currentAppConfig = localStorage.getItem('sepilot_app_config');
                const appConfig = currentAppConfig ? JSON.parse(currentAppConfig) : {};
                appConfig.github = newConfig;
                localStorage.setItem('sepilot_app_config', JSON.stringify(appConfig));
              }

              // Notify other components about GitHub config update
              window.dispatchEvent(new CustomEvent('sepilot:config-updated', {
                detail: { github: newConfig }
              }));
            }}
          />
        )}

        {activeTab === 'backup' && (
          <BackupRestoreSettings />
        )}

        {activeTab === 'quickinput' && (
          <QuickInputSettingsTab
            config={quickInputConfig}
            setConfig={setQuickInputConfig}
            onSave={handleQuickInputSave}
            isSaving={isSaving}
            message={message}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
