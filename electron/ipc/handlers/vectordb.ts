import { ipcMain } from 'electron';
import { vectorDBService } from '../../services/vectordb';
import { logger } from '../../services/logger';
import { VectorDocument, SearchResult, ExportData } from '../../../lib/vectordb/types';

export function setupVectorDBHandlers() {
  // Initialize VectorDB
  ipcMain.handle(
    'vectordb-initialize',
    async (_, config: { indexName: string; dimension: number }) => {
      try {
        logger.debug('Initializing VectorDB', config);
        await vectorDBService.initialize(config);
        return { success: true };
      } catch (error) {
        logger.error('Failed to initialize VectorDB', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Create index
  ipcMain.handle('vectordb-create-index', async (_, name: string, dimension: number) => {
    try {
      logger.debug('Creating VectorDB index', { name, dimension });
      await vectorDBService.createIndex(name, dimension);
      return { success: true };
    } catch (error) {
      logger.error('Failed to create VectorDB index', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Delete index
  ipcMain.handle('vectordb-delete-index', async (_, name: string) => {
    try {
      logger.debug('Deleting VectorDB index', { name });
      await vectorDBService.deleteIndex(name);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete VectorDB index', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Check if index exists
  ipcMain.handle('vectordb-index-exists', async (_, name: string) => {
    try {
      const exists = await vectorDBService.indexExists(name);
      logger.debug('Checked VectorDB index existence', { name, exists });
      return { success: true, data: exists };
    } catch (error) {
      logger.error('Failed to check VectorDB index existence', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Insert documents
  ipcMain.handle('vectordb-insert', async (_, documents: VectorDocument[]) => {
    try {
      logger.debug('Inserting documents into VectorDB', { count: documents.length });
      await vectorDBService.insert(documents);
      return { success: true };
    } catch (error) {
      logger.error('Failed to insert documents into VectorDB', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Search by vector
  ipcMain.handle('vectordb-search', async (_, queryEmbedding: number[], k: number) => {
    try {
      logger.debug('Searching VectorDB', { k });
      const results = await vectorDBService.searchByVector(queryEmbedding, k);
      logger.debug('VectorDB search completed', { resultCount: results.length });
      return { success: true, data: results };
    } catch (error) {
      logger.error('Failed to search VectorDB', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Delete documents
  ipcMain.handle('vectordb-delete', async (_, ids: string[]) => {
    try {
      logger.debug('Deleting documents from VectorDB', { count: ids.length });
      await vectorDBService.delete(ids);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete documents from VectorDB', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Update document metadata
  ipcMain.handle(
    'vectordb-update-metadata',
    async (_, id: string, metadata: Record<string, any>) => {
      try {
        logger.debug('Updating document metadata in VectorDB', { id });
        await vectorDBService.updateMetadata(id, metadata);
        return { success: true };
      } catch (error) {
        logger.error('Failed to update document metadata in VectorDB', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Get document count
  ipcMain.handle('vectordb-count', async () => {
    try {
      const count = await vectorDBService.count();
      logger.debug('Got VectorDB document count', { count });
      return { success: true, data: count };
    } catch (error) {
      logger.error('Failed to get VectorDB document count', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Get all documents
  ipcMain.handle('vectordb-get-all', async () => {
    try {
      const documents = await vectorDBService.getAllDocuments();
      logger.debug('Got all VectorDB documents', { count: documents.length });
      return { success: true, data: documents };
    } catch (error) {
      logger.error('Failed to get all VectorDB documents', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Index documents (with embedding and chunking)
  ipcMain.handle(
    'vectordb-index-documents',
    async (
      _,
      documents: Array<{ id: string; content: string; metadata: Record<string, any> }>,
      options: { chunkSize: number; chunkOverlap: number; batchSize: number }
    ) => {
      try {
        logger.debug('Indexing documents', { count: documents.length, options });

        // Embedding config를 DB에서 로드하여 초기화
        const { databaseService } = await import('../../services/database');
        const { initializeEmbedding } = await import('../../../lib/vectordb/embeddings/client');

        const configStr = databaseService.getSetting('app_config');
        if (!configStr) {
          throw new Error('App config not found. Please configure Embedding in Settings.');
        }

        const appConfig = JSON.parse(configStr);
        if (!appConfig.embedding) {
          throw new Error('Embedding config not found. Please configure Embedding in Settings.');
        }

        logger.debug('Initializing embedding with config:', {
          provider: appConfig.embedding.provider,
          model: appConfig.embedding.model,
        });

        // Embedding 초기화
        initializeEmbedding(appConfig.embedding);

        await vectorDBService.indexDocuments(documents, options);
        logger.debug('Documents indexed successfully');
        return { success: true };
      } catch (error) {
        logger.error('Failed to index documents', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  // Export documents
  ipcMain.handle('vectordb-export', async () => {
    try {
      logger.debug('Exporting VectorDB documents');
      const documents = await vectorDBService.getAllDocuments();
      const exportData: ExportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        documents: documents,
        totalCount: documents.length,
      };
      logger.debug('Documents exported successfully', { count: exportData.totalCount });
      return { success: true, data: exportData };
    } catch (error) {
      logger.error('Failed to export documents', error);
      return { success: false, error: (error as Error).message };
    }
  });

  // Import documents
  ipcMain.handle(
    'vectordb-import',
    async (_, exportData: ExportData, options?: { overwrite?: boolean }) => {
      try {
        const overwrite = options?.overwrite ?? true;
        logger.debug('Importing VectorDB documents', {
          count: exportData.totalCount,
          overwrite,
        });

        const existingDocuments = await vectorDBService.getAllDocuments();
        let imported = 0;
        let overwritten = 0;
        let skipped = 0;

        // 중복 판단을 위한 맵 생성
        const existingMap = new Map<string, VectorDocument>();
        for (const doc of existingDocuments) {
          const originalId = doc.metadata?.originalId || doc.id;
          existingMap.set(originalId, doc);

          // title + source 조합도 체크
          if (doc.metadata?.title && doc.metadata?.source) {
            const key = `${doc.metadata.title}::${doc.metadata.source}`;
            existingMap.set(key, doc);
          }
        }

        // Import할 문서 처리
        const documentsToDelete: string[] = [];
        const documentsToInsert: VectorDocument[] = [];

        for (const doc of exportData.documents) {
          const originalId = doc.metadata?.originalId || doc.id;
          const titleSourceKey =
            doc.metadata?.title && doc.metadata?.source
              ? `${doc.metadata.title}::${doc.metadata.source}`
              : null;

          // 중복 체크
          const isDuplicate =
            existingMap.has(originalId) || (titleSourceKey && existingMap.has(titleSourceKey));

          if (isDuplicate) {
            if (overwrite) {
              // 기존 문서의 모든 청크 찾기
              const chunkIdsToDelete = existingDocuments
                .filter((existingDoc) => {
                  const existingOriginalId = existingDoc.metadata?.originalId || existingDoc.id;
                  return existingOriginalId === originalId;
                })
                .map((d) => d.id);

              documentsToDelete.push(...chunkIdsToDelete);
              documentsToInsert.push(doc);
              overwritten++;
            } else {
              skipped++;
            }
          } else {
            documentsToInsert.push(doc);
            imported++;
          }
        }

        // 기존 문서 삭제 (overwrite 모드)
        if (documentsToDelete.length > 0) {
          await vectorDBService.delete(documentsToDelete);
        }

        // 새 문서 삽입
        if (documentsToInsert.length > 0) {
          await vectorDBService.insert(documentsToInsert);
        }

        logger.debug('Documents imported successfully', { imported, overwritten, skipped });
        return { success: true, data: { imported, overwritten, skipped } };
      } catch (error) {
        logger.error('Failed to import documents', error);
        return { success: false, error: (error as Error).message };
      }
    }
  );

  logger.info('VectorDB IPC handlers registered');
}
