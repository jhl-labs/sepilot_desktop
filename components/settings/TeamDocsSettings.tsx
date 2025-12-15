'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
  const [configs, setConfigs] = useState<TeamDocsConfig[]>(teamDocs || []);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [isSyncingAll, setIsSyncingAll] = useState(false);
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
    if (!window.confirm(t('settings.teamDocs.deleteConfirm'))) {
      return;
    }

    try {
      const newConfigs = configs.filter((c) => c.id !== id);
      await onSave(newConfigs);
      setConfigs(newConfigs);
      setMessage({ type: 'success', text: t('settings.teamDocs.deleteSuccess') });
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to delete team docs:', err);
      setMessage({ type: 'error', text: err.message || t('settings.teamDocs.deleteFailed') });
    }
  };

  const handleSaveConfig = async () => {
    // 필수 필드 검증 (개별 메시지)
    if (!formData.name?.trim()) {
      setMessage({ type: 'error', text: t('settings.teamDocs.nameRequired') });
      return;
    }
    if (!formData.token?.trim()) {
      setMessage({ type: 'error', text: t('settings.teamDocs.tokenRequired') });
      return;
    }
    if (!formData.owner?.trim()) {
      setMessage({ type: 'error', text: t('settings.teamDocs.ownerRequired') });
      return;
    }
    if (!formData.repo?.trim()) {
      setMessage({ type: 'error', text: t('settings.teamDocs.repoRequired') });
      return;
    }

    // GHES URL 검증
    if (formData.serverType === 'ghes' && !formData.ghesUrl?.trim()) {
      setMessage({ type: 'error', text: t('settings.teamDocs.ghesUrlRequired') });
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
      setMessage({ type: 'success', text: t('settings.teamDocs.saveSuccess') });
      resetForm();
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to save team docs:', err);
      setMessage({ type: 'error', text: err.message || t('settings.teamDocs.saveFailed') });
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
            text: result.message || t('settings.teamDocs.connectionSuccess'),
          });
        } else {
          throw new Error(result.error || t('settings.teamDocs.connectionFailed'));
        }
      } else {
        throw new Error(t('settings.teamDocs.electronApiUnavailable'));
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Connection test failed:', err);
      setMessage({ type: 'error', text: err.message || t('settings.teamDocs.connectionFailed') });
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
            text: result.message || t('settings.teamDocs.syncSuccess'),
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
          throw new Error(result.error || t('settings.teamDocs.syncFailed'));
        }
      } else {
        throw new Error(t('settings.teamDocs.electronApiUnavailable'));
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

      setMessage({ type: 'error', text: err.message || t('settings.teamDocs.syncFailed') });
    } finally {
      setIsSyncing(null);
    }
  };

  const handleSyncAll = async () => {
    const enabledConfigs = configs.filter((c) => c.enabled);
    if (enabledConfigs.length === 0) {
      setMessage({ type: 'error', text: t('settings.teamDocs.noEnabledConfigs') });
      return;
    }

    setIsSyncingAll(true);
    setMessage(null);

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.teamDocs) {
        const result = await window.electronAPI.teamDocs.syncAll();

        if (result.success) {
          setMessage({
            type: 'success',
            text: result.message || t('settings.teamDocs.syncAllSuccess'),
          });

          // 설정 다시 로드 (마지막 동기화 시간 업데이트)
          const configResult = await window.electronAPI.config.load();
          if (configResult.success && configResult.data?.teamDocs) {
            setConfigs(configResult.data.teamDocs);
          }
        } else {
          throw new Error(result.error || t('settings.teamDocs.syncAllFailed'));
        }
      } else {
        throw new Error(t('settings.teamDocs.electronApiUnavailable'));
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error('Failed to sync all team docs:', err);
      setMessage({ type: 'error', text: err.message || t('settings.teamDocs.syncAllFailed') });
    } finally {
      setIsSyncingAll(false);
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
            {t('settings.teamDocs.title')}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t('settings.teamDocs.description')}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleSyncAll}
            disabled={isSyncingAll || configs.filter((c) => c.enabled).length === 0}
          >
            {isSyncingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('settings.teamDocs.syncing')}
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                {t('settings.teamDocs.syncAll')}
              </>
            )}
          </Button>
          <Button onClick={handleAddNew} disabled={editingId !== null}>
            <Plus className="h-4 w-4 mr-2" />
            {t('settings.teamDocs.addNew')}
          </Button>
        </div>
      </div>

      {/* 편집 폼 */}
      {editingId && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>
              {editingId === 'new' ? t('settings.teamDocs.addNew') : t('settings.teamDocs.edit')}
            </CardTitle>
            <CardDescription>{t('settings.teamDocs.editDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label htmlFor="name">{t('settings.teamDocs.teamName')}</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Frontend Team"
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="description">{t('settings.teamDocs.descriptionLabel')}</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('settings.teamDocs.descriptionPlaceholder')}
                  rows={2}
                />
              </div>

              <div className="col-span-2 space-y-2">
                <Label htmlFor="serverType">Server Type</Label>
                <select
                  title="GitHub 서버 타입"
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
                <p className="text-xs text-muted-foreground">
                  {t('settings.teamDocs.tokenDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="owner">{t('settings.teamDocs.owner')}</Label>
                <Input
                  id="owner"
                  value={formData.owner}
                  onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                  placeholder="my-org"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="repo">{t('settings.teamDocs.repository')}</Label>
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
                <Label htmlFor="docsPath">{t('settings.teamDocs.docsPath')}</Label>
                <Input
                  id="docsPath"
                  value={formData.docsPath}
                  onChange={(e) => setFormData({ ...formData, docsPath: e.target.value })}
                  placeholder="sepilot/documents"
                />
                <p className="text-xs text-muted-foreground">
                  {t('settings.teamDocs.docsPathDescription')}
                </p>
              </div>

              <div className="col-span-2 flex items-center justify-between p-3 border rounded-md">
                <Label htmlFor="enabled">{t('settings.teamDocs.enabled')}</Label>
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
                    {t('common.saving')}
                  </>
                ) : (
                  t('common.save')
                )}
              </Button>
              <Button onClick={resetForm} variant="outline">
                {t('common.cancel')}
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
                <p>{t('settings.teamDocs.noConfigs')}</p>
                <p className="text-xs mt-2">{t('settings.teamDocs.noConfigsHint')}</p>
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
                          ({t('settings.teamDocs.disabled')})
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
                      title={t('common.edit')}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(config.id)}
                      disabled={editingId !== null}
                      title={t('common.delete')}
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
                    <span className="text-muted-foreground">
                      {t('settings.teamDocs.docsPath')}:
                    </span>{' '}
                    <span className="font-mono">{config.docsPath || 'sepilot/documents'}</span>
                  </div>
                  {config.lastSyncAt && (
                    <div>
                      <span className="text-muted-foreground">
                        {t('settings.teamDocs.lastSync')}:
                      </span>{' '}
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
                    {t('settings.teamDocs.testConnection')}
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
                        {t('settings.teamDocs.syncing')}
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
        <p className="font-medium mb-2">{t('settings.teamDocs.usageTitle')}</p>
        <ul className="space-y-1 text-xs list-disc list-inside text-blue-700 dark:text-blue-400">
          <li>{t('settings.teamDocs.usage1')}</li>
          <li>{t('settings.teamDocs.usage2')}</li>
          <li>{t('settings.teamDocs.usage3')}</li>
          <li>{t('settings.teamDocs.usage4')}</li>
        </ul>
      </div>
    </div>
  );
}
