'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LLMConfig, VisionModelConfig, NetworkConfig } from '@/types';
import { RefreshCw } from 'lucide-react';
import { fetchAvailableModels, createDefaultVisionConfig } from './settingsUtils';

interface LLMSettingsTabProps {
  config: LLMConfig;
  setConfig: React.Dispatch<React.SetStateAction<LLMConfig>>;
  networkConfig: NetworkConfig;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function LLMSettingsTab({
  config,
  setConfig,
  networkConfig,
  onSave,
  isSaving,
  message,
}: LLMSettingsTabProps) {
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [visionModelOptions, setVisionModelOptions] = useState<string[]>([]);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isVisionModelLoading, setIsVisionModelLoading] = useState(false);
  const [modelFetchError, setModelFetchError] = useState<string | null>(null);
  const [visionModelFetchError, setVisionModelFetchError] = useState<string | null>(null);
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  const updateVisionConfig = (partial: Partial<VisionModelConfig>) => {
    setConfig((prev) => ({
      ...prev,
      vision: {
        ...(prev.vision ?? createDefaultVisionConfig()),
        ...partial,
      },
    }));
  };

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
        customHeaders: config.customHeaders,
        networkConfig,
      });
      setModelOptions(models);
    } catch (error: any) {
      setModelFetchError(error.message || '모델 정보를 불러오지 못했습니다.');
      setModelOptions([]);
    } finally {
      setIsModelLoading(false);
    }
  };

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
        customHeaders: config.customHeaders,
        networkConfig,
      });
      setVisionModelOptions(models);
    } catch (error: any) {
      setVisionModelFetchError(error.message || 'Vision 모델 정보를 불러오지 못했습니다.');
      setVisionModelOptions([]);
    } finally {
      setIsVisionModelLoading(false);
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
                LiteLLM + Ollama 비전 모델 조합에서는 스트리밍 파싱 오류가 발생할 수 있습니다. 기본값(비활성화) 권장.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Custom Headers for LLM API */}
      <div className="pt-6 border-t space-y-4">
        <div>
          <Label className="text-base font-semibold">커스텀 HTTP 헤더 (LLM API 전용)</Label>
          <p className="text-xs text-muted-foreground mt-1">
            LLM API 호출 시 전송할 커스텀 HTTP 헤더를 설정합니다. (다른 서비스에는 적용되지 않습니다)
          </p>
        </div>

        {/* Existing Headers */}
        {config.customHeaders && Object.keys(config.customHeaders).length > 0 && (
          <div className="space-y-2">
            {Object.entries(config.customHeaders).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 p-2 rounded-md bg-background border">
                <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                  <div className="font-mono text-xs break-all">{key}</div>
                  <div className="font-mono text-xs break-all text-muted-foreground">{value}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const newHeaders = { ...config.customHeaders };
                    delete newHeaders[key];
                    setConfig({ ...config, customHeaders: newHeaders });
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
                setConfig({
                  ...config,
                  customHeaders: {
                    ...config.customHeaders,
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
            예: X-Custom-Header, X-Request-ID 등 (Authorization은 자동으로 추가됩니다)
          </p>
        </div>
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
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
}
