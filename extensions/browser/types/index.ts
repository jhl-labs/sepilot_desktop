/**
 * Browser Agent 타입 정의 통합 Export
 *
 * 파일 구조:
 * - google-search.ts: Google Search Tools (기존)
 * - browser-control.ts: Browser Control Tools (신규)
 * - vision.ts: Vision-Based Tools (신규)
 * - errors.ts: Error & Recovery Strategy (신규)
 * - workflow.ts: Session & Workflow Management (신규)
 */

// =============================================================================
// Google Search (기존)
// =============================================================================

export * from './google-search';

// 명시적 re-export (하위 호환성)
export type {
  BrowserAgentLogLevel,
  BrowserAgentLogEntry,
  BrowserAgentState,
  BrowserAgentLLMConfig,
  BrowserChatFontConfig,
  BrowserAgentCompletionStatus,
  BrowserAgentToolStats,
  BrowserAgentVisitedPage,
  BrowserAgentReport,
  BrowserAgentExecutionContext,
  GoogleSearchType,
  GoogleDateFilter,
  GoogleLanguageCode,
  GoogleRegionCode,
  GoogleFileType,
  GoogleSortBy,
  GoogleSearchOptions,
  GoogleSearchResultItem,
  GoogleSearchResult,
  GoogleExtractResultsOptions,
  GoogleVisitResultOptions,
  GoogleVisitResult,
  GoogleSearchContext,
  GoogleSearchErrorType,
  GoogleSearchError,
  GoogleSearchParsingState,
  GoogleSearchStats,
  GoogleSearchSession,
  GoogleSearchToolName,
  GoogleSearchToolCategory,
} from './google-search';

export {
  GOOGLE_SEARCH_TOOLS,
  GOOGLE_SEARCH_TOOLS_LIST,
  GOOGLE_SEARCH_TOOLS_BY_CATEGORY,
} from './google-search';

// =============================================================================
// Browser Control Tools (신규)
// =============================================================================

export * from './browser-control';

// =============================================================================
// Vision Tools (신규)
// =============================================================================

export * from './vision';

// =============================================================================
// Error & Recovery (신규)
// =============================================================================

export * from './errors';

// =============================================================================
// Workflow & Session (신규)
// =============================================================================

export * from './workflow';

// =============================================================================
// 통합 Tool 목록
// =============================================================================

import { GOOGLE_SEARCH_TOOLS } from './google-search';
import { BROWSER_CONTROL_TOOLS } from './browser-control';
import { VISION_TOOLS } from './vision';

/**
 * 모든 Browser Agent Tools (통합)
 */
export const ALL_BROWSER_AGENT_TOOLS = {
  ...GOOGLE_SEARCH_TOOLS,
  ...BROWSER_CONTROL_TOOLS,
  ...VISION_TOOLS,
} as const;

/**
 * Browser Agent Tool 이름 (통합)
 */
export type BrowserAgentToolName = keyof typeof ALL_BROWSER_AGENT_TOOLS;

/**
 * Browser Agent Tool 카테고리 (확장)
 */
export type BrowserAgentToolCategory =
  // Google Search
  | 'search'
  | 'extraction'
  // Browser Control
  | 'navigation'
  | 'inspection'
  | 'interaction'
  | 'tabs'
  // Vision
  | 'vision';

/**
 * 모든 Browser Agent Tools 목록 (배열)
 */
export const ALL_BROWSER_AGENT_TOOLS_LIST = Object.values(ALL_BROWSER_AGENT_TOOLS);

/**
 * 카테고리별 Tool 개수
 */
export const BROWSER_AGENT_TOOL_COUNTS = {
  google_search: Object.values(GOOGLE_SEARCH_TOOLS).length, // 9개
  browser_control: Object.values(BROWSER_CONTROL_TOOLS).length, // 14개
  vision: Object.values(VISION_TOOLS).length, // 5개
  total: ALL_BROWSER_AGENT_TOOLS_LIST.length, // 28개
} as const;

/**
 * 카테고리별 Tools (통합)
 */
export const BROWSER_AGENT_TOOLS_BY_CATEGORY = {
  // Google Search
  search: ALL_BROWSER_AGENT_TOOLS_LIST.filter((tool) => tool.category === 'search'),
  extraction: ALL_BROWSER_AGENT_TOOLS_LIST.filter((tool) => tool.category === 'extraction'),

  // Browser Control
  navigation: ALL_BROWSER_AGENT_TOOLS_LIST.filter((tool) => tool.category === 'navigation'),
  inspection: ALL_BROWSER_AGENT_TOOLS_LIST.filter((tool) => tool.category === 'inspection'),
  interaction: ALL_BROWSER_AGENT_TOOLS_LIST.filter((tool) => tool.category === 'interaction'),
  tabs: ALL_BROWSER_AGENT_TOOLS_LIST.filter((tool) => tool.category === 'tabs'),

  // Vision
  vision: ALL_BROWSER_AGENT_TOOLS_LIST.filter((tool) => tool.category === 'vision'),
} as const;
