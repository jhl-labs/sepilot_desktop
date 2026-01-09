'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AppConfig,
  ImageGenConfig,
  LLMConfig,
  LLMConfigV2,
  NetworkConfig,
  QuickInputConfig,
  GitHubOAuthConfig,
  GitHubSyncConfig,
  TeamDocsConfig,
  BetaConfig,
} from '@/types';
import { initializeLLMClient } from '@/lib/llm/client';
import { VectorDBSettings } from '@/components/rag/VectorDBSettings';
import { VectorDBConfig, EmbeddingConfig } from '@/lib/vectordb/types';
import { initializeVectorDB } from '@/lib/vectordb/client';
import { initializeEmbedding } from '@/lib/vectordb/embeddings/client';
import { isElectron } from '@/lib/platform';
import { configureWebLLMClient } from '@/lib/llm/web-client';
import { changeLanguage, SupportedLanguage, getI18nInstance } from '@/lib/i18n';
import { GitHubSyncSettings } from '@/components/settings/GitHubSyncSettings';
import { TeamDocsSettings } from '@/components/settings/TeamDocsSettings';
import { BackupRestoreSettings } from '@/components/settings/BackupRestoreSettings';
import { GeneralSettingsTab } from './GeneralSettingsTab';
import { LLMSettingsTab } from './LLMSettingsTab';
import { NetworkSettingsTab } from './NetworkSettingsTab';
import { ImageGenSettingsTab } from './ImageGenSettingsTab';
import { MCPSettingsTab } from './MCPSettingsTab';
import { QuickInputSettingsTab } from './QuickInputSettingsTab';
import { ExtensionManagerTab } from './ExtensionManagerTab';
import { SettingsSidebar, SettingSection } from './SettingsSidebar';
import { BetaSettingsTab } from './BetaSettingsTab';
import {
  createDefaultLLMConfig,
  createDefaultNetworkConfig,
  createDefaultImageGenConfig,
  mergeLLMConfig,
  mergeNetworkConfig,
  mergeComfyConfig,
  mergeImageGenConfig,
} from './settingsUtils';
import { migrateLLMConfig, convertV2ToV1, isLLMConfigV2 } from '@/lib/config/llm-config-migration';
import { SettingsJsonEditor } from './SettingsJsonEditor';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useExtensions } from '@/lib/extensions/use-extensions';

import { logger } from '@/lib/utils/logger';
interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const createDefaultQuickInputConfig = (): QuickInputConfig => ({
  quickInputShortcut: 'CommandOrControl+Shift+Space',
  quickQuestions: [],
});

const createDefaultBetaConfig = (): BetaConfig => ({
  enablePresentationMode: false,
});

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { t } = useTranslation();
  const { activeExtensions } = useExtensions();
  const [activeTab, setActiveTab] = useState<SettingSection>('general');
  const [viewMode, setViewMode] = useState<'ui' | 'json'>('ui');

  const [config, setConfig] = useState<LLMConfig>(createDefaultLLMConfig());
  const [configV2, setConfigV2] = useState<LLMConfigV2 | null>(null); // New V2 config
  const [networkConfig, setNetworkConfig] = useState<NetworkConfig>(createDefaultNetworkConfig());
  const [githubConfig, setGithubConfig] = useState<GitHubOAuthConfig | null>(null);
  const [githubSyncConfig, setGithubSyncConfig] = useState<GitHubSyncConfig | null>(null);
  const [teamDocsConfigs, setTeamDocsConfigs] = useState<TeamDocsConfig[]>([]);
  const [quickInputConfig, setQuickInputConfig] = useState<QuickInputConfig>(
    createDefaultQuickInputConfig()
  );
  const [betaConfig, setBetaConfig] = useState<BetaConfig>(createDefaultBetaConfig());
  const [generalConfig, setGeneralConfig] = useState<{ language: SupportedLanguage } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isImageGenSaving, setIsImageGenSaving] = useState(false);
  const [imageGenMessage, setImageGenMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // 탭 변경 시 메시지 초기화
  useEffect(() => {
    setMessage(null);
    setImageGenMessage(null);
  }, [activeTab]);

  // VectorDB & Embedding 설정 상태
  const [vectorDBConfig, setVectorDBConfig] = useState<VectorDBConfig | null>(null);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig | null>(null);
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenConfig>(
    createDefaultImageGenConfig()
  );
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

            // Migration: comfyUI -> imageGen
            let imageGenFromDB: ImageGenConfig | undefined;
            if (result.data.imageGen) {
              imageGenFromDB = mergeImageGenConfig(result.data.imageGen);
            } else if (result.data.comfyUI) {
              // Migrate from old comfyUI config to new imageGen config
              imageGenFromDB = {
                provider: 'comfyui',
                comfyui: mergeComfyConfig(result.data.comfyUI),
                nanobanana: createDefaultImageGenConfig().nanobanana,
              };
            }

            const normalizedConfig: AppConfig = {
              llm: llmConfig,
              network: mergeNetworkConfig(result.data.network),
              mcp: result.data.mcp ?? [],
              vectorDB: result.data.vectorDB,
              embedding: result.data.embedding,
              imageGen: imageGenFromDB,
              comfyUI: result.data.comfyUI ? mergeComfyConfig(result.data.comfyUI) : undefined,
              github: result.data.github,
              githubSync: result.data.githubSync,
              teamDocs: result.data.teamDocs ?? [],
              quickInput: result.data.quickInput ?? createDefaultQuickInputConfig(),
              beta: result.data.beta ?? createDefaultBetaConfig(),
            };
            setAppConfigSnapshot(normalizedConfig);
            setConfig(llmConfig);
            setConfigV2(llmConfigV2);
            setNetworkConfig(normalizedConfig.network ?? createDefaultNetworkConfig());
            setImageGenConfig(imageGenFromDB ?? createDefaultImageGenConfig());
            setGithubConfig(normalizedConfig.github ?? null);
            setGithubSyncConfig(normalizedConfig.githubSync ?? null);
            setTeamDocsConfigs(normalizedConfig.teamDocs ?? []);
            setQuickInputConfig(normalizedConfig.quickInput ?? createDefaultQuickInputConfig());
            setBetaConfig(normalizedConfig.beta ?? createDefaultBetaConfig());

            // General 설정 로드
            if (result.data.general?.language) {
              setGeneralConfig(result.data.general);
              changeLanguage(result.data.general.language);
            }

            // VectorDB 설정 로드 (DB에서)
            if (result.data.vectorDB) {
              setVectorDBConfig(result.data.vectorDB);

              // VectorDB 자동 초기화
              try {
                await initializeVectorDB(result.data.vectorDB);
                logger.info('VectorDB auto-initialized from DB');
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
                logger.info('Embedding auto-initialized from DB');
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

          const savedImageGenConfig = localStorage.getItem('sepilot_imagegen_config');
          const savedComfyConfig = localStorage.getItem('sepilot_comfyui_config');
          if (savedImageGenConfig) {
            setImageGenConfig(mergeImageGenConfig(JSON.parse(savedImageGenConfig)));
          } else if (savedComfyConfig) {
            // Backward compatibility: migrate from old comfyUI config
            const comfyConfig = JSON.parse(savedComfyConfig);
            setImageGenConfig({
              provider: 'comfyui',
              comfyui: comfyConfig,
            });
          } else {
            setImageGenConfig(createDefaultImageGenConfig());
          }

          const savedQuickInputConfig = localStorage.getItem('sepilot_quickinput_config');
          if (savedQuickInputConfig) {
            setQuickInputConfig(JSON.parse(savedQuickInputConfig));
          } else {
            setQuickInputConfig(createDefaultQuickInputConfig());
          }

          const savedBetaConfig = localStorage.getItem('sepilot_beta_config');
          if (savedBetaConfig) {
            setBetaConfig(JSON.parse(savedBetaConfig));
          } else {
            setBetaConfig(createDefaultBetaConfig());
          }

          const savedGeneralConfig = localStorage.getItem('sepilot_general_config');
          if (savedGeneralConfig) {
            setGeneralConfig(JSON.parse(savedGeneralConfig));
          }

          // VectorDB 설정 로드 및 초기화 (Web 환경에서만, Electron은 위에서 DB에서 로드함)
          const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
          if (savedVectorDBConfig) {
            const parsedVectorDBConfig = JSON.parse(savedVectorDBConfig);
            setVectorDBConfig(parsedVectorDBConfig);

            // SQLite-vec는 브라우저에서 건너뛰기
            if (parsedVectorDBConfig.type === 'sqlite-vec') {
              logger.info('Skipping SQLite-vec in browser environment');
            } else {
              // VectorDB 자동 초기화
              try {
                await initializeVectorDB(parsedVectorDBConfig);
                logger.info('VectorDB auto-initialized from localStorage');
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
              logger.info('Embedding auto-initialized from localStorage');
            } catch (error) {
              console.error('Failed to auto-initialize Embedding:', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    loadConfig();

    if (open) {
      setMessage(null);
      setImageGenMessage(null);
    }
  }, [open]);

  const persistAppConfig = async (partial: Partial<AppConfig>): Promise<AppConfig | null> => {
    if (typeof window === 'undefined' || !isElectron() || !window.electronAPI) {
      return null;
    }

    // Load current config from DB to preserve existing settings
    const currentConfigResult = await window.electronAPI.config.load();
    const currentConfig =
      currentConfigResult.success && currentConfigResult.data
        ? currentConfigResult.data
        : (appConfigSnapshot ?? ({} as AppConfig));

    const currentLLMConfig = currentConfig.llm ?? appConfigSnapshot?.llm ?? mergeLLMConfig();

    // Merge LLM config properly - preserve models and connections if LLMConfigV2
    let mergedLLM: LLMConfig | LLMConfigV2;
    if (partial.llm) {
      if (isLLMConfigV2(partial.llm) && isLLMConfigV2(currentLLMConfig)) {
        // Both are V2: merge models and connections, but use new activeBaseModelId and other settings from partial
        // CRITICAL: Always preserve models and connections from current config (DB) to avoid data loss
        // Both are V2: merge models and connections
        // Priority: partial (UI) > DB models/connections
        // When saving from SettingsDialog, partial.llm is the full config state from the UI,
        // so we should use it to overwrite the DB state (allowing additions/deletions).

        const newModels = partial.llm.models;
        const newConnections = partial.llm.connections;

        mergedLLM = {
          ...partial.llm,
          models: newModels,
          connections: newConnections,
        };
        console.log('[persistAppConfig] Merged LLMConfigV2 (UI priority):');
        console.log('  - Saving models:', newModels.length);
        console.log('  - Saving connections:', newConnections.length);
        if (isLLMConfigV2(mergedLLM)) {
          console.log('  - Updated activeBaseModelId:', mergedLLM.activeBaseModelId);
        }
      } else if (isLLMConfigV2(partial.llm)) {
        // partial is V2 but current is V1: use partial as-is (migration case)
        mergedLLM = partial.llm;
        console.log(
          '[persistAppConfig] Using partial LLMConfigV2 (migration case), models:',
          partial.llm.models.length
        );
      } else {
        mergedLLM = partial.llm;
      }
    } else {
      mergedLLM = currentLLMConfig;
    }

    // Merge all config sections: partial (new) > currentConfig (DB) > appConfigSnapshot (fallback)
    const merged: AppConfig = {
      llm: mergedLLM as unknown as LLMConfig, // LLMConfigV2 is stored as llm in AppConfig
      network:
        partial.network ??
        currentConfig.network ??
        appConfigSnapshot?.network ??
        mergeNetworkConfig(),
      vectorDB: partial.vectorDB ?? currentConfig.vectorDB ?? appConfigSnapshot?.vectorDB,
      embedding: partial.embedding ?? currentConfig.embedding ?? appConfigSnapshot?.embedding,
      mcp: partial.mcp ?? currentConfig.mcp ?? appConfigSnapshot?.mcp ?? [],
      imageGen: partial.imageGen ?? currentConfig.imageGen ?? appConfigSnapshot?.imageGen,
      comfyUI: partial.comfyUI ?? currentConfig.comfyUI ?? appConfigSnapshot?.comfyUI,
      github: partial.github ?? currentConfig.github ?? appConfigSnapshot?.github,
      githubSync: partial.githubSync ?? currentConfig.githubSync ?? appConfigSnapshot?.githubSync,
      quickInput: partial.quickInput ?? currentConfig.quickInput ?? appConfigSnapshot?.quickInput,
      beta: partial.beta ?? currentConfig.beta ?? appConfigSnapshot?.beta,
      general: partial.general ?? currentConfig.general ?? appConfigSnapshot?.general,
      teamDocs: partial.teamDocs ?? currentConfig.teamDocs ?? appConfigSnapshot?.teamDocs ?? [],
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
        setMessage({ type: 'error', text: t('settings.notInitialized') });
        setIsSaving(false);
        return;
      }

      // Validate connections
      if (configV2.connections.length === 0) {
        setMessage({ type: 'error', text: t('settings.llm.validation.noConnection') });
        setIsSaving(false);
        return;
      }

      // Validate active base model
      if (!configV2.activeBaseModelId) {
        setMessage({ type: 'error', text: t('settings.llm.validation.noBaseModel') });
        setIsSaving(false);
        return;
      }

      // Convert V2 to V1 for backward compatibility
      let v1Config: LLMConfig;
      try {
        v1Config = convertV2ToV1(configV2);
      } catch (error) {
        console.error('[SettingsDialog] V2 to V1 conversion failed:', error);

        let userMessage = t('settings.conversionFailed');

        // Provide specific error messages
        if (
          error instanceof Error ? error.message : String(error)?.includes('No active base model')
        ) {
          userMessage = t('settings.llm.validation.noActiveBaseModel');
        } else if (error instanceof Error ? error.message : String(error)?.includes('connection')) {
          userMessage = t('settings.llm.validation.connectionNotExists');
        } else {
          userMessage = t('settings.conversionError', {
            error: error instanceof Error ? error.message : String(error),
          });
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
          // persistAppConfig will preserve existing models and connections from DB
          console.log(
            '[SettingsDialog] Saving configV2 with models:',
            configV2.models.length,
            'connections:',
            configV2.connections.length
          );
          savedConfig = await persistAppConfig({
            llm: configV2 as unknown as LLMConfig,
            network: networkConfig,
          });
          if (savedConfig) {
            // Verify models were preserved
            if (isLLMConfigV2(savedConfig.llm)) {
              console.log(
                '[SettingsDialog] Saved config has models:',
                savedConfig.llm.models.length,
                'connections:',
                savedConfig.llm.connections.length
              );
              if (savedConfig.llm.models.length < configV2.models.length) {
                console.warn(
                  '[SettingsDialog] WARNING: Some models may have been lost during save!'
                );
              }
            }
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

      setMessage({ type: 'success', text: t('settings.saved') });
    } catch (error) {
      console.error('Failed to save config:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error) || t('settings.saveFailed'),
      });
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

      setMessage({ type: 'success', text: t('settings.network.saved') });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error) || t('settings.saveFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleImageGenSave = async () => {
    setIsImageGenSaving(true);
    setImageGenMessage(null);

    try {
      // Validation based on selected provider
      if (imageGenConfig.provider === 'comfyui' && imageGenConfig.comfyui?.enabled) {
        if (!imageGenConfig.comfyui.httpUrl.trim()) {
          throw new Error(t('settings.imagegen.validation.httpUrlRequired'));
        }
        if (!imageGenConfig.comfyui.workflowId.trim()) {
          throw new Error(t('settings.imagegen.validation.workflowIdRequired'));
        }
      } else if (imageGenConfig.provider === 'nanobanana' && imageGenConfig.nanobanana?.enabled) {
        if (!imageGenConfig.nanobanana.apiKey.trim()) {
          throw new Error(t('settings.imagegen.validation.apiKeyRequired'));
        }
      }

      let savedConfig: AppConfig | null = null;
      if (isElectron() && window.electronAPI) {
        try {
          savedConfig = await persistAppConfig({ imageGen: imageGenConfig });
        } catch (error) {
          console.error('Error saving ImageGen config to DB:', error);
        }
      }

      if (!savedConfig) {
        localStorage.setItem('sepilot_imagegen_config', JSON.stringify(imageGenConfig));
      }

      // Notify InputBox and other components about config update
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { imageGen: imageGenConfig },
        })
      );

      setImageGenMessage({ type: 'success', text: t('settings.imagegen.saved') });
    } catch (error) {
      console.error('Failed to save ImageGen config:', error);
      setImageGenMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error) || t('settings.saveFailed'),
      });
    } finally {
      setIsImageGenSaving(false);
    }
  };

  const handleQuickInputSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      // Validation
      if (!quickInputConfig.quickInputShortcut.trim()) {
        setMessage({ type: 'error', text: t('settings.quickinput.validation.shortcutRequired') });
        setIsSaving(false);
        return;
      }

      // Validate Quick Questions
      const usedShortcuts = new Set<string>();
      usedShortcuts.add(quickInputConfig.quickInputShortcut);

      for (const question of quickInputConfig.quickQuestions) {
        if (!question.name.trim()) {
          setMessage({ type: 'error', text: t('settings.quickinput.validation.nameRequired') });
          setIsSaving(false);
          return;
        }
        if (!question.shortcut.trim()) {
          setMessage({
            type: 'error',
            text: t('settings.quickinput.validation.questionShortcutRequired'),
          });
          setIsSaving(false);
          return;
        }
        if (!question.prompt.trim()) {
          setMessage({ type: 'error', text: t('settings.quickinput.validation.promptRequired') });
          setIsSaving(false);
          return;
        }

        // Check for shortcut conflicts
        if (usedShortcuts.has(question.shortcut)) {
          setMessage({
            type: 'error',
            text: t('settings.quickinput.validation.duplicateShortcut', { name: question.name }),
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
          logger.info('[QuickInputSettings] Shortcuts reloaded');
        } catch (error) {
          console.error('[QuickInputSettings] Failed to reload shortcuts:', error);
        }
      }

      setMessage({ type: 'success', text: t('settings.quickinput.saved') });
    } catch (error) {
      console.error('Failed to save QuickInput config:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error) || t('settings.saveFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleBetaSave = async () => {
    setIsSaving(true);
    setMessage(null);

    try {
      if (isElectron() && window.electronAPI) {
        try {
          await persistAppConfig({ beta: betaConfig });
        } catch (error) {
          console.error('Error saving Beta config to DB:', error);
        }
      }

      // Always save to localStorage for Sidebar sync (Sidebar reads from localStorage)
      localStorage.setItem('sepilot_beta_config', JSON.stringify(betaConfig));

      // Notify other components about Beta config update
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { beta: betaConfig },
        })
      );

      setMessage({ type: 'success', text: t('settings.beta.saved') });
    } catch (error) {
      console.error('Failed to save Beta config:', error);
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : String(error) || t('settings.saveFailed'),
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

      logger.info(
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
          logger.info('[SettingsDialog] Saved to DB successfully');
        } catch (error) {
          console.error('Error saving vectorDB config to DB:', error);
        }
      }

      // Always save to localStorage (for DocumentsPage and other components)
      logger.info('[SettingsDialog] Saving to localStorage:', {
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
          logger.info('SQLite-vec initialized in Electron environment');
        } else {
          // 브라우저 환경: 설정만 저장, 초기화는 건너뛰기
          logger.info(t('settings.vectordb.hints.sqliteVec'));
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

      logger.info('VectorDB and Embedding configuration saved and initialized successfully');
    } catch (error) {
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
          llm: llmConfigV2 as unknown as LLMConfig,
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
        if (newConfig.imageGen) {
          localStorage.setItem('sepilot_imagegen_config', JSON.stringify(newConfig.imageGen));
        }
        if (newConfig.beta) {
          localStorage.setItem('sepilot_beta_config', JSON.stringify(newConfig.beta));
        }
      }

      // Update state
      setConfig(llmConfig);
      setConfigV2(llmConfigV2);
      setNetworkConfig(newConfig.network ?? createDefaultNetworkConfig());
      setImageGenConfig(newConfig.imageGen ?? createDefaultImageGenConfig());
      setGithubConfig(newConfig.github ?? null);
      setGithubSyncConfig(newConfig.githubSync ?? null);
      setQuickInputConfig(newConfig.quickInput ?? createDefaultQuickInputConfig());
      setBetaConfig(newConfig.beta ?? createDefaultBetaConfig());
      setGeneralConfig(newConfig.general ?? null);
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
    } catch (error) {
      console.error('Failed to save JSON config:', error);
      throw error;
    }
  };

  // Get current AppConfig for JSON editor
  const getCurrentAppConfig = (): AppConfig => {
    return {
      llm: (configV2 as unknown as LLMConfig) || config,
      network: networkConfig,
      mcp: appConfigSnapshot?.mcp ?? [],
      vectorDB: vectorDBConfig ?? undefined,
      embedding: embeddingConfig ?? undefined,
      imageGen: imageGenConfig,
      comfyUI: imageGenConfig?.comfyui ?? undefined, // Backward compatibility
      github: githubConfig ?? undefined,
      githubSync: githubSyncConfig ?? undefined,
      quickInput: quickInputConfig,
      beta: betaConfig,
      general: generalConfig ?? undefined,
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
            <DialogTitle>{t('settings.title')}</DialogTitle>
            <DialogDescription>{t('settings.description')}</DialogDescription>
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
                {activeTab === 'general' && (
                  <GeneralSettingsTab
                    onSave={async (lang) => {
                      if (lang) {
                        setGeneralConfig({ language: lang as SupportedLanguage });
                        // 언어 변경이 완료된 후에 메시지를 설정
                        await changeLanguage(lang as SupportedLanguage);
                        if (isElectron() && window.electronAPI) {
                          await persistAppConfig({
                            general: { language: lang as SupportedLanguage },
                          });
                        } else {
                          localStorage.setItem(
                            'sepilot_general_config',
                            JSON.stringify({ language: lang })
                          );
                        }
                      }
                      // 언어 변경 완료 후 메시지 설정 (올바른 언어로 번역됨)
                      // i18n 인스턴스에서 직접 번역하여 변경된 언어로 메시지 표시
                      const i18n = getI18nInstance();
                      const messageText =
                        i18n?.t('settings.general.saved') || t('settings.general.saved');
                      setMessage({ type: 'success', text: messageText });
                    }}
                    isSaving={isSaving}
                    message={message}
                  />
                )}
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
                    setNetworkConfig={setNetworkConfig}
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

                {activeTab === 'imagegen' && (
                  <ImageGenSettingsTab
                    imageGenConfig={imageGenConfig}
                    setImageGenConfig={setImageGenConfig}
                    networkConfig={networkConfig}
                    onSave={handleImageGenSave}
                    isSaving={isImageGenSaving}
                    message={imageGenMessage}
                    setMessage={setImageGenMessage}
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

                {activeTab === 'team-docs' && (
                  <TeamDocsSettings
                    teamDocs={teamDocsConfigs}
                    onSave={async (newConfigs) => {
                      setTeamDocsConfigs(newConfigs);
                      let savedConfig: AppConfig | null = null;
                      if (isElectron() && window.electronAPI) {
                        savedConfig = await persistAppConfig({ teamDocs: newConfigs });
                      }
                      if (!savedConfig) {
                        const currentAppConfig = localStorage.getItem('sepilot_app_config');
                        const appConfig = currentAppConfig ? JSON.parse(currentAppConfig) : {};
                        appConfig.teamDocs = newConfigs;
                        localStorage.setItem('sepilot_app_config', JSON.stringify(appConfig));
                      }

                      // Notify other components about Team Docs config update
                      window.dispatchEvent(
                        new CustomEvent('sepilot:config-updated', {
                          detail: { teamDocs: newConfigs },
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

                {activeTab === 'extensions' && (
                  <ExtensionManagerTab
                    onSectionChange={(section) => setActiveTab(section)}
                    message={message}
                  />
                )}

                {/* Extension-based Settings tabs (dynamically discovered) */}
                {activeExtensions
                  .filter((ext) => ext.manifest.settingsTab && ext.SettingsTabComponent)
                  .map((ext) => {
                    const settingsTab = ext.manifest.settingsTab!;
                    const SettingsTabComponent = ext.SettingsTabComponent!;

                    if (activeTab === settingsTab.id) {
                      return (
                        <SettingsTabComponent
                          key={ext.manifest.id}
                          onSave={() =>
                            setMessage({
                              type: 'success',
                              text: t(`settings.${settingsTab.id}.saved`),
                            })
                          }
                          isSaving={isSaving}
                          message={message}
                        />
                      );
                    }
                    return null;
                  })}

                {activeTab === 'beta' && (
                  <BetaSettingsTab
                    config={betaConfig}
                    setConfig={setBetaConfig}
                    onSave={handleBetaSave}
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
