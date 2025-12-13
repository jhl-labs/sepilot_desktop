import { logger } from '@/lib/utils/logger';
/**
 * useConfigLoader Hook
 *
 * LLM, ImageGen Config 로딩 관리
 */

import { useState, useEffect } from 'react';
import { isElectron } from '@/lib/platform';
import { initializeLLMClient } from '@/lib/llm/client';
import { initializeComfyUIClient } from '@/lib/comfyui/client';
import { configureWebLLMClient } from '@/lib/llm/web-client';
import { isLLMConfigV2, convertV2ToV1 } from '@/lib/config/llm-config-migration';
import type { LLMConfig, ImageGenConfig } from '@/types';

export function useConfigLoader() {
  const [llmConfig, setLlmConfig] = useState<LLMConfig | null>(null);
  const [imageGenConfig, setImageGenConfig] = useState<ImageGenConfig | null>(null);
  const [imageGenAvailable, setImageGenAvailable] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Load config on mount
  useEffect(() => {
    const loadConfig = async () => {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        if (isElectron() && window.electronAPI) {
          // Electron: Load from SQLite
          const result = await window.electronAPI.config.load();
          if (result.success && result.data) {
            // Initialize LLM client
            if (result.data.llm) {
              let llmCfg = result.data.llm;
              // Convert V2 to V1 if needed
              if (isLLMConfigV2(llmCfg)) {
                logger.info('[useConfigLoader] Converting V2 config to V1 for LLM client');
                llmCfg = convertV2ToV1(llmCfg);
              }
              initializeLLMClient(llmCfg);
              setLlmConfig(llmCfg);
            }

            // Initialize ImageGen (ComfyUI, NanoBanana, etc.)
            let imgGenCfg: ImageGenConfig | null = null;
            if (result.data.imageGen) {
              imgGenCfg = result.data.imageGen;
            } else if (result.data.comfyUI) {
              // Backward compatibility: migrate from old comfyUI config
              imgGenCfg = {
                provider: 'comfyui',
                comfyui: result.data.comfyUI,
              };
            }

            if (imgGenCfg) {
              // Initialize ComfyUI client if provider is comfyui
              if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
                initializeComfyUIClient(imgGenCfg.comfyui);
              }
              // Store ImageGen config
              setImageGenConfig(imgGenCfg);
              // Check availability based on provider
              let isAvailable = false;
              if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
                isAvailable = imgGenCfg.comfyui.enabled && !!imgGenCfg.comfyui.httpUrl;
              } else if (imgGenCfg.provider === 'nanobanana' && imgGenCfg.nanobanana) {
                isAvailable = imgGenCfg.nanobanana.enabled && !!imgGenCfg.nanobanana.apiKey;
              }
              setImageGenAvailable(isAvailable);
            } else {
              setImageGenAvailable(false);
              setImageGenConfig(null);
            }
          }
        } else {
          // Web: Load from localStorage
          const savedConfig = localStorage.getItem('sepilot_llm_config');
          if (savedConfig) {
            const config = JSON.parse(savedConfig);
            configureWebLLMClient(config);
            setLlmConfig(config);
          }

          // Also try to load ImageGen config from localStorage
          const savedImageGenConfig = localStorage.getItem('sepilot_imagegen_config');
          const savedComfyConfig = localStorage.getItem('sepilot_comfyui_config');

          let imgGenCfg: ImageGenConfig | null = null;
          if (savedImageGenConfig) {
            imgGenCfg = JSON.parse(savedImageGenConfig);
          } else if (savedComfyConfig) {
            // Backward compatibility
            const comfyConfig = JSON.parse(savedComfyConfig);
            imgGenCfg = {
              provider: 'comfyui',
              comfyui: comfyConfig,
            };
          }

          if (imgGenCfg) {
            // Initialize ComfyUI client if provider is comfyui
            if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
              initializeComfyUIClient(imgGenCfg.comfyui);
            }
            setImageGenConfig(imgGenCfg);
            // Check availability based on provider
            let isAvailable = false;
            if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
              isAvailable = imgGenCfg.comfyui.enabled && !!imgGenCfg.comfyui.httpUrl;
            } else if (imgGenCfg.provider === 'nanobanana' && imgGenCfg.nanobanana) {
              isAvailable = imgGenCfg.nanobanana.enabled && !!imgGenCfg.nanobanana.apiKey;
            }
            setImageGenAvailable(isAvailable);
          } else {
            setImageGenAvailable(false);
            setImageGenConfig(null);
          }
        }
      } catch (error) {
        console.error('Failed to load config:', error);
      }
    };

    loadConfig();

    // Listen for storage changes (when settings are updated)
    const handleStorageChange = (e: StorageEvent) => {
      if (
        (e.key === 'sepilot_imagegen_config' || e.key === 'sepilot_comfyui_config') &&
        e.newValue
      ) {
        try {
          let imgGenCfg: ImageGenConfig | null = null;
          if (e.key === 'sepilot_imagegen_config') {
            imgGenCfg = JSON.parse(e.newValue);
          } else if (e.key === 'sepilot_comfyui_config') {
            // Backward compatibility
            const comfyConfig = JSON.parse(e.newValue);
            imgGenCfg = {
              provider: 'comfyui',
              comfyui: comfyConfig,
            };
          }

          if (imgGenCfg) {
            if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
              initializeComfyUIClient(imgGenCfg.comfyui);
            }
            setImageGenConfig(imgGenCfg);
            let isAvailable = false;
            if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
              isAvailable = imgGenCfg.comfyui.enabled && !!imgGenCfg.comfyui.httpUrl;
            } else if (imgGenCfg.provider === 'nanobanana' && imgGenCfg.nanobanana) {
              isAvailable = imgGenCfg.nanobanana.enabled && !!imgGenCfg.nanobanana.apiKey;
            }
            setImageGenAvailable(isAvailable);
          }
        } catch (error) {
          console.error('Failed to parse ImageGen config from storage:', error);
        }
      }
    };

    // Custom event listener for config updates (Electron environment)
    const handleConfigUpdate = ((e: CustomEvent) => {
      const { imageGen, comfyUI, llm } = e.detail || {};

      // LLM config update
      if (llm) {
        setLlmConfig(llm);
        if (isElectron() && window.electronAPI) {
          initializeLLMClient(llm);
        } else {
          configureWebLLMClient(llm);
        }
      }

      // ImageGen config update
      let imgGenCfg: ImageGenConfig | null = null;
      if (imageGen) {
        imgGenCfg = imageGen;
      } else if (comfyUI) {
        // Backward compatibility
        imgGenCfg = {
          provider: 'comfyui',
          comfyui: comfyUI,
        };
      }

      if (imgGenCfg) {
        if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
          initializeComfyUIClient(imgGenCfg.comfyui);
        }
        setImageGenConfig(imgGenCfg);
        let isAvailable = false;
        if (imgGenCfg.provider === 'comfyui' && imgGenCfg.comfyui) {
          isAvailable = imgGenCfg.comfyui.enabled && !!imgGenCfg.comfyui.httpUrl;
        } else if (imgGenCfg.provider === 'nanobanana' && imgGenCfg.nanobanana) {
          isAvailable = imgGenCfg.nanobanana.enabled && !!imgGenCfg.nanobanana.apiKey;
        }
        setImageGenAvailable(isAvailable);
      }
    }) as EventListener;

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('sepilot:config-updated', handleConfigUpdate);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('sepilot:config-updated', handleConfigUpdate);
    };
  }, []);

  return {
    llmConfig,
    imageGenConfig,
    imageGenAvailable,
    mounted,
  };
}
