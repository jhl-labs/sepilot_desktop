'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Loader2, CheckCircle, AlertCircle, Save, RefreshCw, FileText } from 'lucide-react';
import { GitHubSyncConfig } from '@/types';

interface PersonalDocsSettingsProps {
  config?: GitHubSyncConfig;
  onSave: (config: GitHubSyncConfig) => Promise<void>;
}

export function PersonalDocsSettings({ config, onSave }: PersonalDocsSettingsProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<GitHubSyncConfig>>({
    serverType: 'github.com',
    token: '',
    owner: '',
    repo: '',
    branch: 'main',
    syncDocuments: false,
    ...config,
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (config) {
      setFormData({
        serverType: config.serverType || 'github.com',
        token: config.token || '',
        owner: config.owner || '',
        repo: config.repo || '',
        branch: config.branch || 'main',
        syncDocuments: config.syncDocuments ?? false,
      });
    }
  }, [config]);

  const handleSave = async () => {
    // Basic validation
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

    setIsSaving(true);
    setMessage(null);

    try {
      await onSave(formData as GitHubSyncConfig);
      setMessage({ type: 'success', text: t('settings.personalDocs.saveSuccess') });
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || t('settings.personalDocs.saveFailed') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);

    try {
      if (typeof window !== 'undefined' && window.electronAPI?.githubSync) {
        // Only sync documents
        const result = await window.electronAPI.githubSync.syncDocuments(
          formData as GitHubSyncConfig
        );

        if (result.success) {
          setMessage({
            type: 'success',
            text: result.message || t('settings.personalDocs.syncSuccess'),
          });
        } else {
          throw new Error(result.error || t('settings.personalDocs.syncFailed'));
        }
      } else {
        throw new Error('Electron API unavailable');
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || t('settings.personalDocs.syncFailed') });
    } finally {
      setIsSyncing(false);
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

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          {t('settings.personalDocs.title')}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t('settings.personalDocs.description')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('settings.personalDocs.configuration')}</CardTitle>
          <CardDescription>{t('settings.personalDocs.configurationDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg bg-secondary/10">
            <div className="space-y-0.5">
              <Label className="text-base">{t('settings.personalDocs.enableSync')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('settings.personalDocs.enableSyncDesc')}
              </p>
            </div>
            <Switch
              checked={formData.syncDocuments}
              onCheckedChange={(checked) => setFormData({ ...formData, syncDocuments: checked })}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
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
                <option value="github.com">GitHub.com</option>
                <option value="ghes">GitHub Enterprise (GHES)</option>
              </select>
            </div>

            {formData.serverType === 'ghes' && (
              <div className="space-y-2">
                <Label htmlFor="ghesUrl">GHES URL</Label>
                <Input
                  id="ghesUrl"
                  value={formData.ghesUrl || ''}
                  onChange={(e) => setFormData({ ...formData, ghesUrl: e.target.value })}
                  placeholder="https://github.company.com"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="token">Personal Access Token</Label>
              <Input
                id="token"
                type="password"
                value={formData.token || ''}
                onChange={(e) => setFormData({ ...formData, token: e.target.value })}
                placeholder="ghp_..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="owner">Owner (User/Org)</Label>
              <Input
                id="owner"
                value={formData.owner || ''}
                onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                placeholder="username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="repo">Repository</Label>
              <Input
                id="repo"
                value={formData.repo || ''}
                onChange={(e) => setFormData({ ...formData, repo: e.target.value })}
                placeholder="my-docs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="branch">Branch</Label>
              <Input
                id="branch"
                value={formData.branch || ''}
                onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                placeholder="main"
              />
            </div>
          </div>

          <div className="pt-4 flex gap-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {t('common.save')}
                </>
              )}
            </Button>

            <Button
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing || !formData.syncDocuments}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('settings.personalDocs.syncing')}
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {t('settings.personalDocs.syncNow')}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-4 py-3 text-sm">
        <p className="font-medium mb-2">Note</p>
        <p className="text-muted-foreground">{t('settings.personalDocs.note')}</p>
      </div>
    </div>
  );
}
