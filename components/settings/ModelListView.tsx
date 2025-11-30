'use client';

import { useState } from 'react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LLMConnection, ModelConfig, ModelRoleTag, NetworkConfig } from '@/types';
import { RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { fetchAvailableModels } from './settingsUtils';

interface ModelListViewProps {
  connections: LLMConnection[];
  models: ModelConfig[];
  onModelsChange: (models: ModelConfig[]) => void;
  activeBaseModelId?: string;
  activeVisionModelId?: string;
  activeAutocompleteModelId?: string;
  onActiveModelsChange: (baseId?: string, visionId?: string, autocompleteId?: string) => void;
  networkConfig: NetworkConfig;
  defaultTemperature: number;
  defaultMaxTokens: number;
}

interface AvailableModel {
  id: string;
  connectionId: string;
  modelId: string;
  connectionName: string;
}

export function ModelListView({
  connections,
  models,
  onModelsChange,
  activeBaseModelId,
  activeVisionModelId,
  activeAutocompleteModelId,
  onActiveModelsChange,
  networkConfig,
  defaultTemperature,
  defaultMaxTokens,
}: ModelListViewProps) {
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fetch models from all enabled connections
  const handleFetchAllModels = async () => {
    setIsLoadingModels(true);
    setLoadError(null);

    const allModels: AvailableModel[] = [];
    const errors: Array<{ connection: string; error: string }> = [];

    for (const connection of connections) {
      if (!connection.enabled) {
        continue;
      }

      try {
        const modelIds = await fetchAvailableModels({
          provider: connection.provider,
          baseURL: connection.baseURL,
          apiKey: connection.apiKey,
          customHeaders: connection.customHeaders,
          networkConfig,
        });

        modelIds.forEach((modelId) => {
          allModels.push({
            id: `${connection.id}-${modelId}`,
            connectionId: connection.id,
            modelId,
            connectionName: connection.name,
          });
        });
      } catch (error: any) {
        console.error(`Failed to fetch models from ${connection.name}:`, error);
        errors.push({
          connection: connection.name,
          error: error.message || '알 수 없는 오류',
        });
      }
    }

    setAvailableModels(allModels);
    setIsLoadingModels(false);

    if (errors.length > 0) {
      const errorMsg = errors
        .map((e) => `- ${e.connection}: ${e.error}`)
        .join('\n');
      setLoadError(`일부 Connection에서 모델을 가져오지 못했습니다:\n${errorMsg}`);
    } else if (allModels.length === 0) {
      setLoadError('활성화된 Connection에서 모델을 가져오지 못했습니다.');
    }
  };

  // Add model to configuration
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const handleAddModel = (availableModel: AvailableModel) => {
    const existingModel = models.find(
      (m) =>
        m.connectionId === availableModel.connectionId &&
        m.modelId === availableModel.modelId
    );

    if (existingModel) {
      setDuplicateError(`"${availableModel.modelId}"는 이미 추가되었습니다.`);
      setTimeout(() => setDuplicateError(null), 3000);
      return;
    }

    setDuplicateError(null);

    const newModel: ModelConfig = {
      id: `model-${nanoid()}`,
      connectionId: availableModel.connectionId,
      modelId: availableModel.modelId,
      tags: [],
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    };

    onModelsChange([...models, newModel]);
  };

  // Remove model from configuration
  const handleRemoveModel = (modelId: string) => {
    onModelsChange(models.filter((m) => m.id !== modelId));

    // Clear active selections if the removed model was active
    if (activeBaseModelId === modelId) {
      onActiveModelsChange(undefined, activeVisionModelId, activeAutocompleteModelId);
    }
    if (activeVisionModelId === modelId) {
      onActiveModelsChange(activeBaseModelId, undefined, activeAutocompleteModelId);
    }
    if (activeAutocompleteModelId === modelId) {
      onActiveModelsChange(activeBaseModelId, activeVisionModelId, undefined);
    }
  };

  // Toggle model tag
  const handleToggleTag = (modelId: string, tag: ModelRoleTag) => {
    onModelsChange(
      models.map((m) => {
        if (m.id !== modelId) {return m;}

        const tags = m.tags.includes(tag)
          ? m.tags.filter((t) => t !== tag)
          : [...m.tags, tag];

        return { ...m, tags };
      })
    );
  };

  // Update model configuration
  const handleUpdateModel = (modelId: string, updates: Partial<ModelConfig>) => {
    onModelsChange(
      models.map((m) => (m.id === modelId ? { ...m, ...updates } : m))
    );
  };

  // Set active model
  const handleSetActive = (modelId: string, role: ModelRoleTag) => {
    if (role === 'base') {
      onActiveModelsChange(modelId, activeVisionModelId, activeAutocompleteModelId);
    } else if (role === 'vision') {
      onActiveModelsChange(activeBaseModelId, modelId, activeAutocompleteModelId);
    } else if (role === 'autocomplete') {
      onActiveModelsChange(activeBaseModelId, activeVisionModelId, modelId);
    }
  };

  const getConnectionName = (connectionId: string) => {
    return connections.find((c) => c.id === connectionId)?.name || 'Unknown';
  };

  const isModelAdded = (availableModel: AvailableModel) => {
    return models.some(
      (m) =>
        m.connectionId === availableModel.connectionId &&
        m.modelId === availableModel.modelId
    );
  };

  return (
    <div className="space-y-6">
      {/* Model Discovery Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">사용 가능한 모델</h3>
            <p className="text-sm text-muted-foreground">
              활성화된 Connection에서 모델 목록을 가져와 추가할 수 있습니다.
            </p>
          </div>
          <Button
            onClick={handleFetchAllModels}
            disabled={isLoadingModels || connections.filter((c) => c.enabled).length === 0}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingModels ? 'animate-spin' : ''}`} />
            모델 목록 가져오기
          </Button>
        </div>

        {loadError && (
          <p className="text-sm text-destructive">{loadError}</p>
        )}

        {duplicateError && (
          <p className="text-sm text-destructive">{duplicateError}</p>
        )}

        {availableModels.length > 0 && (
          <div className="max-h-60 overflow-y-auto space-y-1 border rounded-lg p-2">
            {availableModels.map((availableModel) => (
              <div
                key={availableModel.id}
                className="flex items-center justify-between p-2 rounded hover:bg-muted"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium">{availableModel.modelId}</p>
                  <p className="text-xs text-muted-foreground">{availableModel.connectionName}</p>
                </div>
                <Button
                  size="sm"
                  variant={isModelAdded(availableModel) ? 'secondary' : 'default'}
                  onClick={() => handleAddModel(availableModel)}
                  disabled={isModelAdded(availableModel)}
                >
                  {isModelAdded(availableModel) ? '추가됨' : '추가'}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configured Models Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">구성된 모델</h3>
          <p className="text-sm text-muted-foreground">
            추가된 모델에 태그를 지정하고 세부 설정을 구성합니다.
          </p>
        </div>

        {models.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>구성된 모델이 없습니다.</p>
            <p className="text-sm">위에서 모델 목록을 가져와 추가하세요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {models.map((model) => (
              <div key={model.id} className="border rounded-lg overflow-hidden">
                <div className="p-4 bg-background">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <button
                          onClick={() =>
                            setExpandedModelId(expandedModelId === model.id ? null : model.id)
                          }
                          className="flex items-center gap-1 hover:text-primary"
                        >
                          {expandedModelId === model.id ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <h4 className="font-semibold">{model.displayName || model.modelId}</h4>
                        </button>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {getConnectionName(model.connectionId)} • {model.modelId}
                      </p>

                      {/* Tags */}
                      <div className="flex flex-wrap gap-2">
                        {(['base', 'vision', 'autocomplete'] as ModelRoleTag[]).map((tag) => {
                          const isActive =
                            (tag === 'base' && activeBaseModelId === model.id) ||
                            (tag === 'vision' && activeVisionModelId === model.id) ||
                            (tag === 'autocomplete' && activeAutocompleteModelId === model.id);
                          const hasTag = model.tags.includes(tag);

                          return (
                            <button
                              key={tag}
                              onClick={() => handleToggleTag(model.id, tag)}
                              className={`px-2 py-1 rounded text-xs transition-colors ${
                                hasTag
                                  ? isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'bg-primary/20 text-primary'
                                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              {tag}
                              {isActive && ' ★'}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveModel(model.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      삭제
                    </Button>
                  </div>
                </div>

                {/* Expanded Settings */}
                {expandedModelId === model.id && (
                  <div className="p-4 border-t bg-muted/30 space-y-4">
                    <ModelSettings
                      model={model}
                      onUpdate={(updates) => handleUpdateModel(model.id, updates)}
                      onSetActive={handleSetActive}
                      isActiveBase={activeBaseModelId === model.id}
                      isActiveVision={activeVisionModelId === model.id}
                      isActiveAutocomplete={activeAutocompleteModelId === model.id}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ModelSettingsProps {
  model: ModelConfig;
  onUpdate: (updates: Partial<ModelConfig>) => void;
  onSetActive: (modelId: string, role: ModelRoleTag) => void;
  isActiveBase: boolean;
  isActiveVision: boolean;
  isActiveAutocomplete: boolean;
}

function ModelSettings({
  model,
  onUpdate,
  onSetActive,
  isActiveBase,
  isActiveVision,
  isActiveAutocomplete,
}: ModelSettingsProps) {
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');

  return (
    <div className="space-y-4">
      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor={`display-name-${model.id}`}>표시 이름 (선택사항)</Label>
        <Input
          id={`display-name-${model.id}`}
          value={model.displayName || ''}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
          placeholder={model.modelId}
        />
      </div>

      {/* Active Model Selection */}
      <div className="space-y-2">
        <Label>활성 모델 지정</Label>
        <div className="flex flex-wrap gap-2">
          {model.tags.includes('base') && (
            <Button
              size="sm"
              variant={isActiveBase ? 'default' : 'outline'}
              onClick={() => onSetActive(model.id, 'base')}
            >
              기본 모델로 사용 {isActiveBase && '★'}
            </Button>
          )}
          {model.tags.includes('vision') && (
            <Button
              size="sm"
              variant={isActiveVision ? 'default' : 'outline'}
              onClick={() => onSetActive(model.id, 'vision')}
            >
              Vision 모델로 사용 {isActiveVision && '★'}
            </Button>
          )}
          {model.tags.includes('autocomplete') && (
            <Button
              size="sm"
              variant={isActiveAutocomplete ? 'default' : 'outline'}
              onClick={() => onSetActive(model.id, 'autocomplete')}
            >
              자동완성 모델로 사용 {isActiveAutocomplete && '★'}
            </Button>
          )}
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-2">
        <Label htmlFor={`temperature-${model.id}`}>
          Temperature ({model.temperature ?? 0.7})
        </Label>
        <input
          id={`temperature-${model.id}`}
          type="range"
          min="0"
          max="2"
          step="0.1"
          value={model.temperature ?? 0.7}
          onChange={(e) => onUpdate({ temperature: parseFloat(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Max Tokens */}
      <div className="space-y-2">
        <Label htmlFor={`max-tokens-${model.id}`}>Max Tokens</Label>
        <Input
          id={`max-tokens-${model.id}`}
          type="number"
          min={1}
          max={100000}
          value={model.maxTokens ?? 2000}
          onChange={(e) => {
            const value = parseInt(e.target.value, 10);
            if (!isNaN(value) && value > 0) {
              onUpdate({ maxTokens: value });
            }
          }}
        />
      </div>

      {/* Vision-specific settings */}
      {model.tags.includes('vision') && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`max-image-tokens-${model.id}`}>Max Image Tokens</Label>
            <Input
              id={`max-image-tokens-${model.id}`}
              type="number"
              min={1}
              max={100000}
              value={model.maxImageTokens ?? 4096}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                if (!isNaN(value) && value > 0) {
                  onUpdate({ maxImageTokens: value });
                }
              }}
            />
          </div>
          <div className="flex items-center space-x-2">
            <input
              id={`enable-streaming-${model.id}`}
              type="checkbox"
              checked={model.enableStreaming ?? false}
              onChange={(e) => onUpdate({ enableStreaming: e.target.checked })}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor={`enable-streaming-${model.id}`} className="font-normal cursor-pointer">
              스트리밍 응답 활성화
            </Label>
          </div>
        </>
      )}

      {/* Autocomplete-specific settings */}
      {model.tags.includes('autocomplete') && (
        <div className="space-y-2">
          <Label htmlFor={`debounce-${model.id}`}>Debounce (ms)</Label>
          <Input
            id={`debounce-${model.id}`}
            type="number"
            min={0}
            max={5000}
            value={model.debounceMs ?? 300}
            onChange={(e) => {
              const value = parseInt(e.target.value, 10);
              if (!isNaN(value) && value >= 0) {
                onUpdate({ debounceMs: value });
              }
            }}
          />
        </div>
      )}

      {/* Custom Headers */}
      <div className="space-y-2">
        <Label>커스텀 HTTP 헤더 (모델 전용)</Label>
        {model.customHeaders && Object.keys(model.customHeaders).length > 0 && (
          <div className="space-y-1">
            {Object.entries(model.customHeaders).map(([key, value]) => (
              <div key={key} className="flex items-center gap-2 p-2 rounded bg-background text-sm">
                <span className="font-mono flex-1">{key}:</span>
                <span className="font-mono text-muted-foreground flex-1">{value}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const newHeaders = { ...model.customHeaders };
                    delete newHeaders[key];
                    onUpdate({ customHeaders: newHeaders });
                  }}
                >
                  삭제
                </Button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            value={newHeaderKey}
            onChange={(e) => setNewHeaderKey(e.target.value)}
            placeholder="헤더 이름"
            className="flex-1"
          />
          <Input
            value={newHeaderValue}
            onChange={(e) => setNewHeaderValue(e.target.value)}
            placeholder="헤더 값"
            className="flex-1"
          />
          <Button
            size="sm"
            onClick={() => {
              if (newHeaderKey.trim() && newHeaderValue.trim()) {
                onUpdate({
                  customHeaders: {
                    ...model.customHeaders,
                    [newHeaderKey.trim()]: newHeaderValue.trim(),
                  },
                });
                setNewHeaderKey('');
                setNewHeaderValue('');
              }
            }}
          >
            추가
          </Button>
        </div>
      </div>
    </div>
  );
}
