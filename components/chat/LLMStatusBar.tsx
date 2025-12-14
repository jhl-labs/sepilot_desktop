'use client';

import { useState, useMemo, useEffect } from 'react';
import { Minimize2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { LLMConfig, Message, LLMConfigV2, ModelConfig } from '@/types';
import { calculateContextUsage, formatTokens } from '@/lib/utils/token-counter';
import { isLLMConfigV2, convertV2ToV1 } from '@/lib/config/llm-config-migration';
import { isElectron } from '@/lib/platform';
import { initializeLLMClient } from '@/lib/llm/client';

export interface ToolInfo {
  name: string;
  description: string;
  serverName: string;
}

interface LLMStatusBarProps {
  isStreaming: boolean;
  llmConfig: LLMConfig | null;
  messages: Message[];
  input: string;
  mounted: boolean;
  tools?: ToolInfo[];
  onCompact?: () => void;
  onConfigUpdate?: (config: LLMConfig) => void;
}

export function LLMStatusBar({
  isStreaming,
  llmConfig,
  messages,
  input,
  mounted,
  tools = [],
  onCompact,
  onConfigUpdate,
}: LLMStatusBarProps) {
  const [editingField, setEditingField] = useState<'maxTokens' | 'temperature' | null>(null);
  const [editValue, setEditValue] = useState('');
  const [availableModels, setAvailableModels] = useState<ModelConfig[]>([]);
  const [modelSelectOpen, setModelSelectOpen] = useState(false);
  const [llmConfigV2, setLlmConfigV2] = useState<LLMConfigV2 | null>(null);

  // Group tools by server
  const groupedTools = useMemo(() => {
    const groups: Record<string, ToolInfo[]> = {};
    tools.forEach((tool) => {
      if (!groups[tool.serverName]) {
        groups[tool.serverName] = [];
      }
      groups[tool.serverName].push(tool);
    });
    return groups;
  }, [tools]);

  // Load LLMConfigV2 to get base models
  useEffect(() => {
    const loadConfigV2 = async () => {
      if (!isElectron() || !window.electronAPI) {
        return;
      }

      try {
        const result = await window.electronAPI.config.load();
        if (result.success && result.data?.llm) {
          if (isLLMConfigV2(result.data.llm)) {
            setLlmConfigV2(result.data.llm);
            // Load base models (models with 'base' tag)
            const baseModels = result.data.llm.models.filter((m) => m.tags.includes('base'));
            console.log('[LLMStatusBar] Loaded base models:', baseModels);
            setAvailableModels(baseModels);

            // If no base models but we have models, show all models as fallback
            if (baseModels.length === 0 && result.data.llm.models.length > 0) {
              console.warn('[LLMStatusBar] No base models found, showing all models');
              setAvailableModels(result.data.llm.models);
            }
          } else {
            // Fallback: If using LLMConfig (v1), create a dummy model entry
            console.log('[LLMStatusBar] Using LLMConfig (v1), creating fallback model');
            if (llmConfig) {
              setAvailableModels([
                {
                  id: 'legacy-model',
                  connectionId: 'legacy-connection',
                  modelId: llmConfig.model,
                  tags: ['base'],
                  temperature: llmConfig.temperature,
                  maxTokens: llmConfig.maxTokens,
                },
              ]);
            }
          }
        } else {
          console.warn('[LLMStatusBar] Config load failed or no llm config');
          // Fallback: use current model
          if (llmConfig) {
            setAvailableModels([
              {
                id: 'legacy-model',
                connectionId: 'legacy-connection',
                modelId: llmConfig.model,
                tags: ['base'],
                temperature: llmConfig.temperature,
                maxTokens: llmConfig.maxTokens,
              },
            ]);
          }
        }
      } catch (error) {
        console.error('[LLMStatusBar] Failed to load LLMConfigV2:', error);
        // Fallback: If error, use current model
        if (llmConfig) {
          setAvailableModels([
            {
              id: 'legacy-model',
              connectionId: 'legacy-connection',
              modelId: llmConfig.model,
              tags: ['base'],
              temperature: llmConfig.temperature,
              maxTokens: llmConfig.maxTokens,
            },
          ]);
        }
      }
    };

    if (llmConfig) {
      loadConfigV2();
    }
  }, [llmConfig?.model, llmConfig]); // Reload when model changes

  // Handle model change
  const handleModelChange = async (newModelId: string) => {
    if (!llmConfig || !onConfigUpdate) {
      return;
    }

    // If using legacy LLMConfig (v1), just update the model directly
    if (!llmConfigV2) {
      const updatedConfig: LLMConfig = {
        ...llmConfig,
        model: newModelId === 'legacy-model' ? llmConfig.model : newModelId,
      };
      onConfigUpdate(updatedConfig);
      return;
    }

    try {
      // Update activeBaseModelId in LLMConfigV2
      const updatedConfigV2: LLMConfigV2 = {
        ...llmConfigV2,
        activeBaseModelId: newModelId,
      };

      // Convert to LLMConfig for actual use
      const updatedConfig = convertV2ToV1(updatedConfigV2);

      // Save to storage FIRST (before calling onConfigUpdate)
      if (isElectron() && window.electronAPI) {
        const currentConfig = await window.electronAPI.config.load();
        if (currentConfig.success && currentConfig.data) {
          // Preserve all existing models and connections from current config
          const currentLLMConfig = currentConfig.data.llm;
          let preservedModels: ModelConfig[] = [];
          let preservedConnections = updatedConfigV2.connections;

          if (isLLMConfigV2(currentLLMConfig)) {
            // Preserve all existing models - CRITICAL: don't lose any models
            preservedModels = currentLLMConfig.models;
            preservedConnections = currentLLMConfig.connections;
            console.log(
              '[LLMStatusBar] Preserving',
              preservedModels.length,
              'models from current config'
            );
          } else {
            // Fallback: use models from updatedConfigV2
            preservedModels = updatedConfigV2.models;
            console.log(
              '[LLMStatusBar] Using models from updatedConfigV2:',
              preservedModels.length
            );
          }

          // Ensure we preserve all existing models when updating activeBaseModelId
          const mergedConfig = {
            ...currentConfig.data,
            llm: {
              ...updatedConfigV2,
              // CRITICAL: Preserve all models - don't lose any
              models: preservedModels,
              // Preserve connections
              connections: preservedConnections,
            } as any,
          };

          await window.electronAPI.config.save(mergedConfig);
          console.log(
            '[LLMStatusBar] Saved LLMConfigV2 with activeBaseModelId:',
            newModelId,
            'Models count:',
            preservedModels.length
          );

          // Re-initialize Main Process LLM client with new config
          console.log('[LLMStatusBar] Initializing backend with config:', {
            provider: updatedConfig.provider,
            model: updatedConfig.model,
            baseURL: updatedConfig.baseURL,
          });
          await window.electronAPI.llm.init({ ...mergedConfig, llm: updatedConfig });
          console.log(
            '[LLMStatusBar] Main Process LLM client re-initialized with model:',
            updatedConfig.model
          );

          // Verify the save by reloading
          const verifyConfig = await window.electronAPI.config.load();
          if (
            verifyConfig.success &&
            verifyConfig.data?.llm &&
            isLLMConfigV2(verifyConfig.data.llm)
          ) {
            console.log(
              '[LLMStatusBar] Verified saved config, activeBaseModelId:',
              verifyConfig.data.llm.activeBaseModelId,
              'Models count:',
              verifyConfig.data.llm.models.length
            );
            if (verifyConfig.data.llm.models.length !== preservedModels.length) {
              console.error(
                '[LLMStatusBar] WARNING: Model count mismatch! Expected:',
                preservedModels.length,
                'Got:',
                verifyConfig.data.llm.models.length
              );
            }
          }
        }
      }

      // Update local state
      setLlmConfigV2(updatedConfigV2);

      // Initialize LLM client with new config - MUST be done before onConfigUpdate
      initializeLLMClient(updatedConfig);
      console.log('[LLMStatusBar] LLMClient initialized with model:', updatedConfig.model);

      // Update parent component (InputBox) - this will trigger re-render
      // Note: InputBox's handleConfigUpdate will check if it's LLMConfigV2 and won't overwrite
      onConfigUpdate(updatedConfig);

      // Dispatch event to notify other components (including InputBox's event listener)
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', { detail: { llm: updatedConfig } })
      );

      console.log('[LLMStatusBar] Model changed to:', newModelId, 'Config:', updatedConfig);

      // Reload config to ensure state is in sync
      setTimeout(async () => {
        if (isElectron() && window.electronAPI) {
          const reloaded = await window.electronAPI.config.load();
          if (reloaded.success && reloaded.data?.llm && isLLMConfigV2(reloaded.data.llm)) {
            setLlmConfigV2(reloaded.data.llm);
            const baseModels = reloaded.data.llm.models.filter((m) => m.tags.includes('base'));
            setAvailableModels(baseModels);
            console.log(
              '[LLMStatusBar] Reloaded config, activeBaseModelId:',
              reloaded.data.llm.activeBaseModelId
            );
          }
        }
      }, 100);
    } catch (error) {
      console.error('[LLMStatusBar] Failed to update model:', error);
    }
  };

  const contextUsage = useMemo(() => {
    if (!llmConfig) {
      return {
        used: 0,
        max: 0,
        percentage: 0,
      };
    }

    // tiktoken을 사용하여 정확한 토큰 수 계산
    // calculateContextUsage 내부에서 모델명을 통해 자동으로 모델별 컨텍스트 제한을 적용함
    return calculateContextUsage(messages, input, llmConfig.model);
  }, [messages, input, llmConfig]);

  // Start editing a field
  const startEditing = (field: 'maxTokens' | 'temperature') => {
    if (!llmConfig) {
      return;
    }
    setEditingField(field);
    setEditValue(
      field === 'maxTokens' ? String(llmConfig.maxTokens) : String(llmConfig.temperature)
    );
  };

  // Save edited field
  const saveEditedField = () => {
    if (!editingField || !llmConfig) {
      setEditingField(null);
      return;
    }

    let newValue: number;
    if (editingField === 'maxTokens') {
      newValue = parseInt(editValue, 10);
      if (isNaN(newValue) || newValue < 1) {
        setEditingField(null);
        return;
      }
    } else {
      newValue = parseFloat(editValue);
      if (isNaN(newValue) || newValue < 0 || newValue > 2) {
        setEditingField(null);
        return;
      }
    }

    const updatedConfig = {
      ...llmConfig,
      [editingField]: newValue,
    };

    setEditingField(null);
    onConfigUpdate?.(updatedConfig);
  };

  // Handle key press in edit input
  const handleEditKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEditedField();
    } else if (e.key === 'Escape') {
      setEditingField(null);
    }
  };

  return (
    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground/70">
      <div className="flex items-center gap-2">
        {isStreaming ? (
          <span className="text-primary animate-pulse">응답 생성 중... (Esc로 중지)</span>
        ) : llmConfig ? (
          <>
            <div className="flex items-center gap-1">
              <Select
                value={
                  llmConfigV2?.activeBaseModelId ||
                  (availableModels.length > 0 ? availableModels[0]?.id : '')
                }
                onValueChange={handleModelChange}
                open={modelSelectOpen}
                onOpenChange={setModelSelectOpen}
                disabled={isStreaming}
              >
                <SelectTrigger
                  className="h-auto w-auto border-none bg-transparent p-0 text-xs font-normal text-muted-foreground/70 hover:text-primary focus:ring-0 focus:ring-offset-0"
                  title={`Provider: ${llmConfig.provider} - 클릭하여 모델 변경`}
                >
                  <SelectValue>
                    {(() => {
                      if (llmConfigV2?.activeBaseModelId) {
                        const model = availableModels.find(
                          (m) => m.id === llmConfigV2.activeBaseModelId
                        );
                        return model?.displayName || model?.modelId || llmConfig.model;
                      }
                      if (availableModels.length > 0) {
                        const model = availableModels[0];
                        return model.displayName || model.modelId;
                      }
                      return llmConfig.model;
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {availableModels.length > 0 ? (
                    availableModels.map((model) => {
                      const connection = llmConfigV2?.connections.find(
                        (c) => c.id === model.connectionId
                      );
                      const displayName = model.displayName || model.modelId;
                      return (
                        <SelectItem key={model.id} value={model.id}>
                          <div className="flex flex-col">
                            <span>{displayName}</span>
                            {connection && (
                              <span className="text-[10px] text-muted-foreground">
                                {connection.name}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })
                  ) : (
                    <div className="px-2 py-4 text-xs text-muted-foreground">
                      <div className="mb-2">Base 모델이 설정되지 않았습니다.</div>
                      <div className="text-[10px]">
                        설정에서 Models 탭에서 base 태그가 있는 모델을 추가하세요.
                      </div>
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            <span className="text-muted-foreground/50">·</span>
            {editingField === 'maxTokens' ? (
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEditedField}
                onKeyDown={handleEditKeyDown}
                className="w-16 bg-transparent border-b border-primary outline-none text-center"
                autoFocus
                min={1}
              />
            ) : (
              <span
                onClick={() => startEditing('maxTokens')}
                className="cursor-pointer hover:text-primary transition-colors"
                title="클릭하여 수정 (최대 출력 토큰)"
              >
                max {llmConfig.maxTokens}
              </span>
            )}
            <span className="text-muted-foreground/50">·</span>
            {editingField === 'temperature' ? (
              <input
                type="number"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEditedField}
                onKeyDown={handleEditKeyDown}
                className="w-12 bg-transparent border-b border-primary outline-none text-center"
                autoFocus
                min={0}
                max={2}
                step={0.1}
              />
            ) : (
              <span
                onClick={() => startEditing('temperature')}
                className="cursor-pointer hover:text-primary transition-colors"
                title="클릭하여 수정 (Temperature: 0~2)"
              >
                temp {llmConfig.temperature}
              </span>
            )}
            {tools.length > 0 && (
              <>
                <span className="text-muted-foreground/50">·</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      className="flex items-center gap-1 cursor-pointer hover:text-primary transition-colors"
                      title="사용 가능한 툴 목록 보기"
                    >
                      <Wrench className="h-3 w-3" />
                      <span>{tools.length} tools</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-80 max-h-96 overflow-y-auto"
                    side="top"
                    align="start"
                  >
                    <div className="space-y-3">
                      <div className="font-semibold text-sm border-b pb-2">
                        사용 가능한 툴 ({tools.length}개)
                      </div>
                      {Object.entries(groupedTools).map(([serverName, serverTools]) => (
                        <div key={serverName} className="space-y-1">
                          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            {serverName === 'builtin' ? 'Built-in Tools' : serverName}
                            <span className="ml-1 text-muted-foreground/70">
                              ({serverTools.length})
                            </span>
                          </div>
                          <div className="space-y-1 pl-2">
                            {serverTools.map((tool) => (
                              <div
                                key={`${tool.serverName}-${tool.name}`}
                                className="text-xs py-1 border-l-2 border-muted pl-2"
                              >
                                <div className="font-mono font-medium">{tool.name}</div>
                                <div className="text-muted-foreground text-[10px] mt-0.5">
                                  {tool.description}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </>
            )}
          </>
        ) : (
          <span>모델 설정 필요</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`${contextUsage.percentage > 80 ? 'text-orange-500' : ''} ${contextUsage.percentage > 95 ? 'text-red-500' : ''}`}
          title={`컨텍스트 사용량: ${contextUsage.used.toLocaleString()} / ${contextUsage.max.toLocaleString()} 토큰 (추정)`}
        >
          {formatTokens(contextUsage.used)} / {formatTokens(contextUsage.max)}
        </span>
        {mounted && messages.length > 2 && onCompact && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={onCompact}
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1.5 text-xs"
                  disabled={isStreaming}
                >
                  <Minimize2 className="h-3 w-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p>컨텍스트 압축 (구현 예정)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
