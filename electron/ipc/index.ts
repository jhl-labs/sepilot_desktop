import { setupChatHandlers } from './handlers/chat';
import { setupConfigHandlers } from './handlers/config';
import { setupMCPHandlers } from './handlers/mcp';
import { setupAuthHandlers } from './handlers/auth';
import { setupLLMHandlers } from './handlers/llm';
import { setupVectorDBHandlers } from './handlers/vectordb';
import { registerFileHandlers } from './handlers/file';
import { setupGitHubHandlers } from './handlers/github';
import { setupEmbeddingsHandlers } from './handlers/embeddings';
import { setupComfyUIHandlers } from './handlers/comfyui';
import { logger } from '../services/logger';

export function setupIpcHandlers() {
  logger.info('Setting up IPC handlers');

  setupChatHandlers();
  setupConfigHandlers();
  setupMCPHandlers();
  setupAuthHandlers();
  setupLLMHandlers();
  setupVectorDBHandlers();
  registerFileHandlers();
  setupGitHubHandlers();
  setupEmbeddingsHandlers();
  setupComfyUIHandlers();

  logger.info('IPC handlers setup complete');
}
