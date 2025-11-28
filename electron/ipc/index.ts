/**
 * IPC Module
 * Electron IPC 핸들러 등록
 */

import { setupChatHandlers } from './handlers/chat';
import { setupActivityHandlers } from './handlers/activity';
import { setupConfigHandlers } from './handlers/config';
import { setupMCPHandlers } from './handlers/mcp';
import { setupAuthHandlers } from './handlers/auth';
import { setupLLMHandlers } from './handlers/llm';
import { setupLangGraphHandlers } from './handlers/langgraph';
import { setupVectorDBHandlers } from './handlers/vectordb';
import { registerFileHandlers } from './handlers/file';
import { setupGitHubHandlers } from './handlers/github';
import { setupEmbeddingsHandlers } from './handlers/embeddings';
import { setupComfyUIHandlers } from './handlers/comfyui';
import { setupUpdateHandlers } from './handlers/update';
import { logger } from '../services/logger';

/**
 * Register all IPC handlers
 */
export function setupIpcHandlers() {
  logger.info('Setting up IPC handlers');

  setupChatHandlers();
  setupActivityHandlers();
  setupConfigHandlers();
  setupMCPHandlers();
  setupAuthHandlers();
  setupLLMHandlers();
  setupLangGraphHandlers();
  setupVectorDBHandlers();
  registerFileHandlers();
  setupGitHubHandlers();
  setupEmbeddingsHandlers();
  setupComfyUIHandlers();
  setupUpdateHandlers();

  logger.info('IPC handlers setup complete');
}

// Re-export utilities
export * from './utils';

// Re-export individual setup functions for granular control
export {
  setupChatHandlers,
  setupConfigHandlers,
  setupLLMHandlers,
  setupMCPHandlers,
  setupVectorDBHandlers,
  setupEmbeddingsHandlers,
  setupAuthHandlers,
  setupGitHubHandlers,
  registerFileHandlers,
  setupComfyUIHandlers,
};
