import { ipcMain } from 'electron';
import { vectorDBService } from '../../services/vectordb';
import { logger } from '../../services/logger';
import { VectorDocument, SearchResult } from '../../../lib/vectordb/types';

export function setupVectorDBHandlers() {
  // Initialize VectorDB
  ipcMain.handle('vectordb-initialize', async (_, config: { indexName: string; dimension: number }) => {
    try {
      logger.debug('Initializing VectorDB', config);
      await vectorDBService.initialize(config);
      return { success: true };
    } catch (error) {
      logger.error('Failed to initialize VectorDB', error);
      return { success: false, error: (error as Error).message };
    }
  });

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

  logger.info('VectorDB IPC handlers registered');
}
