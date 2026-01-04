/**
 * Editor Extension
 *
 * Code editor with Monaco, file explorer, integrated terminal, and AI coding assistant.
 *
 * NOTE: This file exports only client-safe components.
 * Server-side code (Agents, Tools) should be imported directly from their respective files.
 */

export { manifest } from './manifest';

// Types (client-safe)
export * from './types';

// Main Component (Workspace)
export { EditorWithTerminal } from './components/EditorWithTerminal';

// Sidebar Component
export { SidebarEditor } from './components/SidebarEditor';

// Header Actions Component
export { EditorHeaderActions } from './components/EditorHeaderActions';

// Settings Component
export { EditorSettingsTab } from './components/EditorSettingsTab';

// NOTE: Agents and Tools are NOT exported here to avoid bundling server-only code in client.
// They should be imported directly in server-side code:
// - import { createAdvancedEditorAgentGraph } from '@/extensions/editor/agents/editor-agent-advanced';
// - import { editorToolsRegistry } from '@/extensions/editor/tools/index';
