'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AppConfig,
  ComfyUIConfig,
  LLMConfig,
  LLMConfigV2,
  NetworkConfig,
  QuickInputConfig,
  GitHubOAuthConfig,
} from '@/types';
import { initializeLLMClient } from '@/lib/llm/client';
import { VectorDBSettings } from '@/components/rag/VectorDBSettings';
import { VectorDBConfig, EmbeddingConfig } from '@/lib/vectordb/types';
import { initializeVectorDB } from '@/lib/vectordb/client';
import { initializeEmbedding } from '@/lib/vectordb/embeddings/client';
import { isElectron } from '@/lib/platform';
import { configureWebLLMClient } from '@/lib/llm/web-client';
import { GitHubSyncSettings } from '@/components/settings/GitHubSyncSettings';
import { GitHubSyncConfig } from '@/types';
import { BackupRestoreSettings } from '@/components/settings/BackupRestoreSettings';
import { LLMSettingsTab } from './LLMSettingsTab';
import { NetworkSettingsTab } from './NetworkSettingsTab';
import { ComfyUISettingsTab } from './ComfyUISettingsTab';
import { MCPSettingsTab } from './MCPSettingsTab';
import { QuickInputSettingsTab } from './QuickInputSettingsTab';
import { SettingsSidebar, SettingSection } from './SettingsSidebar';
import {
  createDefaultLLMConfig,
  createDefaultNetworkConfig,
  createDefaultComfyUIConfig,
  mergeLLMConfig,
  mergeNetworkConfig,
  mergeComfyConfig,
} from './settingsUtils';
import { migrateLLMConfig, convertV2ToV1, isLLMConfigV2 } from '@/lib/config/llm-config-migration';
import { SettingsJsonEditor } from './SettingsJsonEditor';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EditorSettingsTab } from './EditorSettingsTab';
import { BrowserSettingsTab } from './BrowserSettingsTab';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createDefaultQuickInputConfig = (): QuickInputConfig => ({
  quickInputShortcut: 'CommandOrControl+Shift+Space',
  quickQuestions: [],
});

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<SettingSection>('llm');
  const [viewMode, setViewMode] = useState<'ui' | 'json'>('ui');

  const [config, setConfig] = useState<LLMConfig>(createDefaultLLMConfig());
  const [configV2, setConfigV2] = useState<LLMConfigV2 | null>(null); // New V2 config
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>(createDefaultNetworkConfig());
  const [githubConfig, setGithubConfig] = useState<GitHubOAuthConfig | null>(null);
  const [githubSyncConfig, setGithubSyncConfig] = useState<GitHubSyncConfig | null>(null);
  const [quickInputConfig, setQuickInputConfig] = useState<QuickInputConfig>(
    createDefaultQuickInputConfig()
  );

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isComfySaving, setIsComfySaving] = useState(false);
  const [comfyMessage, setComfyMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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
            // Check if LLM config is V2
            let llmConfig: LLMConfig;
            let llmConfigV2: LLMConfigV2 | null = null;

            if (isLLMConfigV2(result.data.llm)) {
              // V2 config detected
              llmConfigV2 = result.data.llm as LLMConfigV2;
              llmConfig = convertV2ToV1(llmConfigV2);
            } else {
              // V1 config, migrate to V2
              llmConfig = mergeLLMConfig(result.data.llm);
              llmConfigV2 = migrateLLMConfig(llmConfig);
            }

            const normalizedConfig: AppConfig = {
              llm: llmConfig,
              network: mergeNetworkConfig(result.data.network),
              mcp: result.data.mcp ?? [],
              vectorDB: result.data.vectorDB,
              embedding: result.data.embedding,
              comfyUI: result.data.comfyUI ? mergeComfyConfig(result.data.comfyUI) : undefined,
              github: result.data.github,
              githubSync: result.data.githubSync,
              quickInput: result.data.quickInput ?? createDefaultQuickInputConfig(),
            };
            setAppConfigSnapshot(normalizedConfig);
            setConfig(llmConfig);
            setConfigV2(llmConfigV2);
            setNetworkConfig(normalizedConfig.network ?? createDefaultNetworkConfig());
            setComfyConfig(normalizedConfig.comfyUI ?? createDefaultComfyUIConfig());
            setGithubConfig(normalizedConfig.github ?? null);
            setGithubSyncConfig(normalizedConfig.githubSync ?? null);
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
      githubSync: partial.githubSync ?? appConfigSnapshot?.githubSync,
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
      // Validate V2 config
      if (!configV2) {
        setMessage({ type: 'error', text: '설정이 초기화되지 않았습니다.' });
        setIsSaving(false);
        return;
      }

      // Validate connections
      if (configV2.connections.length === 0) {
        setMessage({ type: 'error', text: '최소 하나의 Connection을 추가해주세요.' });
        setIsSaving(false);
        return;
      }

      // Validate active base model
      if (!configV2.activeBaseModelId) {
        setMessage({ type: 'error', text: '기본 대화용 모델을 선택해주세요.' });
        setIsSaving(false);
        return;
      }

      // Convert V2 to V1 for backward compatibility
      let v1Config: LLMConfig;
      try {
        v1Config = convertV2ToV1(configV2);
      } catch (error: any) {
        console.error('[SettingsDialog] V2 to V1 conversion failed:', error);

        let userMessage = '설정 변환에 실패했습니다.';

        // Provide specific error messages
        if (error.message?.includes('No active base model')) {
          userMessage =
            '기본 대화용 모델이 선택되지 않았습니다. Models 탭에서 base 태그가 있는 모델을 선택하고 "기본 모델로 사용" 버튼을 클릭해주세요.';
        } else if (error.message?.includes('connection')) {
          userMessage =
            '모델이 참조하는 Connection이 존재하지 않습니다. Connections 탭을 확인해주세요.';
        } else {
          userMessage = `설정 변환 오류: ${error.message}`;
        }

        setMessage({ type: 'error', text: userMessage });
        setIsSaving(false);
        return;
      }

      // Save to database or localStorage
      let savedConfig: AppConfig | null = null;
      if (isElectron() && window.electronAPI) {
        try {
          // Save V2 config to DB (V2 is the source of truth)
          savedConfig = await persistAppConfig({ llm: configV2 as any, network: networkConfig });
          if (savedConfig) {
            // Initialize Main Process LLM client with V1 config
            const configForInit = { ...savedConfig, llm: v1Config };
            await window.electronAPI.llm.init(configForInit);
          }
        } catch (error) {
          console.error('Error saving config to DB:', error);
        }
      }

      // Fallback to localStorage if not saved
      if (!savedConfig) {
        // Web or Electron DB save failed: localStorage에 저장
        localStorage.setItem('sepilot_llm_config', JSON.stringify(v1Config));
        localStorage.setItem('sepilot_llm_config_v2', JSON.stringify(configV2)); // Also save V2
        localStorage.setItem('sepilot_network_config', JSON.stringify(networkConfig));
      } else {
        // Also save V2 to localStorage for UI
        localStorage.setItem('sepilot_llm_config_v2', JSON.stringify(configV2));
      }

      // Initialize Renderer Process LLM client (for both Electron and Web)
      try {
        if (isElectron() && typeof initializeLLMClient !== 'undefined') {
          initializeLLMClient(v1Config);
        } else {
          configureWebLLMClient(v1Config);
        }
      } catch (error) {
        console.error('Failed to initialize LLM client:', error);
      }

      // Notify other components about config update
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { llm: v1Config, network: networkConfig },
        })
      );

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
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { network: networkConfig },
        })
      );

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
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { comfyUI: comfyConfig },
        })
      );

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
      const usedShortcuts = new Set<string>();
      usedShortcuts.add(quickInputConfig.quickInputShortcut);

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

        // Check for shortcut conflicts
        if (usedShortcuts.has(question.shortcut)) {
          setMessage({
            type: 'error',
            text: `"${question.name}"의 단축키가 다른 단축키와 중복됩니다.`,
          });
          setIsSaving(false);
          return;
        }
        usedShortcuts.add(question.shortcut);
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
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { quickInput: quickInputConfig },
        })
      );

      // Reload shortcuts in Main Process
      if (isElectron() && window.electronAPI) {
        try {
          await window.electronAPI.quickInput.reloadShortcuts();
          console.log('[QuickInputSettings] Shortcuts reloaded');
        } catch (error) {
          console.error('[QuickInputSettings] Failed to reload shortcuts:', error);
        }
      }

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
      const { customHeaders: _customHeaders, ...networkConfigWithoutCustomHeaders } = networkConfig;
      const embeddingConfigWithNetwork = {
        ...embeddingConfig,
        networkConfig: networkConfigWithoutCustomHeaders,
      };

      console.log(
        '[SettingsDialog] Saving embedding config with model:',
        embeddingConfig.model,
        'networkConfig:',
        !!networkConfig
      );

      // Save to database or localStorage (LLM 설정과 동일한 방식)
      if (isElectron() && window.electronAPI) {
        try {
          await persistAppConfig({
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
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { vectorDB: vectorDBConfig, embedding: embeddingConfigWithNetwork },
        })
      );

      console.log('VectorDB and Embedding configuration saved and initialized successfully');
    } catch (error: any) {
      console.error('Failed to save VectorDB config:', error);
      throw error;
    }
  };

  // JSON 모드에서 전체 설정 저장
  const handleJsonSave = async (newConfig: AppConfig) => {
    try {
      // Validate and migrate LLM config if needed
      let llmConfig: LLMConfig;
      let llmConfigV2: LLMConfigV2 | null = null;

      if (isLLMConfigV2(newConfig.llm)) {
        llmConfigV2 = newConfig.llm as LLMConfigV2;
        llmConfig = convertV2ToV1(llmConfigV2);
      } else {
        llmConfig = mergeLLMConfig(newConfig.llm);
        llmConfigV2 = migrateLLMConfig(llmConfig);
      }

      // Save to database or localStorage
      if (isElectron() && window.electronAPI) {
        const savedConfig = await persistAppConfig({
          ...newConfig,
          llm: llmConfigV2 as any,
        });
        if (savedConfig) {
          await window.electronAPI.llm.init({ ...savedConfig, llm: llmConfig });
        }
      } else {
        localStorage.setItem('sepilot_llm_config', JSON.stringify(llmConfig));
        localStorage.setItem('sepilot_llm_config_v2', JSON.stringify(llmConfigV2));
        localStorage.setItem('sepilot_network_config', JSON.stringify(newConfig.network));
        if (newConfig.comfyUI) {
          localStorage.setItem('sepilot_comfyui_config', JSON.stringify(newConfig.comfyUI));
        }
        if (newConfig.quickInput) {
          localStorage.setItem('sepilot_quickinput_config', JSON.stringify(newConfig.quickInput));
        }
        if (newConfig.vectorDB) {
          localStorage.setItem('sepilot_vectordb_config', JSON.stringify(newConfig.vectorDB));
        }
        if (newConfig.embedding) {
          localStorage.setItem('sepilot_embedding_config', JSON.stringify(newConfig.embedding));
        }
      }

      // Update state
      setConfig(llmConfig);
      setConfigV2(llmConfigV2);
      setNetworkConfig(newConfig.network ?? createDefaultNetworkConfig());
      setComfyConfig(newConfig.comfyUI ?? createDefaultComfyUIConfig());
      setGithubConfig(newConfig.github ?? null);
      setGithubSyncConfig(newConfig.githubSync ?? null);
      setQuickInputConfig(newConfig.quickInput ?? createDefaultQuickInputConfig());
      setVectorDBConfig(newConfig.vectorDB ?? null);
      setEmbeddingConfig(newConfig.embedding ?? null);
      setAppConfigSnapshot(newConfig);

      // Initialize clients
      if (isElectron() && typeof initializeLLMClient !== 'undefined') {
        initializeLLMClient(llmConfig);
      } else {
        configureWebLLMClient(llmConfig);
      }

      if (newConfig.embedding) {
        initializeEmbedding(newConfig.embedding);
      }

      if (newConfig.vectorDB) {
        if (newConfig.vectorDB.type !== 'sqlite-vec' || (isElectron() && window.electronAPI)) {
          await initializeVectorDB(newConfig.vectorDB);
        }
      }

      // Reload shortcuts if quickInput changed
      if (isElectron() && window.electronAPI && newConfig.quickInput) {
        await window.electronAPI.quickInput.reloadShortcuts();
      }

      // Notify other components
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: newConfig,
        })
      );
    } catch (error: any) {
      console.error('Failed to save JSON config:', error);
      throw error;
    }
  };

  // Get current AppConfig for JSON editor
  const getCurrentAppConfig = (): AppConfig => {
    return {
      llm: (configV2 as any) || config,
      network: networkConfig,
      mcp: appConfigSnapshot?.mcp ?? [],
      vectorDB: vectorDBConfig ?? undefined,
      embedding: embeddingConfig ?? undefined,
      comfyUI: comfyConfig,
      github: githubConfig ?? undefined,
      githubSync: githubSyncConfig ?? undefined,
      quickInput: quickInputConfig,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-6xl max-h-[90vh] p-0 gap-0"
        onClose={() => onOpenChange(false)}
      >
        <div className="px-6 pt-6 pb-3 border-b">
          <DialogHeader>
            <DialogTitle>설정</DialogTitle>
            <DialogDescription>LLM, VectorDB, MCP 등의 설정을 구성하세요.</DialogDescription>
          </DialogHeader>

          {/* UI/JSON Toggle Tabs (VSCode-style) */}
          <Tabs
            value={viewMode}
            onValueChange={(v) => setViewMode(v as 'ui' | 'json')}
            className="mt-4"
          >
            <TabsList className="grid w-[200px] grid-cols-2">
              <TabsTrigger value="ui">UI</TabsTrigger>
              <TabsTrigger value="json">JSON</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex h-[calc(90vh-9rem)] overflow-hidden">
          {viewMode === 'ui' ? (
            <>
              {/* Sidebar Navigation */}
              <SettingsSidebar
                activeSection={activeTab}
                onSectionChange={setActiveTab}
                className="flex-shrink-0 overflow-y-auto"
              />

              {/* Content Area */}
              <div className="flex-1 overflow-y-auto p-6">
                {activeTab === 'llm' && configV2 && (
                  <LLMSettingsTab
                    config={configV2}
                    setConfig={(update) => {
                      if (typeof update === 'function') {
                        setConfigV2((prev) => {
                          if (!prev) {
                            return prev;
                          }
                          const newV2 = update(prev);
                          // Also update V1 config for compatibility
                          try {
                            setConfig(convertV2ToV1(newV2));
                          } catch (err) {
                            console.error('Failed to convert V2 to V1:', err);
                          }
                          return newV2;
                        });
                      } else {
                        setConfigV2(update);
                        try {
                          setConfig(convertV2ToV1(update));
                        } catch (err) {
                          console.error('Failed to convert V2 to V1:', err);
                        }
                      }
                    }}
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

                {activeTab === 'mcp' && <MCPSettingsTab />}

                {activeTab === 'github' && (
                  <GitHubSyncSettings
                    config={githubSyncConfig}
                    onSave={async (newConfig) => {
                      setGithubSyncConfig(newConfig);
                      let savedConfig: AppConfig | null = null;
                      if (isElectron() && window.electronAPI) {
                        savedConfig = await persistAppConfig({ githubSync: newConfig });
                      }
                      if (!savedConfig) {
                        const currentAppConfig = localStorage.getItem('sepilot_app_config');
                        const appConfig = currentAppConfig ? JSON.parse(currentAppConfig) : {};
                        appConfig.githubSync = newConfig;
                        localStorage.setItem('sepilot_app_config', JSON.stringify(appConfig));
                      }

                      // Notify other components about GitHub Sync config update
                      window.dispatchEvent(
                        new CustomEvent('sepilot:config-updated', {
                          detail: { githubSync: newConfig },
                        })
                      );
                    }}
                  />
                )}

                {activeTab === 'backup' && <BackupRestoreSettings />}

                {activeTab === 'quickinput' && (
                  <QuickInputSettingsTab
                    config={quickInputConfig}
                    setConfig={setQuickInputConfig}
                    onSave={handleQuickInputSave}
                    isSaving={isSaving}
                    message={message}
                  />
                )}

                {activeTab === 'editor' && (
                  <EditorSettingsTab
                    onSave={() =>
                      setMessage({ type: 'success', text: 'Editor 설정이 저장되었습니다!' })
                    }
                    isSaving={isSaving}
                    message={message}
                  />
                )}

                {activeTab === 'browser' && (
                  <BrowserSettingsTab
                    onSave={() =>
                      setMessage({ type: 'success', text: 'Browser 설정이 저장되었습니다!' })
                    }
                    isSaving={isSaving}
                    message={message}
                  />
                )}
              </div>
            </>
          ) : (
            /* JSON Editor Mode */
            <div className="flex-1 p-6">
              <SettingsJsonEditor config={getCurrentAppConfig()} onSave={handleJsonSave} />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
