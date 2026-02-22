/**
 * Extension IPC Handlers
 */

export { registerExtensionLLMHandlers } from './extension-llm';
export { registerExtensionVectorDBHandlers } from './extension-vectordb';
export { registerExtensionMCPHandlers } from './extension-mcp';
export { registerExtensionFSHandlers } from './extension-fs';
export { registerExtensionSkillsHandlers } from './extension-skills';
// Note: extension-handlers.ts exports are registered by loadAndRegisterExtensions()
// in lib/extensions/loader-main.ts
