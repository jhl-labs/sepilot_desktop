'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ComfyUIConfig, NetworkConfig } from '@/types';

interface ComfyUISettingsTabProps {
  comfyConfig: ComfyUIConfig;
  setComfyConfig: React.Dispatch<React.SetStateAction<ComfyUIConfig>>;
  networkConfig: NetworkConfig;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
  setMessage: React.Dispatch<React.SetStateAction<{ type: 'success' | 'error'; text: string } | null>>;
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
  const [isTestingComfy, setIsTestingComfy] = useState(false);

  const handleTestComfyConnection = async () => {
    setIsTestingComfy(true);
    setMessage(null);

    try {
      if (!comfyConfig.httpUrl.trim()) {
        throw new Error('ComfyUI HTTP URL을 입력해주세요.');
      }

      // Electron 환경: IPC를 통해 Main Process에서 호출 (CORS 없음, Network Config 사용)
      if (typeof window !== 'undefined' && window.electronAPI?.comfyui) {
        // customHeaders는 LLM 전용이므로 ComfyUI에는 전달하지 않음
        const { customHeaders, ...networkConfigWithoutCustomHeaders } = networkConfig;
        const result = await window.electronAPI.comfyui.testConnection(
          comfyConfig.httpUrl,
          comfyConfig.apiKey,
          networkConfigWithoutCustomHeaders
        );

        if (!result.success) {
          throw new Error(result.error || 'ComfyUI 서버 연결 테스트에 실패했습니다.');
        }

        setMessage({ type: 'success', text: 'ComfyUI 서버와 연결되었습니다.' });
      } else {
        // 브라우저 환경 (fallback): 직접 fetch
        console.warn('[ComfyUI] Running in browser mode - CORS may occur, Network Config not applied');
        const normalizedUrl = comfyConfig.httpUrl.replace(/\/$/, '');
        const response = await fetch(`${normalizedUrl}/system_stats`, {
          headers: comfyConfig.apiKey
            ? {
                Authorization: `Bearer ${comfyConfig.apiKey}`,
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
      setIsTestingComfy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-md border bg-muted/40 p-4 space-y-2">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold">ComfyUI 연결</h3>
            <p className="text-xs text-muted-foreground mt-1">
              이미지 생성을 위해 사용할 ComfyUI REST/WebSocket 엔드포인트와 기본 워크플로우를 설정합니다.
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
            토글을 활성화하면 아래 설정을 편집할 수 있습니다.
          </p>
        )}
      </div>

      <div className={`space-y-4 ${!comfyConfig.enabled ? 'opacity-60 pointer-events-none' : ''}`}>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="comfyHttp">HTTP Endpoint</Label>
            <Input
              id="comfyHttp"
              value={comfyConfig.httpUrl}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  httpUrl: e.target.value,
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
              value={comfyConfig.wsUrl}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  wsUrl: e.target.value,
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
              value={comfyConfig.workflowId}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  workflowId: e.target.value,
                })
              }
              placeholder="workflow.json 또는 prompt ID"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="comfyClientId">Client ID</Label>
            <Input
              id="comfyClientId"
              value={comfyConfig.clientId || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  clientId: e.target.value,
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
              value={comfyConfig.apiKey || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  apiKey: e.target.value,
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
              value={comfyConfig.seed ?? -1}
              onChange={(e) => {
                const parsed = parseInt(e.target.value, 10);
                setComfyConfig({
                  ...comfyConfig,
                  seed: Number.isNaN(parsed) ? undefined : parsed,
                });
              }}
              placeholder="-1"
            />
            <p className="text-xs text-muted-foreground">-1이면 ComfyUI가 자동 Seed를 사용합니다.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="comfySteps">Steps</Label>
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
            <Label htmlFor="comfyCfg">CFG Scale</Label>
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
              value={comfyConfig.positivePrompt || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  positivePrompt: e.target.value,
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
              value={comfyConfig.negativePrompt || ''}
              onChange={(e) =>
                setComfyConfig({
                  ...comfyConfig,
                  negativePrompt: e.target.value,
                })
              }
              placeholder="불필요한 요소를 제거하기 위한 네거티브 프롬프트"
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
          {isTestingComfy ? '테스트 중...' : '연결 테스트'}
        </Button>
        <Button onClick={onSave} disabled={isSaving || (comfyConfig.enabled && !comfyConfig.httpUrl.trim())}>
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>
    </div>
  );
}
