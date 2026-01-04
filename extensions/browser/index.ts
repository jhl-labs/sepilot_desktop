/**
 * Browser Extension
 *
 * Integrated web browser with AI agent, snapshots, bookmarks, and page capture.
 *
 * NOTE: This file exports only client-safe components.
 * Server-side code (Agents) should be imported directly from their respective files.
 */

export { manifest } from './manifest';

// Types (client-safe)
export * from './types';

// Main Component (Workspace)
export { BrowserPanel } from './components/BrowserPanel';

// Sidebar Component
export { SidebarBrowser } from './components/SidebarBrowser';

// NOTE: Agents are NOT exported here to avoid bundling server-only code in client.
// They should be imported directly in server-side code:
// - import { createBrowserAgentGraph, BrowserAgentGraph } from '@/extensions/browser/agents/browser-agent';
