'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DocumentList } from '@/components/rag/DocumentList';
import { DocumentDialog } from '@/components/rag/DocumentDialog';
import {
  VectorDBConfig,
  EmbeddingConfig,
  VectorDocument,
  ChunkStrategy,
} from '@/lib/vectordb/types';
import {
  getVectorDB,
  getEmbeddingProvider,
  deleteDocuments,
  getAllDocuments,
} from '@/lib/vectordb';
import { generateId } from '@/lib/utils';
import { indexDocuments } from '@/lib/vectordb/indexing';
import { isElectron } from '@/lib/platform';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Plus } from 'lucide-react';

import { logger } from '@/lib/utils/logger';
interface DocumentsPageProps {
  onBack?: () => void;
}

type DocumentWithMetadata = {
  content: string;
  metadata: Record<string, unknown>;
};

export function DocumentsPage({ onBack }: DocumentsPageProps) {
  const { t } = useTranslation();
  const [vectorDBConfig, setVectorDBConfig] = useState<VectorDBConfig | null>(null);
  const [embeddingConfig, setEmbeddingConfig] = useState<EmbeddingConfig | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDocument, setEditingDocument] = useState<VectorDocument | null>(null);
  const [refreshDocuments, setRefreshDocuments] = useState<(() => Promise<void>) | null>(null);

  // VectorDB 설정 로드 함수
  const loadConfigs = async () => {
    logger.info('[DocumentsPage] Loading VectorDB and Embedding configs...');
    logger.debug('[DocumentsPage] Environment info', { isElectron: isElectron() });

    // Electron 환경에서는 DB에서 먼저 시도
    if (isElectron() && window.electronAPI) {
      try {
        const result = await window.electronAPI.config.load();
        logger.debug('[DocumentsPage] Loaded config from DB', result);
        if (result.success && result.data) {
          if (result.data.vectorDB) {
            logger.info('[DocumentsPage] VectorDB config loaded from DB');
            setVectorDBConfig(result.data.vectorDB);
          }
          if (result.data.embedding) {
            logger.info('[DocumentsPage] Embedding config loaded from DB');
            setEmbeddingConfig(result.data.embedding);
          }
          return; // DB에서 로드 성공하면 종료
        }
      } catch (error) {
        logger.error('[DocumentsPage] Failed to load configs from DB', error);
      }
    }

    // Web 환경 또는 DB 로드 실패 시 localStorage에서 로드
    const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
    logger.debug('[DocumentsPage] savedVectorDBConfig from localStorage:', savedVectorDBConfig);
    if (savedVectorDBConfig) {
      const parsed = JSON.parse(savedVectorDBConfig);
      logger.info('[DocumentsPage] VectorDB config loaded from localStorage');
      setVectorDBConfig(parsed);
    } else {
      logger.warn('[DocumentsPage] No VectorDB config found in localStorage');
    }

    const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');
    logger.debug('[DocumentsPage] savedEmbeddingConfig from localStorage:', savedEmbeddingConfig);
    if (savedEmbeddingConfig) {
      const parsed = JSON.parse(savedEmbeddingConfig);
      logger.info('[DocumentsPage] Embedding config loaded from localStorage');
      setEmbeddingConfig(parsed);
    } else {
      logger.warn('[DocumentsPage] No Embedding config found in localStorage');
    }
  };

  useEffect(() => {
    // 초기 로드 (async)
    (async () => {
      await loadConfigs();
    })();

    // 설정 업데이트 이벤트 리스너
    const handleConfigUpdate = (event: CustomEvent) => {
      logger.info('[DocumentsPage] Config updated event received:', event.detail);
      if (event.detail.vectorDB) {
        logger.debug('[DocumentsPage] Updating VectorDB config from event:', event.detail.vectorDB);
        setVectorDBConfig(event.detail.vectorDB);
      }
      if (event.detail.embedding) {
        logger.debug(
          '[DocumentsPage] Updating Embedding config from event:',
          event.detail.embedding
        );
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
    logger.debug('[DocumentsPage] Configuration status:', {
      vectorDBConfig,
      embeddingConfig,
      isConfigured,
      isDisabled,
      isElectronEnv: isElectron(),
    });
  }, [vectorDBConfig, embeddingConfig, isConfigured, isDisabled]);

  const handleDocumentUpload = async (
    documents: DocumentWithMetadata[],
    chunkStrategy?: ChunkStrategy
  ) => {
    try {
      logger.info('[DocumentsPage] Starting document upload', {
        count: documents.length,
        isElectronEnv: isElectron(),
        vectorDBType: vectorDBConfig?.type,
        chunkStrategy: chunkStrategy || 'sentence',
      });

      // 브라우저 환경에서 SQLite-vec 사용 시 경고
      if (!isElectron() && vectorDBConfig?.type === 'sqlite-vec') {
        throw new Error(t('documentsPage.errors.sqliteElectronOnly'));
      }

      // Raw documents 생성
      const rawDocs = documents.map((doc) => ({
        id: generateId(),
        content: doc.content,
        metadata: doc.metadata,
      }));

      const indexingOptions = {
        chunkSize: 2500, // 2500자 (약 600-750 토큰): 적절한 맥락 유지
        chunkOverlap: 250, // 10% 오버랩: 경계 부분 맥락 보존
        batchSize: 10,
        chunkStrategy: chunkStrategy || 'sentence', // 기본값: sentence
      };

      // Electron 환경에서는 IPC를 통해 Main Process에서 인덱싱
      if (isElectron() && window.electronAPI?.vectorDB) {
        logger.info('[DocumentsPage] Using IPC for indexing in Electron');
        const result = await window.electronAPI.vectorDB.indexDocuments(rawDocs, indexingOptions);

        if (!result.success) {
          throw new Error(result.error || t('documents.errors.indexFailed'));
        }

        logger.info('[DocumentsPage] Documents indexed successfully via IPC');
      } else {
        // Web 환경에서는 직접 인덱싱
        logger.info('[DocumentsPage] Using direct indexing in Web');

        // Embedding이 초기화되었는지 확인
        let embedder;
        try {
          embedder = getEmbeddingProvider();
        } catch {
          throw new Error(t('documentsPage.errors.embeddingNotInitialized'));
        }

        // VectorDB가 초기화되었는지 확인
        let vectorDB;
        try {
          vectorDB = getVectorDB();
        } catch {
          throw new Error(t('documentsPage.errors.vectorDBNotInitialized'));
        }

        if (!vectorDB || !embedder) {
          throw new Error(t('documentsPage.errors.notInitialized'));
        }

        // 인덱싱
        await indexDocuments(vectorDB, embedder, rawDocs, indexingOptions);
        logger.info('[DocumentsPage] Documents indexed successfully');
      }

      // 리스트 새로고침
      if (refreshDocuments) {
        await refreshDocuments();
      }
    } catch (error: unknown) {
      logger.error('[DocumentsPage] Failed to upload documents', error);
      throw error;
    }
  };

  const handleDocumentEdit = async (doc: DocumentWithMetadata & { id: string }) => {
    try {
      // 브라우저 환경에서 SQLite-vec 사용 시 경고
      if (!isElectron() && vectorDBConfig?.type === 'sqlite-vec') {
        throw new Error(t('documentsPage.errors.sqliteElectronOnly'));
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
        chunkSize: 2500, // 2500자 (약 600-750 토큰): 적절한 맥락 유지
        chunkOverlap: 250, // 10% 오버랩: 경계 부분 맥락 보존
        batchSize: 10,
      };

      // 원본 문서 ID와 매칭되는 모든 청크 ID 찾기
      const allDocs = await getAllDocuments();
      const chunkIdsToDelete = allDocs
        .filter((d) => {
          const originalId = d.metadata?.originalId || d.id;
          return originalId === doc.id;
        })
        .map((d) => d.id);

      const idsToDelete = chunkIdsToDelete.length > 0 ? chunkIdsToDelete : [doc.id];

      // Electron 환경에서는 IPC를 통해 Main Process에서 처리
      if (isElectron() && window.electronAPI?.vectorDB) {
        // 기존 문서의 모든 청크 삭제
        await deleteDocuments(idsToDelete);

        // 새 문서 인덱싱 (같은 ID 사용)
        const result = await window.electronAPI.vectorDB.indexDocuments(rawDocs, indexingOptions);

        if (!result.success) {
          throw new Error(result.error || t('documentsPage.errors.editFailed'));
        }
      } else {
        // Web 환경에서는 직접 처리
        const vectorDB = getVectorDB();
        const embedder = getEmbeddingProvider();

        if (!vectorDB || !embedder) {
          throw new Error(t('documentsPage.errors.notInitialized'));
        }

        // 기존 문서의 모든 청크 삭제
        await vectorDB.delete(idsToDelete);

        // 새 문서 인덱싱 (같은 ID 사용)
        await indexDocuments(vectorDB, embedder, rawDocs, indexingOptions);
      }

      // 리스트 새로고침
      if (refreshDocuments) {
        await refreshDocuments();
      }
    } catch (error: unknown) {
      logger.error('[DocumentsPage] Failed to edit document', error);
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
                title={t('documentsPage.backToChat')}
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <div>
              <h1 className="text-2xl font-bold">{t('documentsPage.title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('documentsPage.description')}</p>
            </div>
          </div>
          <Button
            onClick={() => setUploadDialogOpen(true)}
            disabled={!isConfigured || isDisabled}
            size="default"
          >
            <Plus className="h-5 w-5 mr-2" />
            {t('documentsPage.addDocument')}
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
                <svg
                  className="w-5 h-5 mt-0.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <p className="font-medium">{t('documentsPage.warnings.setupRequired.title')}</p>
                  <p className="mt-1">{t('documentsPage.warnings.setupRequired.message')}</p>
                </div>
              </div>
            </div>
          ) : isDisabled ? (
            <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-sm text-yellow-600 dark:text-yellow-500">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 mt-0.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
                <div>
                  <p className="font-medium">
                    {t('documentsPage.warnings.sqliteElectronOnly.title')}
                  </p>
                  <p className="mt-1">{t('documentsPage.warnings.sqliteElectronOnly.message')}</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-green-500/10 border border-green-500/20 px-4 py-3 text-sm text-green-600 dark:text-green-500">
              <div className="flex items-start gap-2">
                <svg
                  className="w-5 h-5 mt-0.5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <div>
                  <p className="font-medium">{t('documentsPage.success.configured')}</p>
                  <p className="mt-1">
                    {vectorDBConfig.type === 'sqlite-vec' ? 'SQLite-vec' : vectorDBConfig.type} /{' '}
                    {embeddingConfig.provider === 'openai'
                      ? `OpenAI ${embeddingConfig.model}`
                      : embeddingConfig.provider}
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
      <DocumentDialog
        mode="create"
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUpload={handleDocumentUpload}
      />

      {/* Edit Dialog */}
      <DocumentDialog
        mode="edit"
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        document={editingDocument}
        onSave={handleDocumentEdit}
      />
    </div>
  );
}
