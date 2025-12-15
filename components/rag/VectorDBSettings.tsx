'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { VectorDBConfig, EmbeddingConfig } from '@/lib/vectordb';

import { logger } from '@/lib/utils/logger';
interface VectorDBSettingsProps {
  onSave: (vectorDBConfig: VectorDBConfig, embeddingConfig: EmbeddingConfig) => Promise<void>;
  initialVectorDBConfig?: VectorDBConfig;
  initialEmbeddingConfig?: EmbeddingConfig;
}

export function VectorDBSettings({
  onSave,
  initialVectorDBConfig,
  initialEmbeddingConfig,
}: VectorDBSettingsProps) {
  const { t } = useTranslation();
  const [vectorDBConfig, setVectorDBConfig] = useState<VectorDBConfig>(
    initialVectorDBConfig || {
      type: 'sqlite-vec',
      indexName: 'documents',
      dimension: 1536,
    }
  );

  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig>(
    initialEmbeddingConfig || {
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimension: 1536,
      apiKey: '',
      baseURL: 'https://api.openai.com/v1',
    }
  );

  // 초기 설정이 변경되면 state 업데이트
  useEffect(() => {
    logger.info('[VectorDBSettings] Received initial configs:', {
      vectorDB: initialVectorDBConfig,
      embedding: initialEmbeddingConfig,
      embeddingModel: initialEmbeddingConfig?.model,
    });

    if (initialVectorDBConfig) {
      setVectorDBConfig(initialVectorDBConfig);
    }
    if (initialEmbeddingConfig) {
      setEmbeddingConfig(initialEmbeddingConfig);
      logger.info(
        '[VectorDBSettings] Set embedding config with model:',
        initialEmbeddingConfig.model
      );
    }
  }, [initialVectorDBConfig, initialEmbeddingConfig]);

  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 모델 목록 관리 - 저장된 모델이 있으면 포함
  const getInitialModels = () => {
    const defaultModels = ['text-embedding-3-small', 'text-embedding-3-large'];
    const savedModel = initialEmbeddingConfig?.model;
    if (savedModel && !defaultModels.includes(savedModel)) {
      return [savedModel, ...defaultModels];
    }
    return defaultModels;
  };

  const [availableModels, setAvailableModels] = useState<string[]>(getInitialModels());
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  // initialEmbeddingConfig가 변경되면 모델 목록도 업데이트
  useEffect(() => {
    const savedModel = initialEmbeddingConfig?.model;
    if (savedModel && !availableModels.includes(savedModel)) {
      setAvailableModels((prev) => [savedModel, ...prev]);
    }
  }, [initialEmbeddingConfig?.model]);

  // 모델 목록 가져오기
  const fetchAvailableModels = async () => {
    if (!embeddingConfig.baseURL || !embeddingConfig.apiKey) {
      setModelError(t('settings.vectordb.validation.needBaseUrlAndApiKey'));
      return;
    }

    setIsLoadingModels(true);
    setModelError(null);

    try {
      const baseURL = embeddingConfig.baseURL.replace(/\/$/, ''); // 끝의 / 제거
      const response = await fetch(`${baseURL}/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${embeddingConfig.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(
          t('settings.vectordb.validation.fetchModelsFailed', { error: response.statusText })
        );
      }

      const data = await response.json();

      // 임베딩 모델 키워드 목록
      const embeddingKeywords = [
        'embedding',
        'embed',
        'bge',
        'nomic',
        'e5',
        'gte',
        'sentence',
        'instructor',
        'minilm',
        'mpnet',
      ];

      // 임베딩 모델 필터 함수
      const isEmbeddingModel = (modelName: string): boolean => {
        const lowerName = modelName.toLowerCase();
        return embeddingKeywords.some((keyword) => lowerName.includes(keyword));
      };

      // OpenAI API 형식: { data: [{ id: "model-name", ... }] }
      let models: string[] = [];
      if (data.data && Array.isArray(data.data)) {
        const allModels = data.data.map((model: any) => model.id || model.name);
        // 임베딩 모델 필터링
        const embeddingModels = allModels.filter(
          (id: string) => typeof id === 'string' && isEmbeddingModel(id)
        );
        // 임베딩 모델이 없으면 모든 모델 표시
        models =
          embeddingModels.length > 0
            ? embeddingModels
            : allModels.filter((id: string) => typeof id === 'string');
      } else if (data.models && Array.isArray(data.models)) {
        // Ollama API 형식: { models: [{ name: "model-name", ... }] }
        const allModels = data.models.map((model: any) => model.name || model.id);
        const embeddingModels = allModels.filter(
          (id: string) => typeof id === 'string' && isEmbeddingModel(id)
        );
        models =
          embeddingModels.length > 0
            ? embeddingModels
            : allModels.filter((id: string) => typeof id === 'string');
      } else if (Array.isArray(data)) {
        // 다른 형식의 응답 처리
        const allModels = data.map((model: any) => model.id || model.name || model);
        const embeddingModels = allModels.filter(
          (id: string) => typeof id === 'string' && isEmbeddingModel(id)
        );
        models =
          embeddingModels.length > 0
            ? embeddingModels
            : allModels.filter((id: string) => typeof id === 'string');
      }

      if (models.length === 0) {
        setModelError(t('settings.vectordb.validation.noModelsFound'));
        // 기본 모델 목록 유지
      } else {
        setAvailableModels(models);
        setModelError(null);

        // 현재 선택된 모델이 새 목록에 없으면 첫 번째 모델로 변경
        if (!models.includes(embeddingConfig.model || '')) {
          const firstModel = models[0];
          logger.info(
            `[VectorDBSettings] Current model "${embeddingConfig.model}" not in new list, selecting first: "${firstModel}"`
          );

          // 첫 번째 모델의 dimension 추정
          let dimension = 1536;
          if (firstModel.includes('3-large') || firstModel.includes('large')) {
            dimension = 3072;
          } else if (firstModel.includes('3-small') || firstModel.includes('small')) {
            dimension = 1536;
          }

          setEmbeddingConfig({
            ...embeddingConfig,
            model: firstModel,
            dimension,
          });
          setVectorDBConfig({ ...vectorDBConfig, dimension });
        }
      }
    } catch (error: any) {
      console.error('Failed to fetch models:', error);
      setModelError(
        error.message ||
          t('settings.vectordb.validation.fetchModelsFailed', { error: 'Unknown error' })
      );
    } finally {
      setIsLoadingModels(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setMessage(null);

    logger.info('[VectorDBSettings] Saving configs:', {
      vectorDB: vectorDBConfig,
      embedding: embeddingConfig,
      embeddingModel: embeddingConfig.model,
    });

    try {
      // API 키 검증
      if (
        embeddingConfig.provider === 'openai' &&
        (!embeddingConfig.apiKey || !embeddingConfig.apiKey.trim())
      ) {
        setMessage({ type: 'error', text: t('settings.vectordb.validation.apiKeyRequired') });
        setIsSaving(false);
        return;
      }

      await onSave(vectorDBConfig, embeddingConfig);

      setMessage({ type: 'success', text: t('settings.vectordb.validation.saveSuccess') });

      // 성공 메시지 표시 후 자동으로 사라지게
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      console.error('Failed to save VectorDB config:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.vectordb.validation.saveFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.vectordb.title')}</h3>

        <div className="space-y-4">
          {/* Vector DB Type */}
          <div className="space-y-2">
            <Label htmlFor="vectordb-type">{t('settings.vectordb.type.title')}</Label>
            <select
              title="Vector DB Type"
              id="vectordb-type"
              value={vectorDBConfig.type}
              onChange={(e) =>
                setVectorDBConfig({ ...vectorDBConfig, type: e.target.value as any })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
            >
              <option value="sqlite-vec" className="bg-background text-foreground">
                {t('settings.vectordb.type.sqliteVec')}
              </option>
              <option value="opensearch" disabled className="bg-background text-foreground">
                {t('settings.vectordb.type.opensearch')}
              </option>
              <option value="elasticsearch" disabled className="bg-background text-foreground">
                {t('settings.vectordb.type.elasticsearch')}
              </option>
              <option value="pgvector" disabled className="bg-background text-foreground">
                {t('settings.vectordb.type.pgvector')}
              </option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.vectordb.hints.sqliteVec')}
            </p>
          </div>

          {/* Index Name */}
          <div className="space-y-2">
            <Label htmlFor="index-name">Index Name</Label>
            <Input
              id="index-name"
              value={vectorDBConfig.indexName}
              onChange={(e) => setVectorDBConfig({ ...vectorDBConfig, indexName: e.target.value })}
              placeholder="documents"
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.vectordb.embedding.title')}</h3>

        <div className="space-y-4">
          {/* Embedding Provider */}
          <div className="space-y-2">
            <Label htmlFor="embedding-provider">{t('settings.vectordb.embedding.provider')}</Label>
            <select
              title="Embedding Provider"
              id="embedding-provider"
              value={embeddingConfig.provider}
              onChange={(e) =>
                setEmbeddingConfig({ ...embeddingConfig, provider: e.target.value as any })
              }
              className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
            >
              <option value="openai" className="bg-background text-foreground">
                OpenAI
              </option>
              <option value="local" disabled className="bg-background text-foreground">
                Local (준비 중)
              </option>
            </select>
          </div>

          {/* Embedding Model */}
          {embeddingConfig.provider === 'openai' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="embedding-baseurl">{t('settings.llm.connections.baseURL')}</Label>
                <div className="flex gap-2">
                  <Input
                    id="embedding-baseurl"
                    value={embeddingConfig.baseURL || 'https://api.openai.com/v1'}
                    onChange={(e) =>
                      setEmbeddingConfig({ ...embeddingConfig, baseURL: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={fetchAvailableModels}
                    disabled={isLoadingModels}
                    title={t('settings.vectordb.hints.fetchModels')}
                  >
                    {isLoadingModels ? (
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    ) : (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.vectordb.hints.baseUrlDescription')}
                </p>
                {modelError && <p className="text-xs text-destructive">{modelError}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="embedding-api-key">{t('settings.llm.connections.apiKey')}</Label>
                <Input
                  id="embedding-api-key"
                  type="password"
                  value={embeddingConfig.apiKey}
                  onChange={(e) =>
                    setEmbeddingConfig({ ...embeddingConfig, apiKey: e.target.value })
                  }
                  placeholder="sk-..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="embedding-model">{t('settings.vectordb.embedding.model')}</Label>
                <select
                  title="Embedding Model"
                  id="embedding-model"
                  value={embeddingConfig.model}
                  onChange={(e) => {
                    const selectedModel = e.target.value;
                    // 일반적인 임베딩 모델의 dimension 추정
                    let dimension = 1536; // 기본값
                    if (selectedModel.includes('3-large') || selectedModel.includes('large')) {
                      dimension = 3072;
                    } else if (selectedModel.includes('ada')) {
                      dimension = 1536;
                    } else if (
                      selectedModel.includes('3-small') ||
                      selectedModel.includes('small')
                    ) {
                      dimension = 1536;
                    }

                    setEmbeddingConfig({
                      ...embeddingConfig,
                      model: selectedModel,
                      dimension,
                    });
                    setVectorDBConfig({ ...vectorDBConfig, dimension });
                  }}
                  className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                  disabled={isLoadingModels}
                >
                  {availableModels.map((model) => (
                    <option key={model} value={model} className="bg-background text-foreground">
                      {model}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {availableModels.length > 2
                    ? t('settings.vectordb.hints.availableModels', {
                        count: availableModels.length,
                      })
                    : t('settings.vectordb.hints.fetchModelsHint')}
                </p>
              </div>
            </>
          )}

          {/* Dimension (읽기 전용) */}
          <div className="space-y-2">
            <Label htmlFor="dimension">{t('settings.vectordb.embedding.dimension')}</Label>
            <Input id="dimension" value={embeddingConfig.dimension} disabled />
          </div>
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
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
