'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Loader2,
  CheckCircle,
  AlertCircle,
  Github,
  User,
  Users,
  Download,
  Upload,
  Plus,
  Trash2,
  Edit2,
  RefreshCw,
} from 'lucide-react';
import { GitHubSyncConfig, TeamDocsConfig } from '@/types';

interface DocsSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => Promise<void>;
}

export function DocsSyncDialog({ open, onOpenChange, onRefresh }: DocsSyncDialogProps) {
  // Personal Docs Repo state
  const [personalRepo, setPersonalRepo] = useState<GitHubSyncConfig | null>(null);
  const [personalForm, setPersonalForm] = useState({
    serverType: 'github.com' as 'github.com' | 'ghes',
    ghesUrl: '',
    token: '',
    owner: '',
    repo: '',
    branch: 'main',
    docsPath: 'sepilot/documents',
  });

  // Team Docs Repos state
  const [teamDocs, setTeamDocs] = useState<TeamDocsConfig[]>([]);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamForm, setTeamForm] = useState<Partial<TeamDocsConfig>>({
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
  });

  // UI state
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'personal' | 'team'>('personal');

  // Load configs on mount
  useEffect(() => {
    if (open) {
      loadConfigs();
    }
  }, [open]);

  const loadConfigs = async () => {
    try {
      if (typeof window !== 'undefined' && window.electronAPI?.config) {
        const result = await window.electronAPI.config.load();
        if (result.success && result.data) {
          // Load Personal Docs config
          if (result.data.githubSync) {
            setPersonalRepo(result.data.githubSync);
            setPersonalForm({
              serverType: result.data.githubSync.serverType || 'github.com',
              ghesUrl: result.data.githubSync.ghesUrl || '',
              token: result.data.githubSync.token || '',
              owner: result.data.githubSync.owner || '',
              repo: result.data.githubSync.repo || '',
              branch: result.data.githubSync.branch || 'main',
              docsPath: 'sepilot/documents',
            });
          }

          // Load Team Docs configs
          if (result.data.teamDocs) {
            setTeamDocs(result.data.teamDocs);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load configs:', error);
      setMessage({ type: 'error', text: '설정 로드 실패' });
    }
  };

  // Personal Docs handlers
  const handleSavePersonalRepo = async () => {
    if (!personalForm.token || !personalForm.owner || !personalForm.repo) {
      setMessage({ type: 'error', text: '모든 필수 필드를 입력하세요.' });
      return;
    }

    if (personalForm.serverType === 'ghes' && !personalForm.ghesUrl) {
      setMessage({ type: 'error', text: 'GHES URL을 입력하세요.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const config: GitHubSyncConfig = {
        serverType: personalForm.serverType,
        ghesUrl: personalForm.serverType === 'ghes' ? personalForm.ghesUrl : undefined,
        token: personalForm.token,
        owner: personalForm.owner,
        repo: personalForm.repo,
        branch: personalForm.branch,
        syncSettings: false,
        syncDocuments: true,
        syncImages: false,
        syncConversations: false,
        syncPersonas: false,
      };

      // Load current config
      const result = await window.electronAPI.config.load();
      if (result.success && result.data) {
        const updatedConfig = {
          ...result.data,
          githubSync: config,
        };

        const saveResult = await window.electronAPI.config.save(updatedConfig);
        if (saveResult.success) {
          setPersonalRepo(config);
          setMessage({ type: 'success', text: 'Personal Docs 설정이 저장되었습니다!' });
        } else {
          throw new Error(saveResult.error || '설정 저장 실패');
        }
      }
    } catch (error: any) {
      console.error('Failed to save personal repo:', error);
      setMessage({ type: 'error', text: error.message || '설정 저장 실패' });
    } finally {
      setIsSaving(false);
    }
  };

  const handlePullPersonalDocs = async () => {
    if (!personalRepo) {
      setMessage({ type: 'error', text: '먼저 Personal Docs 설정을 저장하세요.' });
      return;
    }

    setIsSyncing('personal-pull');
    setMessage(null);

    try {
      const result = await window.electronAPI.githubSync.pullDocuments(personalRepo);

      if (result.success && result.documents && result.documents.length > 0) {
        // Get existing docs
        const existingDocsResult = await window.electronAPI.vectorDB.getAll();
        const existingDocs =
          existingDocsResult.success && existingDocsResult.data ? existingDocsResult.data : [];

        // Find duplicates
        const docsToDelete: string[] = [];
        for (const newDoc of result.documents) {
          const matchingDocs = existingDocs.filter(
            (existing: any) =>
              existing.metadata?.title === newDoc.title &&
              existing.metadata?.folderPath === newDoc.metadata?.folderPath &&
              existing.metadata?.docGroup !== 'team' // Only delete personal docs
          );
          for (const match of matchingDocs) {
            docsToDelete.push(match.id);
          }
        }

        // Delete duplicates
        if (docsToDelete.length > 0) {
          await window.electronAPI.vectorDB.delete(docsToDelete);
        }

        // Generate IDs
        const generateId = () => {
          return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        };

        // Add IDs and docGroup metadata
        const documentsWithIds = result.documents.map((doc: any) => ({
          id: generateId(),
          content: doc.content,
          metadata: {
            ...doc.metadata,
            docGroup: 'personal',
            source: `${personalRepo.owner}/${personalRepo.repo}`,
          },
        }));

        // Index documents
        const indexResult = await window.electronAPI.vectorDB.indexDocuments(documentsWithIds, {
          chunkSize: 2500,
          chunkOverlap: 250,
          batchSize: 10,
        });

        if (indexResult.success) {
          setMessage({
            type: 'success',
            text: `${result.documents.length}개의 Personal 문서를 동기화했습니다!`,
          });
          if (onRefresh) {
            await onRefresh();
          }
        } else {
          throw new Error(indexResult.error || '문서 인덱싱 실패');
        }
      } else if (result.success && result.documents && result.documents.length === 0) {
        setMessage({ type: 'success', text: '동기화할 Personal 문서가 없습니다.' });
      } else {
        throw new Error(result.error || '문서 가져오기 실패');
      }
    } catch (error: any) {
      console.error('Failed to pull personal docs:', error);
      setMessage({ type: 'error', text: error.message || 'Personal 문서 동기화 실패' });
    } finally {
      setIsSyncing(null);
    }
  };

  const handlePushPersonalDocs = async () => {
    if (!personalRepo) {
      setMessage({ type: 'error', text: '먼저 Personal Docs 설정을 저장하세요.' });
      return;
    }

    setIsSyncing('personal-push');
    setMessage(null);

    try {
      const result = await window.electronAPI.githubSync.syncDocuments(personalRepo);

      if (result.success) {
        setMessage({
          type: 'success',
          text: result.message || 'Personal 문서를 GitHub에 Push했습니다!',
        });
      } else {
        throw new Error(result.error || 'Push 실패');
      }
    } catch (error: any) {
      console.error('Failed to push personal docs:', error);
      setMessage({ type: 'error', text: error.message || 'Personal 문서 Push 실패' });
    } finally {
      setIsSyncing(null);
    }
  };

  // Team Docs handlers
  const handleAddTeamDoc = () => {
    setTeamForm({
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
    });
    setEditingTeamId('new');
  };

  const handleEditTeamDoc = (config: TeamDocsConfig) => {
    setTeamForm(config);
    setEditingTeamId(config.id);
  };

  const handleSaveTeamDoc = async () => {
    if (!teamForm.name || !teamForm.token || !teamForm.owner || !teamForm.repo) {
      setMessage({ type: 'error', text: '모든 필수 필드를 입력하세요.' });
      return;
    }

    if (teamForm.serverType === 'ghes' && !teamForm.ghesUrl) {
      setMessage({ type: 'error', text: 'GHES URL을 입력하세요.' });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const newConfig: TeamDocsConfig = {
        id: editingTeamId === 'new' ? `team_${Date.now()}` : editingTeamId!,
        name: teamForm.name!,
        description: teamForm.description || '',
        serverType: teamForm.serverType as 'github.com' | 'ghes',
        ghesUrl: teamForm.serverType === 'ghes' ? teamForm.ghesUrl : undefined,
        token: teamForm.token!,
        owner: teamForm.owner!,
        repo: teamForm.repo!,
        branch: teamForm.branch || 'main',
        docsPath: teamForm.docsPath || 'sepilot/documents',
        enabled: teamForm.enabled ?? true,
        autoSync: teamForm.autoSync || false,
        syncInterval: teamForm.syncInterval || 60,
      };

      let updatedTeamDocs: TeamDocsConfig[];
      if (editingTeamId === 'new') {
        updatedTeamDocs = [...teamDocs, newConfig];
      } else {
        updatedTeamDocs = teamDocs.map((td) => (td.id === editingTeamId ? newConfig : td));
      }

      // Save to config
      const result = await window.electronAPI.config.load();
      if (result.success && result.data) {
        const updatedConfig = {
          ...result.data,
          teamDocs: updatedTeamDocs,
        };

        const saveResult = await window.electronAPI.config.save(updatedConfig);
        if (saveResult.success) {
          setTeamDocs(updatedTeamDocs);
          setEditingTeamId(null);
          setMessage({ type: 'success', text: 'Team Docs 설정이 저장되었습니다!' });
        } else {
          throw new Error(saveResult.error || '설정 저장 실패');
        }
      }
    } catch (error: any) {
      console.error('Failed to save team doc:', error);
      setMessage({ type: 'error', text: error.message || '설정 저장 실패' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTeamDoc = async (id: string) => {
    if (!window.confirm('이 Team Docs 설정을 삭제하시겠습니까?')) {
      return;
    }

    try {
      const updatedTeamDocs = teamDocs.filter((td) => td.id !== id);

      const result = await window.electronAPI.config.load();
      if (result.success && result.data) {
        const updatedConfig = {
          ...result.data,
          teamDocs: updatedTeamDocs,
        };

        const saveResult = await window.electronAPI.config.save(updatedConfig);
        if (saveResult.success) {
          setTeamDocs(updatedTeamDocs);
          setMessage({ type: 'success', text: 'Team Docs 설정이 삭제되었습니다.' });
        } else {
          throw new Error(saveResult.error || '설정 저장 실패');
        }
      }
    } catch (error: any) {
      console.error('Failed to delete team doc:', error);
      setMessage({ type: 'error', text: error.message || '삭제 실패' });
    }
  };

  const handleSyncTeamDoc = async (config: TeamDocsConfig) => {
    setIsSyncing(`team-pull-${config.id}`);
    setMessage(null);

    try {
      const result = await window.electronAPI.teamDocs.syncDocuments(config);

      if (result.success) {
        setMessage({ type: 'success', text: result.message || `${config.name} Pull 완료!` });
        if (onRefresh) {
          await onRefresh();
        }

        // Update lastSyncAt
        await loadConfigs();
      } else {
        throw new Error(result.error || '동기화 실패');
      }
    } catch (error: any) {
      console.error('Failed to sync team doc:', error);
      setMessage({ type: 'error', text: error.message || '동기화 실패' });
    } finally {
      setIsSyncing(null);
    }
  };

  const handlePushTeamDoc = async (config: TeamDocsConfig) => {
    setIsSyncing(`team-push-${config.id}`);
    setMessage(null);

    try {
      const result = await window.electronAPI.teamDocs.pushDocuments(config);

      if (result.success) {
        setMessage({ type: 'success', text: result.message || `${config.name} Push 완료!` });
      } else {
        throw new Error(result.error || 'Push 실패');
      }
    } catch (error: any) {
      console.error('Failed to push team doc:', error);
      setMessage({ type: 'error', text: error.message || 'Push 실패' });
    } finally {
      setIsSyncing(null);
    }
  };

  const handleSyncAllTeamDocs = async () => {
    const enabledDocs = teamDocs.filter((td) => td.enabled);
    if (enabledDocs.length === 0) {
      setMessage({ type: 'error', text: '활성화된 Team Docs가 없습니다.' });
      return;
    }

    setIsSyncing('team-all');
    setMessage(null);

    try {
      const result = await window.electronAPI.teamDocs.syncAll();

      if (result.success) {
        setMessage({ type: 'success', text: result.message || '모든 Team Docs 동기화 완료!' });
        if (onRefresh) {
          await onRefresh();
        }

        // Update lastSyncAt
        await loadConfigs();
      } else {
        throw new Error(result.error || '일괄 동기화 실패');
      }
    } catch (error: any) {
      console.error('Failed to sync all team docs:', error);
      setMessage({ type: 'error', text: error.message || '일괄 동기화 실패' });
    } finally {
      setIsSyncing(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-y-auto"
        onClose={() => onOpenChange(false)}
      >
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Github className="h-5 w-5" />
              Documents Sync
            </div>
          </DialogTitle>
          <DialogDescription>
            Personal Docs와 Team Docs를 GitHub 레포지토리와 동기화합니다.
          </DialogDescription>
        </DialogHeader>

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

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'personal' | 'team')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="personal" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Personal Docs
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Team Docs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Server Type</Label>
                <select
                  value={personalForm.serverType}
                  onChange={(e) =>
                    setPersonalForm({
                      ...personalForm,
                      serverType: e.target.value as 'github.com' | 'ghes',
                    })
                  }
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                >
                  <option value="github.com">GitHub.com</option>
                  <option value="ghes">GitHub Enterprise Server</option>
                </select>
              </div>

              {personalForm.serverType === 'ghes' && (
                <div className="space-y-2">
                  <Label>GHES URL</Label>
                  <Input
                    value={personalForm.ghesUrl}
                    onChange={(e) => setPersonalForm({ ...personalForm, ghesUrl: e.target.value })}
                    placeholder="https://github.company.com"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>GitHub Token *</Label>
                <Input
                  type="password"
                  value={personalForm.token}
                  onChange={(e) => setPersonalForm({ ...personalForm, token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Owner *</Label>
                  <Input
                    value={personalForm.owner}
                    onChange={(e) => setPersonalForm({ ...personalForm, owner: e.target.value })}
                    placeholder="username or org"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Repository *</Label>
                  <Input
                    value={personalForm.repo}
                    onChange={(e) => setPersonalForm({ ...personalForm, repo: e.target.value })}
                    placeholder="repo-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Branch</Label>
                  <Input
                    value={personalForm.branch}
                    onChange={(e) => setPersonalForm({ ...personalForm, branch: e.target.value })}
                    placeholder="main"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Docs Path</Label>
                  <Input
                    value={personalForm.docsPath}
                    onChange={(e) => setPersonalForm({ ...personalForm, docsPath: e.target.value })}
                    placeholder="sepilot/documents"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSavePersonalRepo} disabled={isSaving} className="flex-1">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    '설정 저장'
                  )}
                </Button>
                <Button
                  onClick={handlePullPersonalDocs}
                  disabled={!personalRepo || isSyncing !== null}
                  variant="outline"
                  className="flex-1"
                >
                  {isSyncing === 'personal-pull' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Pull 중...
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      Pull
                    </>
                  )}
                </Button>
                <Button
                  onClick={handlePushPersonalDocs}
                  disabled={!personalRepo || isSyncing !== null}
                  variant="outline"
                  className="flex-1"
                >
                  {isSyncing === 'personal-push' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Push 중...
                    </>
                  ) : (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Push
                    </>
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            {editingTeamId ? (
              <div className="space-y-4 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {editingTeamId === 'new' ? 'New Team Docs' : 'Edit Team Docs'}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setEditingTeamId(null)}>
                    취소
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>팀 이름 *</Label>
                  <Input
                    value={teamForm.name}
                    onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                    placeholder="예: Frontend Team"
                  />
                </div>

                <div className="space-y-2">
                  <Label>설명</Label>
                  <Textarea
                    value={teamForm.description}
                    onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })}
                    placeholder="이 Team Docs에 대한 설명"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Server Type</Label>
                  <select
                    value={teamForm.serverType}
                    onChange={(e) =>
                      setTeamForm({
                        ...teamForm,
                        serverType: e.target.value as 'github.com' | 'ghes',
                      })
                    }
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  >
                    <option value="github.com">GitHub.com</option>
                    <option value="ghes">GitHub Enterprise Server</option>
                  </select>
                </div>

                {teamForm.serverType === 'ghes' && (
                  <div className="space-y-2">
                    <Label>GHES URL</Label>
                    <Input
                      value={teamForm.ghesUrl}
                      onChange={(e) => setTeamForm({ ...teamForm, ghesUrl: e.target.value })}
                      placeholder="https://github.company.com"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>GitHub Token *</Label>
                  <Input
                    type="password"
                    value={teamForm.token}
                    onChange={(e) => setTeamForm({ ...teamForm, token: e.target.value })}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Owner *</Label>
                    <Input
                      value={teamForm.owner}
                      onChange={(e) => setTeamForm({ ...teamForm, owner: e.target.value })}
                      placeholder="username or org"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Repository *</Label>
                    <Input
                      value={teamForm.repo}
                      onChange={(e) => setTeamForm({ ...teamForm, repo: e.target.value })}
                      placeholder="repo-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Branch</Label>
                    <Input
                      value={teamForm.branch}
                      onChange={(e) => setTeamForm({ ...teamForm, branch: e.target.value })}
                      placeholder="main"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Docs Path</Label>
                    <Input
                      value={teamForm.docsPath}
                      onChange={(e) => setTeamForm({ ...teamForm, docsPath: e.target.value })}
                      placeholder="sepilot/documents"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <Label htmlFor="enabled" className="cursor-pointer">
                    활성화
                  </Label>
                  <Switch
                    id="enabled"
                    checked={teamForm.enabled}
                    onCheckedChange={(checked) => setTeamForm({ ...teamForm, enabled: checked })}
                  />
                </div>

                <Button onClick={handleSaveTeamDoc} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    '저장'
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Team Docs 목록</h3>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSyncAllTeamDocs}
                      disabled={
                        isSyncing !== null || teamDocs.filter((td) => td.enabled).length === 0
                      }
                      variant="outline"
                      size="sm"
                    >
                      {isSyncing === 'team-all' ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          모두 동기화 중...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          모두 동기화
                        </>
                      )}
                    </Button>
                    <Button onClick={handleAddTeamDoc} size="sm">
                      <Plus className="mr-2 h-4 w-4" />
                      추가
                    </Button>
                  </div>
                </div>

                {teamDocs.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                    등록된 Team Docs가 없습니다. 추가 버튼을 클릭하여 생성하세요.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {teamDocs.map((config) => (
                      <div key={config.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{config.name}</h4>
                              {!config.enabled && (
                                <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                                  비활성화
                                </span>
                              )}
                            </div>
                            {config.description && (
                              <p className="text-sm text-muted-foreground mt-1">
                                {config.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {config.owner}/{config.repo} ({config.branch})
                            </p>
                            {config.lastSyncAt && (
                              <p className="text-xs text-muted-foreground mt-1">
                                마지막 동기화: {new Date(config.lastSyncAt).toLocaleString('ko-KR')}
                                {config.lastSyncStatus === 'error' && config.lastSyncError && (
                                  <span className="text-destructive ml-2">
                                    (실패: {config.lastSyncError})
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSyncTeamDoc(config)}
                              disabled={!config.enabled || isSyncing !== null}
                              title="Pull (GitHub → Local)"
                            >
                              {isSyncing === `team-pull-${config.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Download className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePushTeamDoc(config)}
                              disabled={!config.enabled || isSyncing !== null}
                              title="Push (Local → GitHub)"
                            >
                              {isSyncing === `team-push-${config.id}` ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Upload className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTeamDoc(config)}
                              title="편집"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTeamDoc(config.id)}
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
