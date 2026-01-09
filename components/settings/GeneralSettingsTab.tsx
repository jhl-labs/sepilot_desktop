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
  Bell,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import type { SupportedLanguage } from '@/lib/i18n';
import { logger } from '@/lib/utils/logger';
import { httpFetch, safeJsonParse } from '@/lib/http';
import type { NetworkConfig } from '@/types';
import { MessageSquare } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';

// Chat width setting
const CHAT_WIDTH_KEY = 'sepilot_chat_message_width';
const DEFAULT_CHAT_WIDTH = 896; // max-w-4xl = 56rem = 896px
const MIN_CHAT_WIDTH = 640; // 40rem
const MAX_CHAT_WIDTH = 1536; // 96rem

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

  // Chat width state
  const [chatWidth, setChatWidth] = useState<number>(DEFAULT_CHAT_WIDTH);
  const [initialChatWidth, setInitialChatWidth] = useState<number>(DEFAULT_CHAT_WIDTH);

  // Notification test state
  const [isTestingNotification, setIsTestingNotification] = useState(false);
  const [notificationTestResult, setNotificationTestResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const { conversations, activeConversationId } = useChatStore();

  // Load chat width from localStorage on mount
  useEffect(() => {
    const savedWidth = localStorage.getItem(CHAT_WIDTH_KEY);
    if (savedWidth) {
      const width = parseInt(savedWidth, 10);
      if (!isNaN(width) && width >= MIN_CHAT_WIDTH && width <= MAX_CHAT_WIDTH) {
        setChatWidth(width);
        setInitialChatWidth(width);
      }
    }
  }, []);

  const handleChatWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatWidth(parseInt(e.target.value, 10));
  };

  const handleChatWidthSave = () => {
    localStorage.setItem(CHAT_WIDTH_KEY, chatWidth.toString());
    setInitialChatWidth(chatWidth);
    // Dispatch custom event to notify ChatArea
    window.dispatchEvent(new CustomEvent('sepilot:chat-width-change', { detail: chatWidth }));
  };

  const handleTestNotification = async () => {
    if (!isElectron() || !window.electronAPI?.notification) {
      setNotificationTestResult({
        type: 'error',
        message: '알림 기능은 Electron 환경에서만 사용할 수 있습니다.',
      });
      return;
    }

    setIsTestingNotification(true);
    setNotificationTestResult(null);

    try {
      // 현재 활성 대화 또는 첫 번째 대화 사용
      const testConversationId =
        activeConversationId || conversations[0]?.id || 'test-conversation';
      const testConversation = conversations.find((c) => c.id === testConversationId);
      const testTitle = testConversation?.title || '테스트 대화';

      await window.electronAPI.notification.show({
        conversationId: testConversationId,
        title: testTitle,
        body: '알림 테스트가 성공적으로 완료되었습니다!',
      });

      setNotificationTestResult({
        type: 'success',
        message: '테스트 알림이 표시되었습니다. 알림을 클릭하면 해당 대화로 이동합니다.',
      });
    } catch (error: any) {
      logger.error('[GeneralSettingsTab] Failed to show test notification:', error);
      setNotificationTestResult({
        type: 'error',
        message: `알림 표시 실패: ${error.message || '알 수 없는 오류'}`,
      });
    } finally {
      setIsTestingNotification(false);
    }
  };

  const handleLanguageChange = async (value: string) => {
    setSelectedLanguage(value as SupportedLanguage);
  };

  const handleSave = async () => {
    // Save chat width if changed
    if (hasChatWidthChanges) {
      handleChatWidthSave();
    }

    // Save language if changed
    if (hasLanguageChanges) {
      setIsChanging(true);
      try {
        await setLanguage(selectedLanguage);
      } catch (error) {
        logger.error('Failed to change language:', error);
      } finally {
        setIsChanging(false);
      }
    }

    onSave?.(selectedLanguage);
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

      const data: GitHubRelease = await safeJsonParse<GitHubRelease>(
        response,
        'https://api.github.com/repos/jhl-labs/sepilot_desktop/releases/latest'
      );
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
  const hasLanguageChanges = selectedLanguage !== language;
  const hasChatWidthChanges = chatWidth !== initialChatWidth;

  return (
    <div className="space-y-6" data-testid="general-settings">
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

        {hasLanguageChanges && (
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>{t('settings.general.language.restartRequired')}</span>
          </div>
        )}
      </div>

      {/* Chat Message Width Setting */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <MessageSquare className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-medium">{t('settings.general.chatWidth.title')}</h3>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="chat-width-slider">{t('settings.general.chatWidth.label')}</Label>
              <span className="text-sm text-muted-foreground font-mono">{chatWidth}px</span>
            </div>
            <input
              id="chat-width-slider"
              type="range"
              min={MIN_CHAT_WIDTH}
              max={MAX_CHAT_WIDTH}
              step={32}
              value={chatWidth}
              onChange={handleChatWidthChange}
              className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{MIN_CHAT_WIDTH}px</span>
              <span>{MAX_CHAT_WIDTH}px</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('settings.general.chatWidth.description')}
          </p>

          {/* Preview */}
          <div className="p-4 border rounded-lg bg-muted/20">
            <Label className="text-xs text-muted-foreground mb-2 block">
              {t('settings.general.chatWidth.preview')}
            </Label>
            <div
              className="bg-background border rounded-lg p-3 mx-auto transition-all duration-200"
              style={{ maxWidth: `${chatWidth}px` }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-6 h-6 rounded-full bg-primary/20" />
                <span className="text-xs text-muted-foreground">Assistant</span>
              </div>
              <div className="text-sm text-muted-foreground">
                {t('settings.general.chatWidth.previewText')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notification Test Section */}
      <div className="space-y-4">
        <SettingsSectionHeader
          icon={<Bell className="h-5 w-5" />}
          title="알림"
          description="백그라운드 스트리밍 완료 알림을 테스트합니다"
        />

        <div className="space-y-4">
          <div className="p-4 border rounded-lg bg-muted/20 space-y-3">
            <p className="text-sm text-muted-foreground">
              다른 대화를 보고 있거나 앱이 백그라운드에 있을 때 스트리밍이 완료되면 시스템 알림이
              표시됩니다.
            </p>

            <Button
              onClick={handleTestNotification}
              disabled={isTestingNotification}
              variant="outline"
              className="w-full"
            >
              {isTestingNotification && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Bell className="mr-2 h-4 w-4" />
              테스트 알림 보내기
            </Button>

            {notificationTestResult && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  notificationTestResult.type === 'success'
                    ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                    : 'bg-red-500/10 text-red-600 border border-red-500/20'
                }`}
              >
                {notificationTestResult.message}
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              💡 <strong>팁:</strong>
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>테스트 알림은 현재 활성 대화 제목으로 표시됩니다</li>
              <li>알림을 클릭하면 해당 대화로 자동 이동합니다</li>
              <li>실제 알림은 백그라운드에서 스트리밍이 완료될 때 자동으로 표시됩니다</li>
            </ul>
          </div>
        </div>
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
