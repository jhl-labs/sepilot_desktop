'use client';

import { useState } from 'react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LLMConnection, ModelConfig } from '@/types';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';

interface ConnectionManagerProps {
  connections: LLMConnection[];
  onConnectionsChange: (connections: LLMConnection[]) => void;
  models?: ModelConfig[]; // For reference integrity check
  onModelsChange?: (models: ModelConfig[]) => void;
  activeBaseModelId?: string;
  activeVisionModelId?: string;
  activeAutocompleteModelId?: string;
  onActiveModelsChange?: (baseId?: string, visionId?: string, autocompleteId?: string) => void;
}

export function ConnectionManager({
  connections,
  onConnectionsChange,
  models = [],
  onModelsChange,
  activeBaseModelId,
  activeVisionModelId,
  activeAutocompleteModelId,
  onActiveModelsChange,
}: ConnectionManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState<Partial<LLMConnection>>({
    name: '',
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    enabled: true,
    customHeaders: {},
  });

  const handleAdd = () => {
    const { name, baseURL, apiKey, provider } = formData;

    if (!name?.trim() || !baseURL?.trim() || !apiKey?.trim()) {
      return;
    }

    // Validate baseURL format
    if (!baseURL.match(/^https?:\/\/.+/)) {
      alert('Base URL은 http:// 또는 https://로 시작해야 합니다.');
      return;
    }

    // Validate API key length
    if (apiKey.trim().length < 20) {
      alert('API 키는 최소 20자 이상이어야 합니다.');
      return;
    }

    const newConnection: LLMConnection = {
      id: `conn-${nanoid()}`,
      name: name.trim(),
      provider: provider || 'openai',
      baseURL: baseURL.trim(),
      apiKey: apiKey.trim(),
      customHeaders: formData.customHeaders || {},
      enabled: formData.enabled ?? true,
    };

    onConnectionsChange([...connections, newConnection]);
    setIsAdding(false);
    setFormData({
      name: '',
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      enabled: true,
      customHeaders: {},
    });
  };

  const handleEdit = (connection: LLMConnection) => {
    setEditingId(connection.id);
    setFormData(connection);
  };

  const handleSaveEdit = () => {
    if (!editingId) {return;}

    const { name, provider, baseURL, apiKey } = formData;
    if (!name?.trim() || !baseURL?.trim() || !apiKey?.trim()) {
      return;
    }

    // Validate baseURL format
    if (!baseURL.match(/^https?:\/\/.+/)) {
      alert('Base URL은 http:// 또는 https://로 시작해야 합니다.');
      return;
    }

    // Validate API key length
    if (apiKey.trim().length < 20) {
      alert('API 키는 최소 20자 이상이어야 합니다.');
      return;
    }

    onConnectionsChange(
      connections.map((conn) =>
        conn.id === editingId
          ? {
              ...conn,
              name: name.trim(),
              provider: provider || 'openai',
              baseURL: baseURL.trim(),
              apiKey: apiKey.trim(),
              customHeaders: formData.customHeaders || {},
              enabled: formData.enabled ?? true,
            }
          : conn
      )
    );
    setEditingId(null);
    setFormData({
      name: '',
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      enabled: true,
      customHeaders: {},
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({
      name: '',
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      enabled: true,
      customHeaders: {},
    });
  };

  const handleDelete = (id: string) => {
    // Find models that reference this connection
    const referencedModels = models.filter((m) => m.connectionId === id);

    if (referencedModels.length > 0) {
      const modelNames = referencedModels
        .map((m) => m.displayName || m.modelId)
        .join(', ');

      const confirmed = window.confirm(
        `이 Connection을 사용하는 ${referencedModels.length}개의 모델이 있습니다:\n${modelNames}\n\n삭제하시겠습니까? (모델도 함께 삭제됩니다)`
      );

      if (!confirmed) {
        return;
      }

      // Delete associated models
      if (onModelsChange) {
        const modelIdsToDelete = referencedModels.map((m) => m.id);
        onModelsChange(models.filter((m) => !modelIdsToDelete.includes(m.id)));

        // Clear active model selections if they reference deleted models
        if (onActiveModelsChange) {
          const newBaseId = modelIdsToDelete.includes(activeBaseModelId || '')
            ? undefined
            : activeBaseModelId;
          const newVisionId = modelIdsToDelete.includes(activeVisionModelId || '')
            ? undefined
            : activeVisionModelId;
          const newAutocompleteId = modelIdsToDelete.includes(activeAutocompleteModelId || '')
            ? undefined
            : activeAutocompleteModelId;

          if (newBaseId !== activeBaseModelId || newVisionId !== activeVisionModelId || newAutocompleteId !== activeAutocompleteModelId) {
            onActiveModelsChange(newBaseId, newVisionId, newAutocompleteId);
          }
        }
      }
    }

    // Delete connection
    onConnectionsChange(connections.filter((conn) => conn.id !== id));
  };

  const handleToggleEnabled = (id: string) => {
    onConnectionsChange(
      connections.map((conn) =>
        conn.id === id ? { ...conn, enabled: !conn.enabled } : conn
      )
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Connections</h3>
          <p className="text-sm text-muted-foreground">
            LLM 서비스 연결을 관리합니다. 여러 Connection을 등록하고 각 Connection의 모델을 사용할 수 있습니다.
          </p>
        </div>
        <Button
          onClick={() => setIsAdding(true)}
          disabled={isAdding || editingId !== null}
          size="sm"
        >
          <Plus className="h-4 w-4 mr-1" />
          추가
        </Button>
      </div>

      {/* Connection List */}
      <div className="space-y-2">
        {connections.map((connection) => (
          <div
            key={connection.id}
            className={`p-4 rounded-lg border ${
              connection.enabled ? 'bg-background' : 'bg-muted/50'
            }`}
          >
            {editingId === connection.id ? (
              <ConnectionForm
                formData={formData}
                onChange={setFormData}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
              />
            ) : (
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{connection.name}</h4>
                    <span
                      className={`px-2 py-0.5 rounded text-xs ${
                        connection.enabled
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-gray-500/10 text-gray-500'
                      }`}
                    >
                      {connection.enabled ? '활성' : '비활성'}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {connection.provider === 'openai' && 'OpenAI'}
                    {connection.provider === 'anthropic' && 'Anthropic (Claude)'}
                    {connection.provider === 'custom' && 'Custom (OpenAI Compatible)'}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {connection.baseURL}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggleEnabled(connection.id)}
                    disabled={editingId !== null || isAdding}
                  >
                    <input
                      type="checkbox"
                      checked={connection.enabled}
                      onChange={() => handleToggleEnabled(connection.id)}
                      className="h-4 w-4"
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleEdit(connection)}
                    disabled={editingId !== null || isAdding}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(connection.id)}
                    disabled={editingId !== null || isAdding}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add New Connection Form */}
        {isAdding && (
          <div className="p-4 rounded-lg border bg-background">
            <ConnectionForm
              formData={formData}
              onChange={setFormData}
              onSave={handleAdd}
              onCancel={handleCancelEdit}
            />
          </div>
        )}
      </div>
    </div>
  );
}

interface ConnectionFormProps {
  formData: Partial<LLMConnection>;
  onChange: (data: Partial<LLMConnection>) => void;
  onSave: () => void;
  onCancel: () => void;
}

function ConnectionForm({ formData, onChange, onSave, onCancel }: ConnectionFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="conn-name">이름</Label>
        <Input
          id="conn-name"
          value={formData.name || ''}
          onChange={(e) => onChange({ ...formData, name: e.target.value })}
          placeholder="My OpenAI, Local Ollama 등"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="conn-provider">Provider</Label>
        <select
          id="conn-provider"
          value={formData.provider || 'openai'}
          onChange={(e) =>
            onChange({ ...formData, provider: e.target.value as LLMConnection['provider'] })
          }
          className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
        >
          <option value="openai" className="bg-background text-foreground">
            OpenAI
          </option>
          <option value="anthropic" className="bg-background text-foreground">
            Anthropic (Claude)
          </option>
          <option value="custom" className="bg-background text-foreground">
            Custom (OpenAI Compatible)
          </option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="conn-baseurl">Base URL</Label>
        <Input
          id="conn-baseurl"
          value={formData.baseURL || ''}
          onChange={(e) => onChange({ ...formData, baseURL: e.target.value })}
          placeholder="https://api.openai.com/v1"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="conn-apikey">API Key</Label>
        <Input
          id="conn-apikey"
          type="password"
          value={formData.apiKey || ''}
          onChange={(e) => onChange({ ...formData, apiKey: e.target.value })}
          placeholder="sk-..."
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" />
          취소
        </Button>
        <Button size="sm" onClick={onSave}>
          <Check className="h-4 w-4 mr-1" />
          저장
        </Button>
      </div>
    </div>
  );
}
