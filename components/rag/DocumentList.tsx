'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, RefreshCw, Edit, Download, Upload } from 'lucide-react';
import { getAllDocuments, exportDocuments, importDocuments } from '@/lib/vectordb/client';
import { VectorDocument } from '@/lib/vectordb/types';

interface DocumentListProps {
  onDelete?: (ids: string[]) => Promise<void>;
  onEdit?: (doc: VectorDocument) => void;
  onRefresh?: (refreshFn: () => Promise<void>) => void;
  disabled?: boolean;
}

export function DocumentList({ onDelete, onEdit, onRefresh, disabled = false }: DocumentListProps) {
  const [documents, setDocuments] = useState<VectorDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocuments = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const docs = await getAllDocuments();

      // 청크된 문서들을 원본 문서 단위로 그룹화
      const groupedDocs = new Map<string, VectorDocument>();

      for (const doc of docs) {
        const originalId = doc.metadata?.originalId || doc.id;
        const chunkIndex = doc.metadata?.chunkIndex ?? 0;

        if (groupedDocs.has(originalId)) {
          // 기존 그룹에 청크 추가
          const existingDoc = groupedDocs.get(originalId)!;
          const chunks = existingDoc.metadata._chunks || [];
          chunks.push({ index: chunkIndex, content: doc.content });
          chunks.sort((a: any, b: any) => a.index - b.index);
          existingDoc.metadata._chunks = chunks;
        } else {
          // 새 그룹 생성
          groupedDocs.set(originalId, {
            ...doc,
            id: originalId,
            metadata: {
              ...doc.metadata,
              originalId,
              _chunks: [{ index: chunkIndex, content: doc.content }],
            },
          });
        }
      }

      // 청크들을 합쳐서 최종 문서 리스트 생성
      const mergedDocs = Array.from(groupedDocs.values()).map((doc) => {
        const chunks = doc.metadata._chunks || [];
        const mergedContent = chunks.map((c: any) => c.content).join('\n');
        return {
          ...doc,
          content: mergedContent,
        };
      });

      setDocuments(mergedDocs);
      console.log(`Loaded ${docs.length} chunks, grouped into ${mergedDocs.length} documents`);
    } catch (error: any) {
      console.error('Failed to load documents:', error);
      setMessage({ type: 'error', text: error.message || '문서 목록 로드 실패' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
    if (onRefresh) {
      onRefresh(loadDocuments);
    }
  }, []);

  const handleDelete = async (id: string) => {
    if (!onDelete) {
      return;
    }
    if (!window.confirm('이 문서를 삭제하시겠습니까?')) {
      return;
    }

    try {
      // 원본 문서 ID와 매칭되는 모든 청크 ID 찾기
      const allDocs = await getAllDocuments();
      const chunkIdsToDelete = allDocs
        .filter((doc) => {
          const originalId = doc.metadata?.originalId || doc.id;
          return originalId === id;
        })
        .map((doc) => doc.id);

      // 모든 청크 삭제
      await onDelete(chunkIdsToDelete.length > 0 ? chunkIdsToDelete : [id]);
      setMessage({ type: 'success', text: '문서가 삭제되었습니다.' });
      await loadDocuments(); // Reload list
    } catch (error: any) {
      console.error('Failed to delete document:', error);
      setMessage({ type: 'error', text: error.message || '문서 삭제 실패' });
    }
  };

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedDocs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedDocs(newExpanded);
  };

  const handleExport = async () => {
    try {
      setIsLoading(true);
      setMessage(null);

      const exportData = await exportDocuments();

      // JSON 파일 다운로드
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `vectordb-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setMessage({
        type: 'success',
        text: `${exportData.totalCount}개의 문서를 Export했습니다.`,
      });
    } catch (error: any) {
      console.error('Failed to export documents:', error);
      setMessage({ type: 'error', text: error.message || '문서 Export 실패' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      setIsLoading(true);
      setMessage(null);

      const text = await file.text();
      const exportData = JSON.parse(text);

      // Import 실행 (중복 시 overwrite)
      const result = await importDocuments(exportData, { overwrite: true });

      setMessage({
        type: 'success',
        text: `Import 완료: 신규 ${result.imported}개, 덮어쓰기 ${result.overwritten}개, 건너뛰기 ${result.skipped}개`,
      });

      // 문서 목록 새로고침
      await loadDocuments();
    } catch (error: any) {
      console.error('Failed to import documents:', error);
      setMessage({ type: 'error', text: error.message || '문서 Import 실패' });
    } finally {
      setIsLoading(false);
      // 파일 입력 초기화
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" />
          <h3>업로드된 문서</h3>
          <span className="text-sm font-normal text-muted-foreground">({documents.length}개)</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isLoading || disabled || documents.length === 0}
            title="문서 Export (JSON)"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportClick}
            disabled={isLoading || disabled}
            title="문서 Import (JSON)"
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadDocuments}
            disabled={isLoading || disabled}
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

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

      {/* Document List */}
      {documents.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          업로드된 문서가 없습니다.
        </div>
      ) : (
        <div className="space-y-2">
          {documents.map((doc) => {
            const isExpanded = expandedDocs.has(doc.id);
            const content = doc.content || '';
            const contentPreview = content.slice(0, 150);
            const hasMore = content.length > 150;

            return (
              <div
                key={doc.id}
                className="rounded-md border bg-card p-4 hover:bg-accent/50 transition-colors min-h-[180px]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <h4 className="font-medium text-sm truncate">
                        {doc.metadata?.title || '제목 없음'}
                      </h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">
                      출처: {doc.metadata?.source || 'manual'}
                      {doc.metadata?.cleaned && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          LLM 정제됨
                        </span>
                      )}
                      {' • '}
                      {doc.metadata?.uploadedAt
                        ? new Date(doc.metadata.uploadedAt).toLocaleString('ko-KR')
                        : '알 수 없음'}
                    </p>
                    <div
                      className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-3 min-h-[60px]'}`}
                    >
                      {isExpanded ? content : contentPreview}
                      {!isExpanded && hasMore && '...'}
                    </div>
                    {hasMore && (
                      <button
                        onClick={() => toggleExpand(doc.id)}
                        className="text-xs text-primary hover:underline mt-1"
                      >
                        {isExpanded ? '접기' : '더 보기'}
                      </button>
                    )}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit?.(doc)}
                      disabled={!onEdit || disabled}
                      title="편집"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(doc.id)}
                      disabled={!onDelete || disabled}
                      title="삭제"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
