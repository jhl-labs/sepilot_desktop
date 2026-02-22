/**
 * Browser Extension Shared Types
 *
 * Extension과 Host 간 공유되는 Browser 관련 타입 정의
 * 이 타입들은 Extension SDK에서 제공하여 Host가 Extension에 직접 의존하지 않도록 합니다.
 */

// =============================================================================
// Browser Agent Log Types
// =============================================================================

export type BrowserAgentLogLevel = 'info' | 'success' | 'warning' | 'error' | 'thinking';

export interface BrowserAgentLogEntry {
  id: string;
  timestamp: number;
  level: BrowserAgentLogLevel;
  phase: 'thinking' | 'tool_call' | 'tool_result' | 'decision' | 'completion' | 'error';
  message: string;
  details?: {
    // Thinking phase
    reasoning?: string;

    // Tool call phase
    toolName?: string;
    toolArgs?: Record<string, string | number | boolean | null>;

    // Tool result phase
    toolResult?: string;
    toolError?: string;

    // Decision phase
    decision?: 'continue' | 'end';
    nextAction?: string;

    // Iteration info
    iteration?: number;
    maxIterations?: number;
  };
}

// =============================================================================
// Google Search Types
// =============================================================================

export type GoogleSearchType =
  | 'web'
  | 'news'
  | 'scholar'
  | 'images'
  | 'videos'
  | 'shopping'
  | 'books';

export type GoogleDateFilter =
  | 'anytime'
  | 'hour'
  | 'day'
  | 'week'
  | 'month'
  | 'year'
  | 'custom';

export type GoogleLanguageCode =
  | 'ko'
  | 'en'
  | 'ja'
  | 'zh-CN'
  | 'zh-TW'
  | 'es'
  | 'fr'
  | 'de'
  | 'ru'
  | 'ar'
  | 'pt'
  | 'it';

export type GoogleRegionCode =
  | 'KR'
  | 'US'
  | 'GB'
  | 'JP'
  | 'CN'
  | 'DE'
  | 'FR'
  | 'ES'
  | 'IT'
  | 'CA'
  | 'AU';

export type GoogleFileType =
  | 'pdf'
  | 'doc'
  | 'docx'
  | 'xls'
  | 'xlsx'
  | 'ppt'
  | 'pptx'
  | 'txt'
  | 'rtf'
  | 'odt'
  | 'ods'
  | 'odp';

export type GoogleSortBy = 'relevance' | 'date';

export interface GoogleSearchOptions {
  query: string;
  type?: GoogleSearchType;
  dateFilter?: GoogleDateFilter;
  dateStart?: string;
  dateEnd?: string;
  site?: string;
  fileType?: GoogleFileType;
  language?: GoogleLanguageCode;
  region?: GoogleRegionCode;
  exactPhrase?: string;
  excludeWords?: string[];
  orWords?: string[];
  sortBy?: GoogleSortBy;
  maxResults?: number;
  safeSearch?: 'off' | 'moderate' | 'strict';
}

export interface GoogleExtractResultsOptions {
  maxResults?: number;
  detailed?: boolean;
  captureScreenshot?: boolean;
}

export interface GoogleVisitResultOptions {
  rank: number;
  extractType?: 'text' | 'structured' | 'markdown' | 'summary';
  maxWaitTime?: number;
  captureScreenshot?: boolean;
  waitForJs?: boolean;
}

export interface GoogleSearchResultItem {
  rank: number;
  title: string;
  url: string;
  displayUrl: string;
  snippet: string;
  date?: string;
  source?: string;
  thumbnail?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface GoogleSearchResult {
  query: string;
  type: GoogleSearchType;
  options: GoogleSearchOptions;
  results: GoogleSearchResultItem[];
  totalResults: number;
  searchTime: number;
  relatedSearches?: string[];
  nextPageToken?: string;
}

export interface GoogleVisitResult {
  url: string;
  title: string;
  content: string;
  contentType: 'text' | 'structured' | 'markdown' | 'summary';
  metadata?: {
    author?: string;
    publishDate?: string;
    modifiedDate?: string;
    language?: string;
    description?: string;
    keywords?: string[];
  };
  screenshotPath?: string;
  visitTime: number;
}

// =============================================================================
// Browser Agent Configuration Types
// =============================================================================

/**
 * Browser Agent LLM 설정
 */
export interface BrowserAgentLLMConfig {
  maxTokens: number;
  temperature: number;
  topP: number;
  maxIterations: number;
}

/**
 * Browser 채팅 폰트 설정
 */
export interface BrowserChatFontConfig {
  fontFamily: string;
  fontSize: number; // px 단위
}
