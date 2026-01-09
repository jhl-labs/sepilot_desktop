/**
 * IPC Module
 * Electron IPC 핸들러 등록
 */

import { BrowserWindow } from 'electron';
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
import { setupGitHubSyncHandlers } from './handlers/github-sync';
import { setupTeamDocsHandlers } from './handlers/team-docs';
import { setupEmbeddingsHandlers } from './handlers/embeddings';
import { setupComfyUIHandlers } from './handlers/comfyui';
import { setupUpdateHandlers } from './handlers/update';
import { setupQuickInputHandlers } from './handlers/quick-input';
import { setupBrowserViewHandlers } from './handlers/browser-view';
import { setupBrowserControlHandlers } from './handlers/browser-control';
import { setupTerminalHandlers } from './handlers/terminal';
import { setupPersonaHandlers } from './handlers/persona';
import { setupErrorReportingHandlers } from './handlers/error-reporting';
import { setupNotificationHandlers } from './handlers/notification';
import { registerSkillsHandlers } from './handlers/skills';
import { logger } from '../services/logger';
import { registerExtensionIpcHandlers } from '../../lib/extensions/loader-main';

/**
 * Register all IPC handlers
 */
export function setupIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  registerShortcuts: () => Promise<void>
) {
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
  setupGitHubSyncHandlers();
  setupTeamDocsHandlers();
  setupEmbeddingsHandlers();
  setupComfyUIHandlers();
  setupUpdateHandlers();
  setupQuickInputHandlers(getMainWindow, registerShortcuts);
  setupBrowserViewHandlers();
  setupBrowserControlHandlers();
  setupTerminalHandlers(undefined);
  setupPersonaHandlers();
  setupErrorReportingHandlers();
  setupNotificationHandlers(getMainWindow);
  registerSkillsHandlers();

  // Extension IPC handlers
  registerExtensionIpcHandlers();

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

// Re-export Skills functions
export { initializeSkills } from './handlers/skills';
