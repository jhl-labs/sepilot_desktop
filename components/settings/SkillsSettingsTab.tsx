'use client';

import { useEffect, useState } from 'react';
import { SkillManager } from '@/components/skills/SkillManager';
import { Button } from '@/components/ui/button';
import { Store, Plus, Info, FolderOpen, RefreshCw, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Trans, useTranslation } from 'react-i18next';

export function SkillsSettingsTab() {
  const DEDUPE_STRATEGY_SETTING_KEY = 'skills_scan_dedupe_strategy';
  const INCLUDE_HIDDEN_DIRS_SETTING_KEY = 'skills_scan_include_hidden_dirs';
  const { t } = useTranslation();

  const [skillsRefreshKey, setSkillsRefreshKey] = useState(0);
  const [userSkillsFolder, setUserSkillsFolder] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [dedupeStrategy, setDedupeStrategy] = useState<
    'version_then_mtime' | 'mtime_only' | 'first_seen'
  >('version_then_mtime');
  const [includeHiddenDirs, setIncludeHiddenDirs] = useState(false);
  const [lastScanFailures, setLastScanFailures] = useState<Array<{ path: string; error: string }>>(
    []
  );
  const [skillGuideVisible, setSkillGuideVisible] = useState(false);

  const persistScanSetting = async (
    key: string,
    value: unknown,
    rollback: () => void,
    errorTitle: string
  ): Promise<void> => {
    try {
      const result = await window.electronAPI.config.updateSetting(key, value);
      if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        rollback();
        toast.error(errorTitle, {
          description: result.error,
        });
      }
    } catch (error) {
      rollback();
      toast.error(errorTitle, {
        description: String(error),
      });
    }
  };

  useEffect(() => {
    void (async () => {
      const result = await window.electronAPI.skills.getUserSkillsFolder();
      if (result.success) {
        setUserSkillsFolder(result.data ?? null);
      }

      const strategyResult = await window.electronAPI.config.getSetting(
        DEDUPE_STRATEGY_SETTING_KEY
      );
      if (
        strategyResult.success &&
        (strategyResult.data === 'version_then_mtime' ||
          strategyResult.data === 'mtime_only' ||
          strategyResult.data === 'first_seen')
      ) {
        setDedupeStrategy(strategyResult.data);
      }

      const hiddenDirsResult = await window.electronAPI.config.getSetting(
        INCLUDE_HIDDEN_DIRS_SETTING_KEY
      );
      if (hiddenDirsResult.success && typeof hiddenDirsResult.data === 'boolean') {
        setIncludeHiddenDirs(hiddenDirsResult.data);
      }
    })();
  }, []);

  const handleOpenMarketplace = () => {
    // TODO: Phase 2에서 마켓플레이스 다이얼로그 구현
    console.log('[SkillsSettings] Open marketplace - Not yet implemented');
  };

  const handleImportLocal = () => {
    void (async () => {
      try {
        const selectedDir = await window.electronAPI.skills.selectSkillsFolder();
        if (!selectedDir.success || !selectedDir.data) {
          return;
        }

        const installResult = await window.electronAPI.skills.installFromLocal(selectedDir.data);
        if (!installResult.success) {
          toast.error(t('settings.skills.toasts.importFailed'), {
            description: installResult.error,
          });
          return;
        }

        toast.success(t('settings.skills.toasts.importSuccess'), {
          description: `${installResult.data?.manifest.name ?? 'Skill'} (${installResult.data?.id ?? ''})`,
        });

        setSkillsRefreshKey((prev) => prev + 1);
      } catch (error) {
        toast.error(t('settings.skills.toasts.importError'), {
          description: String(error),
        });
      }
    })();
  };

  const handleSelectUserSkillsFolder = () => {
    void (async () => {
      try {
        const selected = await window.electronAPI.skills.selectSkillsFolder();
        if (!selected.success || !selected.data) {
          return;
        }

        const saved = await window.electronAPI.skills.setUserSkillsFolder(selected.data);
        if (!saved.success) {
          toast.error(t('settings.skills.toasts.saveFolderFailed'), {
            description: saved.error,
          });
          return;
        }

        setUserSkillsFolder(selected.data);
        toast.success(t('settings.skills.toasts.saveFolderSuccess'));
      } catch (error) {
        toast.error(t('settings.skills.toasts.saveFolderError'), {
          description: String(error),
        });
      }
    })();
  };

  const handleScanUserSkillsFolder = () => {
    void (async () => {
      setIsScanning(true);
      try {
        const result = await window.electronAPI.skills.scanUserSkillsFolder({
          dedupeStrategy,
          includeHiddenDirs,
        });
        if (!result.success || !result.data) {
          toast.error(t('settings.skills.toasts.scanFailed'), {
            description: result.error,
          });
          return;
        }

        const importedCount = result.data.imported.length;
        const failedCount = result.data.failed.length;
        const scannedCount = result.data.scanned;
        const deduplicatedCount = result.data.deduplicated;
        setLastScanFailures(result.data.failed.slice(0, 20));
        setSkillsRefreshKey((prev) => prev + 1);

        if (failedCount > 0) {
          const firstFailure = result.data.failed[0];
          toast.warning(t('settings.skills.toasts.scanPartial'), {
            description: t('settings.skills.toasts.scanPartialDesc', {
              scanned: scannedCount,
              deduplicated: deduplicatedCount,
              imported: importedCount,
              failed: failedCount,
              failureExample: firstFailure ? ` (${firstFailure.path})` : '',
            }),
          });
        } else if (scannedCount === 0) {
          toast.info(t('settings.skills.toasts.scanNoSkills'), {
            description: t('settings.skills.toasts.scanNoSkillsDesc'),
          });
        } else {
          toast.success(t('settings.skills.toasts.scanComplete'), {
            description: t('settings.skills.toasts.scanCompleteDesc', {
              scanned: scannedCount,
              deduplicated: deduplicatedCount,
              imported: importedCount,
            }),
          });
        }
      } catch (error) {
        toast.error(t('settings.skills.toasts.scanError'), {
          description: String(error),
        });
      } finally {
        setIsScanning(false);
      }
    })();
  };

  return (
    <div className="space-y-6">
      {/* 안내 메시지 */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>{t('settings.skills.title')}</AlertTitle>
        <AlertDescription>
          <span className="whitespace-pre-line">{t('settings.skills.description')}</span>
        </AlertDescription>
      </Alert>

      {/* 액션 버튼 */}
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setSkillGuideVisible((prev) => !prev)}
          aria-expanded={skillGuideVisible}
          aria-controls="skills-writing-guide"
        >
          <HelpCircle className="mr-2 h-4 w-4" />
          {skillGuideVisible ? t('settings.skills.hideGuide') : t('settings.skills.openGuide')}
        </Button>
        <Button onClick={handleOpenMarketplace} disabled>
          <Store className="mr-2 h-4 w-4" />
          {t('settings.skills.openMarketplace')}
          <span className="ml-2 rounded bg-primary/20 px-1.5 py-0.5 text-xs">
            {t('settings.skills.comingSoon')}
          </span>
        </Button>
        <Button variant="outline" onClick={handleImportLocal}>
          <Plus className="mr-2 h-4 w-4" />
          {t('settings.skills.importLocal')}
        </Button>
      </div>

      {skillGuideVisible && (
        <div
          id="skills-writing-guide"
          role="region"
          aria-labelledby="skills-writing-guide-title"
          className="rounded-lg border p-4 space-y-3"
        >
          <h4 id="skills-writing-guide-title" className="text-sm font-semibold">
            {t('settings.skills.skillGuideTitle')}
          </h4>
          <p className="text-xs text-muted-foreground">
            {t('settings.skills.skillGuideDescription')}
          </p>
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {t('settings.skills.skillGuideSummary')}
          </p>
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 text-xs text-foreground">
            {t('settings.skills.skillGuideExample')}
          </pre>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <Trans
          i18nKey="settings.skills.localImportGuide"
          components={{ 1: <code />, 3: <code />, 5: <code />, 7: <code /> }}
        />
      </p>

      <div className="rounded-lg border p-4 space-y-3">
        <div>
          <h4 className="text-sm font-semibold">{t('settings.skills.userSkillsFolder')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('settings.skills.userSkillsFolderDesc')}
          </p>
        </div>
        <div className="text-xs text-muted-foreground break-all">
          {t('settings.skills.currentFolder', {
            path: userSkillsFolder || t('settings.skills.notSet'),
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSelectUserSkillsFolder}>
            <FolderOpen className="mr-2 h-4 w-4" />
            {t('settings.skills.selectFolder')}
          </Button>
          <Button
            variant="outline"
            onClick={handleScanUserSkillsFolder}
            disabled={!userSkillsFolder || isScanning}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {isScanning ? t('settings.skills.scanning') : t('settings.skills.scanFolder')}
          </Button>
        </div>
        <div className="space-y-1">
          <label
            htmlFor="skills-dedupe-strategy"
            className="text-xs font-medium text-muted-foreground"
          >
            {t('settings.skills.dedupeStrategy')}
          </label>
          <select
            id="skills-dedupe-strategy"
            className="h-9 w-full max-w-xs rounded-md border bg-background px-3 text-sm"
            value={dedupeStrategy}
            onChange={(e) =>
              void (async () => {
                const previous = dedupeStrategy;
                const nextStrategy = e.target.value as
                  | 'version_then_mtime'
                  | 'mtime_only'
                  | 'first_seen';
                setDedupeStrategy(nextStrategy);
                await persistScanSetting(
                  DEDUPE_STRATEGY_SETTING_KEY,
                  nextStrategy,
                  () => setDedupeStrategy(previous),
                  t('settings.skills.toasts.saveStrategyFailed')
                );
              })()
            }
          >
            <option value="version_then_mtime">{t('settings.skills.strategies.version')}</option>
            <option value="mtime_only">{t('settings.skills.strategies.mtime')}</option>
            <option value="first_seen">{t('settings.skills.strategies.first')}</option>
          </select>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={includeHiddenDirs}
              onChange={(e) =>
                void (async () => {
                  const previous = includeHiddenDirs;
                  const checked = e.target.checked;
                  setIncludeHiddenDirs(checked);
                  await persistScanSetting(
                    INCLUDE_HIDDEN_DIRS_SETTING_KEY,
                    checked,
                    () => setIncludeHiddenDirs(previous),
                    t('settings.skills.toasts.saveHiddenOptionFailed')
                  );
                })()
              }
            />
            {t('settings.skills.includeHidden')}
          </label>
          {lastScanFailures.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                const text = lastScanFailures
                  .map((item) => `${item.path}\n${item.error}`)
                  .join('\n\n');
                void navigator.clipboard
                  .writeText(text)
                  .then(() => {
                    toast.success(t('settings.skills.toasts.copyFailuresSuccess'));
                  })
                  .catch((error) => {
                    toast.error(t('settings.skills.toasts.copyFailuresError'), {
                      description: String(error),
                    });
                  });
              }}
            >
              {t('settings.skills.copyFailures')}
            </Button>
          )}
        </div>
      </div>

      {lastScanFailures.length > 0 && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 space-y-2">
          <h4 className="text-sm font-semibold">{t('settings.skills.recentFailures')}</h4>
          <ul className="max-h-52 space-y-1 overflow-auto text-xs text-muted-foreground">
            {lastScanFailures.map((item, idx) => (
              <li key={`${item.path}-${idx}`} className="break-all">
                <span className="font-medium text-foreground">{item.path}</span>
                <br />
                {item.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 스킬 목록 */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold">{t('settings.skills.installedSkills')}</h3>
          <p className="text-sm text-muted-foreground">
            {t('settings.skills.installedSkillsDesc')}
          </p>
        </div>
        <SkillManager
          key={skillsRefreshKey}
          onRefresh={() => {
            setSkillsRefreshKey((prev) => prev + 1);
          }}
        />
      </div>
    </div>
  );
}
