/**
 * Browser Agent Error 및 Recovery Strategy 타입 정의
 */

// =============================================================================
// Error Types
// =============================================================================

/**
 * Browser Error 타입
 */
export type BrowserErrorType =
  // Navigation Errors
  | 'navigation_failed'
  | 'navigation_timeout'
  | 'invalid_url'
  | 'connection_refused'
  | 'dns_failed'
  | 'ssl_error'
  // Element Errors
  | 'element_not_found'
  | 'element_not_visible'
  | 'element_not_clickable'
  | 'element_disabled'
  | 'element_readonly'
  | 'element_obscured'
  | 'invalid_element_id'
  // Interaction Errors
  | 'click_failed'
  | 'type_failed'
  | 'scroll_failed'
  | 'coordinate_out_of_bounds'
  | 'marker_not_found'
  // Page Errors
  | 'page_crash'
  | 'page_load_timeout'
  | 'page_not_found'
  | 'javascript_error'
  | 'render_error'
  // Tab Errors
  | 'tab_not_found'
  | 'tab_closed'
  | 'cannot_close_last_tab'
  | 'tab_limit_reached'
  // Screenshot Errors
  | 'screenshot_failed'
  | 'screenshot_timeout'
  | 'screenshot_too_large'
  // Search Errors
  | 'search_failed'
  | 'search_timeout'
  | 'no_search_results'
  | 'search_rate_limit'
  | 'captcha_detected'
  // Network Errors
  | 'network_error'
  | 'offline'
  | 'proxy_error'
  // General Errors
  | 'timeout'
  | 'permission_denied'
  | 'invalid_parameters'
  | 'unknown';

/**
 * Browser Error 인터페이스
 */
export interface BrowserError {
  /** Error Type */
  type: BrowserErrorType;

  /** Error Message */
  message: string;

  /** Error Context */
  context: {
    /** 발생한 URL */
    url?: string;

    /** 발생한 Tool */
    tool?: string;

    /** Element ID (요소 관련 에러) */
    elementId?: string;

    /** Coordinates (좌표 관련 에러) */
    coordinates?: { x: number; y: number };

    /** Tab ID (탭 관련 에러) */
    tabId?: string;

    /** Marker Label (마커 관련 에러) */
    markerLabel?: string;

    /** Additional Context */
    additionalInfo?: Record<string, any>;
  };

  /** Timestamp */
  timestamp: number;

  /** Recoverable 여부 */
  recoverable: boolean;

  /** Suggested Action (해결 방법 제안) */
  suggestedAction?: string;

  /** Stack Trace (디버깅용) */
  stackTrace?: string;
}

// =============================================================================
// Error Recovery Strategy
// =============================================================================

/**
 * Fallback Action
 */
export interface FallbackAction {
  /** Tool Name */
  tool: string;

  /** Tool Arguments */
  arguments: Record<string, any>;

  /** Description */
  description: string;

  /** Expected Result */
  expectedResult?: string;

  /** Priority (낮을수록 먼저 시도) */
  priority: number;
}

/**
 * Error Recovery Strategy
 */
export interface ErrorRecoveryStrategy {
  /** Error Type */
  errorType: BrowserErrorType;

  /** 현재 시도 횟수 */
  currentAttempt: number;

  /** 최대 시도 횟수 */
  maxAttempts: number;

  /** Fallback Actions */
  fallbackActions: FallbackAction[];

  /** Last Error */
  lastError?: BrowserError;

  /** Recovery History */
  recoveryHistory: Array<{
    attempt: number;
    action: FallbackAction;
    success: boolean;
    timestamp: number;
    error?: string;
  }>;
}

// =============================================================================
// Predefined Recovery Strategies
// =============================================================================

/**
 * Navigation Failed Recovery
 */
export const NAVIGATION_FAILED_RECOVERY: Omit<
  ErrorRecoveryStrategy,
  'currentAttempt' | 'lastError' | 'recoveryHistory'
> = {
  errorType: 'navigation_failed',
  maxAttempts: 3,
  fallbackActions: [
    {
      tool: 'browser_navigate',
      arguments: { url: '${url}', timeout: 60000 },
      description: 'Retry navigation with longer timeout',
      priority: 1,
    },
    {
      tool: 'browser_create_tab',
      arguments: { url: '${url}', activate: true },
      description: 'Try opening in new tab',
      priority: 2,
    },
    {
      tool: 'google_search',
      arguments: { query: '${url}' },
      description: 'Search for the URL on Google',
      priority: 3,
    },
  ],
};

/**
 * Element Not Found Recovery
 */
export const ELEMENT_NOT_FOUND_RECOVERY: Omit<
  ErrorRecoveryStrategy,
  'currentAttempt' | 'lastError' | 'recoveryHistory'
> = {
  errorType: 'element_not_found',
  maxAttempts: 4,
  fallbackActions: [
    {
      tool: 'browser_scroll',
      arguments: { direction: 'down', amount: 500 },
      description: 'Scroll down to load more content',
      priority: 1,
    },
    {
      tool: 'browser_wait_for_element',
      arguments: { selector: '${selector}', timeout_ms: 5000 },
      description: 'Wait for element to appear',
      priority: 2,
    },
    {
      tool: 'browser_get_interactive_elements',
      arguments: { maxElements: 50 },
      description: 'Get all interactive elements and search manually',
      priority: 3,
    },
    {
      tool: 'browser_capture_annotated_screenshot',
      arguments: { max_markers: 30, include_overlay: true },
      description: 'Capture annotated screenshot for visual identification',
      priority: 4,
    },
  ],
};

/**
 * Element Not Clickable Recovery
 */
export const ELEMENT_NOT_CLICKABLE_RECOVERY: Omit<
  ErrorRecoveryStrategy,
  'currentAttempt' | 'lastError' | 'recoveryHistory'
> = {
  errorType: 'element_not_clickable',
  maxAttempts: 3,
  fallbackActions: [
    {
      tool: 'browser_scroll',
      arguments: { toElementId: '${element_id}', smooth: true },
      description: 'Scroll to element',
      priority: 1,
    },
    {
      tool: 'browser_get_clickable_coordinate',
      arguments: { element_id: '${element_id}', method: 'center' },
      description: 'Get clickable coordinate and use coordinate click',
      expectedResult: 'Then use browser_click_coordinate',
      priority: 2,
    },
    {
      tool: 'browser_capture_annotated_screenshot',
      arguments: { max_markers: 30 },
      description: 'Capture screenshot to find marker label',
      expectedResult: 'Then use browser_click_marker',
      priority: 3,
    },
  ],
};

/**
 * Search Timeout Recovery
 */
export const SEARCH_TIMEOUT_RECOVERY: Omit<
  ErrorRecoveryStrategy,
  'currentAttempt' | 'lastError' | 'recoveryHistory'
> = {
  errorType: 'search_timeout',
  maxAttempts: 2,
  fallbackActions: [
    {
      tool: 'browser_navigate',
      arguments: { url: '${url}' },
      description: 'Navigate directly to URL instead of searching',
      priority: 1,
    },
    {
      tool: 'google_search',
      arguments: { query: '${query}', maxResults: 5 },
      description: 'Try simpler search with fewer results',
      priority: 2,
    },
  ],
};

/**
 * Page Crash Recovery
 */
export const PAGE_CRASH_RECOVERY: Omit<
  ErrorRecoveryStrategy,
  'currentAttempt' | 'lastError' | 'recoveryHistory'
> = {
  errorType: 'page_crash',
  maxAttempts: 2,
  fallbackActions: [
    {
      tool: 'browser_navigate',
      arguments: { url: '${url}' },
      description: 'Reload the page',
      priority: 1,
    },
    {
      tool: 'browser_create_tab',
      arguments: { url: '${url}', activate: true },
      description: 'Open in new tab',
      priority: 2,
    },
  ],
};

/**
 * Screenshot Failed Recovery
 */
export const SCREENSHOT_FAILED_RECOVERY: Omit<
  ErrorRecoveryStrategy,
  'currentAttempt' | 'lastError' | 'recoveryHistory'
> = {
  errorType: 'screenshot_failed',
  maxAttempts: 3,
  fallbackActions: [
    {
      tool: 'browser_take_screenshot',
      arguments: { fullPage: false, returnBase64: false },
      description: 'Try viewport-only screenshot without base64',
      priority: 1,
    },
    {
      tool: 'browser_get_page_content',
      arguments: { includeMetadata: true },
      description: 'Get text content instead of screenshot',
      priority: 2,
    },
    {
      tool: 'browser_navigate',
      arguments: { url: '${url}' },
      description: 'Reload page and retry',
      priority: 3,
    },
  ],
};

/**
 * All Predefined Recovery Strategies
 */
export const PREDEFINED_RECOVERY_STRATEGIES = {
  navigation_failed: NAVIGATION_FAILED_RECOVERY,
  element_not_found: ELEMENT_NOT_FOUND_RECOVERY,
  element_not_clickable: ELEMENT_NOT_CLICKABLE_RECOVERY,
  search_timeout: SEARCH_TIMEOUT_RECOVERY,
  page_crash: PAGE_CRASH_RECOVERY,
  screenshot_failed: SCREENSHOT_FAILED_RECOVERY,
} as const;

// =============================================================================
// Error Utilities
// =============================================================================

/**
 * Create Browser Error
 */
export function createBrowserError(
  type: BrowserErrorType,
  message: string,
  context: BrowserError['context'] = {},
  recoverable = true,
  suggestedAction?: string
): BrowserError {
  return {
    type,
    message,
    context,
    timestamp: Date.now(),
    recoverable,
    suggestedAction,
  };
}

/**
 * Get Recovery Strategy for Error Type
 */
export function getRecoveryStrategy(errorType: BrowserErrorType): ErrorRecoveryStrategy | null {
  const predefined =
    PREDEFINED_RECOVERY_STRATEGIES[errorType as keyof typeof PREDEFINED_RECOVERY_STRATEGIES];

  if (!predefined) {
    return null;
  }

  return {
    ...predefined,
    currentAttempt: 0,
    recoveryHistory: [],
  };
}

/**
 * Is Error Recoverable
 */
export function isErrorRecoverable(error: BrowserError): boolean {
  return error.recoverable && error.type !== 'unknown';
}

/**
 * Format Error Message
 */
export function formatErrorMessage(error: BrowserError): string {
  let message = `[${error.type}] ${error.message}`;

  if (error.context.url) {
    message += `\n  URL: ${error.context.url}`;
  }

  if (error.context.tool) {
    message += `\n  Tool: ${error.context.tool}`;
  }

  if (error.context.elementId) {
    message += `\n  Element: ${error.context.elementId}`;
  }

  if (error.suggestedAction) {
    message += `\n  💡 Suggestion: ${error.suggestedAction}`;
  }

  return message;
}
