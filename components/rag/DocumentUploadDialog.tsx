'use client';

import { useState, useEffect } from 'react';
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
import { Loader2, AlertCircle } from 'lucide-react';
import { DocumentSourceType } from '@/lib/documents/types';
import { ChunkStrategy } from '@/lib/vectordb/types';
import { fetchDocument } from '@/lib/documents/fetchers';
import { cleanDocumentsWithLLM } from '@/lib/documents/cleaner';
import { TeamDocsConfig } from '@/types';

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (
    documents: { content: string; metadata: Record<string, any> }[],
    chunkStrategy?: ChunkStrategy
  ) => Promise<void>;
}

export function DocumentUploadDialog({ open, onOpenChange, onUpload }: DocumentUploadDialogProps) {
  const [sourceType, setSourceType] = useState<DocumentSourceType>('manual');
  const [docGroup, setDocGroup] = useState<'personal' | 'team'>('personal');
  const [selectedTeamDocsId, setSelectedTeamDocsId] = useState<string>('');
  const [teamDocs, setTeamDocs] = useState<TeamDocsConfig[]>([]);
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [folderPath, setFolderPath] = useState('');

  // HTTP 문서용
  const [httpUrl, setHttpUrl] = useState('');

  // GitHub 문서용
  const [githubRepoUrl, setGithubRepoUrl] = useState('');
  const [githubPath, setGithubPath] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');

  const [cleanWithLLM, setCleanWithLLM] = useState(false);
  const [chunkStrategy, setChunkStrategy] = useState<ChunkStrategy>('sentence');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(
    null
  );
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Load Team Docs configs on mount
  useEffect(() => {
    const loadTeamDocs = async () => {
      try {
        if (typeof window !== 'undefined' && window.electronAPI?.config) {
          const result = await window.electronAPI.config.load();
          if (result.success && result.data?.teamDocs) {
            setTeamDocs(result.data.teamDocs);
            // Set first team docs as default if available
            if (result.data.teamDocs.length > 0) {
              setSelectedTeamDocsId(result.data.teamDocs[0].id);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load team docs:', error);
      }
    };

    if (open) {
      loadTeamDocs();
    }
  }, [open]);

  const handleUpload = async () => {
    setIsUploading(true);
    setMessage(null);

    try {
      // Team Docs 검증
      if (docGroup === 'team') {
        if (!selectedTeamDocsId) {
          setMessage({ type: 'error', text: 'Team Docs를 선택해주세요.' });
          setIsUploading(false);
          return;
        }

        const selectedTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
        if (!selectedTeam) {
          setMessage({ type: 'error', text: '선택한 Team Docs를 찾을 수 없습니다.' });
          setIsUploading(false);
          return;
        }
      }

      let documentsToUpload: { content: string; metadata: Record<string, any> }[] = [];

      // 기본 메타데이터 생성
      const getBaseMetadata = () => {
        const baseMetadata: Record<string, any> = {
          docGroup: docGroup,
          uploadedAt: Date.now(),
          folderPath: folderPath.trim() || undefined,
        };

        // Team Docs인 경우 추가 정보
        if (docGroup === 'team') {
          const selectedTeam = teamDocs.find((td) => td.id === selectedTeamDocsId);
          baseMetadata.teamDocsId = selectedTeamDocsId;
          baseMetadata.teamName = selectedTeam?.name;
          baseMetadata.source = `${selectedTeam?.owner}/${selectedTeam?.repo}`;
        }

        return baseMetadata;
      };

      if (sourceType === 'manual') {
        // 직접 작성
        if (!content.trim()) {
          setMessage({ type: 'error', text: '문서 내용을 입력해주세요.' });
          setIsUploading(false);
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
        // HTTP 문서
        if (!httpUrl.trim()) {
          setMessage({ type: 'error', text: 'URL을 입력해주세요.' });
          setIsUploading(false);
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

        // LLM으로 정제
        if (cleanWithLLM) {
          setMessage({ type: 'success', text: 'LLM으로 문서를 정제하는 중...' });
          processedDocs = await cleanDocumentsWithLLM(processedDocs, (current, total) => {
            setUploadProgress({ current, total });
          });
          setUploadProgress(null);
        }

        documentsToUpload = processedDocs;
      } else if (sourceType === 'github') {
        // GitHub 문서
        if (!githubRepoUrl.trim() || !githubPath.trim()) {
          setMessage({ type: 'error', text: 'Repository URL과 경로를 입력해주세요.' });
          setIsUploading(false);
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

        // LLM으로 정제
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

      // 입력 필드 초기화
      setDocGroup('personal');
      setSelectedTeamDocsId('');
      setContent('');
      setTitle('');
      setSource('');
      setFolderPath('');
      setHttpUrl('');
      setGithubRepoUrl('');
      setGithubPath('');
      setGithubBranch('main');
      setGithubToken('');
      setCleanWithLLM(false);
      setChunkStrategy('sentence');

      setTimeout(() => {
        onOpenChange(false);
        setMessage(null);
      }, 1500);
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage({ type: 'error', text: error.message || '문서 업로드에 실패했습니다.' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="!w-[90vw] !max-w-[1400px] h-[85vh] flex flex-col"
        onClose={() => onOpenChange(false)}
      >
        <DialogHeader>
          <DialogTitle>문서 업로드</DialogTitle>
          <DialogDescription>새 문서를 추가하여 RAG 검색에 활용하세요.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4 flex-1 overflow-y-auto">
          {/* Document Group */}
          <div className="space-y-2">
            <Label htmlFor="doc-group">문서 그룹</Label>
            <select
              id="doc-group"
              value={docGroup}
              onChange={(e) => {
                const newDocGroup = e.target.value as 'personal' | 'team';
                setDocGroup(newDocGroup);
                // Team으로 변경 시 첫 번째 Team Docs 선택
                if (newDocGroup === 'team' && teamDocs.length > 0) {
                  setSelectedTeamDocsId(teamDocs[0].id);
                }
              }}
              disabled={isUploading}
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

          {/* Team Docs 선택 (docGroup이 'team'일 때만 표시) */}
          {docGroup === 'team' && (
            <div className="space-y-2">
              <Label htmlFor="team-docs-select">Team Docs Repository</Label>
              {teamDocs.length > 0 ? (
                <>
                  <select
                    id="team-docs-select"
                    value={selectedTeamDocsId}
                    onChange={(e) => setSelectedTeamDocsId(e.target.value)}
                    disabled={isUploading}
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
                    <span>
                      설정된 Team Docs가 없습니다. 먼저 Team Docs Repository를 설정해주세요.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Document Source Type */}
          <div className="space-y-2">
            <Label htmlFor="source-type">문서 소스 타입</Label>
            <select
              id="source-type"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as DocumentSourceType)}
              disabled={isUploading}
              className="flex h-9 w-full rounded-md border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm"
            >
              <option value="manual">직접 작성</option>
              <option value="http">HTTP 문서</option>
              <option value="github">GitHub Repository</option>
            </select>
          </div>

          {/* Manual Type Fields */}
          {sourceType === 'manual' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="upload-title">제목 (선택)</Label>
                <Input
                  id="upload-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="문서 제목"
                  disabled={isUploading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="upload-source">출처 (선택)</Label>
                <Input
                  id="upload-source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="예: Wikipedia, 내부 문서"
                  disabled={isUploading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="upload-folder">폴더 경로 (선택)</Label>
                <Input
                  id="upload-folder"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="예: 프로젝트/백엔드/API"
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  슬래시(/)로 하위 폴더를 구분할 수 있습니다
                </p>
              </div>

              <div className="space-y-2 flex-1 flex flex-col">
                <Label htmlFor="upload-content">문서 내용</Label>
                <Textarea
                  id="upload-content"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="업로드할 문서 내용을 입력하세요..."
                  className="flex-1 min-h-[400px] font-mono text-sm resize-none"
                  disabled={isUploading}
                />
              </div>
            </>
          )}

          {/* HTTP Type Fields */}
          {sourceType === 'http' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="http-url">문서 URL</Label>
                <Input
                  id="http-url"
                  value={httpUrl}
                  onChange={(e) => setHttpUrl(e.target.value)}
                  placeholder="https://example.com/document.txt"
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  HTTP(S) URL을 통해 텍스트 문서를 가져옵니다.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="http-title">제목 (선택)</Label>
                <Input
                  id="http-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="문서 제목 (비워두면 URL에서 추출)"
                  disabled={isUploading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="http-folder">폴더 경로 (선택)</Label>
                <Input
                  id="http-folder"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="예: 프로젝트/백엔드/API"
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  슬래시(/)로 하위 폴더를 구분할 수 있습니다
                </p>
              </div>

              {/* LLM 정제 옵션 */}
              <div className="flex items-center space-x-2 p-3 rounded-md border bg-muted/50">
                <input
                  type="checkbox"
                  id="clean-with-llm-http"
                  checked={cleanWithLLM}
                  onChange={(e) => setCleanWithLLM(e.target.checked)}
                  disabled={isUploading}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div className="flex-1">
                  <Label htmlFor="clean-with-llm-http" className="cursor-pointer font-medium">
                    LLM으로 문서 정제
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    HTML 태그, 광고, 불필요한 텍스트를 제거하고 핵심 내용만 추출합니다
                  </p>
                </div>
              </div>
            </>
          )}

          {/* GitHub Type Fields */}
          {sourceType === 'github' && (
            <>
              <div className="space-y-2">
                <Label htmlFor="github-repo">Repository URL</Label>
                <Input
                  id="github-repo"
                  value={githubRepoUrl}
                  onChange={(e) => setGithubRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                  disabled={isUploading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="github-path">파일 또는 디렉토리 경로</Label>
                <Input
                  id="github-path"
                  value={githubPath}
                  onChange={(e) => setGithubPath(e.target.value)}
                  placeholder="docs/README.md 또는 docs/"
                  disabled={isUploading}
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
                    disabled={isUploading}
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
                    disabled={isUploading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="github-folder">폴더 경로 (선택)</Label>
                <Input
                  id="github-folder"
                  value={folderPath}
                  onChange={(e) => setFolderPath(e.target.value)}
                  placeholder="예: 프로젝트/백엔드/API"
                  disabled={isUploading}
                />
                <p className="text-xs text-muted-foreground">
                  슬래시(/)로 하위 폴더를 구분할 수 있습니다
                </p>
              </div>

              <div className="rounded-md bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-600 dark:text-blue-400">
                <p className="font-medium mb-2">GitHub 기능 안내:</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>
                    <strong>디렉토리 경로</strong>: 모든 하위 폴더를 재귀적으로 탐색하여 .md, .txt,
                    .json, .yaml 파일 수집
                  </li>
                  <li>
                    <strong>단일 파일</strong>: 확장자가 있는 경로는 해당 파일만 가져옴
                  </li>
                  <li>
                    <strong>Private Repository</strong>: Personal Access Token 필요
                    <br />
                    <span className="ml-4 text-muted-foreground">
                      Settings → Developer settings → Personal access tokens → Tokens (classic) →
                      Generate new token
                    </span>
                    <br />
                    <span className="ml-4 text-muted-foreground">
                      권한: <code className="text-xs bg-black/10 px-1 rounded">repo</code> 또는{' '}
                      <code className="text-xs bg-black/10 px-1 rounded">public_repo</code> 체크
                    </span>
                  </li>
                </ul>
              </div>

              {/* LLM 정제 옵션 */}
              <div className="flex items-center space-x-2 p-3 rounded-md border bg-muted/50">
                <input
                  type="checkbox"
                  id="clean-with-llm-github"
                  checked={cleanWithLLM}
                  onChange={(e) => setCleanWithLLM(e.target.checked)}
                  disabled={isUploading}
                  className="w-4 h-4 rounded border-gray-300"
                />
                <div className="flex-1">
                  <Label htmlFor="clean-with-llm-github" className="cursor-pointer font-medium">
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
          <div className="space-y-2">
            <Label htmlFor="chunk-strategy">청킹 전략</Label>
            <select
              id="chunk-strategy"
              value={chunkStrategy}
              onChange={(e) => setChunkStrategy(e.target.value as ChunkStrategy)}
              disabled={isUploading}
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

          {/* Info */}
          <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
            <p>• 문서는 자동으로 청킹되고 임베딩되어 Vector DB에 저장됩니다.</p>
            <p>• RAG 채팅 모드에서 이 문서를 기반으로 답변을 생성합니다.</p>
          </div>

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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isUploading}>
            취소
          </Button>
          <Button onClick={handleUpload} disabled={isUploading}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                업로드 중...
              </>
            ) : (
              '업로드'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
