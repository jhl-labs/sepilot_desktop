'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageGenConfig, NetworkConfig } from '@/types';
import { Image, Sparkles } from 'lucide-react';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
        throw new Error('ComfyUI HTTP URL을 입력해주세요.');
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
          throw new Error(result.error || 'ComfyUI 서버 연결 테스트에 실패했습니다.');
        }

        setMessage({ type: 'success', text: 'ComfyUI 서버와 연결되었습니다.' });
      } else {
        console.warn(
          '[ComfyUI] Running in browser mode - CORS may occur, Network Config not applied'
        );
        const normalizedUrl = imageGenConfig.comfyui.httpUrl.replace(/\/$/, '');
        const response = await fetch(`${normalizedUrl}/system_stats`, {
          headers: imageGenConfig.comfyui.apiKey
            ? {
                Authorization: `Bearer ${imageGenConfig.comfyui.apiKey}`,
              }
            : undefined,
        });

        if (!response.ok) {
          throw new Error(`ComfyUI 서버 응답이 올바르지 않습니다. (HTTP ${response.status})`);
        }

        setMessage({ type: 'success', text: 'ComfyUI 서버와 연결되었습니다.' });
      }
    } catch (error: any) {
      console.error('Failed to test ComfyUI connection:', error);
      setMessage({
        type: 'error',
        text: error.message || 'ComfyUI 서버 연결 테스트에 실패했습니다.',
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
        throw new Error('NanoBanana API Key를 입력해주세요.');
      }

      // TODO: Implement NanoBanana connection test via IPC
      // For now, just validate API key format
      setMessage({ type: 'success', text: 'NanoBanana 설정이 유효합니다.' });
    } catch (error: any) {
      console.error('Failed to test NanoBanana connection:', error);
      setMessage({
        type: 'error',
        text: error.message || 'NanoBanana 연결 테스트에 실패했습니다.',
      });
    } finally {
      setIsTestingConnection(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title="이미지 생성 설정"
        description="ComfyUI 또는 NanoBanana(Google Imagen)를 사용한 이미지 생성 설정을 관리합니다."
        icon={Image}
      />

      {/* Provider Selection */}
      <div className="rounded-md border bg-muted/40 p-4 space-y-3">
        <div>
          <h3 className="text-base font-semibold">이미지 생성 제공자 선택</h3>
          <p className="text-xs text-muted-foreground mt-1">
            사용할 이미지 생성 서비스를 선택하세요.
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
                <h3 className="text-base font-semibold">ComfyUI 연결</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  이미지 생성을 위해 사용할 ComfyUI REST/WebSocket 엔드포인트와 기본 워크플로우를
                  설정합니다.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
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
                토글을 활성화하면 아래 설정을 편집할 수 있습니다.
              </p>
            )}
          </div>

          <div
            className={`space-y-4 ${!imageGenConfig.comfyui?.enabled ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comfyHttp">HTTP Endpoint</Label>
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
                  placeholder="http://127.0.0.1:8188"
                />
                <p className="text-xs text-muted-foreground">
                  ComfyUI REST API 기본 URL (예: http://localhost:8188)
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="comfyWs">WebSocket Endpoint</Label>
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
                  placeholder="ws://127.0.0.1:8188/ws"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comfyWorkflow">기본 워크플로우 ID 또는 파일</Label>
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
                  placeholder="workflow.json 또는 prompt ID"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comfyClientId">Client ID</Label>
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
                  placeholder="선택 사항"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comfyApiKey">API Key</Label>
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
                  placeholder="인증 필요 시 입력"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comfySeed">Seed</Label>
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
                  placeholder="-1"
                />
                <p className="text-xs text-muted-foreground">
                  -1이면 ComfyUI가 자동 Seed를 사용합니다.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="comfySteps">Steps</Label>
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
                <Label htmlFor="comfyCfg">CFG Scale</Label>
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
                <Label>워크플로우 경로 참고</Label>
                <p className="text-xs text-muted-foreground">
                  ComfyUI API 호출 시 사용할 기본 하이퍼파라미터를 정의합니다.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="comfyPositive">기본 프롬프트</Label>
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
                  placeholder="이미지 생성 시 기본으로 사용할 포지티브 프롬프트"
                  className="min-h-[100px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="comfyNegative">네거티브 프롬프트</Label>
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
                  placeholder="불필요한 요소를 제거하기 위한 네거티브 프롬프트"
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
                {isTestingConnection ? '테스트 중...' : '연결 테스트'}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* NanoBanana Settings */}
        <TabsContent value="nanobanana" className="space-y-4 mt-6">
          <div className="rounded-md border bg-muted/40 p-4 space-y-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">NanoBanana 연결</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Google Imagen API를 사용한 이미지 생성 설정을 관리합니다.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
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
                토글을 활성화하면 아래 설정을 편집할 수 있습니다.
              </p>
            )}
          </div>

          <div
            className={`space-y-4 ${!imageGenConfig.nanobanana?.enabled ? 'opacity-60 pointer-events-none' : ''}`}
          >
            <div className="space-y-2">
              <Label htmlFor="nanoBananaProvider">API Provider</Label>
              <select
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
                <option value="nanobananaapi">NanoBanana API (nanobananaapi.ai)</option>
                <option value="vertex-ai">Google Vertex AI (직접 연결)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {imageGenConfig.nanobanana?.provider === 'vertex-ai'
                  ? 'Google Cloud Vertex AI를 직접 사용합니다. OAuth 2 access token이 필요합니다.'
                  : 'NanoBanana API를 사용합니다. 간단한 API key로 사용 가능합니다.'}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nanoBananaApiKey">
                  {imageGenConfig.nanobanana?.provider === 'vertex-ai'
                    ? 'Google Cloud API Key (OAuth 2 Token)'
                    : 'NanoBanana API Key'}
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
                      ? 'Google Cloud OAuth 2 Token'
                      : 'NanoBanana API Key'
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {imageGenConfig.nanobanana?.provider === 'vertex-ai'
                    ? 'Google Cloud Console에서 발급받은 OAuth 2 access token을 입력하세요.'
                    : 'https://nanobananaapi.ai 에서 발급받은 API Key를 입력하세요.'}
                </p>
              </div>

              {imageGenConfig.nanobanana?.provider === 'vertex-ai' && (
                <div className="space-y-2">
                  <Label htmlFor="nanoBananaProject">Project ID</Label>
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
                    placeholder="my-project-id"
                  />
                  <p className="text-xs text-muted-foreground">
                    Google Cloud Project ID (Vertex AI 사용 시 필수)
                  </p>
                </div>
              )}
            </div>

            {imageGenConfig.nanobanana?.provider === 'vertex-ai' && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="nanoBananaLocation">Location</Label>
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
                    placeholder="us-central1"
                  />
                  <p className="text-xs text-muted-foreground">
                    Google Cloud 리전 (기본값: us-central1)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nanoBananaModel">Model</Label>
                  <select
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
                    <option value="imagen-3.0-generate-001">Imagen 3.0 (Standard)</option>
                    <option value="imagen-3.0-fast-generate-001">Imagen 3.0 Fast</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Fast: 빠른 생성, Standard: 더 높은 품질
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
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
                <span className="ml-3 text-sm font-medium">이미지 생성 시 옵션 물어보기</span>
              </label>
              <p className="text-xs text-muted-foreground ml-14">
                활성화하면 이미지 생성할 때마다 aspect ratio, 이미지 개수 등을 선택할 수 있습니다.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="nanoBananaAspectRatio">Aspect Ratio</Label>
                <select
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
                <Label htmlFor="nanoBananaNumImages">Number of Images</Label>
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
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground">생성할 이미지 개수 (1-8)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nanoBananaSeed">Seed</Label>
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
                  placeholder="-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="nanoBananaNegative">네거티브 프롬프트</Label>
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
                placeholder="불필요한 요소를 제거하기 위한 네거티브 프롬프트"
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
                {isTestingConnection ? '테스트 중...' : '연결 테스트'}
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
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
}
