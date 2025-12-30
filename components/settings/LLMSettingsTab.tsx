'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { LLMConfigV2, NetworkConfig, LLMConnection, ModelConfig } from '@/types';
import { Settings } from 'lucide-react';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { ConnectionManager } from './ConnectionManager';
import { ModelListView } from './ModelListView';

interface LLMSettingsTabProps {
  config: LLMConfigV2;
  setConfig: React.Dispatch<React.SetStateAction<LLMConfigV2>>;
  networkConfig: NetworkConfig;
  setNetworkConfig?: React.Dispatch<React.SetStateAction<NetworkConfig>>;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function LLMSettingsTab({
  config,
  setConfig,
  networkConfig,
  setNetworkConfig,
  onSave,
  isSaving,
  message,
}: LLMSettingsTabProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'connections' | 'models'>('connections');

  const handleConnectionsChange = (connections: LLMConnection[]) => {
    setConfig((prev) => ({ ...prev, connections }));
  };

  const handleModelsChange = (models: ModelConfig[]) => {
    setConfig((prev) => ({ ...prev, models }));
  };

  const handleActiveModelsChange = (
    baseId?: string,
    visionId?: string,
    autocompleteId?: string
  ) => {
    setConfig((prev) => ({
      ...prev,
      activeBaseModelId: baseId,
      activeVisionModelId: visionId,
      activeAutocompleteModelId: autocompleteId,
    }));
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.llm.settingsV2')}
        description={t('settings.llm.settingsV2Description')}
        icon={Settings}
      />

      {/* Network Override Settings */}
      {setNetworkConfig && (
        <div className="flex items-center space-x-2 p-4 border rounded-lg bg-muted/20">
          <input
            id="ignore-env-vars"
            type="checkbox"
            checked={networkConfig?.proxy?.ignoreEnvVars ?? false}
            onChange={(e) => {
              const checked = e.target.checked;
              setNetworkConfig((prev) => ({
                ...prev,
                proxy: {
                  enabled: prev.proxy?.enabled ?? false,
                  mode: prev.proxy?.mode ?? 'none',
                  url: prev.proxy?.url ?? '',
                  ignoreEnvVars: checked,
                },
              }));
            }}
            className="h-4 w-4 rounded border-input cursor-pointer"
          />
          <div className="flex-1">
            <label
              htmlFor="ignore-env-vars"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer block"
            >
              {t('settings.network.proxy.ignoreEnvVars')}
            </label>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.network.proxy.ignoreEnvVarsDescription')}
            </p>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setActiveTab('connections')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'connections'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('settings.llm.connections.title')}
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'models'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {t('settings.llm.models.title')}
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'connections' && (
          <ConnectionManager
            connections={config.connections}
            onConnectionsChange={handleConnectionsChange}
            models={config.models}
            onModelsChange={handleModelsChange}
            activeBaseModelId={config.activeBaseModelId}
            activeVisionModelId={config.activeVisionModelId}
            activeAutocompleteModelId={config.activeAutocompleteModelId}
            onActiveModelsChange={handleActiveModelsChange}
          />
        )}

        {activeTab === 'models' && (
          <ModelListView
            connections={config.connections}
            models={config.models}
            onModelsChange={handleModelsChange}
            activeBaseModelId={config.activeBaseModelId}
            activeVisionModelId={config.activeVisionModelId}
            activeAutocompleteModelId={config.activeAutocompleteModelId}
            onActiveModelsChange={handleActiveModelsChange}
            networkConfig={networkConfig}
            defaultTemperature={config.defaultTemperature}
            defaultMaxTokens={config.defaultMaxTokens}
          />
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
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
