'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Github,
  Users,
  Plus,
  Trash2,
  Download,
  Edit2,
} from 'lucide-react';
import { TeamDocsConfig } from '@/types';

interface TeamDocsSettingsProps {
  teamDocs: TeamDocsConfig[];
  onSave: (teamDocs: TeamDocsConfig[]) => Promise<void>;
}

export function TeamDocsSettings({ teamDocs, onSave }: TeamDocsSettingsProps) {
  const [configs, setConfigs] = useState<TeamDocsConfig[]>(teamDocs || []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states for editing
  const [formData, setFormData] = useState<Partial<TeamDocsConfig>>({
    name: '',
    description: '',
    serverType: 'github.com',
    ghesUrl: '',
    token: '',
    owner: '',
    repo: '',
    branch: 'main',
    docsPath: 'sepilot/documents',
    enabled: true,
    autoSync: false,
    syncInterval: 60,
  });

  useEffect(() => {
    setConfigs(teamDocs || []);
  }, [teamDocs]);

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      serverType: 'github.com',
      ghesUrl: '',
      token: '',
      owner: '',
      repo: '',
      branch: 'main',
      docsPath: 'sepilot/documents',
      enabled: true,
      autoSync: false,
      syncInterval: 60,
    });
    setEditingId(null);
  };

  const handleAddNew = () => {
    resetForm();
    setEditingId('new');
  };

  const handleEdit = (config: TeamDocsConfig) => {
    setFormData(config);
    setEditingId(config.id);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 Team Docs 설정을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const newConfigs = configs.filter((c) => c.id !== id);
      await onSave(newConfigs);
      setConfigs(newConfigs);
      setMessage({ type: 'success', text: 'Team Docs 설정이 삭제되었습니다.' });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to delete team docs:', err);
      setMessage({ type: 'error', text: err.message || '삭제 실패' });
    }
  };

  const handleSaveConfig = async () => {
    if (!formData.name || !formData.token || !formData.owner || !formData.repo) {
      setMessage({ type: 'error', text: '필수 항목을 모두 입력해주세요.' });
      return;
    }

    if (formData.serverType === 'ghes' && !formData.ghesUrl) {
      setMessage({ type: 'error', text: 'GHES URL을 입력해주세요.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      let newConfigs: TeamDocsConfig[];

      if (editingId === 'new') {
        // 새 설정 추가
        const newConfig: TeamDocsConfig = {
          ...formData,
          id: `team-${Date.now()}`,
          name: formData.name!,
          token: formData.token!,
          owner: formData.owner!,
          repo: formData.repo!,
          enabled: formData.enabled ?? true,
        } as TeamDocsConfig;
        newConfigs = [...configs, newConfig];
      } else {
        // 기존 설정 수정
        newConfigs = configs.map((c) =>
          c.id === editingId ? ({ ...c, ...formData } as TeamDocsConfig) : c
        );
      }

      await onSave(newConfigs);
      setConfigs(newConfigs);
      setMessage({ type: 'success', text: 'Team Docs 설정이 저장되었습니다!' });
      resetForm();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to save team docs:', err);
      setMessage({ type: 'error', text: err.message || '저장 실패' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async (config: TeamDocsConfig) => {
    setMessage(null);

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.teamDocs) {
        const result = await window.electronAPI.teamDocs.testConnection(config);

        if (result.success) {
          setMessage({
            type: 'success',
            text: result.message || 'GitHub 레포지토리 연결 성공!',
          });
        } else {
          throw new Error(result.error || '연결 테스트 실패');
        }
      } else {
        throw new Error('ElectronAPI를 사용할 수 없습니다.');
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Connection test failed:', err);
      setMessage({ type: 'error', text: err.message || '연결 테스트 실패' });
    }
  };

  const handleSync = async (config: TeamDocsConfig) => {
    setIsSyncing(config.id);
    setMessage(null);

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.teamDocs) {
        const result = await window.electronAPI.teamDocs.syncDocuments(config);

        if (result.success) {
          setMessage({
            type: 'success',
            text: result.message || '동기화 성공!',
          });

          // 마지막 동기화 시간 업데이트
          const newConfigs = configs.map((c) =>
            c.id === config.id
              ? {
                  ...c,
                  lastSyncAt: Date.now(),
                  lastSyncStatus: 'success' as const,
                  lastSyncError: undefined,
                }
              : c
          );
          setConfigs(newConfigs);
          await onSave(newConfigs);
        } else {
          throw new Error(result.error || '동기화 실패');
        }
      } else {
        throw new Error('ElectronAPI를 사용할 수 없습니다.');
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to sync team docs:', err);

      // 에러 상태 업데이트
      const newConfigs = configs.map((c) =>
        c.id === config.id
          ? {
              ...c,
              lastSyncAt: Date.now(),
              lastSyncStatus: 'error' as const,
              lastSyncError: err.message,
            }
          : c
      );
      setConfigs(newConfigs);
      await onSave(newConfigs);

      setMessage({ type: 'error', text: err.message || '동기화 실패' });
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

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Team Docs 관리
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            여러 GitHub 레포지토리에서 팀 문서를 동기화하세요
          </p>
        </div>
        <Button onClick={handleAddNew} disabled={editingId !== null}>
          <Plus className="h-4 w-4 mr-2" />새 Team Docs 추가
        </Button>
      </div>

      {/* 편집 폼 */}
      {editingId && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>{editingId === 'new' ? '새 Team Docs 추가' : 'Team Docs 수정'}</CardTitle>
            <CardDescription>GitHub 레포지토리 정보를 입력하세요</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="name">팀 이름 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Frontend Team"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="description">설명</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="프론트엔드 팀의 공식 문서"
                  rows={2}
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="serverType">Server Type</Label>
                <select
                  id="serverType"
                  value={formData.serverType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      serverType: e.target.value as 'github.com' | 'ghes',
                    })
                  }
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

              {formData.serverType === 'ghes' && (
                <div className="col-span-2 space-y-2">
                  <Label htmlFor="ghesUrl">GHES URL</Label>
                  <Input
                    id="ghesUrl"
                    value={formData.ghesUrl}
                    onChange={(e) => setFormData({ ...formData, ghesUrl: e.target.value })}
                    placeholder="https://github.company.com"
                  />
                </div>
              )}

              <div className="col-span-2 space-y-2">
                <Label htmlFor="token">GitHub Personal Access Token *</Label>
                <Input
                  id="token"
                  type="password"
                  value={formData.token}
                  onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner">Owner *</Label>
                <Input
                  id="owner"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="my-org"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repo">Repository *</Label>
                <Input
                  id="repo"
                  value={formData.repo}
                  onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
                  placeholder="team-docs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="branch">Branch</Label>
                <Input
                  id="branch"
                  value={formData.branch}
                  onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  placeholder="main"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="docsPath">문서 경로</Label>
                <Input
                  id="docsPath"
                  value={formData.docsPath}
                  onChange={(e) => setFormData({ ...formData, docsPath: e.target.value })}
                  placeholder="sepilot/documents"
                />
              </div>

              <div className="col-span-2 flex items-center justify-between p-3 border rounded-md">
                <Label htmlFor="enabled">활성화</Label>
                <Switch
                  id="enabled"
                  checked={formData.enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSaveConfig} disabled={isSaving} className="flex-1">
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    저장 중...
                  </>
                ) : (
                  '저장'
                )}
              </Button>
              <Button onClick={resetForm} variant="outline">
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 설정 목록 */}
      <div className="space-y-4">
        {configs.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center text-sm text-muted-foreground py-8">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>등록된 Team Docs가 없습니다.</p>
                <p className="text-xs mt-2">새 Team Docs를 추가하여 팀 문서를 동기화하세요.</p>
              </div>
            </CardContent>
          </Card>
        ) : (
          configs.map((config) => (
            <Card key={config.id} className={config.enabled ? '' : 'opacity-50'}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="flex items-center gap-2">
                      <Github className="h-5 w-5" />
                      {config.name}
                      {!config.enabled && (
                        <span className="text-xs font-normal text-muted-foreground">
                          (비활성화)
                        </span>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {config.description || `${config.owner}/${config.repo}`}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(config)}
                      disabled={editingId !== null}
                      title="수정"
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                      disabled={editingId !== null}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Repository:</span>{' '}
                    <span className="font-mono">{`${config.owner}/${config.repo}`}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Branch:</span>{' '}
                    <span className="font-mono">{config.branch || 'main'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">문서 경로:</span>{' '}
                    <span className="font-mono">{config.docsPath || 'sepilot/documents'}</span>
                  </div>
                  {config.lastSyncAt && (
                    <div>
                      <span className="text-muted-foreground">마지막 동기화:</span>{' '}
                      <span className={config.lastSyncStatus === 'error' ? 'text-destructive' : ''}>
                        {new Date(config.lastSyncAt).toLocaleString('ko-KR')}
                      </span>
                    </div>
                  )}
                </div>

                {config.lastSyncError && (
                  <div className="text-xs text-destructive bg-destructive/10 rounded p-2">
                    {config.lastSyncError}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection(config)}
                    disabled={!config.enabled}
                  >
                    <Github className="h-4 w-4 mr-2" />
                    연결 테스트
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSync(config)}
                    disabled={!config.enabled || isSyncing !== null}
                  >
                    {isSyncing === config.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        동기화 중...
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4 mr-2" />
                        Pull
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 안내 */}
      <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm">
        <p className="font-medium mb-2">💡 Team Docs 사용 방법</p>
        <ul className="space-y-1 text-xs list-disc list-inside text-blue-700 dark:text-blue-400">
          <li>여러 GitHub 레포지토리에서 팀 문서를 가져올 수 있습니다</li>
          <li>각 Team Docs는 독립적으로 관리되며 VectorDB에 저장됩니다</li>
          <li>Personal Docs와 구분하여 RAG 검색에 활용할 수 있습니다</li>
          <li>Pull 버튼으로 언제든지 최신 문서를 동기화하세요</li>
        </ul>
      </div>
    </div>
  );
}
