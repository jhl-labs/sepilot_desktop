'use client';

import { useState, useEffect } from 'react';
import { DocumentList } from '@/components/rag/DocumentList';
import { DocumentUploadDialog } from '@/components/rag/DocumentUploadDialog';
import { DocumentEditDialog } from '@/components/rag/DocumentEditDialog';
import { VectorDBConfig, EmbeddingConfig, VectorDocument } from '@/lib/vectordb/types';
import { getVectorDB, getEmbeddingProvider } from '@/lib/vectordb';
import { generateId } from '@/lib/utils';
import { indexDocuments } from '@/lib/vectordb/indexing';
import { isElectron } from '@/lib/platform';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';

interface DocumentsPageProps {
  onBack?: () => void;
}

export function DocumentsPage({ onBack }: DocumentsPageProps) {
  const [vectorDBConfig, setVectorDBConfig] = useState<VectorDBConfig | null>(null);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<VectorDocument | null>(null);
  const [refreshDocuments, setRefreshDocuments] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    // VectorDB 설정 로드
    const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
    if (savedVectorDBConfig) {
      setVectorDBConfig(JSON.parse(savedVectorDBConfig));
    }

    // Embedding 설정 로드
    const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');
    if (savedEmbeddingConfig) {
      setEmbeddingConfig(JSON.parse(savedEmbeddingConfig));
    }
  }, []);

  const isConfigured = vectorDBConfig && embeddingConfig;
  const isDisabled = !isElectron() && vectorDBConfig?.type === 'sqlite-vec';

  const handleDocumentUpload = async (
    documents: { content: string; metadata: Record<string, any> }[]
  ) => {
    try {
      // 브라우저 환경에서 SQLite-vec 사용 시 경고
      if (!isElectron() && vectorDBConfig?.type === 'sqlite-vec') {
        throw new Error('SQLite-vec는 Electron 환경에서만 사용 가능합니다. 웹 브라우저에서는 문서를 업로드할 수 없습니다.');
      }

      // Embedding이 초기화되었는지 확인
      let embedder;
      try {
        embedder = getEmbeddingProvider();
      } catch (error) {
        throw new Error('Embedding이 초기화되지 않았습니다. 먼저 설정에서 Embedding 설정을 완료해주세요.');
      }

      // VectorDB가 초기화되었는지 확인
      let vectorDB;
      try {
        vectorDB = getVectorDB();
      } catch (error) {
        throw new Error('VectorDB가 초기화되지 않았습니다. 먼저 설정에서 VectorDB 설정을 완료해주세요.');
      }

      if (!vectorDB || !embedder) {
        throw new Error('VectorDB 또는 Embedding이 초기화되지 않았습니다.');
      }

      // Raw documents 생성
      const rawDocs = documents.map((doc) => ({
        id: generateId(),
        content: doc.content,
        metadata: doc.metadata,
      }));

      // 인덱싱
      await indexDocuments(vectorDB, embedder, rawDocs, {
        chunkSize: 500,
        chunkOverlap: 50,
        batchSize: 10,
      });

      // 리스트 새로고침
      if (refreshDocuments) {
        await refreshDocuments();
      }
    } catch (error: any) {
      console.error('Failed to upload documents:', error);
      throw error;
    }
  };

  const handleDocumentEdit = async (doc: {
    id: string;
    content: string;
    metadata: Record<string, any>;
  }) => {
    try {
      const vectorDB = getVectorDB();
      const embedder = getEmbeddingProvider();

      if (!vectorDB || !embedder) {
        throw new Error('VectorDB 또는 Embedding이 초기화되지 않았습니다.');
      }

      // 기존 문서 삭제
      await vectorDB.delete([doc.id]);

      // 새 문서 인덱싱 (같은 ID 사용)
      const rawDocs = [
        {
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
        },
      ];

      await indexDocuments(vectorDB, embedder, rawDocs, {
        chunkSize: 500,
        chunkOverlap: 50,
        batchSize: 10,
      });

      // 리스트 새로고침
      if (refreshDocuments) {
        await refreshDocuments();
      }
    } catch (error: any) {
      console.error('Failed to edit document:', error);
      throw error;
    }
  };

  const handleEdit = (doc: VectorDocument) => {
    setEditingDocument(doc);
    setEditDialogOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {onBack && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onBack}
                title="대화로 돌아가기"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold">문서 관리</h1>
              <p className="text-sm text-muted-foreground mt-1">
                문서를 업로드하고 관리하여 RAG 검색에 활용하세요
              </p>
            </div>
          </div>
          <Button
            onClick={() => setUploadDialogOpen(true)}
            disabled={!isConfigured || isDisabled}
            size="default"
          >
            <Plus className="h-5 w-5 mr-2" />
            문서 추가
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          {/* VectorDB 초기화 확인 */}
          {!isConfigured ? (
            <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-medium">VectorDB 설정 필요</p>
                  <p className="mt-1">문서를 업로드하려면 먼저 설정에서 VectorDB와 Embedding 설정을 완료해주세요.</p>
                </div>
              </div>
            </div>
          ) : isDisabled ? (
            <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <p className="font-medium">SQLite-vec는 Electron 전용</p>
                  <p className="mt-1">웹 브라우저에서는 SQLite-vec를 사용할 수 없습니다. Electron 앱을 사용하거나 다른 VectorDB(OpenSearch, Elasticsearch 등)를 선택해주세요.</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-600 dark:text-green-500">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium">VectorDB 설정 완료</p>
                  <p className="mt-1">
                    {vectorDBConfig.type === 'sqlite-vec' ? 'SQLite-vec' : vectorDBConfig.type} / {embeddingConfig.provider === 'openai' ? `OpenAI ${embeddingConfig.model}` : embeddingConfig.provider}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Document List */}
          <div className="rounded-lg border p-6">
            <DocumentList
              onDelete={async (ids) => {
                const vectorDB = getVectorDB();
                await vectorDB.delete(ids);
              }}
              onEdit={handleEdit}
              onRefresh={(fn) => setRefreshDocuments(() => fn)}
              disabled={isDisabled}
            />
          </div>
        </div>
      </div>

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUpload={handleDocumentUpload}
      />

      {/* Edit Dialog */}
      <DocumentEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        document={editingDocument}
        onSave={handleDocumentEdit}
      />
    </div>
  );
}
