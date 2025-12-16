'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NetworkConfig } from '@/types';
import { Network, RefreshCw } from 'lucide-react';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { isElectron } from '@/lib/platform';

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
  const { t } = useTranslation();
  const [envVars, setEnvVars] = useState<Record<string, string | undefined>>({});
  const [isLoadingEnv, setIsLoadingEnv] = useState(false);

  // 환경 변수 로드
  const loadEnvVars = async () => {
    if (!isElectron()) {
      return;
    }

    setIsLoadingEnv(true);
    try {
      const result = await window.electronAPI.config.getNetworkEnvVars();
      if (result.success && result.data) {
        setEnvVars(result.data);
      }
    } catch (error) {
      console.error('Failed to load environment variables:', error);
    } finally {
      setIsLoadingEnv(false);
    }
  };

  // 컴포넌트 마운트 시 환경 변수 로드
  useEffect(() => {
    loadEnvVars();
  }, []);

  // 설정된 환경 변수만 필터링
  const definedEnvVars = Object.entries(envVars).filter(([_, value]) => value !== undefined);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.network.title')}
        description={t('settings.network.proxy.description')}
        icon={Network}
      />

      <div className="space-y-4">
        {/* Proxy Settings */}
        <div className="space-y-3 p-4 rounded-lg border">
          <div className="flex items-center justify-between">
            <Label htmlFor="proxyEnabled" className="text-base font-semibold">
              {t('settings.network.proxy.title')}
            </Label>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                title={t('settings.network.proxy.title')}
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
                <Label htmlFor="proxyMode">{t('settings.network.proxy.mode')}</Label>
                <select
                  title={t('settings.network.proxy.mode')}
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
                  <option value="none" className="bg-background text-foreground">
                    {t('settings.network.proxy.modeNone')}
                  </option>
                  <option value="system" className="bg-background text-foreground">
                    {t('settings.network.proxy.modeSystem')}
                  </option>
                  <option value="manual" className="bg-background text-foreground">
                    {t('settings.network.proxy.modeManual')}
                  </option>
                </select>
              </div>

              {networkConfig.proxy?.mode === 'manual' && (
                <div className="space-y-2">
                  <Label htmlFor="proxyUrl">{t('settings.network.proxy.url')}</Label>
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
                    {t('settings.network.proxy.urlExample')}
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
              <Label htmlFor="sslVerify" className="text-base font-semibold">
                {t('settings.network.ssl.verify')}
              </Label>
              <p className="text-xs text-muted-foreground mt-1">
                {t('settings.network.ssl.verifyDescriptionShort')}
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                title={t('settings.network.ssl.verify')}
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
              {t('settings.network.ssl.securityWarning')}
            </div>
          )}
        </div>
      </div>

      {/* Environment Variables */}
      <div className="space-y-3 p-4 rounded-lg border">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-base font-semibold">{t('settings.network.envVars.title')}</Label>
            <p className="text-xs text-muted-foreground mt-1">
              {t('settings.network.envVars.description')}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={loadEnvVars}
            disabled={isLoadingEnv}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${isLoadingEnv ? 'animate-spin' : ''}`} />
            {t('settings.network.envVars.refresh')}
          </Button>
        </div>

        {definedEnvVars.length > 0 ? (
          <div className="mt-3 max-h-64 overflow-y-auto rounded border bg-muted/30">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted border-b">
                <tr>
                  <th className="text-left p-2 font-medium">
                    {t('settings.network.envVars.variableName')}
                  </th>
                  <th className="text-left p-2 font-medium">
                    {t('settings.network.envVars.value')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {definedEnvVars.map(([key, value]) => (
                  <tr key={key} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="p-2 font-mono text-xs text-primary">{key}</td>
                    <td className="p-2 font-mono text-xs break-all">{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="mt-3 text-center py-8 text-sm text-muted-foreground rounded border bg-muted/30">
            {isLoadingEnv
              ? t('settings.network.envVars.loading')
              : t('settings.network.envVars.noVars')}
          </div>
        )}

        <p className="text-xs text-muted-foreground">{t('settings.network.envVars.note')}</p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button onClick={onSave} disabled={isSaving}>
          {isSaving ? t('common.saving') : t('common.save')}
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
