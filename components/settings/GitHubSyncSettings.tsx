'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Github,
  Settings,
  Image,
  MessageSquare,
  User,
  RefreshCw,
  Check,
  AlertTriangle,
  Bug,
} from 'lucide-react';
import { GitHubSyncConfig } from '@/types';

interface GitHubSyncSettingsProps {
  config: GitHubSyncConfig | null;
  onSave: (config: GitHubSyncConfig) => Promise<void>;
}

interface SyncItemConfig {
  id: 'settings' | 'images' | 'conversations' | 'personas';
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  warning?: string;
}

export function GitHubSyncSettings({ config, onSave }: GitHubSyncSettingsProps) {
  const { t } = useTranslation();
  // Form states
  const [serverType, setServerType] = useState<'github.com' | 'ghes'>(
    config?.serverType || 'github.com'
  );
  const [ghesUrl, setGhesUrl] = useState(config?.ghesUrl || '');
  const [token, setToken] = useState(config?.token || '');
  const [owner, setOwner] = useState(config?.owner || '');
  const [repo, setRepo] = useState(config?.repo || '');
  const [branch, setBranch] = useState(config?.branch || 'main');

  // Sync options
  const [syncItems, setSyncItems] = useState<SyncItemConfig[]>([
    {
      id: 'settings',
      title: 'Settings',
      description: 'Settings',
      icon: Settings,
      enabled: config?.syncSettings ?? true,
    },
    {
      id: 'personas',
      title: 'Personas',
      description: 'Personas',
      icon: User,
      enabled: config?.syncPersonas ?? false,
    },
    {
      id: 'images',
      title: 'Images',
      description: 'Images',
      icon: Image,
      enabled: config?.syncImages ?? false,
      warning: 'warning',
    },
    {
      id: 'conversations',
      title: 'Conversations',
      description: 'Conversations',
      icon: MessageSquare,
      enabled: config?.syncConversations ?? false,
      warning: 'warning',
    },
  ]);

  // UI states
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (config) {
      setServerType(config.serverType || 'github.com');
      setGhesUrl(config.ghesUrl || '');
      setToken(config.token || '');
      setOwner(config.owner || '');
      setRepo(config.repo || '');
      setBranch(config.branch || 'main');
      setErrorReportingEnabled(config.errorReporting ?? false);
      setSyncItems((prev) =>
        prev.map((item: any) => ({
          ...item,
          enabled:
            item.id === 'settings'
              ? (config.syncSettings ?? true)
              : item.id === 'personas'
                ? (config.syncPersonas ?? false)
                : item.id === 'images'
                  ? (config.syncImages ?? false)
                  : (config.syncConversations ?? false),
        }))
      );
    }
  }, [config]);

  const toggleSyncItem = (id: string) => {
    setSyncItems((prev) =>
      prev.map((item: any) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const handleTestConnection = async () => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.fillAll') });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.ghesUrlRequired') });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const testConfig: GitHubSyncConfig = {
        serverType,
        ghesUrl: serverType === 'ghes' ? ghesUrl : undefined,
        token,
        owner,
        repo,
        branch,
        syncSettings: syncItems.find((i) => i.id === 'settings')?.enabled ?? true,
        syncDocuments: false,
        syncImages: syncItems.find((i) => i.id === 'images')?.enabled ?? false,
        syncConversations: syncItems.find((i) => i.id === 'conversations')?.enabled ?? false,
        syncPersonas: syncItems.find((i) => i.id === 'personas')?.enabled ?? false,
      };

      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.githubSync.testConnection(testConfig);

        if (result.success) {
          setMessage({
            type: 'success',
            text: result.message || t('settings.githubSync.messages.testSuccess'),
          });
        } else {
          throw new Error(result.error || t('settings.githubSync.messages.testFailed'));
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Connection test failed:', err);
      setMessage({
        type: 'error',
        text: err.message || t('settings.githubSync.messages.testFailed'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  // Error reporting state
  const [errorReportingEnabled, setErrorReportingEnabled] = useState(
    config?.errorReporting ?? false
  );

  const handleSave = async () => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.fillAll') });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.ghesUrlRequired') });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const newConfig: GitHubSyncConfig = {
        serverType,
        ghesUrl: serverType === 'ghes' ? ghesUrl : undefined,
        token,
        owner,
        repo,
        branch: branch || 'main',
        syncSettings: syncItems.find((i) => i.id === 'settings')?.enabled ?? true,
        syncDocuments: false,
        syncImages: syncItems.find((i) => i.id === 'images')?.enabled ?? false,
        syncConversations: syncItems.find((i) => i.id === 'conversations')?.enabled ?? false,
        syncPersonas: syncItems.find((i) => i.id === 'personas')?.enabled ?? false,
        errorReporting: errorReportingEnabled,
      };

      await onSave(newConfig);
      setMessage({ type: 'success', text: t('settings.githubSync.messages.saveSuccess') });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to save config:', err);
      setMessage({
        type: 'error',
        text: err.message || t('settings.githubSync.messages.saveFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async (type: 'settings' | 'images' | 'conversations' | 'personas' | 'all') => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.saveFirst') });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.ghesUrlRequired') });
      return;
    }

    setIsSyncing(type);
    setMessage(null);

    try {
      const syncConfig: GitHubSyncConfig = {
        serverType,
        ghesUrl: serverType === 'ghes' ? ghesUrl : undefined,
        token,
        owner,
        repo,
        branch: branch || 'main',
        syncSettings: syncItems.find((i) => i.id === 'settings')?.enabled ?? true,
        syncDocuments: false,
        syncImages: syncItems.find((i) => i.id === 'images')?.enabled ?? false,
        syncConversations: syncItems.find((i) => i.id === 'conversations')?.enabled ?? false,
        syncPersonas: syncItems.find((i) => i.id === 'personas')?.enabled ?? false,
      };

      if (typeof window !== 'undefined' && window.electronAPI) {
        let result;

        switch (type) {
          case 'settings':
            result = await window.electronAPI.githubSync.syncSettings(syncConfig);
            if (result.success) {
              setMessage({
                type: 'success',
                text:
                  result.message ||
                  t('settings.githubSync.messages.syncSuccess', {
                    type: t('settings.sync.settings.title'),
                  }),
              });
            } else {
              throw new Error(
                result.error ||
                  t('settings.githubSync.messages.syncFailed', {
                    type: t('settings.sync.settings.title'),
                  })
              );
            }
            break;
          case 'personas':
            result = await window.electronAPI.githubSync.syncPersonas(syncConfig);
            if (result.success) {
              setMessage({
                type: 'success',
                text:
                  result.message ||
                  t('settings.githubSync.messages.syncSuccess', {
                    type: t('settings.sync.personas.title'),
                  }),
              });
            } else {
              throw new Error(
                result.error ||
                  t('settings.githubSync.messages.syncFailed', {
                    type: t('settings.sync.personas.title'),
                  })
              );
            }
            break;
          case 'images':
            result = await window.electronAPI.githubSync.syncImages(syncConfig);
            if (result.success) {
              setMessage({
                type: 'success',
                text:
                  result.message ||
                  t('settings.githubSync.messages.syncSuccess', {
                    type: t('settings.sync.images.title'),
                  }),
              });
            } else {
              throw new Error(
                result.error ||
                  t('settings.githubSync.messages.syncFailed', {
                    type: t('settings.sync.images.title'),
                  })
              );
            }
            break;
          case 'conversations':
            result = await window.electronAPI.githubSync.syncConversations(syncConfig);
            if (result.success) {
              setMessage({
                type: 'success',
                text:
                  result.message ||
                  t('settings.githubSync.messages.syncSuccess', {
                    type: t('settings.sync.conversations.title'),
                  }),
              });
            } else {
              throw new Error(
                result.error ||
                  t('settings.githubSync.messages.syncFailed', {
                    type: t('settings.sync.conversations.title'),
                  })
              );
            }
            break;
          case 'all': {
            const allResult = await window.electronAPI.githubSync.syncAll(syncConfig);
            if (allResult.success) {
              setMessage({
                type: 'success',
                text: t('settings.githubSync.messages.syncSuccess', {
                  type: t('settings.githubSync.syncAll'),
                }),
              });
            } else {
              throw new Error(
                allResult.error ||
                  t('settings.githubSync.messages.syncFailed', {
                    type: t('settings.githubSync.syncAll'),
                  })
              );
            }
            break;
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Failed to sync ${type}:`, err);
      setMessage({
        type: 'error',
        text: err.message || t('settings.githubSync.messages.syncFailed', { type }),
      });
    } finally {
      setIsSyncing(null);
    }
  };

  const handlePullSettings = async () => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.saveFirst') });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl) {
      setMessage({ type: 'error', text: t('settings.githubSync.messages.ghesUrlRequired') });
      return;
    }

    setIsSyncing('pull-settings');
    setMessage(null);

    try {
      const syncConfig: GitHubSyncConfig = {
        serverType,
        ghesUrl: serverType === 'ghes' ? ghesUrl : undefined,
        token,
        owner,
        repo,
        branch: branch || 'main',
        syncSettings: syncItems.find((i) => i.id === 'settings')?.enabled ?? true,
        syncDocuments: false,
        syncImages: syncItems.find((i) => i.id === 'images')?.enabled ?? false,
        syncConversations: syncItems.find((i) => i.id === 'conversations')?.enabled ?? false,
        syncPersonas: syncItems.find((i) => i.id === 'personas')?.enabled ?? false,
      };

      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.githubSync.pullSettings(syncConfig);
        if (!result.success) {
          throw new Error(result.error || t('settings.githubSync.messages.pullFailed'));
        }

        const pulled = result.data?.githubSync;
        if (pulled) {
          setServerType(pulled.serverType || 'github.com');
          setGhesUrl(pulled.ghesUrl || '');
          setOwner(pulled.owner || '');
          setRepo(pulled.repo || '');
          setBranch(pulled.branch || 'main');
          setErrorReportingEnabled(pulled.errorReporting ?? false);
          setSyncItems((prev) =>
            prev.map((item: any) => ({
              ...item,
              enabled:
                item.id === 'settings'
                  ? (pulled.syncSettings ?? true)
                  : item.id === 'personas'
                    ? (pulled.syncPersonas ?? false)
                    : item.id === 'images'
                      ? (pulled.syncImages ?? false)
                      : (pulled.syncConversations ?? false),
            }))
          );
        }

        // 앱 전역에 설정 변경 브로드캐스트
        window.dispatchEvent(
          new CustomEvent('sepilot:config-updated', {
            detail: result.data ?? {},
          })
        );

        setMessage({
          type: 'success',
          text: result.message || t('settings.githubSync.messages.pullSuccess'),
        });
      }
    } catch (error: unknown) {
      const err = error as Error;
      setMessage({
        type: 'error',
        text: err.message || t('settings.githubSync.messages.pullFailed'),
      });
    } finally {
      setIsSyncing(null);
    }
  };

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          {message.type === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* GitHub 연결 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="h-5 w-5" />
            {t('settings.githubSync.title')}
          </CardTitle>
          <CardDescription>
            {t('settings.githubSync.description')}
            <br />
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {t('settings.githubSync.newTokenLink')}
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="serverType">{t('settings.githubSync.serverType')}</Label>
              <select
                title={t('settings.githubSync.serverType')}
                id="serverType"
                value={serverType}
                onChange={(e) => setServerType(e.target.value as 'github.com' | 'ghes')}
                className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
              >
                <option value="github.com" className="bg-background text-foreground">
                  GitHub.com
                </option>
                <option value="ghes" className="bg-background text-foreground">
                  GitHub Enterprise Server (GHES)
                </option>
              </select>
            </div>

            {serverType === 'ghes' && (
              <div className="col-span-2 space-y-2">
                <Label htmlFor="ghesUrl">{t('settings.githubSync.ghesUrl')}</Label>
                <Input
                  id="ghesUrl"
                  value={ghesUrl}
                  onChange={(e) => setGhesUrl(e.target.value)}
                  placeholder={t('settings.githubSync.ghesUrlPlaceholder')}
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.githubSync.ghesUrlDescription')}
                </p>
              </div>
            )}

            <div className="col-span-2 space-y-2">
              <Label htmlFor="token">{t('settings.githubSync.token')}</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t('settings.githubSync.tokenPlaceholder')}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.githubSync.tokenDescription')}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner">{t('settings.githubSync.owner')}</Label>
              <Input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder={t('settings.githubSync.ownerPlaceholder')}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo">{t('settings.githubSync.repo')}</Label>
              <Input
                id="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder={t('settings.githubSync.repoPlaceholder')}
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="branch">{t('settings.githubSync.branch')}</Label>
              <Input
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder={t('settings.githubSync.branchPlaceholder')}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleTestConnection}
              disabled={isTesting}
              variant="outline"
              className="flex-1"
            >
              {isTesting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.githubSync.testing')}
                </>
              ) : (
                <>
                  <Github className="mr-2 h-4 w-4" />
                  {t('settings.githubSync.testConnection')}
                </>
              )}
            </Button>

            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.githubSync.saving')}
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  {t('settings.githubSync.save')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 동기화 항목 카드 그리드 */}
      <div>
        <h3 className="text-lg font-semibold mb-4">{t('settings.githubSync.dataSync')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {syncItems.map((item: any) => {
            const Icon = item.icon;
            const isDisabled = !item.enabled || isSyncing !== null;
            const title = t(`settings.sync.${item.id}.title`);
            const description = t(`settings.sync.${item.id}.description`);
            const warningKey = `settings.sync.${item.id}.warning`;
            const hasWarning = item.id === 'images' || item.id === 'conversations';
            const warning = hasWarning ? t(warningKey) : undefined;

            return (
              <Card key={item.id} className={item.enabled ? 'border-primary/50' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-lg ${item.enabled ? 'bg-primary/10' : 'bg-muted'}`}
                      >
                        <Icon
                          className={`h-5 w-5 ${item.enabled ? 'text-primary' : 'text-muted-foreground'}`}
                        />
                      </div>
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {title}
                          {warning && (
                            <span className="text-xs font-normal text-yellow-600 dark:text-yellow-500">
                              ({warning})
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">{description}</CardDescription>
                      </div>
                    </div>
                    <Switch
                      checked={item.enabled}
                      onCheckedChange={() => toggleSyncItem(item.id)}
                    />
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex gap-2">
                    {item.id === 'settings' && (
                      <Button
                        onClick={handlePullSettings}
                        disabled={isDisabled}
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        {isSyncing === 'pull-settings' ? (
                          <>
                            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                            {t('settings.githubSync.pulling')}
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-2 h-3 w-3" />
                            {t('settings.githubSync.pull')}
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      onClick={() => handleSync(item.id)}
                      disabled={isDisabled}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      {isSyncing === item.id ? (
                        <>
                          <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                          {t('settings.githubSync.pushing')}
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-3 w-3" />
                          {t('settings.githubSync.push')}
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 전체 동기화 버튼 */}
      <Card className="border-primary/50 bg-primary/5">
        <CardContent className="pt-6">
          <Button
            onClick={() => handleSync('all')}
            disabled={isSyncing !== null}
            className="w-full h-12 text-base"
            size="lg"
          >
            {isSyncing === 'all' ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                {t('settings.githubSync.syncAllProgress')}
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-5 w-5" />
                {t('settings.githubSync.syncAll')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 마지막 동기화 정보 */}
      {config?.lastSyncAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('settings.githubSync.lastSync.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('settings.githubSync.lastSync.time')}:
                </span>
                <span className="font-medium">
                  {new Date(config.lastSyncAt).toLocaleString('ko-KR')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {t('settings.githubSync.lastSync.status')}:
                </span>
                <span
                  className={`font-medium ${
                    config.lastSyncStatus === 'success'
                      ? 'text-green-600 dark:text-green-500'
                      : 'text-red-600 dark:text-red-500'
                  }`}
                >
                  {config.lastSyncStatus === 'success'
                    ? t('settings.githubSync.lastSync.success')
                    : t('settings.githubSync.lastSync.failed')}
                </span>
              </div>
              {config.lastSyncError && (
                <div className="mt-2 p-2 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
                  {t('settings.githubSync.lastSync.error')}: {config.lastSyncError}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 에러 리포팅 설정 */}
      <Card className="border-blue-500/50 bg-blue-500/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bug className="h-5 w-5" />
            {t('settings.githubSync.errorReporting.title')}
          </CardTitle>
          <CardDescription>{t('settings.githubSync.errorReporting.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-card border">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                <p className="font-medium text-sm">
                  {t('settings.githubSync.errorReporting.enable')}
                </p>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-line">
                {t('settings.githubSync.errorReporting.enableDescription')}
              </p>
            </div>
            <Switch
              checked={errorReportingEnabled}
              onCheckedChange={setErrorReportingEnabled}
              disabled={!token || !owner || !repo}
            />
          </div>

          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm">
            <p className="font-medium mb-2 text-blue-600 dark:text-blue-500">
              {t('settings.githubSync.errorReporting.infoTitle')}
            </p>
            <ul className="space-y-1 text-xs list-disc list-inside text-blue-700 dark:text-blue-400">
              <li>{t('settings.githubSync.errorReporting.info1')}</li>
              <li>{t('settings.githubSync.errorReporting.info2')}</li>
              <li>{t('settings.githubSync.errorReporting.info3')}</li>
              <li>{t('settings.githubSync.errorReporting.info4')}</li>
              <li>{t('settings.githubSync.errorReporting.info5')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 보안 안내 */}
      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
        <p className="font-medium mb-2">{t('settings.githubSync.security.title')}</p>
        <ul className="space-y-1 text-xs list-disc list-inside text-yellow-700 dark:text-yellow-400">
          <li>{t('settings.githubSync.security.item1')}</li>
          <li>{t('settings.githubSync.security.item2')}</li>
          <li>{t('settings.githubSync.security.item3')}</li>
          <li>{t('settings.githubSync.security.item4')}</li>
        </ul>
      </div>
    </div>
  );
}
