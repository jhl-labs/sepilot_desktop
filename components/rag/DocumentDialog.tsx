'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type monaco from 'monaco-editor';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { VectorDocument } from '@/lib/vectordb/types';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { DocumentSourceType } from '@/lib/documents/types';
import { ChunkStrategy } from '@/lib/vectordb/types';
import { fetchDocument } from '@/lib/documents/fetchers';
import { cleanDocumentsWithLLM } from '@/lib/documents/cleaner';
import { TeamDocsConfig } from '@/types';

// Load Monaco Editor component without SSR
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  ),
});

type AIAction =
  | 'refine'
  | 'translate-ko'
  | 'translate-en'
  | 'translate-ja'
  | 'expand'
  | 'shorten'
  | 'improve'
  | 'verify'
  | 'custom';

interface DocumentDialogProps {
  mode: 'create' | 'edit';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Edit mode props
  document?: VectorDocument | null;
  onSave?: (doc: { id: string; content: string; metadata: Record<string, any> }) => Promise<void>;
  // Create mode props
  onUpload?: (
    documents: { content: string; metadata: Record<string, any> }[],
    chunkStrategy?: ChunkStrategy
  ) => Promise<void>;
}

export function DocumentDialog({
  mode,
  open,
  onOpenChange,
  document,
  onSave,
  onUpload,
}: DocumentDialogProps) {
  // Common states
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editor, setEditor] = useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [processingAction, setProcessingAction] = useState<string>('');

  // AI custom prompt states
  const [customPromptOpen, setCustomPromptOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');

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

  // Load Team Docs configs on mount (for create mode)
  useEffect(() => {
    const loadTeamDocs = async () => {
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.config) {
          const result = await window.electronAPI.config.load();
          if (result.success && result.data?.teamDocs) {
            setTeamDocs(result.data.teamDocs);
            if (result.data.teamDocs.length > 0) {
              setSelectedTeamDocsId(result.data.teamDocs[0].id);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load team docs:', error);
      }
    };

    if (open && mode === 'create') {
      loadTeamDocs();
    }
  }, [open, mode]);

  // Initialize edit mode data
  useEffect(() => {
    if (mode === 'edit' && document) {
      setTitle(document.metadata?.title || '');
      setSource(document.metadata?.source || '');
      setFolderPath(document.metadata?.folderPath || '');
      setContent(document.content || '');
    }
  }, [mode, document]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (!open) {
      // Reset all states
      setTitle('');
      setSource('');
      setFolderPath('');
      setContent('');
      setMessage(null);
      setCustomPrompt('');
      setCustomPromptOpen(false);
      if (mode === 'create') {
        setSourceType('manual');
        setDocGroup('personal');
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
    }
  }, [open, mode]);

  const getAIPrompt = (action: AIAction, text: string, customPromptText?: string): string => {
    const prompts: Record<AIAction, string> = {
      refine: `다음 텍스트를 정제하여 핵심 내용만 추출하고, 불필요한 내용은 제거하세요. 마크다운 형식으로 깔끔하게 작성하세요:\n\n${text}`,
      'translate-ko': `다음 텍스트를 한국어로 자연스럽게 번역하세요:\n\n${text}`,
      'translate-en': `다음 텍스트를 영어로 자연스럽게 번역하세요:\n\n${text}`,
      'translate-ja': `다음 텍스트를 일본어로 자연스럽게 번역하세요:\n\n${text}`,
      expand: `다음 텍스트의 내용을 더 자세하고 풍부하게 확장하세요. 추가 설명과 예시를 포함하세요:\n\n${text}`,
      shorten: `다음 텍스트를 핵심 내용만 남기고 간결하게 요약하세요:\n\n${text}`,
      improve: `다음 텍스트의 가독성과 품질을 개선하세요. 문법, 표현, 구조를 개선하고 더 명확하게 작성하세요:\n\n${text}`,
      verify: `다음 텍스트의 내용을 검증하고, 사실 관계가 틀리거나 논리적으로 모순되는 부분이 있는지 분석하세요. 문제가 있다면 지적하고, 없다면 "검증 완료: 문제 없음"이라고 답변하세요:\n\n${text}`,
      custom: customPromptText ? `${customPromptText}\n\n텍스트:\n${text}` : text,
    };
    return prompts[action];
  };

  const getActionLabel = (action: AIAction): string => {
    const labels: Record<AIAction, string> = {
      refine: '정제',
      'translate-ko': '한국어로 번역',
      'translate-en': '영어로 번역',
      'translate-ja': '일본어로 번역',
      expand: '내용 확장',
      shorten: '내용 축소',
      improve: '품질 개선',
      verify: '내용 검증',
      custom: '커스텀 프롬프트',
    };
    return labels[action];
  };

  const executeAIAction = useCallback(
    async (action: AIAction, customPromptText?: string) => {
      if (!editor) {
        setMessage({ type: 'error', text: 'Editor가 준비되지 않았습니다.' });
        return;
      }

      const model = editor.getModel();
      const selection = editor.getSelection();

      if (!model) {
        setMessage({ type: 'error', text: 'Editor model이 없습니다.' });
        return;
      }

      const targetText =
        selection && !selection.isEmpty() ? model.getValueInRange(selection) : model.getValue();

      if (!targetText.trim()) {
        setMessage({ type: 'error', text: '처리할 텍스트가 없습니다.' });
        return;
      }

      setIsProcessing(true);
      setProcessingAction(getActionLabel(action));
      setMessage(null);

      try {
        const result = await window.electronAPI.llm.chat([
          {
            id: 'system',
            role: 'system',
            content: '당신은 문서 편집과 개선을 돕는 전문 AI 어시스턴트입니다.',
            created_at: Date.now(),
          },
          {
            id: 'user',
            role: 'user',
            content: getAIPrompt(action, targetText, customPromptText),
            created_at: Date.now(),
          },
        ]);

        if (!result.success || !result.data) {
          throw new Error(result.error || 'AI 작업에 실패했습니다.');
        }

        const processedText = result.data.content;

        if (selection && !selection.isEmpty()) {
          editor.executeEdits('ai-action', [
            {
              range: selection,
              text: processedText,
              forceMoveMarkers: true,
            },
          ]);
        } else {
          const fullRange = model.getFullModelRange();
          editor.executeEdits('ai-action', [
            {
              range: fullRange,
              text: processedText,
              forceMoveMarkers: true,
            },
          ]);
        }

        setMessage({
          type: 'success',
          text: `${getActionLabel(action)} 작업이 완료되었습니다!`,
        });
      } catch (error: any) {
        console.error('AI action error:', error);
        setMessage({ type: 'error', text: error.message || 'AI 작업에 실패했습니다.' });
      } finally {
        setIsProcessing(false);
        setProcessingAction('');
      }
    },
    [editor]
  );

  // Register Monaco context menu actions
  useEffect(() => {
    if (!editor) {
      return;
    }

    const actions = [
      editor.addAction({
        id: 'doc-refine',
        label: 'AI: 내용 정제',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 1,
        run: () => executeAIAction('refine'),
      }),
      editor.addAction({
        id: 'doc-expand',
        label: 'AI: 내용 확장',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 2,
        run: () => executeAIAction('expand'),
      }),
      editor.addAction({
        id: 'doc-shorten',
        label: 'AI: 내용 축약',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 3,
        run: () => executeAIAction('shorten'),
      }),
      editor.addAction({
        id: 'doc-verify',
        label: 'AI: 내용 검증',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 4,
        run: () => executeAIAction('verify'),
      }),
      editor.addAction({
        id: 'doc-improve',
        label: 'AI: 품질 개선',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 5,
        run: () => executeAIAction('improve'),
      }),
      editor.addAction({
        id: 'doc-translate-ko',
        label: 'AI: 한국어로 번역',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 6,
        run: () => executeAIAction('translate-ko'),
      }),
      editor.addAction({
        id: 'doc-translate-en',
        label: 'AI: 영어로 번역',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 7,
        run: () => executeAIAction('translate-en'),
      }),
      editor.addAction({
        id: 'doc-translate-ja',
        label: 'AI: 일본어로 번역',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 8,
        run: () => executeAIAction('translate-ja'),
      }),
      editor.addAction({
        id: 'doc-custom',
        label: 'AI: 커스텀 프롬프트',
        contextMenuGroupId: 'ai-docs',
        contextMenuOrder: 9,
        run: () => setCustomPromptOpen(true),
      }),
    ];

    return () => {
      actions.forEach((action) => action.dispose());
    };
  }, [editor, executeAIAction]);

  const handleEdit = async (pushToGitHub: boolean = false) => {
    if (!content.trim()) {
      setMessage({ type: 'error', text: '문서 내용을 입력해주세요.' });
      return;
    }

    if (!document || !onSave) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      const updatedMetadata: Record<string, any> = {
        ...document.metadata,
        title: title.trim() || '제목 없음',
        source: source.trim() || 'manual',
        folderPath: folderPath.trim() || undefined,
        updatedAt: Date.now(),
      };

      if (document.metadata?.docGroup === 'team' && !pushToGitHub) {
        updatedMetadata.modifiedLocally = true;
      }

      await onSave({
        id: document.id,
        content: content.trim(),
        metadata: updatedMetadata,
      });

      if (pushToGitHub && document.metadata?.docGroup === 'team') {
        if (!document.metadata.teamDocsId) {
          setMessage({
            type: 'error',
            text: 'Team Docs ID가 누락되었습니다. 이 문서는 Team Docs 동기화 대상이 아닙니다.',
          });
          return;
        }

        setIsPushing(true);

        try {
          const newTitle = title.trim() || '제목 없음';
          const newFolderPath = folderPath.trim();
          let githubPath = document.metadata.githubPath;

          const oldTitle = document.metadata.title;
          const oldFolderPath = document.metadata.folderPath;
          if (newTitle !== oldTitle || newFolderPath !== oldFolderPath) {
            githubPath = newFolderPath ? `${newFolderPath}/${newTitle}.md` : `${newTitle}.md`;
          }

          const result = await window.electronAPI.teamDocs.pushDocument({
            teamDocsId: document.metadata.teamDocsId,
            githubPath: githubPath,
            oldGithubPath: document.metadata.githubPath,
            title: newTitle,
            content: content.trim(),
            metadata: {
              folderPath: newFolderPath || undefined,
              source: source.trim() || 'manual',
            },
            sha: document.metadata.githubSha,
            commitMessage: `Update ${newTitle} from SEPilot`,
          });

          if (!result.success) {
            if (result.error === 'CONFLICT') {
              setMessage({
                type: 'error',
                text: '문서 충돌 감지! GitHub에 다른 사용자의 변경사항이 있습니다. 먼저 동기화(Pull)해주세요.',
              });
            } else {
              throw new Error(result.error || 'Push 실패');
            }
            return;
          }

          setMessage({ type: 'success', text: '문서가 GitHub에 성공적으로 업로드되었습니다!' });
        } catch (error: any) {
          console.error('Push error:', error);
          setMessage({ type: 'error', text: error.message || 'GitHub Push에 실패했습니다.' });
          return;
        } finally {
          setIsPushing(false);
        }
      } else {
        setMessage({ type: 'success', text: '문서가 성공적으로 수정되었습니다!' });
      }

      setTimeout(() => {
        onOpenChange(false);
      }, 1000);
    } catch (error: any) {
      console.error('Edit error:', error);
      setMessage({ type: 'error', text: error.message || '문서 수정에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!onUpload) {
      return;
    }

    setIsSaving(true);
    setMessage(null);

    try {
      if (docGroup === 'team') {
        if (!selectedTeamDocsId) {
          setMessage({ type: 'error', text: 'Team Docs를 선택해주세요.' });
          setIsSaving(false);
          return;
        }

        const selectedTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
        if (!selectedTeam) {
          setMessage({ type: 'error', text: '선택한 Team Docs를 찾을 수 없습니다.' });
          setIsSaving(false);
          return;
        }
      }

      let documentsToUpload: { content: string; metadata: Record<string, any> }[] = [];

      const getBaseMetadata = () => {
        const baseMetadata: Record<string, any> = {
          docGroup: docGroup,
          uploadedAt: Date.now(),
          folderPath: folderPath.trim() || undefined,
        };

        if (docGroup === 'team') {
          const selectedTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
          baseMetadata.teamDocsId = selectedTeamDocsId;
          baseMetadata.teamName = selectedTeam?.name;
          baseMetadata.source = `${selectedTeam?.owner}/${selectedTeam?.repo}`;
        }

        return baseMetadata;
      };

      if (sourceType === 'manual') {
        if (!content.trim()) {
          setMessage({ type: 'error', text: '문서 내용을 입력해주세요.' });
          setIsSaving(false);
          return;
        }

        documentsToUpload = [
          {
            content: content.trim(),
            metadata: {
              ...getBaseMetadata(),
              title: title.trim() || '제목 없음',
              source: source.trim() || getBaseMetadata().source || 'manual',
            },
          },
        ];
      } else if (sourceType === 'http') {
        if (!httpUrl.trim()) {
          setMessage({ type: 'error', text: 'URL을 입력해주세요.' });
          setIsSaving(false);
          return;
        }

        const fetchedDocs = await fetchDocument({
          type: 'http',
          url: httpUrl.trim(),
        });

        let processedDocs: { content: string; metadata: Record<string, any> }[] = fetchedDocs.map(
          (doc) => ({
            content: doc.content,
            metadata: {
              ...doc.metadata,
              ...getBaseMetadata(),
              title: title.trim() || doc.metadata.title || 'Untitled',
            },
          })
        );

        if (cleanWithLLM) {
          setMessage({ type: 'success', text: 'LLM으로 문서를 정제하는 중...' });
          processedDocs = await cleanDocumentsWithLLM(processedDocs, (current, total) => {
            setUploadProgress({ current, total });
          });
          setUploadProgress(null);
        }

        documentsToUpload = processedDocs;
      } else if (sourceType === 'github') {
        if (!githubRepoUrl.trim() || !githubPath.trim()) {
          setMessage({ type: 'error', text: 'Repository URL과 경로를 입력해주세요.' });
          setIsSaving(false);
          return;
        }

        const fetchedDocs = await fetchDocument({
          type: 'github',
          repoUrl: githubRepoUrl.trim(),
          path: githubPath.trim(),
          branch: githubBranch.trim() || 'main',
          token: githubToken.trim() || undefined,
        });

        let processedDocs: { content: string; metadata: Record<string, any> }[] = fetchedDocs.map(
          (doc) => ({
            content: doc.content,
            metadata: {
              ...doc.metadata,
              ...getBaseMetadata(),
              title: doc.metadata.title || 'Untitled',
            },
          })
        );

        if (cleanWithLLM) {
          setMessage({ type: 'success', text: 'LLM으로 문서를 정제하는 중...' });
          processedDocs = await cleanDocumentsWithLLM(processedDocs, (current, total) => {
            setUploadProgress({ current, total });
          });
          setUploadProgress(null);
        }

        documentsToUpload = processedDocs;
      }

      await onUpload(documentsToUpload, chunkStrategy);

      const docCount = documentsToUpload.length;
      setMessage({
        type: 'success',
        text: `${docCount}개의 문서가 성공적으로 업로드되었습니다!`,
      });

      setTimeout(() => {
        onOpenChange(false);
      }, 1500);
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage({ type: 'error', text: error.message || '문서 업로드에 실패했습니다.' });
    } finally {
      setIsSaving(false);
    }
  };

  const renderCreateModeFields = () => (
    <>
      {/* Document Group */}
      <div className="space-y-2">
        <Label htmlFor="doc-group">문서 그룹</Label>
        <select
          id="doc-group"
          value={docGroup}
          onChange={(e) => {
            const newDocGroup = e.target.value as 'personal' | 'team';
            setDocGroup(newDocGroup);
            if (newDocGroup === 'team' && teamDocs.length > 0) {
              setSelectedTeamDocsId(teamDocs[0].id);
            }
          }}
          disabled={isSaving}
          className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
        >
          <option value="personal">Personal Docs (개인 문서)</option>
          <option value="team">Team Docs (팀 공유 문서)</option>
        </select>
        <p className="text-xs text-muted-foreground">
          {docGroup === 'personal'
            ? '개인 문서: 본인만 사용하는 문서입니다.'
            : 'Team Docs: 팀 전체가 공유하는 문서입니다.'}
        </p>
      </div>

      {/* Team Docs Selection */}
      {docGroup === 'team' && (
        <div className="space-y-2">
          <Label htmlFor="team-docs-select">Team Docs Repository</Label>
          {teamDocs.length > 0 ? (
            <>
              <select
                id="team-docs-select"
                value={selectedTeamDocsId}
                onChange={(e) => setSelectedTeamDocsId(e.target.value)}
                disabled={isSaving}
                className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
              >
                {teamDocs.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} ({team.owner}/{team.repo})
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                이 문서가 속할 Team Docs Repository를 선택하세요.
              </p>
            </>
          ) : (
            <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>설정된 Team Docs가 없습니다. 먼저 Team Docs Repository를 설정해주세요.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Source Type */}
      <div className="space-y-2">
        <Label htmlFor="source-type">문서 소스 타입</Label>
        <select
          id="source-type"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as DocumentSourceType)}
          disabled={isSaving}
          className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
        >
          <option value="manual">직접 작성</option>
          <option value="http">HTTP 문서</option>
          <option value="github">GitHub Repository</option>
        </select>
      </div>

      {/* HTTP Fields */}
      {sourceType === 'http' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="http-url">문서 URL</Label>
            <Input
              id="http-url"
              value={httpUrl}
              onChange={(e) => setHttpUrl(e.target.value)}
              placeholder="https://example.com/document.txt"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              HTTP(S) URL을 통해 텍스트 문서를 가져옵니다.
            </p>
          </div>
          <div className="flex items-center space-x-2 p-3 rounded-md border bg-muted/50">
            <input
              type="checkbox"
              id="clean-with-llm"
              checked={cleanWithLLM}
              onChange={(e) => setCleanWithLLM(e.target.checked)}
              disabled={isSaving}
              className="w-4 h-4 rounded border-gray-300"
            />
            <div className="flex-1">
              <Label htmlFor="clean-with-llm" className="cursor-pointer font-medium">
                LLM으로 문서 정제
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                HTML 태그, 광고, 불필요한 텍스트를 제거하고 핵심 내용만 추출합니다
              </p>
            </div>
          </div>
        </>
      )}

      {/* GitHub Fields */}
      {sourceType === 'github' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="github-repo">Repository URL</Label>
            <Input
              id="github-repo"
              value={githubRepoUrl}
              onChange={(e) => setGithubRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              disabled={isSaving}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="github-path">파일 또는 디렉토리 경로</Label>
            <Input
              id="github-path"
              value={githubPath}
              onChange={(e) => setGithubPath(e.target.value)}
              placeholder="docs/README.md 또는 docs/"
              disabled={isSaving}
            />
            <p className="text-xs text-muted-foreground">
              파일 경로 또는 디렉토리 경로 (디렉토리인 경우 모든 .md, .txt 파일 가져옴)
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="github-branch">브랜치</Label>
              <Input
                id="github-branch"
                value={githubBranch}
                onChange={(e) => setGithubBranch(e.target.value)}
                placeholder="main"
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-token">GitHub Token (선택)</Label>
              <Input
                id="github-token"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="ghp_..."
                disabled={isSaving}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 p-3 rounded-md border bg-muted/50">
            <input
              type="checkbox"
              id="clean-with-llm"
              checked={cleanWithLLM}
              onChange={(e) => setCleanWithLLM(e.target.checked)}
              disabled={isSaving}
              className="w-4 h-4 rounded border-gray-300"
            />
            <div className="flex-1">
              <Label htmlFor="clean-with-llm" className="cursor-pointer font-medium">
                LLM으로 문서 정제
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                마크다운 외 불필요한 코드/주석 제거, 핵심 문서 내용만 추출합니다
              </p>
            </div>
          </div>
        </>
      )}

      {/* Chunking Strategy */}
      {sourceType !== 'manual' && (
        <div className="space-y-2">
          <Label htmlFor="chunk-strategy">청킹 전략</Label>
          <select
            id="chunk-strategy"
            value={chunkStrategy}
            onChange={(e) => setChunkStrategy(e.target.value as ChunkStrategy)}
            disabled={isSaving}
            className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
          >
            <option value="sentence">문장 기반 (권장) - 문장 경계 보존</option>
            <option value="structure">구조 기반 - Markdown/코드 블록 보존</option>
            <option value="character">문자 기반 - 단순 분할 (빠름)</option>
            <option value="token">토큰 기반 - LLM 토큰 단위 (향후 지원)</option>
          </select>
          <p className="text-xs text-muted-foreground">
            {chunkStrategy === 'sentence' &&
              '문장 단위로 청킹하여 컨텍스트를 보존합니다. 대부분의 경우 권장됩니다.'}
            {chunkStrategy === 'structure' &&
              'Markdown 헤딩, 코드 블록 등 구조를 유지합니다. 기술 문서에 적합합니다.'}
            {chunkStrategy === 'character' &&
              '단순히 문자 수로 분할합니다. 빠르지만 문맥이 손실될 수 있습니다.'}
            {chunkStrategy === 'token' &&
              'LLM 토큰 단위로 청킹합니다. (현재 sentence 방식으로 폴백됩니다)'}
          </p>
        </div>
      )}
    </>
  );

  const renderCommonFields = () => (
    <>
      {/* Title */}
      <div className="space-y-2">
        <Label htmlFor="title">제목{mode === 'create' && ' (선택)'}</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="문서 제목"
          disabled={isSaving}
        />
      </div>

      {/* Source (only for manual or edit) */}
      {(mode === 'edit' || sourceType === 'manual') && (
        <div className="space-y-2">
          <Label htmlFor="source">출처 (선택)</Label>
          <Input
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="예: Wikipedia, 내부 문서"
            disabled={isSaving}
          />
        </div>
      )}

      {/* Folder Path */}
      <div className="space-y-2">
        <Label htmlFor="folder-path">폴더 경로 (선택)</Label>
        <Input
          id="folder-path"
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          placeholder="예: 프로젝트/백엔드/API"
          disabled={isSaving}
        />
        <p className="text-xs text-muted-foreground">슬래시(/)로 하위 폴더를 구분할 수 있습니다</p>
      </div>
    </>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!w-[90vw] !max-w-[1400px] h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{mode === 'create' ? '문서 업로드' : '문서 편집'}</DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? '새 문서를 추가하여 RAG 검색에 활용하세요.'
                : '문서의 내용과 메타데이터를 수정합니다.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Scrollable form fields */}
            <div className="space-y-4 overflow-y-auto px-1">
              {mode === 'create' && renderCreateModeFields()}
              {(mode === 'edit' || sourceType === 'manual') && renderCommonFields()}
            </div>

            {/* Monaco Editor - takes remaining space */}
            {(mode === 'edit' || sourceType === 'manual') && (
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                  <Label>문서 내용</Label>
                  {isProcessing && processingAction && (
                    <div className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="font-medium">{processingAction} 중...</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 border rounded-md overflow-hidden">
                  <MonacoEditor
                    height="100%"
                    language="markdown"
                    value={content}
                    onChange={(value) => setContent(value || '')}
                    onMount={(editorInstance) => {
                      setEditor(editorInstance);
                      if (!(window as any).monaco) {
                        (window as any).monaco = (window as any).monaco || {};
                      }
                    }}
                    theme="vs-dark"
                    options={{
                      fontSize: 14,
                      fontFamily: 'monospace',
                      minimap: { enabled: false },
                      scrollBeyondLastLine: false,
                      wordWrap: 'on',
                      automaticLayout: true,
                      lineNumbers: 'on',
                      readOnly: isSaving || isProcessing,
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  텍스트를 선택하고 우클릭하여 AI 작업 실행 (선택 없이 우클릭하면 전체 문서에 적용)
                </p>
              </div>
            )}

            {/* Progress */}
            {uploadProgress && (
              <div className="rounded-md bg-blue-500/10 border border-blue-500/20 px-3 py-2 text-sm text-blue-600 dark:text-blue-400">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    문서 정제 중... ({uploadProgress.current} / {uploadProgress.total})
                  </span>
                </div>
              </div>
            )}

            {/* Message */}
            {message && (
              <div
                className={`rounded-md px-3 py-2 text-sm ${
                  message.type === 'success'
                    ? 'bg-green-500/10 text-green-500'
                    : 'bg-destructive/10 text-destructive'
                }`}
              >
                {message.text}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving || isProcessing || isPushing}
            >
              취소
            </Button>

            {mode === 'edit' && document?.metadata?.docGroup === 'team' ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => handleEdit(false)}
                  disabled={isSaving || isProcessing || isPushing}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      저장 중...
                    </>
                  ) : (
                    '로컬 저장'
                  )}
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-block">
                        <Button
                          onClick={() => handleEdit(true)}
                          disabled={
                            isSaving || isProcessing || isPushing || !document?.metadata?.teamDocsId
                          }
                        >
                          {isPushing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Push 중...
                            </>
                          ) : isSaving ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              저장 중...
                            </>
                          ) : (
                            <>
                              {!document?.metadata?.teamDocsId && (
                                <AlertCircle className="mr-2 h-4 w-4" />
                              )}
                              저장 & Push
                            </>
                          )}
                        </Button>
                      </div>
                    </TooltipTrigger>
                    {!document?.metadata?.teamDocsId && (
                      <TooltipContent>
                        <p>Team Docs ID가 없어 GitHub Push를 할 수 없습니다.</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          이 문서는 Team Docs에서 가져온 문서가 아닙니다.
                        </p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </>
            ) : (
              <Button
                onClick={mode === 'edit' ? () => handleEdit(false) : handleCreate}
                disabled={
                  isSaving ||
                  isProcessing ||
                  (mode === 'create' && docGroup === 'team' && teamDocs.length === 0)
                }
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {mode === 'create' ? '업로드 중...' : '저장 중...'}
                  </>
                ) : isProcessing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    AI 작업 중...
                  </>
                ) : mode === 'create' ? (
                  '업로드'
                ) : (
                  '저장'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Custom Prompt Dialog */}
      <Dialog open={customPromptOpen} onOpenChange={setCustomPromptOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>커스텀 프롬프트 입력</DialogTitle>
            <DialogDescription>
              텍스트에 적용할 작업을 자유롭게 입력하세요. 선택된 텍스트 또는 전체 문서에 적용됩니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="custom-prompt">프롬프트</Label>
              <Textarea
                id="custom-prompt"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="예: 이 텍스트를 bullet point 형식으로 재구성해주세요"
                className="min-h-[150px] resize-none"
              />
            </div>
            {editor && editor.getSelection() && !editor.getSelection()!.isEmpty() && (
              <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-sm text-blue-600 dark:text-blue-400">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {editor.getModel()?.getValueInRange(editor.getSelection()!).length || 0}자의
                    선택된 텍스트에 적용됩니다
                  </span>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCustomPromptOpen(false);
                setCustomPrompt('');
              }}
            >
              취소
            </Button>
            <Button
              onClick={async () => {
                if (!customPrompt.trim()) {
                  setMessage({ type: 'error', text: '프롬프트를 입력해주세요.' });
                  return;
                }
                setCustomPromptOpen(false);
                await executeAIAction('custom', customPrompt.trim());
                setCustomPrompt('');
              }}
              disabled={!customPrompt.trim()}
            >
              실행
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
