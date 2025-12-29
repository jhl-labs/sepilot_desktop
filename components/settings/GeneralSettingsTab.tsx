'use client';

import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/components/providers/i18n-provider';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import {
  Loader2,
  Languages,
  AlertCircle,
  Info,
  Download,
  ExternalLink,
  PackageCheck,
} from 'lucide-react';
import { useState } from 'react';
import type { SupportedLanguage } from '@/lib/i18n';
import { logger } from '@/lib/utils/logger';
import { httpFetch } from '@/lib/http';
import type { NetworkConfig } from '@/types';

interface GeneralSettingsTabProps {
  onSave?: (language?: string) => void;
  isSaving?: boolean;
  message?: { type: 'success' | 'error'; text: string } | null;
}

interface GitHubRelease {
  tag_name: string;
  name: string;
  html_url: string;
  published_at: string;
}

// package.json에서 버전 정보 가져오기
const getAppVersion = (): string => {
  try {
    // Webpack 빌드 시점에 주입되는 버전 정보 사용
    return process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
  } catch {
    return '0.0.0';
  }
};

export function GeneralSettingsTab({ onSave, isSaving, message }: GeneralSettingsTabProps) {
  const { t } = useTranslation();
  const { language, setLanguage, supportedLanguages } = useLanguage();
  const [selectedLanguage, setSelectedLanguage] = useState<SupportedLanguage>(language);
  const [isChanging, setIsChanging] = useState(false);

  // Version check state
  const [currentVersion] = useState<string>(getAppVersion());
  const [latestRelease, setLatestRelease] = useState<GitHubRelease | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateCheckError, setUpdateCheckError] = useState<string | null>(null);

  const handleLanguageChange = async (value: string) => {
    setSelectedLanguage(value as SupportedLanguage);
  };

  const handleSave = async () => {
    if (selectedLanguage === language) {
      onSave?.(selectedLanguage);
      return;
    }

    setIsChanging(true);
    try {
      await setLanguage(selectedLanguage);
      onSave?.(selectedLanguage);
    } catch (error) {
      logger.error('Failed to change language:', error);
    } finally {
      setIsChanging(false);
    }
  };

  const checkForUpdates = async () => {
    setIsCheckingUpdate(true);
    setUpdateCheckError(null);

    try {
      // Load NetworkConfig from localStorage
      const networkConfigStr = localStorage.getItem('sepilot_network_config');
      const networkConfig: NetworkConfig | undefined = networkConfigStr
        ? JSON.parse(networkConfigStr)
        : undefined;

      const response = await httpFetch(
        'https://api.github.com/repos/jhl-labs/sepilot_desktop/releases/latest',
        { networkConfig }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: GitHubRelease = await response.json();
      setLatestRelease(data);
      logger.info('Latest release:', data.tag_name);
    } catch (error) {
      logger.error('Failed to check for updates:', error);
      setUpdateCheckError(t('settings.general.version.checkFailed'));
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const compareVersions = (
    current: string,
    latest: string
  ): 'up-to-date' | 'update-available' | 'unknown' => {
    try {
      // Remove 'v' prefix if exists
      const cleanCurrent = current.replace(/^v/, '');
      const cleanLatest = latest.replace(/^v/, '');

      if (cleanCurrent === cleanLatest) {
        return 'up-to-date';
      }

      const currentParts = cleanCurrent.split('.').map(Number);
      const latestParts = cleanLatest.split('.').map(Number);

      for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const curr = currentParts[i] || 0;
        const lat = latestParts[i] || 0;

        if (lat > curr) {
          return 'update-available';
        }
        if (lat < curr) {
          return 'up-to-date';
        }
      }

      return 'up-to-date';
    } catch {
      return 'unknown';
    }
  };

  const updateStatus = latestRelease
    ? compareVersions(currentVersion, latestRelease.tag_name)
    : null;
  const hasChanges = selectedLanguage !== language;

  return (
    <div className="space-y-6">
      <SettingsSectionHeader
        title={t('settings.general.title')}
        description={t('settings.general.description')}
      />

      {/* Version Information */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <PackageCheck className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t('settings.general.version.title')}</h3>
        </div>

        <div className="space-y-4 p-4 border rounded-lg bg-muted/20">
          {/* Current Version */}
          <div className="flex items-center justify-between">
            <Label>{t('settings.general.version.currentVersion')}</Label>
            <span className="font-mono text-sm font-semibold">v{currentVersion}</span>
          </div>

          {/* Latest Version */}
          {latestRelease && (
            <div className="flex items-center justify-between">
              <Label>{t('settings.general.version.latestVersion')}</Label>
              <span className="font-mono text-sm font-semibold">{latestRelease.tag_name}</span>
            </div>
          )}

          {/* Update Status */}
          {updateStatus === 'up-to-date' && (
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md text-sm">
              <Info className="h-4 w-4 text-green-600" />
              <span className="text-green-700 dark:text-green-400">
                {t('settings.general.version.upToDate')}
              </span>
            </div>
          )}

          {updateStatus === 'update-available' && (
            <div className="flex items-center gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-md text-sm">
              <Info className="h-4 w-4 text-blue-600" />
              <span className="text-blue-700 dark:text-blue-400">
                {t('settings.general.version.updateAvailable', {
                  version: latestRelease?.tag_name,
                })}
              </span>
            </div>
          )}

          {/* Update Check Error */}
          {updateCheckError && (
            <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-sm">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <span className="text-red-700 dark:text-red-400">{updateCheckError}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={checkForUpdates}
              disabled={isCheckingUpdate}
            >
              {isCheckingUpdate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('settings.general.version.checkForUpdates')}
            </Button>

            {latestRelease && updateStatus === 'update-available' && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => window.open(latestRelease.html_url, '_blank')}
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t('settings.general.version.downloadUpdate')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => window.open(latestRelease.html_url, '_blank')}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {t('settings.general.version.releaseNotes')}
                </Button>
              </>
            )}
          </div>

          {/* Development Warning */}
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-sm">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <div className="font-semibold text-amber-700 dark:text-amber-400">
                {t('settings.general.version.warning')}
              </div>
              <div className="text-amber-700/90 dark:text-amber-400/90">
                {t('settings.general.version.developmentWarning')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Language Selection */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Languages className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t('settings.general.language.title')}</h3>
        </div>

        <div className="space-y-2">
          <Label htmlFor="language-select">{t('settings.general.language.selectLanguage')}</Label>
          <Select value={selectedLanguage} onValueChange={handleLanguageChange}>
            <SelectTrigger id="language-select" className="w-[200px]">
              <SelectValue placeholder={t('settings.general.language.selectLanguage')} />
            </SelectTrigger>
            <SelectContent>
              {supportedLanguages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span className="flex items-center gap-2">
                    <span>{lang.nativeName}</span>
                    {lang.name !== lang.nativeName && (
                      <span className="text-muted-foreground text-sm">({lang.name})</span>
                    )}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {t('settings.general.language.description')}
          </p>
        </div>

        {hasChanges && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{t('settings.general.language.restartRequired')}</span>
          </div>
        )}
      </div>

      {/* Save Button and Message */}
      <div className="flex items-center gap-4 pt-4 border-t">
        <Button onClick={handleSave} disabled={isSaving || isChanging}>
          {(isSaving || isChanging) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>

        {message && (
          <p
            className={`text-sm ${message.type === 'success' ? 'text-green-600' : 'text-red-600'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
