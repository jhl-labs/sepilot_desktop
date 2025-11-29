'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NetworkConfig } from '@/types';
import { Network } from 'lucide-react';
import { SettingsSectionHeader } from './SettingsSectionHeader';

interface NetworkSettingsTabProps {
  networkConfig: NetworkConfig;
  setNetworkConfig: React.Dispatch<React.SetStateAction<NetworkConfig>>;
  onSave: () => Promise<void>;
  isSaving: boolean;
  message: { type: 'success' | 'error'; text: string } | null;
}

export function NetworkSettingsTab({
  networkConfig,
  setNetworkConfig,
  onSave,
  isSaving,
  message,
}: NetworkSettingsTabProps) {
  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title="Network 설정"
        description="프록시 및 SSL 인증서 검증 설정을 관리합니다. 이 설정은 LLM, ComfyUI, VectorDB, MCP 등 모든 외부 연결에 적용됩니다."
        icon={Network}
      />

      <div className="space-y-4">

        {/* Proxy Settings */}
        <div className="space-y-3 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <Label htmlFor="proxyEnabled" className="text-base font-semibold">프록시 설정</Label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                id="proxyEnabled"
                type="checkbox"
                checked={networkConfig.proxy?.enabled ?? false}
                onChange={(e) =>
                  setNetworkConfig({
                    ...networkConfig,
                    proxy: {
                      ...networkConfig.proxy,
                      enabled: e.target.checked,
                      mode: networkConfig.proxy?.mode || 'none',
                    } as any,
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
            </label>
          </div>

          {networkConfig.proxy?.enabled && (
            <div className="space-y-3 pl-4">
              <div className="space-y-2">
                <Label htmlFor="proxyMode">프록시 모드</Label>
                <select
                  id="proxyMode"
                  value={networkConfig.proxy?.mode || 'none'}
                  onChange={(e) =>
                    setNetworkConfig({
                      ...networkConfig,
                      proxy: {
                        ...networkConfig.proxy,
                        enabled: networkConfig.proxy?.enabled ?? false,
                        mode: e.target.value as 'system' | 'manual' | 'none',
                      } as any,
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
                >
                  <option value="none" className="bg-background text-foreground">사용 안 함</option>
                  <option value="system" className="bg-background text-foreground">시스템 프록시 사용</option>
                  <option value="manual" className="bg-background text-foreground">수동 설정</option>
                </select>
              </div>

              {networkConfig.proxy?.mode === 'manual' && (
                <div className="space-y-2">
                  <Label htmlFor="proxyUrl">프록시 URL</Label>
                  <Input
                    id="proxyUrl"
                    value={networkConfig.proxy?.url || ''}
                    onChange={(e) =>
                      setNetworkConfig({
                        ...networkConfig,
                        proxy: {
                          ...networkConfig.proxy,
                          enabled: networkConfig.proxy?.enabled ?? false,
                          mode: networkConfig.proxy?.mode || 'manual',
                          url: e.target.value,
                        } as any,
                      })
                    }
                    placeholder="http://proxy.example.com:8080"
                  />
                  <p className="text-xs text-muted-foreground">
                    예: http://proxy.example.com:8080 또는 socks5://127.0.0.1:1080
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SSL Verification */}
        <div className="space-y-2 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="sslVerify" className="text-base font-semibold">SSL 인증서 검증</Label>
              <p className="text-xs text-muted-foreground mt-1">
                자체 서명 인증서 사용 시 비활성화하세요
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                id="sslVerify"
                type="checkbox"
                checked={networkConfig.ssl?.verify ?? true}
                onChange={(e) =>
                  setNetworkConfig({
                    ...networkConfig,
                    ssl: {
                      verify: e.target.checked,
                    },
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/20 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
            </label>
          </div>
          {!(networkConfig.ssl?.verify ?? true) && (
            <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-xs text-yellow-600 dark:text-yellow-500">
              보안 경고: SSL 검증을 비활성화하면 중간자 공격에 취약할 수 있습니다.
            </div>
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? '저장 중...' : '저장'}
        </Button>
      </div>

      {message && (
        <div
          className={`rounded-md px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
