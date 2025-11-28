'use client';

import { useState, useEffect } from 'react';
import { DocumentList } from '@/components/rag/DocumentList';
import { DocumentUploadDialog } from '@/components/rag/DocumentUploadDialog';
import { DocumentEditDialog } from '@/components/rag/DocumentEditDialog';
import { VectorDBConfig, EmbeddingConfig, VectorDocument } from '@/lib/vectordb/types';
import { getVectorDB, getEmbeddingProvider, deleteDocuments } from '@/lib/vectordb';
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

  // VectorDB 설정 로드 함수
  const loadConfigs = async () => {
    console.log('[DocumentsPage] Loading VectorDB and Embedding configs...');
    console.log('[DocumentsPage] isElectron:', isElectron());

    // Electron 환경에서는 DB에서 먼저 시도
    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.config.load();
        console.log('[DocumentsPage] Loaded from DB:', result);
        if (result.success && result.data) {
          if (result.data.vectorDB) {
            console.log('[DocumentsPage] VectorDB config from DB:', result.data.vectorDB);
            setVectorDBConfig(result.data.vectorDB);
          }
          if (result.data.embedding) {
            console.log('[DocumentsPage] Embedding config from DB:', result.data.embedding);
            setEmbeddingConfig(result.data.embedding);
          }
          return; // DB에서 로드 성공하면 종료
        }
      } catch (error) {
        console.error('[DocumentsPage] Failed to load from DB:', error);
      }
    }

    // Web 환경 또는 DB 로드 실패 시 localStorage에서 로드
    const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
    console.log('[DocumentsPage] savedVectorDBConfig from localStorage:', savedVectorDBConfig);
    if (savedVectorDBConfig) {
      const parsed = JSON.parse(savedVectorDBConfig);
      console.log('[DocumentsPage] Parsed VectorDB config:', parsed);
      setVectorDBConfig(parsed);
    } else {
      console.log('[DocumentsPage] No VectorDB config found in localStorage');
    }

    const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');
    console.log('[DocumentsPage] savedEmbeddingConfig from localStorage:', savedEmbeddingConfig);
    if (savedEmbeddingConfig) {
      const parsed = JSON.parse(savedEmbeddingConfig);
      console.log('[DocumentsPage] Parsed Embedding config:', parsed);
      setEmbeddingConfig(parsed);
    } else {
      console.log('[DocumentsPage] No Embedding config found in localStorage');
    }
  };

  useEffect(() => {
    // 초기 로드 (async)
    (async () => {
      await loadConfigs();
    })();

    // 설정 업데이트 이벤트 리스너
    const handleConfigUpdate = (event: CustomEvent) => {
      console.log('[DocumentsPage] Config updated event received:', event.detail);
      if (event.detail.vectorDB) {
        console.log('[DocumentsPage] Updating VectorDB config from event:', event.detail.vectorDB);
        setVectorDBConfig(event.detail.vectorDB);
      }
      if (event.detail.embedding) {
        console.log('[DocumentsPage] Updating Embedding config from event:', event.detail.embedding);
        setEmbeddingConfig(event.detail.embedding);
      }
    };

    window.addEventListener('sepilot:config-updated', handleConfigUpdate as EventListener);

    return () => {
      window.removeEventListener('sepilot:config-updated', handleConfigUpdate as EventListener);
    };
  }, []);

  const isConfigured = vectorDBConfig && embeddingConfig;
  const isDisabled = !isElectron() && vectorDBConfig?.type === 'sqlite-vec';

  // 디버깅을 위한 로그
  useEffect(() => {
    console.log('[DocumentsPage] Configuration status:', {
      vectorDBConfig,
      embeddingConfig,
      isConfigured,
      isDisabled,
      isElectronEnv: isElectron(),
    });
  }, [vectorDBConfig, embeddingConfig, isConfigured, isDisabled]);

  const handleDocumentUpload = async (
    documents: { content: string; metadata: Record<string, any> }[]
  ) => {
    try {
      console.log('[DocumentsPage] Starting document upload...', {
        count: documents.length,
        isElectronEnv: isElectron(),
        vectorDBType: vectorDBConfig?.type,
      });

      // 브라우저 환경에서 SQLite-vec 사용 시 경고
      if (!isElectron() && vectorDBConfig?.type === 'sqlite-vec') {
        throw new Error('SQLite-vec는 Electron 환경에서만 사용 가능합니다. 웹 브라우저에서는 문서를 업로드할 수 없습니다.');
      }

      // Raw documents 생성
      const rawDocs = documents.map((doc) => ({
        id: generateId(),
        content: doc.content,
        metadata: doc.metadata,
      }));

      const indexingOptions = {
        chunkSize: 500,
        chunkOverlap: 50,
        batchSize: 10,
      };

      // Electron 환경에서는 IPC를 통해 Main Process에서 인덱싱
      if (isElectron() && window.electronAPI?.vectorDB) {
        console.log('[DocumentsPage] Using IPC for indexing in Electron');
        const result = await window.electronAPI.vectorDB.indexDocuments(rawDocs, indexingOptions);

        if (!result.success) {
          throw new Error(result.error || '문서 인덱싱 실패');
        }

        console.log('[DocumentsPage] Documents indexed successfully via IPC');
      } else {
        // Web 환경에서는 직접 인덱싱
        console.log('[DocumentsPage] Using direct indexing in Web');

        // Embedding이 초기화되었는지 확인
        let embedder;
        try {
          embedder = getEmbeddingProvider();
        } catch {
          throw new Error('Embedding이 초기화되지 않았습니다. 먼저 설정에서 Embedding 설정을 완료해주세요.');
        }

        // VectorDB가 초기화되었는지 확인
        let vectorDB;
        try {
          vectorDB = getVectorDB();
        } catch {
          throw new Error('VectorDB가 초기화되지 않았습니다. 먼저 설정에서 VectorDB 설정을 완료해주세요.');
        }

        if (!vectorDB || !embedder) {
          throw new Error('VectorDB 또는 Embedding이 초기화되지 않았습니다.');
        }

        // 인덱싱
        await indexDocuments(vectorDB, embedder, rawDocs, indexingOptions);
        console.log('[DocumentsPage] Documents indexed successfully');
      }

      // 리스트 새로고침
      if (refreshDocuments) {
        await refreshDocuments();
      }
    } catch (error: any) {
      console.error('[DocumentsPage] Failed to upload documents:', error);
      throw error;
    }
  };

  const handleDocumentEdit = async (doc: {
    id: string;
    content: string;
    metadata: Record<string, any>;
  }) => {
    try {
      // 브라우저 환경에서 SQLite-vec 사용 시 경고
      if (!isElectron() && vectorDBConfig?.type === 'sqlite-vec') {
        throw new Error('SQLite-vec는 Electron 환경에서만 사용 가능합니다. 웹 브라우저에서는 문서를 편집할 수 없습니다.');
      }

      // 새 문서 데이터
      const rawDocs = [
        {
          id: doc.id,
          content: doc.content,
          metadata: doc.metadata,
        },
      ];

      const indexingOptions = {
        chunkSize: 500,
        chunkOverlap: 50,
        batchSize: 10,
      };

      // Electron 환경에서는 IPC를 통해 Main Process에서 처리
      if (isElectron() && window.electronAPI?.vectorDB) {
        // 기존 문서 삭제
        await deleteDocuments([doc.id]);

        // 새 문서 인덱싱 (같은 ID 사용)
        const result = await window.electronAPI.vectorDB.indexDocuments(rawDocs, indexingOptions);

        if (!result.success) {
          throw new Error(result.error || '문서 편집 실패');
        }
      } else {
        // Web 환경에서는 직접 처리
        const vectorDB = getVectorDB();
        const embedder = getEmbeddingProvider();

        if (!vectorDB || !embedder) {
          throw new Error('VectorDB 또는 Embedding이 초기화되지 않았습니다.');
        }

        // 기존 문서 삭제
        await vectorDB.delete([doc.id]);

        // 새 문서 인덱싱 (같은 ID 사용)
        await indexDocuments(vectorDB, embedder, rawDocs, indexingOptions);
      }

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
              onDelete={deleteDocuments}
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
