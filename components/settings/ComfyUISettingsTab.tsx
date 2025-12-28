'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ComfyUIConfig, NetworkConfig } from '@/types';
import { Image } from 'lucide-react';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { httpFetch } from '@/lib/http';

interface ComfyUISettingsTabProps {
  comfyConfig: ComfyUIConfig;
  setComfyConfig: React.Dispatch<React.SetStateAction<ComfyUIConfig>>;
  networkConfig: NetworkConfig;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  setMessage: React.Dispatch<
    React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>
  >;
}

export function ComfyUISettingsTab({
  comfyConfig,
  setComfyConfig,
  networkConfig,
  onSave,
  isSaving,
  message,
  setMessage,
}: ComfyUISettingsTabProps) {
  const { t } = useTranslation();
  const [isTestingComfy, setIsTestingComfy] = useState(false);

  const handleTestComfyConnection = async () => {
    setIsTestingComfy(true);
    setMessage(null);

    try {
      if (!comfyConfig.httpUrl.trim()) {
        throw new Error(t('settings.imagegen.comfyui.httpUrlRequired'));
      }

      // Electron 환경: IPC를 통해 Main Process에서 호출 (CORS 없음, Network Config 사용)
      if (typeof window !== 'undefined' && window.electronAPI?.comfyui) {
        // customHeaders는 LLM 전용이므로 ComfyUI에는 전달하지 않음
        const { customHeaders: _customHeaders, ...networkConfigWithoutCustomHeaders } =
          networkConfig;
        const result = await window.electronAPI.comfyui.testConnection(
          comfyConfig.httpUrl,
          comfyConfig.apiKey,
          networkConfigWithoutCustomHeaders
        );

        if (!result.success) {
          throw new Error(result.error || t('settings.imagegen.comfyui.connectionTestFailed'));
        }

        setMessage({ type: 'success', text: t('settings.imagegen.comfyui.connectionSuccess') });
      } else {
        // 브라우저 환경 (fallback): 직접 fetch
        console.warn(
          '[ComfyUI] Running in browser mode - CORS may occur, Network Config not applied'
        );
        const normalizedUrl = comfyConfig.httpUrl.replace(/\/$/, '');
        const response = await httpFetch(`${normalizedUrl}/system_stats`, {
          headers: comfyConfig.apiKey
            ? {
                Authorization: `Bearer ${comfyConfig.apiKey}`,
              }
            : undefined,
        });

        if (!response.ok) {
          throw new Error(
            t('settings.imagegen.comfyui.invalidResponse', { status: response.status })
          );
        }

        setMessage({ type: 'success', text: t('settings.imagegen.comfyui.connectionSuccess') });
      }
    } catch (error: any) {
      console.error('Failed to test ComfyUI connection:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.imagegen.comfyui.connectionTestFailed'),
      });
    } finally {
      setIsTestingComfy(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.imagegen.comfyui.title')}
        description={t('settings.imagegen.comfyui.description')}
        icon={Image}
      />

      <div className="rounded-md border bg-muted/40 p-4 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">{t('settings.imagegen.comfyui.connection')}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.imagegen.comfyui.connectionDescription')}
            </p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={comfyConfig.enabled}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  enabled: e.target.checked,
                })
              }
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
          </label>
        </div>
        {!comfyConfig.enabled && (
          <p className="text-xs text-muted-foreground">
            {t('settings.imagegen.comfyui.enableToggleHint')}
          </p>
        )}
      </div>

      <div className={`space-y-4 ${!comfyConfig.enabled ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="comfyHttp">{t('settings.imagegen.comfyui.httpEndpoint')}</Label>
            <Input
              id="comfyHttp"
              value={comfyConfig.httpUrl}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  httpUrl: e.target.value,
                })
              }
              placeholder={t('settings.imagegen.comfyui.httpPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.imagegen.comfyui.httpUrlDescription')}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="comfyWs">{t('settings.imagegen.comfyui.wsEndpoint')}</Label>
            <Input
              id="comfyWs"
              value={comfyConfig.wsUrl}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  wsUrl: e.target.value,
                })
              }
              placeholder={t('settings.imagegen.comfyui.wsPlaceholder')}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="comfyWorkflow">{t('settings.imagegen.comfyui.workflowLabel')}</Label>
            <Input
              id="comfyWorkflow"
              value={comfyConfig.workflowId}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  workflowId: e.target.value,
                })
              }
              placeholder={t('settings.imagegen.comfyui.workflowPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comfyClientId">{t('settings.imagegen.comfyui.clientId')}</Label>
            <Input
              id="comfyClientId"
              value={comfyConfig.clientId || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  clientId: e.target.value,
                })
              }
              placeholder={t('settings.imagegen.comfyui.optional')}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="comfyApiKey">{t('settings.imagegen.comfyui.apiKey')}</Label>
            <Input
              id="comfyApiKey"
              type="password"
              value={comfyConfig.apiKey || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  apiKey: e.target.value,
                })
              }
              placeholder={t('settings.imagegen.comfyui.apiKeyPlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comfySeed">{t('settings.imagegen.comfyui.seed')}</Label>
            <Input
              id="comfySeed"
              type="number"
              value={comfyConfig.seed ?? -1}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setComfyConfig({
                  ...comfyConfig,
                  seed: Number.isNaN(parsed) ? undefined : parsed,
                });
              }}
              placeholder={t('settings.imagegen.comfyui.seedPlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.imagegen.comfyui.seedDescription')}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="comfySteps">{t('settings.imagegen.comfyui.steps')}</Label>
            <Input
              id="comfySteps"
              type="number"
              value={comfyConfig.steps ?? 30}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setComfyConfig({
                  ...comfyConfig,
                  steps: Number.isNaN(parsed) ? undefined : parsed,
                });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comfyCfg">{t('settings.imagegen.comfyui.cfgScale')}</Label>
            <Input
              id="comfyCfg"
              type="number"
              value={comfyConfig.cfgScale ?? 7}
              onChange={(e) => {
                const parsed = parseFloat(e.target.value);
                setComfyConfig({
                  ...comfyConfig,
                  cfgScale: Number.isNaN(parsed) ? undefined : parsed,
                });
              }}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('settings.imagegen.comfyui.workflowReference')}</Label>
            <p className="text-xs text-muted-foreground">
              {t('settings.imagegen.comfyui.workflowReferenceDescription')}
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="comfyPositive">{t('settings.imagegen.comfyui.positivePrompt')}</Label>
            <Textarea
              id="comfyPositive"
              value={comfyConfig.positivePrompt || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  positivePrompt: e.target.value,
                })
              }
              placeholder={t('settings.imagegen.comfyui.positivePromptPlaceholder')}
              className="min-h-[100px]"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comfyNegative">{t('settings.imagegen.comfyui.negativePrompt')}</Label>
            <Textarea
              id="comfyNegative"
              value={comfyConfig.negativePrompt || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  negativePrompt: e.target.value,
                })
              }
              placeholder={t('settings.imagegen.comfyui.negativePromptPlaceholder')}
              className="min-h-[100px]"
            />
          </div>
        </div>
      </div>

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

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={handleTestComfyConnection}
          disabled={!comfyConfig.httpUrl.trim() || isTestingComfy || !comfyConfig.enabled}
        >
          {isTestingComfy ? t('common.testing') : t('common.testConnection')}
        </Button>
        <Button
          onClick={onSave}
          disabled={isSaving || (comfyConfig.enabled && !comfyConfig.httpUrl.trim())}
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
