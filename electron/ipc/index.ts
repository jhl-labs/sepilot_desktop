/**
 * IPC Module
 * Electron IPC 핸들러 등록
 */

import { BrowserWindow } from 'electron';

// Chat handlers
import {
  setupChatHandlers,
  setupMessageSubscriptionHandlers,
  setupPersonaHandlers,
} from './handlers/chat';

// Data handlers
import {
  setupActivityHandlers,
  setupVectorDBHandlers,
  setupEmbeddingsHandlers,
} from './handlers/data';

// System handlers
import {
  setupConfigHandlers,
  setupAuthHandlers,
  setupUpdateHandlers,
  setupNotificationHandlers,
  setupErrorReportingHandlers,
  setupSchedulerHandlers,
  registerWebhookHandlers,
} from './handlers/system';

// LLM handlers
import { setupLLMHandlers } from './handlers/llm';

// MCP handlers
import { setupMCPHandlers } from './handlers/mcp';

// Agent handlers
import {
  setupLangGraphHandlers,
  registerArchitectHandlers,
  registerEditorExtensionHandlers,
} from './handlers/agent';

// File handlers
import { registerFileHandlers } from './handlers/file';

// Browser handlers
import { setupBrowserViewHandlers, setupBrowserControlHandlers } from './handlers/browser';

// Terminal handlers
import { setupTerminalHandlers } from './handlers/terminal';

// Integration handlers
import {
  setupGitHubHandlers,
  setupGitHubSyncHandlers,
  setupTeamDocsHandlers,
  setupComfyUIHandlers,
  setupNanoBananaHandlers,
} from './handlers/integration';

// Extension handlers
import {
  registerExtensionLLMHandlers,
  registerExtensionVectorDBHandlers,
  registerExtensionMCPHandlers,
  registerExtensionFSHandlers,
  registerExtensionSkillsHandlers,
} from './handlers/extension';

// Skill handlers
import { registerSkillsHandlers } from './handlers/skill';

// Quick Input handlers
import { setupQuickInputHandlers } from './handlers/quick-input';

import { logger } from '../services/logger';

/**
 * Register all IPC handlers
 */
export function setupIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  registerShortcuts: () => Promise<void>
) {
  logger.info('Setting up IPC handlers');

  // Chat
  setupChatHandlers();
  setupMessageSubscriptionHandlers();
  setupPersonaHandlers();

  // Data
  setupActivityHandlers();
  setupVectorDBHandlers();
  setupEmbeddingsHandlers();

  // System
  setupConfigHandlers();
  setupAuthHandlers();
  setupUpdateHandlers();
  setupNotificationHandlers(getMainWindow);
  setupErrorReportingHandlers();
  setupSchedulerHandlers();
  registerWebhookHandlers(getMainWindow);

  // LLM & MCP
  setupLLMHandlers();
  setupMCPHandlers();

  // Agent
  setupLangGraphHandlers();
  registerArchitectHandlers();
  registerEditorExtensionHandlers();

  // File, Browser, Terminal
  registerFileHandlers();
  setupBrowserViewHandlers();
  setupBrowserControlHandlers();
  setupTerminalHandlers(undefined);

  // Integration
  setupGitHubHandlers();
  setupGitHubSyncHandlers();
  setupTeamDocsHandlers();
  setupComfyUIHandlers();
  setupNanoBananaHandlers();

  // Skill & Quick Input
  registerSkillsHandlers();
  setupQuickInputHandlers(getMainWindow, registerShortcuts);

  // Extension Context API IPC handlers
  registerExtensionLLMHandlers();
  registerExtensionVectorDBHandlers();
  registerExtensionMCPHandlers();
  registerExtensionFSHandlers();
  registerExtensionSkillsHandlers();

  // Extension IPC handlers (extension:discover, extension:install, etc.)
  // are registered by loadAndRegisterExtensions() in lib/extensions/loader-main.ts
  // Do NOT register them here to avoid duplicate handler errors

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
  setupNanoBananaHandlers,
};

// Re-export Skills functions
export { initializeSkills } from './handlers/skill/skills';
