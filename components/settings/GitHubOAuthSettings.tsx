'use client';

import { useState, useEffect } from 'react';
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
    if (!file) {return;}

    try {
      const content = await file.text();

      // Private key 형식 검증
      if (!content.includes('BEGIN') || !content.includes('PRIVATE KEY')) {
        throw new Error('유효하지 않은 Private Key 파일 형식입니다.');
      }

      // Electron API를 통해 데이터베이스에 암호화 저장
      if (typeof window !== 'undefined' && window.electronAPI) {
        const result = await window.electronAPI.github.setPrivateKey(content);
        if (result.success) {
          setPrivateKeyFile(file);
          setPrivateKeyUploaded(true);
          setMessage({ type: 'success', text: 'Private Key가 안전하게 저장되었습니다.' });
        } else {
          throw new Error(result.error || 'Private Key 저장에 실패했습니다.');
        }
      }
    } catch (error: any) {
      console.error('Failed to upload private key:', error);
      setMessage({ type: 'error', text: error.message || 'Private Key 업로드에 실패했습니다.' });
    }
  };

  const handleInstallApp = async () => {
    if (!appId.trim()) {
      setMessage({ type: 'error', text: 'App ID를 입력해주세요.' });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl.trim()) {
      setMessage({ type: 'error', text: 'GHES URL을 입력해주세요.' });
      return;
    }

    if (!privateKeyUploaded) {
      setMessage({ type: 'error', text: 'Private Key를 먼저 업로드해주세요.' });
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
          text: '브라우저에서 GitHub App을 설치해주세요. 설치 후 Installation ID를 입력하세요.',
        });
        setCurrentStep('verify');
      }
    } catch (error: any) {
      console.error('Failed to open installation page:', error);
      setMessage({ type: 'error', text: error.message || 'GitHub App 설치 페이지를 열지 못했습니다.' });
    }
  };

  const handleVerifyInstallation = async () => {
    if (!installationId.trim()) {
      setMessage({ type: 'error', text: 'Installation ID를 입력해주세요.' });
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
          setMessage({ type: 'success', text: `연결 성공! ${result.data.length}개의 레포지토리를 찾았습니다.` });
          setCurrentStep('repository');
        } else {
          throw new Error(result.error || '레포지토리 목록을 가져오지 못했습니다.');
        }
      } else {
        throw new Error('Electron API를 사용할 수 없습니다.');
      }
    } catch (error: any) {
      console.error('Failed to verify installation:', error);
      setMessage({ type: 'error', text: error.message || 'Installation 검증에 실패했습니다.' });
      setRepositories([]);
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleTestConnection = async () => {
    if (!selectedRepo) {
      setMessage({ type: 'error', text: '레포지토리를 먼저 선택해주세요.' });
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
          setMessage({ type: 'success', text: '연결 테스트 성공! 레포지토리에 접근할 수 있습니다.' });
        } else {
          throw new Error(result.error || '연결 테스트에 실패했습니다.');
        }
      }
    } catch (error: any) {
      console.error('Connection test failed:', error);
      setMessage({ type: 'error', text: error.message || '연결 테스트에 실패했습니다.' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveAll = async () => {
    if (!appId.trim()) {
      setMessage({ type: 'error', text: 'App ID를 입력해주세요.' });
      return;
    }

    if (!installationId.trim()) {
      setMessage({ type: 'error', text: 'Installation ID를 입력해주세요.' });
      return;
    }

    if (!selectedRepo) {
      setMessage({ type: 'error', text: '레포지토리를 선택해주세요.' });
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
      setMessage({ type: 'success', text: 'GitHub 설정이 저장되었습니다!' });
      setCurrentStep('complete');
    } catch (error: any) {
      console.error('Failed to save GitHub config:', error);
      setMessage({ type: 'error', text: error.message || '설정 저장에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const getStepStatus = (step: SetupStep): 'current' | 'completed' | 'pending' => {
    const steps: SetupStep[] = ['config', 'install', 'verify', 'repository', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);

    if (stepIndex < currentIndex) {return 'completed';}
    if (stepIndex === currentIndex) {return 'current';}
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
          <CardTitle>GitHub App 설정 진행 상태</CardTitle>
          <CardDescription>단계별로 진행하여 GitHub 동기화를 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { step: 'config', label: '1. 기본 설정', icon: '⚙️' },
              { step: 'install', label: '2. GitHub App 설치', icon: '📦' },
              { step: 'verify', label: '3. Installation 검증', icon: '✅' },
              { step: 'repository', label: '4. 레포지토리 선택', icon: '📁' },
              { step: 'complete', label: '5. 완료', icon: '🎉' },
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
                  {status === 'completed' && <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />}
                  {status === 'current' && <ChevronRight className="h-4 w-4 text-blue-600 dark:text-blue-400" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 1: Basic Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>1. 기본 설정</CardTitle>
          <CardDescription>GitHub 서버 타입과 App ID를 설정합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Server Type */}
          <div className="space-y-2">
            <Label htmlFor="serverType">GitHub 서버 타입</Label>
            <select
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
              <Label htmlFor="ghesUrl">GHES URL</Label>
              <Input
                id="ghesUrl"
                value={ghesUrl}
                onChange={(e) => setGhesUrl(e.target.value)}
                placeholder="https://github.company.com"
                disabled={currentStep !== 'config'}
              />
              <p className="text-xs text-muted-foreground">
                GitHub Enterprise Server의 전체 URL을 입력하세요
              </p>
            </div>
          )}

          {/* App ID */}
          <div className="space-y-2">
            <Label htmlFor="appId">GitHub App ID</Label>
            <Input
              id="appId"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="123456"
              disabled={currentStep !== 'config'}
            />
            <p className="text-xs text-muted-foreground">
              GitHub App 설정 페이지에서 확인할 수 있는 App ID
            </p>
          </div>

          {/* Private Key Upload */}
          <div className="space-y-2">
            <Label htmlFor="privateKey">Private Key 파일</Label>
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
              GitHub App의 Private Key 파일 (.pem)을 업로드하세요
            </p>
          </div>

          {currentStep === 'config' && (
            <Button
              onClick={() => {
                if (!appId.trim() || (serverType === 'ghes' && !ghesUrl.trim()) || !privateKeyUploaded) {
                  setMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
                  return;
                }
                setCurrentStep('install');
                setMessage(null);
              }}
              className="w-full"
            >
              다음 단계
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Install GitHub App */}
      {(currentStep === 'install' || getStepStatus('install') === 'completed') && (
        <Card>
          <CardHeader>
            <CardTitle>2. GitHub App 설치</CardTitle>
            <CardDescription>브라우저에서 GitHub App을 설치합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm text-blue-600 dark:text-blue-400">
              <p className="font-medium">설치 방법</p>
              <ol className="mt-2 space-y-1 text-xs list-decimal list-inside">
                <li>아래 버튼을 클릭하여 GitHub App 설치 페이지를 엽니다.</li>
                <li>설치할 레포지토리를 선택합니다 (All repositories 또는 특정 레포지토리).</li>
                <li>Install 버튼을 클릭합니다.</li>
                <li>설치 후 URL에서 Installation ID를 확인합니다 (예: /settings/installations/12345678).</li>
              </ol>
            </div>

            {currentStep === 'install' && (
              <Button onClick={handleInstallApp} className="w-full">
                <Github className="mr-2 h-4 w-4" />
                GitHub App 설치 페이지 열기
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Verify Installation */}
      {(currentStep === 'verify' || getStepStatus('verify') === 'completed') && (
        <Card>
          <CardHeader>
            <CardTitle>3. Installation 검증</CardTitle>
            <CardDescription>Installation ID를 입력하고 연결을 확인합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="installationId">Installation ID</Label>
              <Input
                id="installationId"
                value={installationId}
                onChange={(e) => setInstallationId(e.target.value)}
                placeholder="12345678"
                disabled={currentStep !== 'verify'}
              />
              <p className="text-xs text-muted-foreground">
                GitHub App 설치 후 획득한 Installation ID (숫자만)
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
                Installation 검증 및 레포지토리 불러오기
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4: Repository Selection */}
      {(currentStep === 'repository' || getStepStatus('repository') === 'completed') && repositories.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>4. 동기화 레포지토리 선택</CardTitle>
            <CardDescription>
              설정과 데이터를 동기화할 레포지토리를 선택하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="selectedRepo">레포지토리</Label>
              <select
                id="selectedRepo"
                value={selectedRepo}
                onChange={(e) => setSelectedRepo(e.target.value)}
                disabled={currentStep !== 'repository'}
                className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm disabled:opacity-50"
              >
                <option value="" className="bg-background text-foreground">
                  레포지토리를 선택하세요
                </option>
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.full_name} className="bg-background text-foreground">
                    {repo.full_name} {repo.private ? '(Private)' : '(Public)'}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {selectedRepo
                  ? `선택된 레포지토리: ${selectedRepo}`
                  : '암호화된 설정을 저장할 레포지토리를 선택하세요.'}
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
                  연결 테스트
                </Button>

                <Button onClick={handleSaveAll} disabled={isSaving} className="w-full">
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  모든 설정 저장
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
            <CardTitle>5. 설정 완료!</CardTitle>
            <CardDescription>GitHub 동기화가 성공적으로 설정되었습니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-md bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-600 dark:text-green-400">
              <p className="font-medium">✅ 설정이 완료되었습니다</p>
              <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
                <li>서버: {serverType === 'ghes' ? ghesUrl : 'GitHub.com'}</li>
                <li>App ID: {appId}</li>
                <li>Installation ID: {installationId}</li>
                <li>레포지토리: {selectedRepo}</li>
              </ul>
            </div>

            <Button
              onClick={() => setCurrentStep('config')}
              variant="outline"
              className="w-full"
            >
              설정 수정하기
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Security Notice */}
      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
        <p className="font-medium">🔒 보안 정보</p>
        <p className="mt-1 text-xs">
          모든 민감한 정보(토큰, API 키, Private Key 등)는 AES-256-GCM으로 암호화되어 선택한 GitHub
          레포지토리에 동기화됩니다. Network 탭에서 설정한 Proxy 및 SSL 검증 설정이 GitHub 통신에도
          적용됩니다.
        </p>
      </div>
    </div>
  );
}
