'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { FileText, Trash2, RefreshCw, Edit } from 'lucide-react';
import { getAllDocuments } from '@/lib/vectordb/client';
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

  const loadDocuments = async () => {
    setIsLoading(true);
    setMessage(null);

    try {
      const docs = await getAllDocuments();
      setDocuments(docs);
      console.log(`Loaded ${docs.length} documents`);
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
    if (!onDelete) return;
    if (!confirm('이 문서를 삭제하시겠습니까?')) return;

    try {
      await onDelete([id]);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <FileText className="h-5 w-5" />
          <h3>업로드된 문서</h3>
          <span className="text-sm font-normal text-muted-foreground">
            ({documents.length}개)
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={loadDocuments}
          disabled={isLoading || disabled}
        >
          <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

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
            const contentPreview = doc.content.slice(0, 150);
            const hasMore = doc.content.length > 150;

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
                    <div className={`text-sm text-muted-foreground ${isExpanded ? '' : 'line-clamp-3 min-h-[60px]'}`}>
                      {isExpanded ? doc.content : contentPreview}
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
