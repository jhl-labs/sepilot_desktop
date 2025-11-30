'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LLMConfigV2, NetworkConfig, LLMConnection, ModelConfig } from '@/types';
import { Settings } from 'lucide-react';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { ConnectionManager } from './ConnectionManager';
import { ModelListView } from './ModelListView';

interface LLMSettingsTabV2Props {
  config: LLMConfigV2;
  setConfig: React.Dispatch<React.SetStateAction<LLMConfigV2>>;
  networkConfig: NetworkConfig;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function LLMSettingsTabV2({
  config,
  setConfig,
  networkConfig,
  onSave,
  isSaving,
  message,
}: LLMSettingsTabV2Props) {
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
        title="LLM 설정 (v2)"
        description="Connection 기반 LLM 모델 관리 시스템"
        icon={Settings}
      />

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
          Connections
        </button>
        <button
          onClick={() => setActiveTab('models')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'models'
              ? 'text-primary border-b-2 border-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          Models
        </button>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {activeTab === 'connections' && (
          <ConnectionManager
            connections={config.connections}
            onConnectionsChange={handleConnectionsChange}
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
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
}
