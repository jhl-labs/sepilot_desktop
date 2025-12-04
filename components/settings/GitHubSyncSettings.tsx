'use client';

import { useState, useEffect } from 'react';
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
      title: '설정 동기화',
      description: 'LLM, Network, VectorDB 등 애플리케이션 설정',
      icon: Settings,
      enabled: config?.syncSettings ?? true,
    },
    {
      id: 'personas',
      title: 'AI 페르소나',
      description: '사용자 정의 AI 페르소나 설정',
      icon: User,
      enabled: config?.syncPersonas ?? false,
    },
    {
      id: 'images',
      title: '이미지 동기화',
      description: '생성된 이미지 메타데이터',
      icon: Image,
      enabled: config?.syncImages ?? false,
      warning: '용량 주의',
    },
    {
      id: 'conversations',
      title: '대화 동기화',
      description: '대화 내역 및 메시지',
      icon: MessageSquare,
      enabled: config?.syncConversations ?? false,
      warning: '개인정보 주의',
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
        prev.map((item) => ({
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
      prev.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  const handleTestConnection = async () => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl) {
      setMessage({ type: 'error', text: 'GHES URL을 입력해주세요.' });
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
            text: result.message || 'GitHub 레포지토리 연결 성공!',
          });
        } else {
          throw new Error(result.error || '연결 테스트 실패');
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Connection test failed:', err);
      setMessage({ type: 'error', text: err.message || '연결 테스트 실패' });
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
      setMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl) {
      setMessage({ type: 'error', text: 'GHES URL을 입력해주세요.' });
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
      setMessage({ type: 'success', text: 'GitHub Sync 설정이 저장되었습니다!' });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to save config:', err);
      setMessage({ type: 'error', text: err.message || '설정 저장 실패' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async (type: 'settings' | 'images' | 'conversations' | 'personas' | 'all') => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: '먼저 설정을 저장해주세요.' });
      return;
    }

    if (serverType === 'ghes' && !ghesUrl) {
      setMessage({ type: 'error', text: 'GHES URL을 입력해주세요.' });
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
              setMessage({ type: 'success', text: result.message || '설정 동기화 완료!' });
            } else {
              throw new Error(result.error || '설정 동기화 실패');
            }
            break;
          case 'personas':
            result = await window.electronAPI.githubSync.syncPersonas(syncConfig);
            if (result.success) {
              setMessage({ type: 'success', text: result.message || 'AI 페르소나 동기화 완료!' });
            } else {
              throw new Error(result.error || 'AI 페르소나 동기화 실패');
            }
            break;
          case 'images':
            result = await window.electronAPI.githubSync.syncImages(syncConfig);
            if (result.success) {
              setMessage({ type: 'success', text: result.message || '이미지 동기화 완료!' });
            } else {
              throw new Error(result.error || '이미지 동기화 실패');
            }
            break;
          case 'conversations':
            result = await window.electronAPI.githubSync.syncConversations(syncConfig);
            if (result.success) {
              setMessage({ type: 'success', text: result.message || '대화 동기화 완료!' });
            } else {
              throw new Error(result.error || '대화 동기화 실패');
            }
            break;
          case 'all': {
            const allResult = await window.electronAPI.githubSync.syncAll(syncConfig);
            if (allResult.success) {
              setMessage({ type: 'success', text: '전체 동기화 완료!' });
            } else {
              throw new Error(allResult.error || '전체 동기화 실패');
            }
            break;
          }
        }
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`Failed to sync ${type}:`, err);
      setMessage({ type: 'error', text: err.message || `${type} 동기화 실패` });
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
            GitHub 연결 설정
          </CardTitle>
          <CardDescription>
            GitHub Personal Access Token을 사용하여 레포지토리에 연결합니다.
            <br />
            <a
              href="https://github.com/settings/tokens/new"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              새 토큰 생성하기 (repo 권한 필요)
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="serverType">Server Type</Label>
              <select
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
                <Label htmlFor="ghesUrl">GHES URL</Label>
                <Input
                  id="ghesUrl"
                  value={ghesUrl}
                  onChange={(e) => setGhesUrl(e.target.value)}
                  placeholder="https://github.company.com"
                />
                <p className="text-xs text-muted-foreground">
                  GHES 인스턴스의 기본 URL을 입력하세요 (예: https://github.company.com)
                </p>
              </div>
            )}

            <div className="col-span-2 space-y-2">
              <Label htmlFor="token">GitHub Personal Access Token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                repo 권한이 있는 Personal Access Token이 필요합니다.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner">Owner (Organization 또는 User)</Label>
              <Input
                id="owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="my-org 또는 my-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo">Repository</Label>
              <Input
                id="repo"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="my-repo"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label htmlFor="branch">Branch (기본값: main)</Label>
              <Input
                id="branch"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder="main"
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
                  연결 테스트 중...
                </>
              ) : (
                <>
                  <Github className="mr-2 h-4 w-4" />
                  연결 테스트
                </>
              )}
            </Button>

            <Button onClick={handleSave} disabled={isSaving} className="flex-1">
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  저장 중...
                </>
              ) : (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  설정 저장
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 동기화 항목 카드 그리드 */}
      <div>
        <h3 className="text-lg font-semibold mb-4">데이터 동기화</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {syncItems.map((item) => {
            const Icon = item.icon;
            const isDisabled = !item.enabled || isSyncing !== null;

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
                          {item.title}
                          {item.warning && (
                            <span className="text-xs font-normal text-yellow-600 dark:text-yellow-500">
                              ({item.warning})
                            </span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs mt-1">
                          {item.description}
                        </CardDescription>
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
                          Push 중...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-3 w-3" />
                          Push
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
                전체 동기화 중...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-5 w-5" />
                전체 동기화 (활성화된 항목만)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 마지막 동기화 정보 */}
      {config?.lastSyncAt && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">마지막 동기화 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">시간:</span>
                <span className="font-medium">
                  {new Date(config.lastSyncAt).toLocaleString('ko-KR')}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">상태:</span>
                <span
                  className={`font-medium ${
                    config.lastSyncStatus === 'success'
                      ? 'text-green-600 dark:text-green-500'
                      : 'text-red-600 dark:text-red-500'
                  }`}
                >
                  {config.lastSyncStatus === 'success' ? '성공' : '실패'}
                </span>
              </div>
              {config.lastSyncError && (
                <div className="mt-2 p-2 rounded bg-red-500/10 text-red-600 dark:text-red-400 text-xs">
                  에러: {config.lastSyncError}
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
            에러 자동 리포팅
          </CardTitle>
          <CardDescription>
            프로그램 에러 발생 시 GitHub Issue로 자동 리포트하여 개선에 도움을 줍니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 rounded-lg bg-card border">
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-blue-600 dark:text-blue-500" />
                <p className="font-medium text-sm">에러 자동 리포팅 활성화</p>
              </div>
              <p className="text-xs text-muted-foreground">
                에러 발생 시 자동으로 GitHub Issue를 생성하여 개발팀에 전달합니다.
                <br />
                에러 메시지, 스택 트레이스, 시스템 정보가 포함되며, 개인정보는 포함되지 않습니다.
              </p>
            </div>
            <Switch
              checked={errorReportingEnabled}
              onCheckedChange={setErrorReportingEnabled}
              disabled={!token || !owner || !repo}
            />
          </div>

          <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm">
            <p className="font-medium mb-2 text-blue-600 dark:text-blue-500">💡 에러 리포팅 정보</p>
            <ul className="space-y-1 text-xs list-disc list-inside text-blue-700 dark:text-blue-400">
              <li>에러 메시지와 스택 트레이스가 GitHub Issue로 전송됩니다.</li>
              <li>앱 버전, OS 플랫폼 등 기본 시스템 정보가 포함됩니다.</li>
              <li>API 키, 토큰 등 민감한 정보는 절대 전송되지 않습니다.</li>
              <li>프로그램 개선을 위해 매우 중요한 정보입니다.</li>
              <li>이 기능은 GitHub Token이 설정된 경우에만 사용할 수 있습니다.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* 보안 안내 */}
      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
        <p className="font-medium mb-2">🔒 보안 정보</p>
        <ul className="space-y-1 text-xs list-disc list-inside text-yellow-700 dark:text-yellow-400">
          <li>민감한 정보(LLM API 키 등)는 AES-256-GCM으로 암호화되어 저장됩니다.</li>
          <li>GitHub Token은 로컬에만 저장되며 동기화되지 않습니다.</li>
          <li>동기화된 파일은 sepilot/ 폴더에 저장됩니다.</li>
          <li>대화 및 이미지 동기화 시 개인정보 보호에 주의하세요.</li>
        </ul>
      </div>
    </div>
  );
}
