'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageGenConfig, NetworkConfig } from '@/types';
import { Image, Sparkles } from 'lucide-react';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { httpFetch } from '@/lib/http';

interface ImageGenSettingsTabProps {
  imageGenConfig: ImageGenConfig;
  setImageGenConfig: React.Dispatch<React.SetStateAction<ImageGenConfig>>;
  networkConfig: NetworkConfig;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  setMessage: React.Dispatch<
    React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>
  >;
}

export function ImageGenSettingsTab({
  imageGenConfig,
  setImageGenConfig,
  networkConfig,
  onSave,
  isSaving,
  message,
  setMessage,
}: ImageGenSettingsTabProps) {
  const { t } = useTranslation();
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const handleProviderChange = (provider: 'comfyui' | 'nanobanana') => {
    setImageGenConfig({
      ...imageGenConfig,
      provider,
    });
  };

  const handleTestComfyConnection = async () => {
    setIsTestingConnection(true);
    setMessage(null);

    try {
      if (!imageGenConfig.comfyui?.httpUrl.trim()) {
        throw new Error(t('settings.imagegen.comfyui.httpUrlRequired'));
      }

      if (typeof window !== 'undefined' && window.electronAPI?.comfyui) {
        const { customHeaders: _customHeaders, ...networkConfigWithoutCustomHeaders } =
          networkConfig;
        const result = await window.electronAPI.comfyui.testConnection(
          imageGenConfig.comfyui.httpUrl,
          imageGenConfig.comfyui.apiKey,
          networkConfigWithoutCustomHeaders
        );

        if (!result.success) {
          throw new Error(result.error || t('settings.imagegen.comfyui.connectionTestFailed'));
        }

        setMessage({ type: 'success', text: t('settings.imagegen.comfyui.connectionSuccess') });
      } else {
        console.warn(
          '[ComfyUI] Running in browser mode - CORS may occur, Network Config not applied'
        );
        const normalizedUrl = imageGenConfig.comfyui.httpUrl.replace(/\/$/, '');
        const response = await httpFetch(`${normalizedUrl}/system_stats`, {
          headers: imageGenConfig.comfyui.apiKey
            ? {
                Authorization: `Bearer ${imageGenConfig.comfyui.apiKey}`,
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
      setIsTestingConnection(false);
    }
  };

  const handleTestNanoBananaConnection = async () => {
    setIsTestingConnection(true);
    setMessage(null);

    try {
      if (!imageGenConfig.nanobanana?.apiKey.trim()) {
        throw new Error(t('settings.imagegen.nanobanana.apiKeyRequired'));
      }

      // TODO: Implement NanoBanana connection test via IPC
      // For now, just validate API key format
      setMessage({ type: 'success', text: t('settings.imagegen.nanobanana.configValid') });
    } catch (error: any) {
      console.error('Failed to test NanoBanana connection:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.imagegen.nanobanana.connectionTestFailed'),
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.imagegen.title')}
        description={t('settings.imagegen.description')}
        icon={Image}
      />

      {/* Provider Selection */}
      <div className="rounded-md border bg-muted/40 p-4 space-y-3">
        <div>
          <h3 className="text-base font-semibold">{t('settings.imagegen.providerSelection')}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {t('settings.imagegen.providerSelectionDescription')}
          </p>
        </div>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="provider"
              value="comfyui"
              checked={imageGenConfig.provider === 'comfyui'}
              onChange={() => handleProviderChange('comfyui')}
              className="w-4 h-4 text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium">ComfyUI</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="provider"
              value="nanobanana"
              checked={imageGenConfig.provider === 'nanobanana'}
              onChange={() => handleProviderChange('nanobanana')}
              className="w-4 h-4 text-primary focus:ring-primary"
            />
            <span className="text-sm font-medium">NanoBanana (Google Imagen)</span>
          </label>
        </div>
      </div>

      {/* Provider-specific Settings */}
      <Tabs value={imageGenConfig.provider} onValueChange={(v) => handleProviderChange(v as any)}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="comfyui" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            ComfyUI
          </TabsTrigger>
          <TabsTrigger value="nanobanana" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            NanoBanana
          </TabsTrigger>
        </TabsList>

        {/* ComfyUI Settings */}
        <TabsContent value="comfyui" className="space-y-4 mt-6">
          <div className="rounded-md border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">
                  {t('settings.imagegen.comfyui.connection')}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.imagegen.comfyui.connectionDescription')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  title={t('settings.imagegen.comfyui.connection')}
                  type="checkbox"
                  className="sr-only peer"
                  checked={imageGenConfig.comfyui?.enabled ?? false}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>
            {!imageGenConfig.comfyui?.enabled && (
              <p className="text-xs text-muted-foreground">
                {t('settings.imagegen.comfyui.enableToggleHint')}
              </p>
            )}
          </div>

          <div
            className={`space-y-4 ${!imageGenConfig.comfyui?.enabled ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comfyHttp">{t('settings.imagegen.comfyui.httpEndpoint')}</Label>
                <Input
                  id="comfyHttp"
                  value={imageGenConfig.comfyui?.httpUrl || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        httpUrl: e.target.value,
                      },
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
                  value={imageGenConfig.comfyui?.wsUrl || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        wsUrl: e.target.value,
                      },
                    })
                  }
                  placeholder={t('settings.imagegen.comfyui.wsPlaceholder')}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comfyWorkflow">
                  {t('settings.imagegen.comfyui.workflowLabel')}
                </Label>
                <Input
                  id="comfyWorkflow"
                  value={imageGenConfig.comfyui?.workflowId || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        workflowId: e.target.value,
                      },
                    })
                  }
                  placeholder={t('settings.imagegen.comfyui.workflowPlaceholder')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comfyClientId">{t('settings.imagegen.comfyui.clientId')}</Label>
                <Input
                  id="comfyClientId"
                  value={imageGenConfig.comfyui?.clientId || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        clientId: e.target.value,
                      },
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
                  value={imageGenConfig.comfyui?.apiKey || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        apiKey: e.target.value,
                      },
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
                  value={imageGenConfig.comfyui?.seed ?? -1}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        seed: Number.isNaN(parsed) ? undefined : parsed,
                      },
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
                  value={imageGenConfig.comfyui?.steps ?? 30}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        steps: Number.isNaN(parsed) ? undefined : parsed,
                      },
                    });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comfyCfg">{t('settings.imagegen.comfyui.cfgScale')}</Label>
                <Input
                  id="comfyCfg"
                  type="number"
                  value={imageGenConfig.comfyui?.cfgScale ?? 7}
                  onChange={(e) => {
                    const parsed = parseFloat(e.target.value);
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        cfgScale: Number.isNaN(parsed) ? undefined : parsed,
                      },
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
                <Label htmlFor="comfyPositive">
                  {t('settings.imagegen.comfyui.positivePrompt')}
                </Label>
                <Textarea
                  id="comfyPositive"
                  value={imageGenConfig.comfyui?.positivePrompt || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        positivePrompt: e.target.value,
                      },
                    })
                  }
                  placeholder={t('settings.imagegen.comfyui.positivePromptPlaceholder')}
                  className="min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comfyNegative">
                  {t('settings.imagegen.comfyui.negativePrompt')}
                </Label>
                <Textarea
                  id="comfyNegative"
                  value={imageGenConfig.comfyui?.negativePrompt || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      comfyui: {
                        ...imageGenConfig.comfyui!,
                        negativePrompt: e.target.value,
                      },
                    })
                  }
                  placeholder={t('settings.imagegen.comfyui.negativePromptPlaceholder')}
                  className="min-h-[100px]"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleTestComfyConnection}
                disabled={
                  !imageGenConfig.comfyui?.httpUrl.trim() ||
                  isTestingConnection ||
                  !imageGenConfig.comfyui?.enabled
                }
              >
                {isTestingConnection ? t('common.testing') : t('common.testConnection')}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* NanoBanana Settings */}
        <TabsContent value="nanobanana" className="space-y-4 mt-6">
          <div className="rounded-md border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">
                  {t('settings.imagegen.nanobanana.connection')}
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {t('settings.imagegen.nanobanana.connectionDescription')}
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  title={t('settings.imagegen.nanobanana.connection')}
                  type="checkbox"
                  className="sr-only peer"
                  checked={imageGenConfig.nanobanana?.enabled ?? false}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      nanobanana: {
                        ...imageGenConfig.nanobanana!,
                        enabled: e.target.checked,
                      },
                    })
                  }
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
              </label>
            </div>
            {!imageGenConfig.nanobanana?.enabled && (
              <p className="text-xs text-muted-foreground">
                {t('settings.imagegen.nanobanana.enableToggleHint')}
              </p>
            )}
          </div>

          <div
            className={`space-y-4 ${!imageGenConfig.nanobanana?.enabled ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <div className="space-y-2">
              <Label htmlFor="nanoBananaProvider">
                {t('settings.imagegen.nanobanana.provider')}
              </Label>
              <select
                title={t('settings.imagegen.nanobanana.provider')}
                id="nanoBananaProvider"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={imageGenConfig.nanobanana?.provider || 'nanobananaapi'}
                onChange={(e) =>
                  setImageGenConfig({
                    ...imageGenConfig,
                    nanobanana: {
                      ...imageGenConfig.nanobanana!,
                      provider: e.target.value as 'nanobananaapi' | 'vertex-ai',
                    },
                  })
                }
              >
                <option value="nanobananaapi">
                  {t('settings.imagegen.nanobanana.providerNanobanana')}
                </option>
                <option value="vertex-ai">
                  {t('settings.imagegen.nanobanana.providerVertexAi')}
                </option>
              </select>
              <p className="text-xs text-muted-foreground">
                {imageGenConfig.nanobanana?.provider === 'vertex-ai'
                  ? t('settings.imagegen.nanobanana.vertexAiDescription')
                  : t('settings.imagegen.nanobanana.apiDescription')}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nanoBananaApiKey">
                  {imageGenConfig.nanobanana?.provider === 'vertex-ai'
                    ? t('settings.imagegen.nanobanana.vertexAiApiKeyLabel')
                    : t('settings.imagegen.nanobanana.apiKeyLabel')}
                </Label>
                <Input
                  id="nanoBananaApiKey"
                  type="password"
                  value={imageGenConfig.nanobanana?.apiKey || ''}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      nanobanana: {
                        ...imageGenConfig.nanobanana!,
                        apiKey: e.target.value,
                      },
                    })
                  }
                  placeholder={
                    imageGenConfig.nanobanana?.provider === 'vertex-ai'
                      ? t('settings.imagegen.nanobanana.vertexAiApiKeyPlaceholder')
                      : t('settings.imagegen.nanobanana.apiKeyPlaceholder')
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {imageGenConfig.nanobanana?.provider === 'vertex-ai'
                    ? t('settings.imagegen.nanobanana.vertexAiApiKeyDescription')
                    : t('settings.imagegen.nanobanana.apiKeyDescription')}
                </p>
              </div>

              {imageGenConfig.nanobanana?.provider === 'vertex-ai' && (
                <div className="space-y-2">
                  <Label htmlFor="nanoBananaProject">
                    {t('settings.imagegen.nanobanana.projectId')}
                  </Label>
                  <Input
                    id="nanoBananaProject"
                    value={imageGenConfig.nanobanana?.projectId || ''}
                    onChange={(e) =>
                      setImageGenConfig({
                        ...imageGenConfig,
                        nanobanana: {
                          ...imageGenConfig.nanobanana!,
                          projectId: e.target.value,
                        },
                      })
                    }
                    placeholder={t('settings.imagegen.nanobanana.projectIdPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.imagegen.nanobanana.projectIdDescription')}
                  </p>
                </div>
              )}
            </div>

            {imageGenConfig.nanobanana?.provider === 'vertex-ai' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nanoBananaLocation">
                    {t('settings.imagegen.nanobanana.location')}
                  </Label>
                  <Input
                    id="nanoBananaLocation"
                    value={imageGenConfig.nanobanana?.location || 'us-central1'}
                    onChange={(e) =>
                      setImageGenConfig({
                        ...imageGenConfig,
                        nanobanana: {
                          ...imageGenConfig.nanobanana!,
                          location: e.target.value,
                        },
                      })
                    }
                    placeholder={t('settings.imagegen.nanobanana.locationPlaceholder')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('settings.imagegen.nanobanana.locationDescription')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nanoBananaModel">{t('settings.imagegen.nanobanana.model')}</Label>
                  <select
                    title={t('settings.imagegen.nanobanana.model')}
                    id="nanoBananaModel"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    value={imageGenConfig.nanobanana?.model || 'imagen-3.0-generate-001'}
                    onChange={(e) =>
                      setImageGenConfig({
                        ...imageGenConfig,
                        nanobanana: {
                          ...imageGenConfig.nanobanana!,
                          model: e.target.value,
                        },
                      })
                    }
                  >
                    <option value="imagen-3.0-generate-001">
                      {t('settings.imagegen.nanobanana.modelStandard')}
                    </option>
                    <option value="imagen-3.0-fast-generate-001">
                      {t('settings.imagegen.nanobanana.modelFast')}
                    </option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {t('settings.imagegen.nanobanana.modelDescription')}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  title={t('settings.imagegen.nanobanana.askOptions')}
                  type="checkbox"
                  className="sr-only peer"
                  checked={imageGenConfig.nanobanana?.askOptionsOnGenerate ?? false}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      nanobanana: {
                        ...imageGenConfig.nanobanana!,
                        askOptionsOnGenerate: e.target.checked,
                      },
                    })
                  }
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                <span className="ml-3 text-sm font-medium">
                  {t('settings.imagegen.nanobanana.askOptions')}
                </span>
              </label>
              <p className="text-xs text-muted-foreground ml-14">
                {t('settings.imagegen.nanobanana.askOptionsDescription')}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="nanoBananaAspectRatio">
                  {t('settings.imagegen.nanobanana.aspectRatio')}
                </Label>
                <select
                  title={t('settings.imagegen.nanobanana.aspectRatio')}
                  id="nanoBananaAspectRatio"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={imageGenConfig.nanobanana?.aspectRatio || '1:1'}
                  onChange={(e) =>
                    setImageGenConfig({
                      ...imageGenConfig,
                      nanobanana: {
                        ...imageGenConfig.nanobanana!,
                        aspectRatio: e.target.value,
                      },
                    })
                  }
                >
                  <option value="1:1">1:1 (Square)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nanoBananaNumImages">
                  {t('settings.imagegen.nanobanana.numberOfImages')}
                </Label>
                <Input
                  id="nanoBananaNumImages"
                  type="number"
                  min="1"
                  max="8"
                  value={imageGenConfig.nanobanana?.numberOfImages ?? 1}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setImageGenConfig({
                      ...imageGenConfig,
                      nanobanana: {
                        ...imageGenConfig.nanobanana!,
                        numberOfImages:
                          Number.isNaN(parsed) || parsed < 1 || parsed > 8 ? 1 : parsed,
                      },
                    });
                  }}
                  placeholder={t('settings.imagegen.nanobanana.numberOfImagesPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.imagegen.nanobanana.numImagesDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nanoBananaSeed">{t('settings.imagegen.nanobanana.seed')}</Label>
                <Input
                  id="nanoBananaSeed"
                  type="number"
                  value={imageGenConfig.nanobanana?.seed ?? -1}
                  onChange={(e) => {
                    const parsed = parseInt(e.target.value, 10);
                    setImageGenConfig({
                      ...imageGenConfig,
                      nanobanana: {
                        ...imageGenConfig.nanobanana!,
                        seed: Number.isNaN(parsed) ? undefined : parsed,
                      },
                    });
                  }}
                  placeholder={t('settings.imagegen.nanobanana.seedPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nanoBananaNegative">
                {t('settings.imagegen.nanobanana.negativePrompt')}
              </Label>
              <Textarea
                id="nanoBananaNegative"
                value={imageGenConfig.nanobanana?.negativePrompt || ''}
                onChange={(e) =>
                  setImageGenConfig({
                    ...imageGenConfig,
                    nanobanana: {
                      ...imageGenConfig.nanobanana!,
                      negativePrompt: e.target.value,
                    },
                  })
                }
                placeholder={t('settings.imagegen.nanobanana.negativePromptPlaceholder')}
                className="min-h-[100px]"
              />
            </div>

            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={handleTestNanoBananaConnection}
                disabled={
                  !imageGenConfig.nanobanana?.apiKey.trim() ||
                  isTestingConnection ||
                  !imageGenConfig.nanobanana?.enabled
                }
              >
                {isTestingConnection ? t('common.testing') : t('common.testConnection')}
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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

      <div className="flex justify-end">
        <Button
          onClick={onSave}
          disabled={
            isSaving ||
            (imageGenConfig.provider === 'comfyui' &&
              imageGenConfig.comfyui?.enabled &&
              !imageGenConfig.comfyui?.httpUrl.trim()) ||
            (imageGenConfig.provider === 'nanobanana' &&
              imageGenConfig.nanobanana?.enabled &&
              !imageGenConfig.nanobanana?.apiKey.trim())
          }
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </Button>
      </div>
    </div>
  );
}
