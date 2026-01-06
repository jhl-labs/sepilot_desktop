/**
 * Terminal Extension
 *
 * AI 기반 인텔리전트 터미널. Warp Terminal을 모티브로 한 블록 기반 UI와
 * 자연어 명령어 변환, 컨텍스트 이해, RAG 기반 검색을 제공합니다.
 *
 * NOTE: This file exports only client-safe components.
 * Server-side code (Agents, Tools) should be imported directly from their respective files.
 */

// Manifest
export { manifest } from './manifest';

// Types (client-safe)
export * from './types';

// Store (client-safe)
export { createTerminalSlice, initialTerminalState } from './store';

// Components (lazy-loaded for better performance)
export { TerminalPanel } from './components/TerminalPanel';
export { TerminalBlock } from './components/TerminalBlock';
export { AICommandInput } from './components/AICommandInput';
export { BlockHistoryPanel } from './components/BlockHistoryPanel';
export { SidebarTerminal } from './components/SidebarTerminal';
export { TerminalSettings } from './components/TerminalSettings';

// NOTE: Agents and Tools are NOT exported here to avoid bundling server-only code in client.
// They should be imported directly in server-side code:
// - import { createTerminalAgentGraph } from '@/extensions/terminal/agents/terminal-agent';
// - import { runCommandTool } from '@/extensions/terminal/tools/run_command';
