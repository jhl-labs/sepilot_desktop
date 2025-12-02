'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Github,
  Settings,
  FileText,
  Image,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import { GitHubSyncConfig } from '@/types';

interface GitHubSyncSettingsProps {
  config: GitHubSyncConfig | null;
  onSave: (config: GitHubSyncConfig) => Promise<void>;
}

export function GitHubSyncSettings({ config, onSave }: GitHubSyncSettingsProps) {
  // Form states
  const [token, setToken] = useState(config?.token || '');
  const [owner, setOwner] = useState(config?.owner || '');
  const [repo, setRepo] = useState(config?.repo || '');
  const [branch, setBranch] = useState(config?.branch || 'main');

  // Sync options
  const [syncSettings, setSyncSettings] = useState(config?.syncSettings ?? true);
  const [syncDocuments, setSyncDocuments] = useState(config?.syncDocuments ?? false);
  const [syncImages, setSyncImages] = useState(config?.syncImages ?? false);
  const [syncConversations, setSyncConversations] = useState(config?.syncConversations ?? false);

  // UI states
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (config) {
      setToken(config.token || '');
      setOwner(config.owner || '');
      setRepo(config.repo || '');
      setBranch(config.branch || 'main');
      setSyncSettings(config.syncSettings ?? true);
      setSyncDocuments(config.syncDocuments ?? false);
      setSyncImages(config.syncImages ?? false);
      setSyncConversations(config.syncConversations ?? false);
    }
  }, [config]);

  const handleTestConnection = async () => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    setIsTesting(true);
    setMessage(null);

    try {
      const testConfig: GitHubSyncConfig = {
        token,
        owner,
        repo,
        branch,
        syncSettings,
        syncDocuments,
        syncImages,
        syncConversations,
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
    } catch (error: any) {
      console.error('Connection test failed:', error);
      setMessage({ type: 'error', text: error.message || '연결 테스트 실패' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async () => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: '모든 필드를 입력해주세요.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const newConfig: GitHubSyncConfig = {
        token,
        owner,
        repo,
        branch: branch || 'main',
        syncSettings,
        syncDocuments,
        syncImages,
        syncConversations,
      };

      await onSave(newConfig);
      setMessage({ type: 'success', text: 'GitHub Sync 설정이 저장되었습니다!' });
    } catch (error: any) {
      console.error('Failed to save config:', error);
      setMessage({ type: 'error', text: error.message || '설정 저장 실패' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async (
    type: 'settings' | 'documents' | 'images' | 'conversations' | 'all'
  ) => {
    if (!token || !owner || !repo) {
      setMessage({ type: 'error', text: '먼저 설정을 저장해주세요.' });
      return;
    }

    setIsSyncing(type);
    setMessage(null);

    try {
      const syncConfig: GitHubSyncConfig = {
        token,
        owner,
        repo,
        branch: branch || 'main',
        syncSettings,
        syncDocuments,
        syncImages,
        syncConversations,
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
          case 'documents':
            result = await window.electronAPI.githubSync.syncDocuments(syncConfig);
            if (result.success) {
              setMessage({ type: 'success', text: result.message || '문서 동기화 완료!' });
            } else {
              throw new Error(result.error || '문서 동기화 실패');
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
    } catch (error: any) {
      console.error(`Failed to sync ${type}:`, error);
      setMessage({ type: 'error', text: error.message || `${type} 동기화 실패` });
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

      {/* GitHub Token 설정 */}
      <Card>
        <CardHeader>
          <CardTitle>GitHub 연결 설정</CardTitle>
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
          {/* Token */}
          <div className="space-y-2">
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

          {/* Owner */}
          <div className="space-y-2">
            <Label htmlFor="owner">Owner (Organization 또는 User)</Label>
            <Input
              id="owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="my-org 또는 my-username"
            />
          </div>

          {/* Repository */}
          <div className="space-y-2">
            <Label htmlFor="repo">Repository</Label>
            <Input
              id="repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="my-repo"
            />
          </div>

          {/* Branch */}
          <div className="space-y-2">
            <Label htmlFor="branch">Branch (기본값: main)</Label>
            <Input
              id="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>

          {/* Test Connection */}
          <Button
            onClick={handleTestConnection}
            disabled={isTesting}
            variant="outline"
            className="w-full"
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

          {/* Save */}
          <Button onClick={handleSave} disabled={isSaving} className="w-full">
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                저장 중...
              </>
            ) : (
              '설정 저장'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 동기화 옵션 */}
      <Card>
        <CardHeader>
          <CardTitle>동기화 옵션</CardTitle>
          <CardDescription>GitHub에 동기화할 데이터를 선택하세요.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="syncSettings"
              checked={syncSettings}
              onChange={(e) => setSyncSettings(e.target.checked)}
              className="w-4 h-4 text-primary bg-background border-gray-300 rounded focus:ring-primary"
            />
            <label
              htmlFor="syncSettings"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              설정 동기화 (LLM, Network, VectorDB 등)
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="syncDocuments"
              checked={syncDocuments}
              onChange={(e) => setSyncDocuments(e.target.checked)}
              className="w-4 h-4 text-primary bg-background border-gray-300 rounded focus:ring-primary"
            />
            <label
              htmlFor="syncDocuments"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              문서 동기화 (RAG 문서)
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="syncImages"
              checked={syncImages}
              onChange={(e) => setSyncImages(e.target.checked)}
              className="w-4 h-4 text-primary bg-background border-gray-300 rounded focus:ring-primary"
            />
            <label htmlFor="syncImages" className="text-sm font-medium leading-none cursor-pointer">
              이미지 동기화 (메타데이터만, 용량 주의)
            </label>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="syncConversations"
              checked={syncConversations}
              onChange={(e) => setSyncConversations(e.target.checked)}
              className="w-4 h-4 text-primary bg-background border-gray-300 rounded focus:ring-primary"
            />
            <label
              htmlFor="syncConversations"
              className="text-sm font-medium leading-none cursor-pointer"
            >
              대화 동기화 (개인정보 주의)
            </label>
          </div>
        </CardContent>
      </Card>

      {/* 개별 동기화 버튼 */}
      <Card>
        <CardHeader>
          <CardTitle>데이터 동기화</CardTitle>
          <CardDescription>선택한 데이터를 GitHub 레포지토리에 동기화합니다.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={() => handleSync('settings')}
            disabled={!syncSettings || isSyncing !== null}
            variant="outline"
            className="w-full justify-start"
          >
            {isSyncing === 'settings' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Settings className="mr-2 h-4 w-4" />
            )}
            설정 동기화
          </Button>

          <Button
            onClick={() => handleSync('documents')}
            disabled={!syncDocuments || isSyncing !== null}
            variant="outline"
            className="w-full justify-start"
          >
            {isSyncing === 'documents' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileText className="mr-2 h-4 w-4" />
            )}
            문서 동기화
          </Button>

          <Button
            onClick={() => handleSync('images')}
            disabled={!syncImages || isSyncing !== null}
            variant="outline"
            className="w-full justify-start"
          >
            {isSyncing === 'images' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Image className="mr-2 h-4 w-4" />
            )}
            이미지 동기화
          </Button>

          <Button
            onClick={() => handleSync('conversations')}
            disabled={!syncConversations || isSyncing !== null}
            variant="outline"
            className="w-full justify-start"
          >
            {isSyncing === 'conversations' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="mr-2 h-4 w-4" />
            )}
            대화 동기화
          </Button>

          <div className="h-4" />

          <Button
            onClick={() => handleSync('all')}
            disabled={isSyncing !== null}
            className="w-full"
          >
            {isSyncing === 'all' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                전체 동기화 중...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                전체 동기화
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 마지막 동기화 정보 */}
      {config?.lastSyncAt && (
        <Card>
          <CardHeader>
            <CardTitle>마지막 동기화 정보</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">
              <p>시간: {new Date(config.lastSyncAt).toLocaleString('ko-KR')}</p>
              <p>
                상태:{' '}
                <span
                  className={
                    config.lastSyncStatus === 'success' ? 'text-green-600' : 'text-red-600'
                  }
                >
                  {config.lastSyncStatus === 'success' ? '성공' : '실패'}
                </span>
              </p>
              {config.lastSyncError && <p className="text-red-600">에러: {config.lastSyncError}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 보안 안내 */}
      <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
        <p className="font-medium">🔒 보안 정보</p>
        <ul className="mt-2 space-y-1 text-xs list-disc list-inside">
          <li>민감한 정보(LLM API 키 등)는 AES-256-GCM으로 암호화되어 저장됩니다.</li>
          <li>GitHub Token은 로컬에만 저장되며 동기화되지 않습니다.</li>
          <li>동기화된 파일은 sepilot/ 폴더에 저장됩니다.</li>
          <li>대화 및 이미지 동기화 시 개인정보 보호에 주의하세요.</li>
        </ul>
      </div>
    </div>
  );
}
