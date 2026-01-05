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
  Plus,
  Trash2,
  Edit2,
} from 'lucide-react';
import { GitHubSyncConfig, TeamDocsConfig } from '@/types';
import { useTranslation } from 'react-i18next';

interface DocsSyncDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh?: () => Promise<void>;
  initialTab?: 'personal' | 'team';
  initialEditTeamId?: string | null;
}

export function DocsSyncDialog({
  open,
  onOpenChange,
  onRefresh,
  initialTab,
  initialEditTeamId,
}: DocsSyncDialogProps) {
  const { t } = useTranslation();

  // Personal Docs Repo state
  const [_personalRepo, setPersonalRepo] = useState<GitHubSyncConfig | null>(null);
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
  const [activeTab, setActiveTab] = useState<'personal' | 'team'>('personal');

  // Load configs on mount and apply initial settings
  useEffect(() => {
    if (open) {
      loadConfigs();

      // Set initial tab if provided
      if (initialTab) {
        setActiveTab(initialTab);
      }
    }
  }, [open, initialTab]);

  // Apply initial edit team ID after team docs are loaded
  useEffect(() => {
    if (open && initialEditTeamId && teamDocs.length > 0) {
      const teamConfig = teamDocs.find((td) => td.id === initialEditTeamId);
      if (teamConfig) {
        handleEditTeamDoc(teamConfig);
      }
    }
  }, [open, initialEditTeamId, teamDocs]);

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
      setMessage({ type: 'error', text: t('documentsSync.validation.requiredFields') });
      return;
    }

    if (personalForm.serverType === 'ghes' && !personalForm.ghesUrl) {
      setMessage({ type: 'error', text: t('documentsSync.validation.ghesUrlRequired') });
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
          setMessage({ type: 'success', text: t('documentsSync.saveSuccess.personal') });
          // Refresh document list
          if (onRefresh) {
            await onRefresh();
          }
        } else {
          throw new Error(saveResult.error || t('documentsSync.saveError'));
        }
      }
    } catch (error: any) {
      console.error('Failed to save personal repo:', error);
      setMessage({ type: 'error', text: error.message || '설정 저장 실패' });
    } finally {
      setIsSaving(false);
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
      setMessage({ type: 'error', text: t('documentsSync.validation.requiredFields') });
      return;
    }

    if (teamForm.serverType === 'ghes' && !teamForm.ghesUrl) {
      setMessage({ type: 'error', text: t('documentsSync.validation.ghesUrlRequired') });
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
          setMessage({ type: 'success', text: t('documentsSync.saveSuccess.team') });
          // Refresh document list
          if (onRefresh) {
            await onRefresh();
          }
        } else {
          throw new Error(saveResult.error || t('documentsSync.saveError'));
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
    if (!window.confirm(t('documentsSync.deleteConfirm'))) {
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
          setMessage({ type: 'success', text: t('documentsSync.deleteSuccess') });
          // Refresh document list
          if (onRefresh) {
            await onRefresh();
          }
        } else {
          throw new Error(saveResult.error || t('documentsSync.saveError'));
        }
      }
    } catch (error: any) {
      console.error('Failed to delete team doc:', error);
      setMessage({ type: 'error', text: error.message || '삭제 실패' });
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
              {t('documentsSync.title')}
            </div>
          </DialogTitle>
          <DialogDescription>
            {t('documentsSync.description')}
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
              {t('documentsSync.tabs.personal')}
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {t('documentsSync.tabs.team')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>{t('documentsSync.labels.serverType')}</Label>
                <select
                  title={t('documentsSync.labels.serverType')}
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
                  <Label>{t('documentsSync.labels.ghesUrl')}</Label>
                  <Input
                    value={personalForm.ghesUrl}
                    onChange={(e) => setPersonalForm({ ...personalForm, ghesUrl: e.target.value })}
                    placeholder="https://github.company.com"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('documentsSync.labels.token')}</Label>
                <Input
                  type="password"
                  value={personalForm.token}
                  onChange={(e) => setPersonalForm({ ...personalForm, token: e.target.value })}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.owner')}</Label>
                  <Input
                    value={personalForm.owner}
                    onChange={(e) => setPersonalForm({ ...personalForm, owner: e.target.value })}
                    placeholder="username or org"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.repo')}</Label>
                  <Input
                    value={personalForm.repo}
                    onChange={(e) => setPersonalForm({ ...personalForm, repo: e.target.value })}
                    placeholder="repo-name"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.branch')}</Label>
                  <Input
                    value={personalForm.branch}
                    onChange={(e) => setPersonalForm({ ...personalForm, branch: e.target.value })}
                    placeholder="main"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.docsPath')}</Label>
                  <Input
                    value={personalForm.docsPath}
                    onChange={(e) => setPersonalForm({ ...personalForm, docsPath: e.target.value })}
                    placeholder="sepilot/documents"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4">
                <Button onClick={handleSavePersonalRepo} disabled={isSaving} className="w-full">
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {t('documentsSync.buttons.saving')}
                    </>
                  ) : (
                    t('documentsSync.buttons.save')
                  )}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {t('documentsSync.hints.saveFirst')}
              </p>
            </div>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            {editingTeamId ? (
              <div className="space-y-4 border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {editingTeamId === 'new' ? t('documentsSync.teamDocs.newTitle') : t('documentsSync.teamDocs.editTitle')}
                  </h3>
                  <Button variant="ghost" size="sm" onClick={() => setEditingTeamId(null)}>
                    {t('documentsSync.buttons.cancel')}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.teamName')}</Label>
                  <Input
                    value={teamForm.name}
                    onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                    placeholder="예: Frontend Team"
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.description')}</Label>
                  <Textarea
                    value={teamForm.description}
                    onChange={(e) => setTeamForm({ ...teamForm, description: e.target.value })}
                    placeholder={t('documentsSync.labels.descriptionPlaceholder')}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.serverType')}</Label>
                  <select
                    title={t('documentsSync.labels.serverType')}
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
                    <Label>{t('documentsSync.labels.ghesUrl')}</Label>
                    <Input
                      value={teamForm.ghesUrl}
                      onChange={(e) => setTeamForm({ ...teamForm, ghesUrl: e.target.value })}
                      placeholder="https://github.company.com"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>{t('documentsSync.labels.token')}</Label>
                  <Input
                    type="password"
                    value={teamForm.token}
                    onChange={(e) => setTeamForm({ ...teamForm, token: e.target.value })}
                    placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('documentsSync.labels.owner')}</Label>
                    <Input
                      value={teamForm.owner}
                      onChange={(e) => setTeamForm({ ...teamForm, owner: e.target.value })}
                      placeholder="username or org"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('documentsSync.labels.repo')}</Label>
                    <Input
                      value={teamForm.repo}
                      onChange={(e) => setTeamForm({ ...teamForm, repo: e.target.value })}
                      placeholder="repo-name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t('documentsSync.labels.branch')}</Label>
                    <Input
                      value={teamForm.branch}
                      onChange={(e) => setTeamForm({ ...teamForm, branch: e.target.value })}
                      placeholder="main"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('documentsSync.labels.docsPath')}</Label>
                    <Input
                      value={teamForm.docsPath}
                      onChange={(e) => setTeamForm({ ...teamForm, docsPath: e.target.value })}
                      placeholder="sepilot/documents"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 rounded-lg bg-muted">
                  <Label htmlFor="enabled" className="cursor-pointer">
                    {t('documentsSync.labels.enabled')}
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
                      {t('documentsSync.buttons.saving')}
                    </>
                  ) : (
                    t('documentsSync.buttons.save')
                  )}
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t('documentsSync.teamDocs.listTitle')}</h3>
                  <Button onClick={handleAddTeamDoc} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    {t('documentsSync.buttons.add')}
                  </Button>
                </div>

                {teamDocs.length === 0 ? (
                  <div className="border border-dashed rounded-lg p-8 text-center text-muted-foreground">
                    {t('documentsSync.teamDocs.empty')}
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
                                  {t('documentsSync.teamDocs.disabled')}
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
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditTeamDoc(config)}
                              title={t('documentsSync.buttons.edit')}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteTeamDoc(config.id)}
                              title={t('documentsSync.buttons.delete')}
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
