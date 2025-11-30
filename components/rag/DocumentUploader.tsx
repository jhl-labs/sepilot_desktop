'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Upload,
  FileText,
  Loader2,
  Globe,
  File,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface DocumentUploaderProps {
  onUpload: (documents: { content: string; metadata: Record<string, any> }[]) => Promise<void>;
  disabled?: boolean;
}

type InputMode = 'text' | 'url' | 'file';

export function DocumentUploader({ onUpload, disabled = false }: DocumentUploaderProps) {
  const [mode, setMode] = useState<InputMode>('text');
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [url, setUrl] = useState('');
  const [filePath, setFilePath] = useState('');
  const [useLLMRefinement, setUseLLMRefinement] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleFetchUrl = async () => {
    if (!url.trim()) {
      setMessage({ type: 'error', text: 'URL을 입력해주세요.' });
      return;
    }

    setIsFetching(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.file.fetchUrl(url.trim());

      if (!result.success || !result.data) {
        throw new Error(result.error || 'URL에서 콘텐츠를 가져오는데 실패했습니다.');
      }

      setContent(result.data.content);
      setTitle(result.data.title || '');
      setSource(url.trim());
      setMessage({ type: 'success', text: 'URL에서 콘텐츠를 가져왔습니다!' });
    } catch (error: any) {
      console.error('Fetch URL error:', error);
      setMessage({ type: 'error', text: error.message || 'URL 가져오기에 실패했습니다.' });
    } finally {
      setIsFetching(false);
    }
  };

  const handleSelectFile = async () => {
    setMessage(null);

    try {
      const result = await window.electronAPI.file.selectDocument();

      if (!result.success || !result.data) {
        throw new Error(result.error || '파일 선택에 실패했습니다.');
      }

      if (result.data.length === 0) {
        return; // 사용자가 취소함
      }

      const file = result.data[0];
      setContent(file.content);
      setTitle(file.title || file.filename);
      setSource(file.path);
      setFilePath(file.path);
      setMessage({ type: 'success', text: `${file.filename} 파일을 불러왔습니다!` });
    } catch (error: any) {
      console.error('Select file error:', error);
      setMessage({ type: 'error', text: error.message || '파일 선택에 실패했습니다.' });
    }
  };

  const handleRefineWithLLM = async () => {
    if (!content.trim()) {
      setMessage({ type: 'error', text: '정제할 문서 내용이 없습니다.' });
      return;
    }

    setIsFetching(true);
    setMessage(null);

    try {
      const result = await window.electronAPI.llm.chat([
        {
          id: 'system',
          role: 'system',
          content: `당신은 문서를 정제하고 핵심 내용을 추출하는 전문가입니다.
주어진 문서에서 중요한 정보만 추출하고, 불필요한 내용(광고, 네비게이션, 푸터 등)은 제거하세요.
결과는 깔끔한 마크다운 형식으로 작성하고, 구조화하여 반환하세요.`,
          created_at: Date.now(),
        },
        {
          id: 'user',
          role: 'user',
          content: `다음 문서를 정제해주세요:\n\n${content}`,
          created_at: Date.now(),
        },
      ]);

      if (!result.success || !result.data) {
        throw new Error(result.error || 'LLM 문서 정제에 실패했습니다.');
      }

      setContent(result.data.content);
      setMessage({ type: 'success', text: 'LLM으로 문서를 정제했습니다!' });
    } catch (error: any) {
      console.error('LLM refinement error:', error);
      setMessage({ type: 'error', text: error.message || 'LLM 정제에 실패했습니다.' });
    } finally {
      setIsFetching(false);
    }
  };

  const handleUpload = async () => {
    if (!content.trim()) {
      setMessage({ type: 'error', text: '문서 내용을 입력해주세요.' });
      return;
    }

    setIsUploading(true);
    setMessage(null);

    try {
      let finalContent = content.trim();

      // LLM 정제 옵션이 활성화되어 있고 아직 정제하지 않았다면
      if (useLLMRefinement) {
        const refineResult = await window.electronAPI.llm.chat([
          {
            id: 'system',
            role: 'system',
            content: `당신은 문서를 정제하고 핵심 내용을 추출하는 전문가입니다.
주어진 문서에서 중요한 정보만 추출하고, 불필요한 내용(광고, 네비게이션, 푸터 등)은 제거하세요.
결과는 깔끔한 마크다운 형식으로 작성하고, 구조화하여 반환하세요.`,
            created_at: Date.now(),
          },
          {
            id: 'user',
            role: 'user',
            content: `다음 문서를 정제해주세요:\n\n${finalContent}`,
            created_at: Date.now(),
          },
        ]);

        if (refineResult.success && refineResult.data) {
          finalContent = refineResult.data.content;
        }
      }

      await onUpload([
        {
          content: finalContent,
          metadata: {
            title: title.trim() || '제목 없음',
            source: source.trim() || (mode === 'text' ? 'manual' : mode),
            mode,
            uploadedAt: Date.now(),
            refined: useLLMRefinement,
          },
        },
      ]);

      setMessage({ type: 'success', text: '문서가 성공적으로 업로드되었습니다!' });

      // 입력 필드 초기화
      setContent('');
      setTitle('');
      setSource('');
      setUrl('');
      setFilePath('');
    } catch (error: any) {
      console.error('Upload error:', error);
      setMessage({ type: 'error', text: error.message || '문서 업로드에 실패했습니다.' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <FileText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">문서 업로드</h3>
          <p className="text-sm text-muted-foreground">RAG에 사용할 문서를 추가합니다</p>
        </div>
      </div>

      {/* Input Mode Tabs */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as InputMode)}>
        <TabsList className="grid w-full grid-cols-3 h-12">
          <TabsTrigger value="text" className="gap-2 h-10">
            <FileText className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">텍스트</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">직접 입력</div>
            </div>
          </TabsTrigger>
          <TabsTrigger value="url" className="gap-2 h-10">
            <Globe className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">URL</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">웹 페이지</div>
            </div>
          </TabsTrigger>
          <TabsTrigger value="file" className="gap-2 h-10">
            <File className="h-4 w-4" />
            <div className="text-left">
              <div className="font-medium">파일</div>
              <div className="text-[10px] text-muted-foreground hidden sm:block">문서 파일</div>
            </div>
          </TabsTrigger>
        </TabsList>

        {/* Text Input Tab */}
        <TabsContent value="text" className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="doc-title">제목 (선택)</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="문서 제목"
              disabled={isUploading || isFetching || disabled}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-source">출처 (선택)</Label>
            <Input
              id="doc-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="예: Wikipedia, 내부 문서"
              disabled={isUploading || isFetching || disabled}
              className="h-10"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-content">문서 내용</Label>
            <Textarea
              id="doc-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="업로드할 문서 내용을 입력하세요..."
              className="min-h-[200px] font-mono text-sm resize-none"
              disabled={isUploading || isFetching || disabled}
            />
          </div>
        </TabsContent>

        {/* URL Input Tab */}
        <TabsContent value="url" className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="doc-url">웹 페이지 URL</Label>
            <div className="flex gap-2">
              <Input
                id="doc-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/article"
                disabled={isUploading || isFetching || disabled}
                className="h-10"
              />
              <Button
                onClick={handleFetchUrl}
                disabled={isUploading || isFetching || disabled || !url.trim()}
                variant="secondary"
                className="shrink-0"
              >
                {isFetching ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </>
                ) : (
                  <>
                    <Globe className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              URL을 입력하고 버튼을 클릭하면 웹 페이지에서 콘텐츠를 가져옵니다
            </p>
          </div>

          {content && (
            <>
              <div className="space-y-2">
                <Label htmlFor="doc-title-url">제목</Label>
                <Input
                  id="doc-title-url"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="문서 제목"
                  disabled={isUploading || isFetching || disabled}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-content-url">가져온 내용</Label>
                <Textarea
                  id="doc-content-url"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[200px] font-mono text-sm resize-none"
                  disabled={isUploading || isFetching || disabled}
                />
              </div>
            </>
          )}
        </TabsContent>

        {/* File Input Tab */}
        <TabsContent value="file" className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label>문서 파일 선택</Label>
            <div className="flex gap-2">
              <Input
                value={filePath ? filePath.split('/').pop() || filePath : ''}
                placeholder="파일을 선택하세요"
                disabled
                className="h-10"
              />
              <Button
                onClick={handleSelectFile}
                disabled={isUploading || isFetching || disabled}
                variant="secondary"
                className="shrink-0"
              >
                <File className="mr-2 h-4 w-4" />
                선택
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">지원 형식: TXT, PDF, MD, DOCX</p>
          </div>

          {content && (
            <>
              <div className="space-y-2">
                <Label htmlFor="doc-title-file">제목</Label>
                <Input
                  id="doc-title-file"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="문서 제목"
                  disabled={isUploading || isFetching || disabled}
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="doc-content-file">파일 내용</Label>
                <Textarea
                  id="doc-content-file"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="min-h-[200px] font-mono text-sm resize-none"
                  disabled={isUploading || isFetching || disabled}
                />
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* LLM Refinement Option */}
      {content && (
        <div className="rounded-xl border-2 bg-card overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">LLM 문서 정제</span>
          </div>
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <Label htmlFor="llm-refine" className="text-sm font-medium">
                  업로드 전에 LLM으로 문서 정제하기
                </Label>
                <p className="text-[11px] text-muted-foreground mt-1">
                  LLM이 문서에서 핵심 내용만 추출하고 불필요한 내용(광고, 네비게이션 등)을
                  제거합니다
                </p>
              </div>
              <Switch
                id="llm-refine"
                checked={useLLMRefinement}
                onCheckedChange={setUseLLMRefinement}
                disabled={isUploading || isFetching || disabled}
              />
            </div>

            <Button
              onClick={handleRefineWithLLM}
              disabled={isUploading || isFetching || disabled || !content.trim()}
              variant="outline"
              className="w-full"
            >
              {isFetching ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  정제 중...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  지금 정제하기
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="rounded-xl bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20 p-4">
        <div className="flex gap-3">
          <FileText className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div className="space-y-2 text-sm">
            <p className="font-medium text-primary">RAG 문서 정보</p>
            <ul className="space-y-1.5 text-muted-foreground text-xs">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                문서는 자동으로 청킹되고 임베딩되어 Vector DB에 저장됩니다
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                RAG 모드에서 이 문서를 기반으로 답변을 생성합니다
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 mt-0.5 shrink-0" />
                LLM 정제는 선택사항이며, 원본 문서를 보존하려면 비활성화하세요
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-3 border ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="h-5 w-5 shrink-0" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Upload Button */}
      <Button
        onClick={handleUpload}
        disabled={isUploading || isFetching || disabled || !content.trim()}
        className="w-full h-12 text-base font-medium gap-2"
        size="lg"
      >
        {isUploading ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" />
            업로드 중...
          </>
        ) : (
          <>
            <Upload className="h-5 w-5" />
            문서 업로드
          </>
        )}
      </Button>
    </div>
  );
}
