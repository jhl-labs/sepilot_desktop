'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { extensionRegistry } from '@/lib/extensions/registry';
import { ExtensionManifest } from '@/lib/extensions/types';
import { ExtensionCard } from './ExtensionCard';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Puzzle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { ExtensionStateConfig, BetaConfig, AppConfig } from '@/types';

interface ExtensionInfo {
  manifest: ExtensionManifest;
  isActive: boolean;
  canDeactivate: boolean;
}

interface ExtensionManagerTabProps {
  onSectionChange?: (section: string) => void;
  message?: { type: 'success' | 'error'; text: string } | null;
}

function isElectron(): boolean {
  return typeof window !== 'undefined' && !!window.electronAPI;
}

export function ExtensionManagerTab({ onSectionChange, message }: ExtensionManagerTabProps) {
  const { t } = useTranslation();
  const [extensions, setExtensions] = useState<ExtensionInfo[]>([]);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [localMessage, setLocalMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(message || null);

  // Extension 목록 로드
  useEffect(() => {
    loadExtensions();
  }, []);

  // 외부 message 업데이트 반영
  useEffect(() => {
    setLocalMessage(message || null);
  }, [message]);

  const loadExtensions = () => {
    const allExtensions = extensionRegistry.getAll();
    const extensionInfos: ExtensionInfo[] = allExtensions
      .map((def) => {
        const isActive = extensionRegistry.isActive(def.manifest.id);
        const canDeactivate = extensionRegistry.canDeactivate(def.manifest.id);

        return {
          manifest: def.manifest,
          isActive,
          canDeactivate,
        };
      })
      .sort((a, b) => {
        // 활성화 상태 우선
        if (a.isActive !== b.isActive) {
          return a.isActive ? -1 : 1;
        }

        // order 순서
        const orderA = a.manifest.order ?? 999;
        const orderB = b.manifest.order ?? 999;
        if (orderA !== orderB) {
          return orderA - orderB;
        }

        // 이름 알파벳순
        return a.manifest.name.localeCompare(b.manifest.name);
      });

    setExtensions(extensionInfos);
  };

  const handleToggle = async (extensionId: string, enabled: boolean) => {
    setTogglingId(extensionId);
    setLocalMessage(null);

    try {
      const manifest = extensionRegistry.getManifest(extensionId);
      if (!manifest) {
        throw new Error(t('settings.extensions.notFound'));
      }

      if (enabled) {
        // 활성화
        await extensionRegistry.activate(extensionId);
      } else {
        // 비활성화
        if (!extensionRegistry.canDeactivate(extensionId)) {
          throw new Error(t('settings.extensions.cannotDeactivate'));
        }
        await extensionRegistry.deactivate(extensionId);
      }

      // BetaConfig 동기화
      if (manifest.betaFlag) {
        await updateBetaConfig(manifest.betaFlag, enabled);
      }

      // Extension 상태 저장
      await saveExtensionState(extensionId, enabled);

      // UI 업데이트
      loadExtensions();

      setLocalMessage({
        type: 'success',
        text: t('settings.extensions.saved'),
      });
    } catch (error) {
      console.error('[ExtensionManagerTab] Toggle failed:', error);
      setLocalMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : String(error) || t('settings.extensions.saveFailed'),
      });

      // 실패 시 원래 상태로 되돌리기
      loadExtensions();
    } finally {
      setTogglingId(null);
    }
  };

  const saveExtensionState = async (extensionId: string, enabled: boolean) => {
    try {
      // 현재 설정 로드
      const currentConfig = await loadAppConfig();
      const currentExtensionsConfig = currentConfig.extensions || {};

      // 새로운 Extension 상태 생성
      const newExtensionsConfig: ExtensionStateConfig = {
        ...currentExtensionsConfig,
        [extensionId]: {
          enabled,
          settings: currentExtensionsConfig[extensionId]?.settings,
        },
      };

      // 설정 저장
      await saveAppConfig({ extensions: newExtensionsConfig });
    } catch (error) {
      console.error('[ExtensionManagerTab] Failed to save extension state:', error);
      throw error;
    }
  };

  const updateBetaConfig = async (betaFlag: string, enabled: boolean) => {
    try {
      const currentConfig = await loadAppConfig();
      const currentBetaConfig = currentConfig.beta || {};

      const newBetaConfig: BetaConfig = {
        ...currentBetaConfig,
        [betaFlag]: enabled,
      };

      await saveAppConfig({ beta: newBetaConfig });

      // BetaConfig 업데이트 이벤트 발생
      window.dispatchEvent(
        new CustomEvent('sepilot:config-updated', {
          detail: { beta: newBetaConfig },
        })
      );
    } catch (error) {
      console.error('[ExtensionManagerTab] Failed to update beta config:', error);
      throw error;
    }
  };

  const loadAppConfig = async (): Promise<Partial<AppConfig>> => {
    if (isElectron() && window.electronAPI) {
      const result = await window.electronAPI.config.load();
      return result.data || {};
    } else {
      const saved = localStorage.getItem('sepilot_app_config');
      return saved ? JSON.parse(saved) : {};
    }
  };

  const saveAppConfig = async (partial: Partial<AppConfig>) => {
    const currentConfig = await loadAppConfig();
    const newConfig = {
      ...currentConfig,
      ...partial,
    };

    if (isElectron() && window.electronAPI) {
      await window.electronAPI.config.save(newConfig as AppConfig);
    }

    // localStorage 동기화 (Electron에서도 필요)
    localStorage.setItem('sepilot_app_config', JSON.stringify(newConfig));
  };

  const handleSettings = (manifest: ExtensionManifest) => {
    if (manifest.settingsTab && onSectionChange) {
      onSectionChange(manifest.settingsTab.id);
    }
  };

  // 활성화된 Extension과 비활성화된 Extension 분리
  const activeExtensions = extensions.filter((ext) => ext.isActive);
  const inactiveExtensions = extensions.filter((ext) => !ext.isActive);

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.extensions.title')}
        description={t('settings.extensions.description')}
        icon={Puzzle}
      />

      {/* 메시지 표시 */}
      {localMessage && (
        <Alert variant={localMessage.type === 'error' ? 'destructive' : 'default'}>
          {localMessage.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{localMessage.text}</AlertDescription>
        </Alert>
      )}

      {/* 활성화된 Extension */}
      {activeExtensions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t('settings.extensions.activeExtensions')} ({activeExtensions.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {activeExtensions.map((ext) => (
              <ExtensionCard
                key={ext.manifest.id}
                manifest={ext.manifest}
                isActive={ext.isActive}
                canDeactivate={ext.canDeactivate}
                onToggle={handleToggle}
                onSettings={
                  ext.manifest.settingsTab ? () => handleSettings(ext.manifest) : undefined
                }
                isToggling={togglingId === ext.manifest.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* 비활성화된 Extension */}
      {inactiveExtensions.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t('settings.extensions.availableExtensions')} ({inactiveExtensions.length})
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {inactiveExtensions.map((ext) => (
              <ExtensionCard
                key={ext.manifest.id}
                manifest={ext.manifest}
                isActive={ext.isActive}
                canDeactivate={ext.canDeactivate}
                onToggle={handleToggle}
                onSettings={
                  ext.manifest.settingsTab ? () => handleSettings(ext.manifest) : undefined
                }
                isToggling={togglingId === ext.manifest.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
