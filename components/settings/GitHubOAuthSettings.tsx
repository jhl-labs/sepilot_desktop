'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, AlertCircle, Github, TestTube2, ChevronRight } from 'lucide-react';
import { GitHubOAuthConfig } from '@/types';
import { GitHubRepository } from '@/lib/auth/types';

interface GitHubOAuthSettingsProps {
  config: GitHubOAuthConfig | null;
  onSave: (config: GitHubOAuthConfig) => Promise<void>;
}

type SetupStep = 'config' | 'install' | 'verify' | 'repository' | 'complete';

export function GitHubOAuthSettings({ config, onSave }: GitHubOAuthSettingsProps) {
  const { t } = useTranslation();
  // Form states
  const [serverType, setServerType] = useState<'github.com' | 'ghes'>(
    config?.serverType || 'github.com'
  );
  const [ghesUrl, setGhesUrl] = useState(config?.ghesUrl || '');
  const [appId, setAppId] = useState(config?.appId || '');
  const [_privateKeyFile, setPrivateKeyFile] = useState<File | null>(null);
  const [privateKeyUploaded, setPrivateKeyUploaded] = useState(false);
  const [installationId, setInstallationId] = useState(config?.installationId || '');
  const [selectedRepo, setSelectedRepo] = useState(config?.selectedRepo || '');

  // UI states
  const [currentStep, setCurrentStep] = useState<SetupStep>('config');
  const [repositories, setRepositories] = useState<GitHubRepository[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (config) {
      setServerType(config.serverType);
      setGhesUrl(config.ghesUrl || '');
      setAppId(config.appId);
      setInstallationId(config.installationId || '');
      setSelectedRepo(config.selectedRepo || '');

      // 설정이 있으면 적절한 단계로 이동
      if (config.selectedRepo) {
        setCurrentStep('complete');
      } else if (config.installationId) {
        setCurrentStep('repository');
      } else if (config.appId) {
        setCurrentStep('install');
      }
    }

    // Private key 존재 여부 확인
    const checkPrivateKey = async () => {
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.github.hasPrivateKey();
        if (result.success) {
          setPrivateKeyUploaded(result.data ?? false);
        }
      }
    };
    checkPrivateKey();
  }, [config]);

  const getBaseUrl = () => {
    return serverType === 'ghes' && ghesUrl ? ghesUrl : 'https://github.com';
  };

  const handlePrivateKeyUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const content = await file.text();

      // Private key 형식 검증
      if (!content.includes('BEGIN') || !content.includes('PRIVATE KEY')) {
        throw new Error(t('settings.githubOAuth.messages.invalidPrivateKey'));
      }

      // Electron API를 통해 데이터베이스에 암호화 저장
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.github.setPrivateKey(content);
        if (result.success) {
          setPrivateKeyFile(file);
          setPrivateKeyUploaded(true);
          setMessage({ type: 'success', text: t('settings.githubOAuth.messages.privateKeySaved') });
        } else {
          throw new Error(result.error || t('settings.githubOAuth.messages.privateKeySaveFailed'));
        }
      }
    } catch (error: any) {
      console.error('Failed to upload private key:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.githubOAuth.messages.privateKeyUploadFailed'),
      });
    }
  };

  const handleInstallApp = async () => {
    if (!appId.trim()) {
      setMessage({ type: 'error', text: t('settings.githubOAuth.messages.appIdRequired') });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl.trim()) {
      setMessage({ type: 'error', text: t('settings.githubOAuth.messages.ghesUrlRequired') });
      return;
    }

    if (!privateKeyUploaded) {
      setMessage({ type: 'error', text: t('settings.githubOAuth.messages.privateKeyRequired') });
      return;
    }

    try {
      const baseUrl = getBaseUrl();
      const loginUrl = `${baseUrl}/apps/${appId}/installations/new`;

      // Open GitHub App installation page
      if (typeof window !== 'undefined' && window.electronAPI) {
        await window.electronAPI.shell.openExternal(loginUrl);
        setMessage({
          type: 'success',
          text: t('settings.githubOAuth.messages.installPageOpened'),
        });
        setCurrentStep('verify');
      }
    } catch (error: any) {
      console.error('Failed to open installation page:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.githubOAuth.messages.installPageFailed'),
      });
    }
  };

  const handleVerifyInstallation = async () => {
    if (!installationId.trim()) {
      setMessage({
        type: 'error',
        text: t('settings.githubOAuth.messages.installationIdRequired'),
      });
      return;
    }

    setIsLoadingRepos(true);
    setMessage(null);

    try {
      const baseUrl = getBaseUrl();

      // Get network config for proxy and SSL settings
      const networkConfigStr = localStorage.getItem('sepilot_network_config');
      const networkConfig = networkConfigStr ? JSON.parse(networkConfigStr) : null;

      // Test connection and load repositories
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.github.getRepositories(
          baseUrl,
          appId,
          installationId,
          networkConfig
        );

        if (result.success && result.data) {
          setRepositories(result.data);
          setMessage({
            type: 'success',
            text: t('settings.githubOAuth.messages.connectionSuccess', {
              count: result.data.length,
            }),
          });
          setCurrentStep('repository');
        } else {
          throw new Error(result.error || t('settings.githubOAuth.messages.repoFetchFailed'));
        }
      } else {
        throw new Error(t('settings.githubOAuth.messages.electronApiUnavailable'));
      }
    } catch (error: any) {
      console.error('Failed to verify installation:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.githubOAuth.messages.verificationFailed'),
      });
      setRepositories([]);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedRepo) {
      setMessage({ type: 'error', text: t('settings.githubOAuth.messages.repoSelectRequired') });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const baseUrl = getBaseUrl();
      const networkConfigStr = localStorage.getItem('sepilot_network_config');
      const networkConfig = networkConfigStr ? JSON.parse(networkConfigStr) : null;

      // Test read/write access to the repository
      if (typeof window !== 'undefined' && window.electronAPI) {
        // TODO: 실제 연결 테스트 IPC 핸들러 추가 필요
        // const result = await window.electronAPI.github.testConnection(baseUrl, installationId, selectedRepo, networkConfig);

        // 임시: 레포지토리 목록 가져오기로 대체
        const result = await window.electronAPI.github.getRepositories(
          baseUrl,
          appId,
          installationId,
          networkConfig
        );

        if (result.success) {
          setMessage({
            type: 'success',
            text: t('settings.githubOAuth.messages.testSuccess'),
          });
        } else {
          throw new Error(result.error || t('settings.githubOAuth.messages.testFailed'));
        }
      }
    } catch (error: any) {
      console.error('Connection test failed:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.githubOAuth.messages.testFailed'),
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAll = async () => {
    if (!appId.trim()) {
      setMessage({ type: 'error', text: t('settings.githubOAuth.messages.appIdRequired') });
      return;
    }

    if (!installationId.trim()) {
      setMessage({
        type: 'error',
        text: t('settings.githubOAuth.messages.installationIdRequired'),
      });
      return;
    }

    if (!selectedRepo) {
      setMessage({ type: 'error', text: t('settings.githubOAuth.messages.repoSelectRequired') });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const newConfig: GitHubOAuthConfig = {
        serverType,
        ghesUrl: serverType === 'ghes' ? ghesUrl : undefined,
        appId,
        installationId,
        selectedRepo,
      };

      await onSave(newConfig);
      setMessage({ type: 'success', text: t('settings.githubOAuth.messages.saveSuccess') });
      setCurrentStep('complete');
    } catch (error: any) {
      console.error('Failed to save GitHub config:', error);
      setMessage({
        type: 'error',
        text: error.message || t('settings.githubOAuth.messages.saveFailed'),
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getStepStatus = (step: SetupStep): 'current' | 'completed' | 'pending' => {
    const steps: SetupStep[] = ['config', 'install', 'verify', 'repository', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);

    if (stepIndex < currentIndex) {
      return 'completed';
    }
    if (stepIndex === currentIndex) {
      return 'current';
    }
    return 'pending';
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

      {/* Progress Steps */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.githubOAuth.steps.statusTitle')}</CardTitle>
          <CardDescription>{t('settings.githubOAuth.steps.statusDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { step: 'config', label: t('settings.githubOAuth.steps.config'), icon: '⚙️' },
              { step: 'install', label: t('settings.githubOAuth.steps.install'), icon: '📦' },
              { step: 'verify', label: t('settings.githubOAuth.steps.verify'), icon: '✅' },
              { step: 'repository', label: t('settings.githubOAuth.steps.repository'), icon: '📁' },
              { step: 'complete', label: t('settings.githubOAuth.steps.complete'), icon: '🎉' },
            ].map(({ step, label, icon }) => {
              const status = getStepStatus(step as SetupStep);
              return (
                <div
                  key={step}
                  className={`flex items-center gap-3 p-2 rounded-md ${
                    status === 'current'
                      ? 'bg-blue-500/10 border border-blue-500/20'
                      : status === 'completed'
                        ? 'bg-green-500/10 border border-green-500/20'
                        : 'bg-gray-500/5 border border-gray-500/10'
                  }`}
                >
                  <span className="text-xl">{icon}</span>
                  <span
                    className={`flex-1 text-sm font-medium ${
                      status === 'current'
                        ? 'text-blue-600 dark:text-blue-400'
                        : status === 'completed'
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-gray-500'
                    }`}
                  >
                    {label}
                  </span>
                  {status === 'completed' && (
                    <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                  )}
                  {status === 'current' && (
                    <ChevronRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Basic Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.githubOAuth.config.title')}</CardTitle>
          <CardDescription>{t('settings.githubOAuth.config.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Server Type */}
          <div className="space-y-2">
            <Label htmlFor="serverType">{t('settings.githubOAuth.config.serverType')}</Label>
            <select
              title={t('settings.githubOAuth.config.serverType')}
              id="serverType"
              value={serverType}
              onChange={(e) => setServerType(e.target.value as 'github.com' | 'ghes')}
              disabled={currentStep !== 'config'}
              className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm disabled:opacity-50"
            >
              <option value="github.com" className="bg-background text-foreground">
                GitHub.com
              </option>
              <option value="ghes" className="bg-background text-foreground">
                GitHub Enterprise Server (GHES)
              </option>
            </select>
          </div>

          {/* GHES URL */}
          {serverType === 'ghes' && (
            <div className="space-y-2">
              <Label htmlFor="ghesUrl">{t('settings.githubOAuth.config.ghesUrl')}</Label>
              <Input
                id="ghesUrl"
                value={ghesUrl}
                onChange={(e) => setGhesUrl(e.target.value)}
                placeholder={t('settings.githubOAuth.config.ghesUrlPlaceholder')}
                disabled={currentStep !== 'config'}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.githubOAuth.config.ghesUrlDescription')}
              </p>
            </div>
          )}

          {/* App ID */}
          <div className="space-y-2">
            <Label htmlFor="appId">{t('settings.githubOAuth.config.appId')}</Label>
            <Input
              id="appId"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="123456"
              disabled={currentStep !== 'config'}
            />
            <p className="text-xs text-muted-foreground">
              {t('settings.githubOAuth.config.appIdDescription')}
            </p>
          </div>

          {/* Private Key Upload */}
          <div className="space-y-2">
            <Label htmlFor="privateKey">{t('settings.githubOAuth.config.privateKey')}</Label>
            <div className="flex items-center gap-2">
              <Input
                id="privateKey"
                type="file"
                accept=".pem"
                onChange={handlePrivateKeyUpload}
                disabled={currentStep !== 'config'}
                className="flex-1"
              />
              {privateKeyUploaded && (
                <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t('settings.githubOAuth.config.privateKeyDescription')}
            </p>
          </div>

          {currentStep === 'config' && (
            <Button
              onClick={() => {
                if (
                  !appId.trim() ||
                  (serverType === 'ghes' && !ghesUrl.trim()) ||
                  !privateKeyUploaded
                ) {
                  setMessage({
                    type: 'error',
                    text: t('settings.githubOAuth.config.validation.allFields'),
                  });
                  return;
                }
                setCurrentStep('install');
                setMessage(null);
              }}
              className="w-full"
            >
              {t('settings.githubOAuth.config.nextStep')}
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Install GitHub App */}
      {(currentStep === 'install' || getStepStatus('install') === 'completed') && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.githubOAuth.install.title')}</CardTitle>
            <CardDescription>{t('settings.githubOAuth.install.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
              <p className="font-medium">{t('settings.githubOAuth.install.guide.title')}</p>
              <ol className="mt-2 space-y-1 text-xs list-decimal list-inside">
                <li>{t('settings.githubOAuth.install.guide.step1')}</li>
                <li>{t('settings.githubOAuth.install.guide.step2')}</li>
                <li>{t('settings.githubOAuth.install.guide.step3')}</li>
                <li>{t('settings.githubOAuth.install.guide.step4')}</li>
              </ol>
            </div>

            {currentStep === 'install' && (
              <Button onClick={handleInstallApp} className="w-full">
                <Github className="mr-2 h-4 w-4" />
                {t('settings.githubOAuth.install.openPage')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Verify Installation */}
      {(currentStep === 'verify' || getStepStatus('verify') === 'completed') && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.githubOAuth.verify.title')}</CardTitle>
            <CardDescription>{t('settings.githubOAuth.verify.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="installationId">
                {t('settings.githubOAuth.verify.installationId')}
              </Label>
              <Input
                id="installationId"
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
                placeholder="12345678"
                disabled={currentStep !== 'verify'}
              />
              <p className="text-xs text-muted-foreground">
                {t('settings.githubOAuth.verify.installationIdDescription')}
              </p>
            </div>

            {currentStep === 'verify' && (
              <Button
                onClick={handleVerifyInstallation}
                disabled={isLoadingRepos || !installationId.trim()}
                className="w-full"
              >
                {isLoadingRepos ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="mr-2 h-4 w-4" />
                )}
                {t('settings.githubOAuth.verify.verifyAndFetch')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Repository Selection */}
      {(currentStep === 'repository' || getStepStatus('repository') === 'completed') &&
        repositories.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('settings.githubOAuth.repository.title')}</CardTitle>
              <CardDescription>{t('settings.githubOAuth.repository.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="selectedRepo">{t('settings.githubOAuth.repository.label')}</Label>
                <select
                  title={t('settings.githubOAuth.repository.label')}
                  id="selectedRepo"
                  value={selectedRepo}
                  onChange={(e) => setSelectedRepo(e.target.value)}
                  disabled={currentStep !== 'repository'}
                  className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm disabled:opacity-50"
                >
                  <option value="" className="bg-background text-foreground">
                    {t('settings.githubOAuth.repository.placeholder')}
                  </option>
                  {repositories.map((repo) => (
                    <option
                      key={repo.id}
                      value={repo.full_name}
                      className="bg-background text-foreground"
                    >
                      {repo.full_name}{' '}
                      {repo.private
                        ? `(${t('settings.githubOAuth.repository.private')})`
                        : `(${t('settings.githubOAuth.repository.public')})`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {selectedRepo
                    ? t('settings.githubOAuth.repository.selectedPrefix') + selectedRepo
                    : t('settings.githubOAuth.repository.noSelection')}
                </p>
              </div>

              {currentStep === 'repository' && selectedRepo && (
                <div className="space-y-2">
                  <Button
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    variant="outline"
                    className="w-full"
                  >
                    {isTesting ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube2 className="mr-2 h-4 w-4" />
                    )}
                    {t('settings.githubOAuth.repository.testConnection')}
                  </Button>

                  <Button onClick={handleSaveAll} disabled={isSaving} className="w-full">
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {t('settings.githubOAuth.repository.saveAll')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

      {/* Step 5: Complete */}
      {currentStep === 'complete' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.githubOAuth.complete.title')}</CardTitle>
            <CardDescription>{t('settings.githubOAuth.complete.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-600 dark:text-green-400">
              <p className="font-medium">{t('settings.githubOAuth.complete.successMessage')}</p>
              <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
                <li>
                  {t('settings.githubOAuth.complete.server')}:{' '}
                  {serverType === 'ghes' ? ghesUrl : 'GitHub.com'}
                </li>
                <li>App ID: {appId}</li>
                <li>Installation ID: {installationId}</li>
                <li>
                  {t('settings.githubOAuth.complete.repository')}: {selectedRepo}
                </li>
              </ul>
            </div>

            <Button onClick={() => setCurrentStep('config')} variant="outline" className="w-full">
              {t('settings.githubOAuth.complete.editSettings')}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Security Notice */}
      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
        <p className="font-medium">{t('settings.githubOAuth.security.title')}</p>
        <p className="mt-1 text-xs">{t('settings.githubOAuth.security.description')}</p>
      </div>
    </div>
  );
}
