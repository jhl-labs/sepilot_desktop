'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from 'next/dynamic';
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  FileText,
  Globe,
  Github,
  FolderOpen,
  Tag,
  Sparkles,
  Save,
  Users,
  User,
} from 'lucide-react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';

import { VectorDocument } from '@/lib/domains/rag/types';
import { DocumentSourceType } from '@/lib/domains/document/types';
import { ChunkStrategy } from '@/lib/domains/rag/types';
import { fetchDocument } from '@/lib/domains/document/fetchers';
import { cleanDocumentsWithLLM } from '@/lib/domains/document/cleaner';
import { TeamDocsConfig } from '@/types';
import { cn } from '@/lib/utils';

// Fallback editor component when editor extension is not available
function FallbackEditor({
  content,
  onChange,
}: {
  content: string;
  language?: string;
  theme?: string;
  onChange?: (value: string | undefined) => void;
  options?: unknown;
}) {
  return (
    <textarea
      value={content}
      onChange={(e) => onChange?.(e.target.value)}
      className="w-full h-full bg-[#1e1e1e] text-gray-200 font-mono text-sm p-4 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
      placeholder="Enter content here..."
      style={{ lineHeight: 1.6 }}
    />
  );
}

// Dynamic import with Extension initialization via registry
// Use SingleFileEditorWithContext which already has ExtensionAPIContextProvider
const SingleFileEditor = dynamic(
  async () => {
    try {
      // Runtime loading via extensionRegistry (아키텍처 원칙 준수)
      const { extensionRegistry } = await import('@/lib/extensions/registry');

      // Extension 활성화
      if (!extensionRegistry.isActive('editor')) {
        await extensionRegistry.activate('editor');
        console.log('[DocumentDialog] Editor extension activated successfully');
      }

      // Extension 정의 가져오기
      const ext = extensionRegistry.get('editor');
      if (!ext?.definition?.MainComponent) {
        throw new Error('Editor extension MainComponent not found');
      }

      // SingleFileEditorWithContext 반환
      const MainComponent = ext.definition.MainComponent as any;
      return { default: MainComponent.SingleFileEditorWithContext || MainComponent };
    } catch (err: any) {
      console.warn('[DocumentDialog] Editor extension not available, using fallback:', err.message);
      return { default: FallbackEditor };
    }
  },
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-[#1e1e1e] text-gray-400">
        Loading editor...
      </div>
    ),
  }
);

interface DocumentDialogProps {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Edit mode props
  document?: VectorDocument | null;
  onSave?: (doc: {
    id: string;
    content: string;
    metadata: Record<string, unknown>;
  }) => Promise<void>;
  // Create mode props
  onUpload?: (
    documents: { content: string; metadata: Record<string, unknown> }[],
    chunkStrategy?: ChunkStrategy
  ) => Promise<void>;
}

const DEFAULT_TEAM_DOCS_PATH = 'sepilot/documents';

function normalizeGitHubPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').trim();
}

function sanitizeFilenameBase(filename: string): string {
  const sanitized = filename
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return sanitized || 'Untitled';
}

function buildTeamGithubPath(
  docsPath: string | undefined,
  folderPath: string,
  title: string
): string {
  const docsRoot = normalizeGitHubPath(docsPath || DEFAULT_TEAM_DOCS_PATH);
  const normalizedFolder = normalizeGitHubPath(folderPath || '');
  const relativeFolder =
    normalizedFolder === docsRoot
      ? ''
      : normalizedFolder.startsWith(`${docsRoot}/`)
        ? normalizedFolder.slice(docsRoot.length + 1)
        : normalizedFolder;
  let titleBase = sanitizeFilenameBase(title);
  if (titleBase.toLowerCase().endsWith('.md')) {
    titleBase = titleBase.slice(0, -3).trim() || 'Untitled';
  }
  const filename = `${titleBase}.md`;
  return relativeFolder ? `${docsRoot}/${relativeFolder}/${filename}` : `${docsRoot}/${filename}`;
}

export function DocumentDialog({
  mode,
  open,
  onOpenChange,
  document,
  onSave,
  onUpload,
}: DocumentDialogProps) {
  const { t } = useTranslation();
  // Common states
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [isPushing, setIsPushing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // AI custom prompt states

  // Create mode specific states
  const [sourceType, setSourceType] = useState<DocumentSourceType>('manual');
  const [docGroup, setDocGroup] = useState<'personal' | 'team'>('personal');
  const [selectedTeamDocsId, setSelectedTeamDocsId] = useState<string>('');
  const [teamDocs, setTeamDocs] = useState<TeamDocsConfig[]>([]);
  const [httpUrl, setHttpUrl] = useState('');
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [githubPath, setGithubPath] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
  const [cleanWithLLM, setCleanWithLLM] = useState(false);
  const [chunkStrategy, setChunkStrategy] = useState<ChunkStrategy>('sentence');
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null
  );

  // Focus management
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Load Team Docs configs
  useEffect(() => {
    const loadTeamDocs = async () => {
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.config) {
          const result = await window.electronAPI.config.load();
          if (result.success && result.data?.teamDocs) {
            setTeamDocs(result.data.teamDocs);
            setSelectedTeamDocsId((prev) => {
              if (mode === 'edit' && document?.metadata?.teamDocsId) {
                const documentTeamId = String(document.metadata.teamDocsId);
                if (result.data.teamDocs.some((td) => td.id === documentTeamId)) {
                  return documentTeamId;
                }
              }
              if (prev && result.data.teamDocs.some((td) => td.id === prev)) {
                return prev;
              }
              return result.data.teamDocs[0]?.id || '';
            });
          }
        }
      } catch (error) {
        console.error('Failed to load team docs:', error);
      }
    };

    if (open) {
      loadTeamDocs();
    }
  }, [open, mode, document]);

  // Initialize edit mode data
  useEffect(() => {
    if (open && mode === 'edit' && document) {
      setTitle(document.metadata?.title || '');
      setSource(document.metadata?.source || '');
      setFolderPath(document.metadata?.folderPath || '');
      setContent(document.content || '');
      const group = document.metadata?.docGroup === 'team' ? 'team' : 'personal';
      setDocGroup(group);
      if (group === 'team' && document.metadata?.teamDocsId) {
        setSelectedTeamDocsId(String(document.metadata.teamDocsId));
      }
    }
  }, [open, mode, document]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Reset all states
      setTitle('');
      setSource('');
      setFolderPath('');
      setContent('');
      setMessage(null);
      setDocGroup('personal');

      if (mode === 'create') {
        setSourceType('manual');
        setSelectedTeamDocsId('');
        setHttpUrl('');
        setGithubRepoUrl('');
        setGithubPath('');
        setGithubBranch('main');
        setGithubToken('');
        setCleanWithLLM(false);
        setChunkStrategy('sentence');
        setUploadProgress(null);
      }
    } else {
      // Focus title on open
      setTimeout(() => {
        titleInputRef.current?.focus();
      }, 100);
    }
  }, [open, mode]);

  const handleSave = async (pushToGitHub: boolean = false) => {
    // Handling Edit Mode Save
    if (mode === 'edit') {
      if (!content.trim()) {
        setMessage({ type: 'error', text: t('documentDialog.errors.contentRequired') });
        return;
      }
      if (!document || !onSave) {
        return;
      }

      setIsSaving(true);
      setMessage(null);

      try {
        const isTeamDoc = document.metadata?.docGroup === 'team';
        const updatedMetadata: Record<string, unknown> = {
          ...document.metadata,
          title: title.trim() || t('documents.untitled'),
          source: source.trim() || 'manual',
          folderPath: folderPath.trim() || undefined,
          updatedAt: Date.now(),
        };

        if (isTeamDoc) {
          updatedMetadata.modifiedLocally = true;
        }

        await onSave({
          id: document.id,
          content: content.trim(),
          metadata: updatedMetadata,
        });

        if (pushToGitHub && isTeamDoc) {
          if (!document.metadata.teamDocsId) {
            throw new Error(t('documentDialog.errors.teamDocsIdMissing'));
          }
          setIsPushing(true);
          try {
            const newTitle = title.trim() || t('documents.untitled');
            const newFolderPath = folderPath.trim();
            const teamConfig = teamDocs.find(
              (td) => td.id === String(document.metadata.teamDocsId)
            );
            if (!teamConfig) {
              throw new Error(t('documentDialog.errors.teamDocsIdMissing'));
            }

            const oldTitle = String(document.metadata.title || '');
            const oldFolderPath = String(document.metadata.folderPath || '');
            let githubPath = String(document.metadata.githubPath || '');
            if (!githubPath || newTitle !== oldTitle || newFolderPath !== oldFolderPath) {
              githubPath = buildTeamGithubPath(teamConfig.docsPath, newFolderPath, newTitle);
            }

            const result = await window.electronAPI.teamDocs.pushDocument({
              documentId: document.id,
              teamDocsId: document.metadata.teamDocsId as string,
              githubPath: githubPath,
              oldGithubPath: document.metadata.githubPath as string,
              title: newTitle,
              content: content.trim(),
              metadata: {
                folderPath: newFolderPath || undefined,
                source: source.trim() || 'manual',
              },
              sha: document.metadata.githubSha as string,
              commitMessage: `Update ${newTitle} from SEPilot`,
            });
            if (!result.success) {
              if (result.error === 'CONFLICT') {
                throw new Error(t('documentDialog.errors.conflict'));
              }
              throw new Error(result.error || t('documents.errors.pushFailed'));
            }
            setMessage({ type: 'success', text: t('documentDialog.success.githubUpload') });
          } catch (error) {
            console.error(error);
            setMessage({
              type: 'error',
              text:
                (error instanceof Error ? error.message : String(error)) ||
                t('documents.errors.pushFailed'),
            });
            return; // Stop here if push failed
          } finally {
            setIsPushing(false);
          }
        } else {
          setMessage({ type: 'success', text: t('documentDialog.success.saved') });
        }

        setTimeout(() => onOpenChange(false), 800);
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            (error instanceof Error ? error.message : String(error)) ||
            t('documentDialog.errors.saveFailed'),
        });
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // Handling Create Mode
    if (mode === 'create' && onUpload) {
      setIsSaving(true);
      setMessage(null);
      try {
        if (docGroup === 'team' && !selectedTeamDocsId) {
          throw new Error(t('documentDialog.errors.selectTeamDocs'));
        }

        let documentsToUpload: { content: string; metadata: Record<string, unknown> }[] = [];
        const getBaseMetadata = () => {
          const base: Record<string, unknown> = {
            docGroup: docGroup,
            uploadedAt: Date.now(),
            folderPath: folderPath.trim() || undefined,
          };
          if (docGroup === 'team') {
            const selectedTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
            base.teamDocsId = selectedTeamDocsId;
            base.teamName = selectedTeam?.name;
            base.source = `${selectedTeam?.owner}/${selectedTeam?.repo}`;
            base.modifiedLocally = true;
          }
          return base;
        };

        if (sourceType === 'manual') {
          if (!content.trim()) {
            throw new Error(t('documentDialog.errors.contentRequired'));
          }
          documentsToUpload = [
            {
              content: content.trim(),
              metadata: {
                ...getBaseMetadata(),
                title: title.trim() || t('documents.untitled'),
                source: source.trim() || 'manual',
              },
            },
          ];
        } else if (sourceType === 'http') {
          if (!httpUrl.trim()) {
            throw new Error(t('documentDialog.errors.urlRequired'));
          }
          const fetched = await fetchDocument({ type: 'http', url: httpUrl.trim() });
          documentsToUpload = fetched.map((doc) => ({
            content: doc.content,
            metadata: {
              ...doc.metadata,
              ...getBaseMetadata(),
              title: title.trim() || doc.metadata.title || 'Untitled',
            },
          }));
        } else if (sourceType === 'github') {
          if (!githubRepoUrl.trim() || !githubPath.trim()) {
            throw new Error(t('documentDialog.errors.repoAndPathRequired'));
          }
          const fetched = await fetchDocument({
            type: 'github',
            repoUrl: githubRepoUrl.trim(),
            path: githubPath.trim(),
            branch: githubBranch.trim() || 'main',
            token: githubToken.trim() || undefined,
          });
          documentsToUpload = fetched.map((doc) => ({
            content: doc.content,
            metadata: {
              ...doc.metadata,
              ...getBaseMetadata(),
              title: doc.metadata.title || 'Untitled',
            },
          }));
        }

        if (cleanWithLLM && documentsToUpload.length > 0) {
          setMessage({ type: 'success', text: t('documentDialog.processing.cleaning') });
          documentsToUpload = await cleanDocumentsWithLLM(documentsToUpload, (c, t) =>
            setUploadProgress({ current: c, total: t })
          );
        }

        await onUpload(documentsToUpload, chunkStrategy);
        setMessage({
          type: 'success',
          text: t('documentDialog.success.uploaded', { count: documentsToUpload.length }),
        });
        setTimeout(() => onOpenChange(false), 1000);
      } catch (error) {
        setMessage({
          type: 'error',
          text:
            error instanceof Error
              ? error.message
              : String(error) || t('documentDialog.errors.uploadFailed'),
        });
      } finally {
        setIsSaving(false);
        setUploadProgress(null);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[90vh] flex flex-col p-0 gap-0 bg-background overflow-hidden sm:rounded-xl border shadow-2xl">
        {/* Header Section */}
        <div className="flex-none px-6 py-4 border-b flex items-start justify-between gap-6 bg-background/95 backdrop-blur z-10 shrink-0">
          <div className="flex-1 flex flex-col gap-2 min-w-0">
            {/* Title Input */}
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <FileText className="w-5 h-5" />
              </div>
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('documentDialog.placeholder.title')}
                className="flex-1 text-lg font-semibold bg-transparent border-none outline-none placeholder:text-muted-foreground/50 focus:placeholder:text-muted-foreground/30 truncate"
              />
            </div>

            {/* Metadata Badges */}
            <div className="flex items-center gap-2 text-sm pl-1 flex-wrap">
              {/* Group Selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 gap-1.5 text-xs font-normal border-dashed text-muted-foreground hover:text-foreground"
                  >
                    {docGroup === 'personal' ? (
                      <User className="w-3.5 h-3.5" />
                    ) : (
                      <Users className="w-3.5 h-3.5 text-orange-500" />
                    )}
                    {docGroup === 'personal'
                      ? t('documents.tabs.personal')
                      : t('documents.tabs.team')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-60 p-2" align="start">
                  <Label className="text-xs text-muted-foreground mb-2 block">
                    {t('documentDialog.labels.selectGroup')}
                  </Label>
                  <div className="grid gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('justify-start gap-2', docGroup === 'personal' && 'bg-accent')}
                      onClick={() => setDocGroup('personal')}
                    >
                      <User className="w-4 h-4" /> {t('documents.tabs.personal')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={cn('justify-start gap-2', docGroup === 'team' && 'bg-accent')}
                      onClick={() => setDocGroup('team')}
                    >
                      <Users className="w-4 h-4" /> {t('documents.tabs.team')}
                    </Button>
                  </div>
                  {docGroup === 'team' && (
                    <div className="mt-2 pt-2 border-t">
                      <select
                        className="w-full text-xs h-8 rounded border px-2"
                        value={selectedTeamDocsId}
                        onChange={(e) => setSelectedTeamDocsId(e.target.value)}
                      >
                        {teamDocs.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </PopoverContent>
              </Popover>

              <Separator orientation="vertical" className="h-4" />

              {/* Folder Selector */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 gap-1.5 text-xs font-normal border-dashed text-muted-foreground hover:text-foreground"
                  >
                    {folderPath ? (
                      <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                    ) : (
                      <FolderOpen className="w-3.5 h-3.5" />
                    )}
                    {folderPath || t('documentDialog.labels.rootFolder')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                  <div className="space-y-2">
                    <Label className="text-xs">{t('documentDialog.labels.folderPath')}</Label>
                    <Input
                      value={folderPath}
                      onChange={(e) => setFolderPath(e.target.value)}
                      placeholder={t('documentDialog.placeholder.folderPath')}
                      className="h-8 text-sm"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      {t('documentDialog.hints.folderSeparator')}
                    </p>
                  </div>
                </PopoverContent>
              </Popover>

              <Separator orientation="vertical" className="h-4" />

              {/* Source Selector (Only for Edit Mode or Manual) */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 gap-1.5 text-xs font-normal border-dashed text-muted-foreground hover:text-foreground"
                  >
                    <Tag className="w-3.5 h-3.5" />
                    {source || t('documentDialog.labels.noSource')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3" align="start">
                  <div className="space-y-2">
                    <Label className="text-xs">{t('documentDialog.labels.source')}</Label>
                    <Input
                      value={source}
                      onChange={(e) => setSource(e.target.value)}
                      placeholder={t('documentDialog.placeholder.source')}
                      className="h-8 text-sm"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
              {t('documentDialog.actions.cancel')}
            </Button>
            <Button
              onClick={() => handleSave(false)}
              disabled={isSaving}
              className="gap-2 min-w-[100px]"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {mode === 'create'
                ? t('documentDialog.actions.upload')
                : t('documentDialog.actions.save')}
            </Button>
            {mode === 'edit' && docGroup === 'team' && (
              <Button
                variant="secondary"
                onClick={() => handleSave(true)}
                disabled={isSaving || isPushing}
                title={t('documentDialog.actions.pushToGitHub')}
              >
                {isPushing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Github className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>

        {/* Message Alert */}
        {message && (
          <div
            className={cn(
              'px-4 py-2 text-sm flex items-center gap-2 animate-in slide-in-from-top-1 shrink-0',
              message.type === 'success'
                ? 'bg-green-500/10 text-green-600'
                : 'bg-red-500/10 text-red-600'
            )}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4" />
            )}
            {message.text}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 min-h-0 bg-muted/5 flex flex-col">
          {mode === 'create' ? (
            <Tabs
              value={sourceType}
              onValueChange={(v) => setSourceType(v as DocumentSourceType)}
              className="flex-1 flex flex-col min-h-0"
            >
              <div className="px-6 border-b bg-background flex items-center gap-4 shrink-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Source Type
                </span>
                <TabsList className="h-10 bg-transparent p-0 gap-4">
                  <TabsTrigger
                    value="manual"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 border-b-2 border-transparent"
                  >
                    <FileText className="w-4 h-4 mr-2" /> {t('documentDialog.sourceType.manual')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="http"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 border-b-2 border-transparent"
                  >
                    <Globe className="w-4 h-4 mr-2" /> {t('documentDialog.sourceType.http')}
                  </TabsTrigger>
                  <TabsTrigger
                    value="github"
                    className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none h-full px-2 border-b-2 border-transparent"
                  >
                    <Github className="w-4 h-4 mr-2" /> {t('documentDialog.sourceType.github')}
                  </TabsTrigger>
                </TabsList>
              </div>

              {/* Manual Tab - Shows Editor */}
              <TabsContent
                value="manual"
                className="flex-1 flex flex-col min-h-0 data-[state=active]:flex mt-0 h-full"
              >
                <div className="flex-1 relative border-t min-h-0">
                  <SingleFileEditor
                    {...({
                      content,
                      language: 'markdown',
                      theme: 'vs-dark',
                      onChange: (value: any) => setContent(value || ''),
                      options: {
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        lineNumbers: 'on',
                        padding: { top: 16, bottom: 16 },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                      },
                    } as any)}
                  />
                </div>
              </TabsContent>

              {/* HTTP Tab */}
              <TabsContent
                value="http"
                className="flex-1 p-8 max-w-2xl mx-auto w-full mt-0 overflow-y-auto h-full"
              >
                <div className="space-y-6 pt-10">
                  <div className="space-y-2">
                    <Label>{t('documentDialog.labels.documentUrl')}</Label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Globe className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          value={httpUrl}
                          onChange={(e) => setHttpUrl(e.target.value)}
                          className="pl-9"
                          placeholder="https://example.com/article"
                        />
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t('documentDialog.hints.webPageExtract')}
                    </p>
                  </div>
                  <div className="p-4 border rounded-lg bg-background space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      <Label className="font-semibold">
                        {t('documentDialog.labels.aiOptions')}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="clean"
                        checked={cleanWithLLM}
                        onChange={(e) => setCleanWithLLM(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="clean" className="font-normal cursor-pointer">
                        {t('documentDialog.options.cleanWithLLM')}
                      </Label>
                    </div>
                  </div>

                  {uploadProgress && (
                    <div className="mt-4 p-4 bg-muted rounded-lg text-center">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      <p className="text-sm font-medium">
                        {t('documentDialog.processing.general', {
                          current: uploadProgress.current,
                          total: uploadProgress.total,
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>

              {/* GitHub Tab */}
              <TabsContent
                value="github"
                className="flex-1 p-8 max-w-2xl mx-auto w-full mt-0 overflow-y-auto h-full"
              >
                <div className="space-y-6 pt-4">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Repository URL</Label>
                      <Input
                        value={githubRepoUrl}
                        onChange={(e) => setGithubRepoUrl(e.target.value)}
                        placeholder="https://github.com/owner/repo"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Path (File/Dir)</Label>
                        <Input
                          value={githubPath}
                          onChange={(e) => setGithubPath(e.target.value)}
                          placeholder="docs/"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Branch</Label>
                        <Input
                          value={githubBranch}
                          onChange={(e) => setGithubBranch(e.target.value)}
                          placeholder="main"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Token (Optional)</Label>
                      <Input
                        type="password"
                        value={githubToken}
                        onChange={(e) => setGithubToken(e.target.value)}
                        placeholder="ghp_..."
                      />
                    </div>
                  </div>

                  <div className="p-4 border rounded-lg bg-background space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-purple-500" />
                      <Label className="font-semibold">AI 전처리 옵션</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="clean-git"
                        checked={cleanWithLLM}
                        onChange={(e) => setCleanWithLLM(e.target.checked)}
                        className="rounded border-gray-300"
                      />
                      <Label htmlFor="clean-git" className="font-normal cursor-pointer">
                        {t('documentDialog.options.cleanGitCode')}
                      </Label>
                    </div>
                  </div>

                  {uploadProgress && (
                    <div className="mt-4 p-4 bg-muted rounded-lg text-center">
                      <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                      <p className="text-sm font-medium">
                        {t('documentDialog.processing.general', {
                          current: uploadProgress.current,
                          total: uploadProgress.total,
                        })}
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            // Edit Mode - Always Manual/Editor
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 relative border-t min-h-0">
                <SingleFileEditor
                  {...({
                    content,
                    language: 'markdown',
                    theme: 'vs-dark',
                    onChange: (value: any) => setContent(value || ''),
                    options: {
                      minimap: { enabled: false },
                      fontSize: 14,
                      wordWrap: 'on',
                      lineNumbers: 'on',
                      padding: { top: 16, bottom: 16 },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    },
                  } as any)}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
