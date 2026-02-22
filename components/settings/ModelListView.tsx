'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LLMConnection, ModelConfig, ModelRoleTag, NetworkConfig } from '@/types';
import { RefreshCw, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { fetchAvailableModels } from './settingsUtils';
import { CustomHeadersManager } from './CustomHeadersManager';
import { runPromisesInBatches } from '@/lib/utils/batch';

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

const MODEL_FETCH_BATCH_SIZE = 4;

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
  const { t } = useTranslation();
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Manual model add states
  const [showManualAddForm, setShowManualAddForm] = useState(false);
  const [manualConnectionId, setManualConnectionId] = useState<string>('');
  const [manualModelId, setManualModelId] = useState<string>('');
  const [manualAddError, setManualAddError] = useState<string | null>(null);

  // Parse error message and translate error code
  const parseErrorMessage = (
    errorMessage: string
  ): { code: string; message: string; details: string } => {
    const lines = errorMessage.split('\n');
    const firstLine = lines[0] || '';

    // Extract error code (format: "ERRORCODE: message")
    const match = firstLine.match(/^([A-Z_]+):/);
    if (match) {
      const errorCode = match[1];
      const translated = getTranslatedErrorMessage(errorCode);
      return {
        code: errorCode,
        message: translated,
        details: lines.slice(1).join('\n'),
      };
    }

    // Fallback: return original error
    return {
      code: 'UNKNOWN',
      message: t('errors.llm.unknown'),
      details: errorMessage,
    };
  };

  const getTranslatedErrorMessage = (errorCode: string): string => {
    const key = `errors.llm.${errorCode.toLowerCase()}`;
    const translated = t(key);

    // If translation key doesn't exist, return default message
    if (translated === key) {
      return t('errors.llm.unknown', { code: errorCode });
    }

    return translated;
  };

  // Fetch models from all enabled connections
  const handleFetchAllModels = async () => {
    setIsLoadingModels(true);
    setLoadError(null);

    const allModels: AvailableModel[] = [];
    const errors: Array<{ connection: string; error: string }> = [];
    const enabledConnections = connections.filter((connection) => connection.enabled);

    const modelFetchResults = await runPromisesInBatches(
      enabledConnections,
      MODEL_FETCH_BATCH_SIZE,
      async (connection) => {
        const modelIds = await fetchAvailableModels({
          provider: connection.provider,
          baseURL: connection.baseURL,
          apiKey: connection.apiKey,
          customHeaders: connection.customHeaders,
          networkConfig,
        });
        return { connection, modelIds };
      }
    );

    modelFetchResults.forEach((result, index) => {
      const connection = enabledConnections[index];
      if (!connection) {
        return;
      }

      if (result.status === 'fulfilled') {
        result.value.modelIds.forEach((modelId) => {
          allModels.push({
            id: `${connection.id}-${modelId}`,
            connectionId: connection.id,
            modelId,
            connectionName: connection.name,
          });
        });
        return;
      }

      console.error(`Failed to fetch models from ${connection.name}:`, result.reason);
      errors.push({
        connection: connection.name,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason) || t('settings.llm.models.validation.unknownError'),
      });
    });

    if (enabledConnections.length === 0) {
      setAvailableModels([]);
      setIsLoadingModels(false);
      setLoadError(t('settings.llm.models.validation.fetchErrorAll'));
      return;
    }

    setAvailableModels(allModels);
    setIsLoadingModels(false);

    if (errors.length > 0) {
      // Parse and translate error messages
      const errorMsg = errors
        .map((e) => {
          const parsed = parseErrorMessage(e.error);
          let msg = `[${e.connection}]\n${parsed.message}`;

          if (parsed.details.trim()) {
            msg += `\n\n${t('common.technicalDetails')}:\n${parsed.details}`;
          }

          return msg;
        })
        .join('\n\n─────────────────────────\n\n');
      setLoadError(errorMsg);
    } else if (allModels.length === 0) {
      setLoadError(t('settings.llm.models.validation.fetchErrorAll'));
    }
  };

  // Add model to configuration
  const [duplicateError, setDuplicateError] = useState<string | null>(null);

  const handleAddModel = (availableModel: AvailableModel) => {
    const existingModel = models.find(
      (m) => m.connectionId === availableModel.connectionId && m.modelId === availableModel.modelId
    );

    if (existingModel) {
      setDuplicateError(
        t('settings.llm.models.validation.duplicate', { modelId: availableModel.modelId })
      );
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

  // Manual model add handler
  const handleManualAddModel = () => {
    // 1. Validation - empty fields
    if (!manualConnectionId.trim() || !manualModelId.trim()) {
      setManualAddError(t('settings.llm.models.validation.emptyFields'));
      return;
    }

    // 2. Validate connection exists
    const connection = connections.find((c: any) => c.id === manualConnectionId);
    if (!connection) {
      setManualAddError(t('settings.llm.models.validation.invalidConnection'));
      return;
    }

    // 3. Duplicate check
    const existingModel = models.find(
      (m) => m.connectionId === manualConnectionId && m.modelId === manualModelId.trim()
    );

    if (existingModel) {
      setManualAddError(
        t('settings.llm.models.validation.duplicate', { modelId: manualModelId.trim() })
      );
      setTimeout(() => setManualAddError(null), 3000);
      return;
    }

    // 4. Add model
    const newModel: ModelConfig = {
      id: `model-${nanoid()}`,
      connectionId: manualConnectionId,
      modelId: manualModelId.trim(),
      tags: [],
      temperature: defaultTemperature,
      maxTokens: defaultMaxTokens,
    };

    onModelsChange([...models, newModel]);

    // 5. Reset form and close
    setManualConnectionId('');
    setManualModelId('');
    setManualAddError(null);
    setShowManualAddForm(false);
  };

  // Remove model from configuration
  const handleRemoveModel = (modelId: string) => {
    onModelsChange(models.filter((m: any) => m.id !== modelId));

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
        if (m.id !== modelId) {
          return m;
        }

        const tags = m.tags.includes(tag) ? m.tags.filter((t: any) => t !== tag) : [...m.tags, tag];

        return { ...m, tags };
      })
    );
  };

  // Update model configuration
  const handleUpdateModel = (modelId: string, updates: Partial<ModelConfig>) => {
    onModelsChange(models.map((m) => (m.id === modelId ? { ...m, ...updates } : m)));
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
    return connections.find((c: any) => c.id === connectionId)?.name || 'Unknown';
  };

  const isModelAdded = (availableModel: AvailableModel) => {
    return models.some(
      (m) => m.connectionId === availableModel.connectionId && m.modelId === availableModel.modelId
    );
  };

  return (
    <div className="space-y-6">
      {/* Model Discovery Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{t('settings.llm.models.available.title')}</h3>
            <p className="text-sm text-muted-foreground">
              {t('settings.llm.models.available.description')}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleFetchAllModels}
              disabled={isLoadingModels || connections.filter((c: any) => c.enabled).length === 0}
              size="sm"
              variant="default"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingModels ? 'animate-spin' : ''}`} />
              {isLoadingModels
                ? t('settings.llm.models.available.fetching')
                : t('settings.llm.models.available.fetch')}
            </Button>
            <Button
              onClick={() => setShowManualAddForm(!showManualAddForm)}
              size="sm"
              variant="outline"
              disabled={connections.filter((c: any) => c.enabled).length === 0}
            >
              <Plus className="h-4 w-4 mr-1" />
              {t('settings.llm.models.manual.button')}
            </Button>
          </div>
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive bg-destructive/10 p-4 text-sm text-destructive">
            <div className="flex items-start gap-2">
              <span className="font-semibold">⚠️ {t('common.error')}:</span>
              <div className="flex-1">
                <pre className="whitespace-pre-wrap break-words font-sans text-sm">{loadError}</pre>
              </div>
            </div>
            {/* Manual add guide when fetch fails */}
            <div className="mt-3 pt-3 border-t border-destructive/30">
              <p className="text-sm text-muted-foreground mb-2">
                {t('settings.llm.models.manual.fetchFailedHint')}
              </p>
              <Button
                onClick={() => setShowManualAddForm(true)}
                size="sm"
                variant="outline"
                className="border-destructive/50 hover:bg-destructive/10"
              >
                <Plus className="h-4 w-4 mr-1" />
                {t('settings.llm.models.manual.button')}
              </Button>
            </div>
          </div>
        )}

        {/* Manual Add Form */}
        {showManualAddForm && (
          <div className="border rounded-lg p-4 bg-muted/30 space-y-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold text-sm">{t('settings.llm.models.manual.title')}</h4>
              <button
                onClick={() => {
                  setShowManualAddForm(false);
                  setManualConnectionId('');
                  setManualModelId('');
                  setManualAddError(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {manualAddError && <p className="text-sm text-destructive">{manualAddError}</p>}

            <div className="space-y-2">
              <Label htmlFor="manual-connection">
                {t('settings.llm.models.manual.connection')}
              </Label>
              <Select value={manualConnectionId} onValueChange={setManualConnectionId}>
                <SelectTrigger id="manual-connection">
                  <SelectValue placeholder={t('settings.llm.models.manual.selectConnection')} />
                </SelectTrigger>
                <SelectContent>
                  {connections
                    .filter((c: any) => c.enabled)
                    .map((connection) => (
                      <SelectItem key={connection.id} value={connection.id}>
                        {connection.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manual-model-id">{t('settings.llm.models.manual.modelId')}</Label>
              <Input
                id="manual-model-id"
                value={manualModelId}
                onChange={(e) => setManualModelId(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && manualConnectionId && manualModelId.trim()) {
                    handleManualAddModel();
                  }
                }}
                placeholder={t('settings.llm.models.manual.modelIdPlaceholder')}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowManualAddForm(false);
                  setManualConnectionId('');
                  setManualModelId('');
                  setManualAddError(null);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                onClick={handleManualAddModel}
                disabled={!manualConnectionId || !manualModelId.trim()}
              >
                {t('settings.llm.models.manual.addButton')}
              </Button>
            </div>
          </div>
        )}

        {duplicateError && <p className="text-sm text-destructive">{duplicateError}</p>}

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
                  {isModelAdded(availableModel)
                    ? t('settings.llm.models.available.added')
                    : t('settings.llm.models.available.add')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Configured Models Section */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t('settings.llm.models.configured.title')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.llm.models.configured.description')}
          </p>
        </div>

        {models.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>{t('settings.llm.models.configured.empty')}</p>
            <p className="text-sm">{t('settings.llm.models.configured.emptyHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {models.map((model) => {
              const connection = connections.find((c: any) => c.id === model.connectionId);

              return (
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
                        {t('settings.llm.models.delete')}
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
                        connection={connection}
                      />
                    </div>
                  )}
                </div>
              );
            })}
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
  connection?: LLMConnection;
}

function ModelSettings({
  model,
  onUpdate,
  onSetActive,
  isActiveBase,
  isActiveVision,
  isActiveAutocomplete,
  connection,
}: ModelSettingsProps) {
  const { t } = useTranslation();

  const connectionHeaders = connection?.customHeaders || {};
  const modelHeaders = model.customHeaders || {};

  const handleAddHeader = (key: string, value: string) => {
    onUpdate({
      customHeaders: {
        ...modelHeaders,
        [key]: value,
      },
    });
  };

  const handleDeleteHeader = (key: string) => {
    const updatedHeaders = { ...modelHeaders };
    delete updatedHeaders[key];
    onUpdate({ customHeaders: updatedHeaders });
  };

  const handleExcludeInheritedHeader = (key: string) => {
    onUpdate({
      customHeaders: {
        ...modelHeaders,
        [key]: null,
      },
    });
  };

  const handleRestoreInheritedHeader = (key: string) => {
    const updatedHeaders = { ...modelHeaders };
    delete updatedHeaders[key];
    onUpdate({ customHeaders: updatedHeaders });
  };

  return (
    <div className="space-y-4">
      {/* Display Name */}
      <div className="space-y-2">
        <Label htmlFor={`display-name-${model.id}`}>{t('settings.llm.models.displayName')}</Label>
        <Input
          id={`display-name-${model.id}`}
          value={model.displayName || ''}
          onChange={(e) => onUpdate({ displayName: e.target.value })}
          placeholder={model.modelId}
        />
      </div>

      {/* Custom Headers */}
      <div className="space-y-2">
        <Label>{t('settings.llm.models.customHeaders.title')}</Label>
        <p className="text-xs text-muted-foreground">
          {t('settings.llm.models.customHeaders.description')}
        </p>

        {Object.keys(connectionHeaders).length > 0 && (
          <div className="space-y-1 rounded-md border bg-background p-2 text-xs">
            <p className="font-medium">{t('settings.llm.models.customHeaders.inherited')}</p>
            {Object.entries(connectionHeaders).map(([key, value]) => (
              <div
                key={key}
                className="flex flex-wrap items-center gap-2 rounded bg-muted/40 p-2 text-sm"
              >
                <span className="font-mono flex-1 min-w-[120px]">{key}</span>
                <span className="font-mono text-muted-foreground flex-1 min-w-[120px]">
                  {modelHeaders[key] && modelHeaders[key] !== null
                    ? `${value} → ${modelHeaders[key]}`
                    : value}
                </span>
                {modelHeaders[key] === null ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleRestoreInheritedHeader(key)}
                    aria-label={t('settings.llm.models.customHeaders.restoreAriaLabel', { key })}
                  >
                    {t('settings.llm.models.customHeaders.restore')}
                  </Button>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleExcludeInheritedHeader(key)}
                    aria-label={t('settings.llm.models.customHeaders.removeAriaLabel', { key })}
                  >
                    {t('settings.llm.models.customHeaders.remove')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <CustomHeadersManager
          headers={
            Object.fromEntries(
              Object.entries(modelHeaders).filter(([, value]) => value !== null)
            ) as Record<string, string>
          }
          onAddHeader={handleAddHeader}
          onDeleteHeader={handleDeleteHeader}
          title={t('settings.llm.models.customHeaders.modelSpecific')}
        />
      </div>

      {/* Active Model Selection */}
      <div className="space-y-2">
        <Label>{t('settings.llm.models.active.title')}</Label>
        <div className="flex flex-wrap gap-2">
          {model.tags.includes('base') && (
            <Button
              size="sm"
              variant={isActiveBase ? 'default' : 'outline'}
              onClick={() => onSetActive(model.id, 'base')}
            >
              {t('settings.llm.models.active.base')} {isActiveBase && '★'}
            </Button>
          )}
          {model.tags.includes('vision') && (
            <Button
              size="sm"
              variant={isActiveVision ? 'default' : 'outline'}
              onClick={() => onSetActive(model.id, 'vision')}
            >
              {t('settings.llm.models.active.vision')} {isActiveVision && '★'}
            </Button>
          )}
          {model.tags.includes('autocomplete') && (
            <Button
              size="sm"
              variant={isActiveAutocomplete ? 'default' : 'outline'}
              onClick={() => onSetActive(model.id, 'autocomplete')}
            >
              {t('settings.llm.models.active.autocomplete')} {isActiveAutocomplete && '★'}
            </Button>
          )}
        </div>
      </div>

      {/* Temperature */}
      <div className="space-y-2">
        <Label htmlFor={`temperature-${model.id}`}>
          {t('settings.llm.models.temperature')} ({model.temperature ?? 0.7})
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
        <Label htmlFor={`max-tokens-${model.id}`}>{t('settings.llm.models.maxTokens')}</Label>
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
              {t('settings.llm.models.streaming')}
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
    </div>
  );
}
