/**
 * Browser Control Tools 타입 정의
 * OpenAI Operator 수준의 브라우저 제어 기능
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Bounding Box (요소 위치 및 크기)
 */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Interactive Element Role (접근성 트리 기반)
 */
export type InteractiveElementRole =
  | 'button'
  | 'link'
  | 'textbox'
  | 'searchbox'
  | 'checkbox'
  | 'radio'
  | 'combobox'
  | 'listbox'
  | 'menuitem'
  | 'tab'
  | 'switch'
  | 'slider'
  | 'spinbutton'
  | 'progressbar'
  | 'scrollbar'
  | 'dialog'
  | 'alert'
  | 'navigation'
  | 'form'
  | 'heading'
  | 'article'
  | 'section'
  | 'generic';

/**
 * Interactive Element (접근성 트리 분석 결과)
 */
export interface InteractiveElement {
  /** AI Element ID (예: "ai-element-1") */
  id: string;

  /** Semantic Role */
  role: InteractiveElementRole;

  /** Element Label (버튼 텍스트, 링크 텍스트 등) */
  label: string;

  /** 현재 값 (input, select 등) */
  value?: string;

  /** Placeholder 텍스트 */
  placeholder?: string;

  /** ARIA Label */
  ariaLabel?: string;

  /** ARIA Description */
  ariaDescription?: string;

  /** 요소 위치 및 크기 */
  position: BoundingBox;

  /** 화면에 보이는지 여부 */
  isVisible: boolean;

  /** 활성화 여부 (disabled가 아닌지) */
  isEnabled: boolean;

  /** 읽기 전용 여부 */
  isReadonly: boolean;

  /** 필수 입력 여부 */
  isRequired?: boolean;

  /** 체크박스/라디오 체크 여부 */
  isChecked?: boolean;

  /** 컨텍스트 정보 */
  context?: {
    /** 부모 요소 설명 */
    parent?: string;

    /** 형제 요소들 */
    siblings?: string[];

    /** 폼 이름 (폼 내부 요소인 경우) */
    formName?: string;

    /** 섹션 이름 */
    sectionName?: string;
  };

  /** DOM 정보 (디버깅용) */
  domInfo?: {
    tagName: string;
    id?: string;
    className?: string;
    name?: string;
  };
}

// =============================================================================
// 1. Browser Navigation
// =============================================================================

export interface BrowserNavigateOptions {
  /** 이동할 URL (http/https 자동 추가) */
  url: string;

  /** 페이지 로딩 대기 시간 (ms, 기본값: 30000) */
  timeout?: number;

  /** 새 탭에서 열기 */
  openInNewTab?: boolean;
}

export interface BrowserNavigateResult {
  success: boolean;
  url: string;
  title?: string;
  loadTime?: number;
  error?: string;
}

// =============================================================================
// 2. Page Inspection Tools
// =============================================================================

/**
 * browser_get_page_content 옵션
 */
export interface BrowserGetPageContentOptions {
  /** 상세 정보 추출 여부 */
  includeMetadata?: boolean;

  /** 최대 콘텐츠 길이 (기본값: 무제한) */
  maxContentLength?: number;
}

/**
 * Page Content (Semantic Structure)
 */
export interface PageContent {
  /** 현재 URL */
  url: string;

  /** 페이지 제목 */
  title: string;

  /** 페이지 요약 (첫 몇 문단) */
  summary: string;

  /** 헤딩 구조 */
  headings: Array<{
    level: 1 | 2 | 3 | 4 | 5 | 6;
    text: string;
  }>;

  /** 페이지 구조 */
  structure: {
    sections: Array<{
      heading?: string;
      content: string;
      subsections?: Array<{
        heading?: string;
        content: string;
      }>;
    }>;
  };

  /** Interactive 요소 개수 */
  interactiveElementCounts: {
    buttons: number;
    links: number;
    inputs: number;
    forms: number;
    checkboxes: number;
    radios: number;
    selects: number;
  };

  /** 메타데이터 (includeMetadata=true일 때) */
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    language?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?: string;
  };
}

/**
 * browser_get_interactive_elements 옵션
 */
export interface BrowserGetInteractiveElementsOptions {
  /** 최대 반환 요소 수 (기본값: 50) */
  maxElements?: number;

  /** 특정 role만 필터링 */
  filterByRole?: InteractiveElementRole[];

  /** 보이는 요소만 */
  visibleOnly?: boolean;

  /** 활성화된 요소만 */
  enabledOnly?: boolean;
}

/**
 * browser_get_interactive_elements 결과
 */
export interface BrowserGetInteractiveElementsResult {
  elements: InteractiveElement[];
  totalCount: number;
  filteredCount: number;
}

/**
 * browser_search_elements 옵션
 */
export interface BrowserSearchElementsOptions {
  /** 자연어 검색 쿼리 */
  query: string;

  /** 최대 결과 수 (기본값: 10) */
  maxResults?: number;

  /** 최소 점수 (0-1, 기본값: 0.5) */
  minScore?: number;
}

/**
 * Element Search Result
 */
export interface ElementSearchResult {
  /** 검색 쿼리 */
  query: string;

  /** 매칭된 요소들 */
  matches: Array<{
    elementId: string;
    role: InteractiveElementRole;
    label: string;
    score: number; // 0-1, relevance score
    reason: string; // 왜 매칭되었는지
    context?: string;
  }>;

  /** 총 매칭 수 */
  totalMatches: number;

  /** 검색 소요 시간 (ms) */
  searchTime: number;
}

/**
 * browser_get_selected_text 결과
 */
export interface BrowserGetSelectedTextResult {
  hasSelection: boolean;
  selectedText?: string;
  selectionLength?: number;
}

/**
 * browser_take_screenshot 옵션
 */
export interface BrowserTakeScreenshotOptions {
  /** 전체 페이지 스크린샷 (기본값: false, 현재 뷰포트만) */
  fullPage?: boolean;

  /** 저장 경로 (기본값: userData/screenshots) */
  savePath?: string;

  /** Base64 반환 여부 */
  returnBase64?: boolean;

  /** 텍스트 미리보기 포함 여부 */
  includeTextPreview?: boolean;
}

/**
 * browser_take_screenshot 결과
 */
export interface BrowserTakeScreenshotResult {
  success: boolean;
  screenshotPath: string;
  screenshotBase64?: string;
  textPreview?: string;
  dimensions?: {
    width: number;
    height: number;
  };
  fileSize?: number;
}

// =============================================================================
// 3. Page Interaction Tools
// =============================================================================

/**
 * browser_click_element 옵션
 */
export interface BrowserClickElementOptions {
  /** Element ID (from browser_get_interactive_elements or browser_search_elements) */
  element_id: string;

  /** 클릭 전 스크롤하여 뷰포트에 표시 */
  scrollIntoView?: boolean;

  /** 클릭 후 대기 시간 (ms) */
  waitAfterClick?: number;
}

/**
 * browser_click_element 결과
 */
export interface BrowserClickElementResult {
  success: boolean;
  elementId: string;
  elementLabel?: string;
  elementRole?: string;
  message: string;
  error?: string;
}

/**
 * browser_type_text 옵션
 */
export interface BrowserTypeTextOptions {
  /** Element ID */
  element_id: string;

  /** 입력할 텍스트 */
  text: string;

  /** 입력 전 기존 값 지우기 */
  clearBefore?: boolean;

  /** Enter 키 누르기 (폼 제출) */
  pressEnter?: boolean;

  /** 입력 속도 (ms per character, 기본값: 0) */
  typingDelay?: number;
}

/**
 * browser_type_text 결과
 */
export interface BrowserTypeTextResult {
  success: boolean;
  elementId: string;
  typedText: string;
  previousValue?: string;
  currentValue?: string;
  message: string;
  error?: string;
}

/**
 * browser_scroll 옵션
 */
export interface BrowserScrollOptions {
  /** 스크롤 방향 */
  direction: 'up' | 'down' | 'left' | 'right';

  /** 스크롤 양 (픽셀, 기본값: 500) */
  amount?: number;

  /** 특정 요소로 스크롤 */
  toElementId?: string;

  /** 부드러운 스크롤 */
  smooth?: boolean;
}

/**
 * browser_scroll 결과
 */
export interface BrowserScrollResult {
  success: boolean;
  scrolledAmount: number;
  currentScrollPosition: {
    x: number;
    y: number;
  };
  message: string;
}

/**
 * browser_wait_for_element 옵션
 */
export interface BrowserWaitForElementOptions {
  /** CSS Selector */
  selector: string;

  /** 대기 시간 (ms, 기본값: 5000) */
  timeout_ms?: number;

  /** 보이는 상태까지 대기 */
  waitForVisible?: boolean;

  /** 활성화 상태까지 대기 */
  waitForEnabled?: boolean;
}

/**
 * browser_wait_for_element 결과
 */
export interface BrowserWaitForElementResult {
  success: boolean;
  selector: string;
  found: boolean;
  waitTime: number;
  elementInfo?: {
    tagName: string;
    id?: string;
    className?: string;
    text?: string;
  };
  message: string;
}

// =============================================================================
// 4. Tab Management
// =============================================================================

/**
 * Browser Tab 정보
 */
export interface BrowserTab {
  /** Tab ID */
  id: string;

  /** 페이지 제목 */
  title: string;

  /** 페이지 URL */
  url: string;

  /** 활성 탭 여부 */
  isActive: boolean;

  /** Favicon URL */
  favicon?: string;

  /** 로딩 상태 */
  loadingState: 'loading' | 'complete' | 'error';

  /** 탭 생성 시간 */
  createdAt?: number;

  /** 마지막 활성화 시간 */
  lastActivatedAt?: number;
}

/**
 * browser_list_tabs 결과
 */
export interface BrowserListTabsResult {
  tabs: BrowserTab[];
  activeTabId: string;
  totalTabs: number;
}

/**
 * browser_create_tab 옵션
 */
export interface BrowserCreateTabOptions {
  /** 새 탭에서 열 URL (기본값: Google) */
  url?: string;

  /** 생성 후 즉시 활성화 */
  activate?: boolean;
}

/**
 * browser_create_tab 결과
 */
export interface BrowserCreateTabResult {
  success: boolean;
  tabId: string;
  url: string;
  message: string;
}

/**
 * browser_switch_tab 옵션
 */
export interface BrowserSwitchTabOptions {
  /** Tab ID */
  tabId: string;
}

/**
 * browser_switch_tab 결과
 */
export interface BrowserSwitchTabResult {
  success: boolean;
  previousTabId: string;
  currentTabId: string;
  currentUrl: string;
  message: string;
}

/**
 * browser_close_tab 옵션
 */
export interface BrowserCloseTabOptions {
  /** Tab ID */
  tabId: string;
}

/**
 * browser_close_tab 결과
 */
export interface BrowserCloseTabResult {
  success: boolean;
  closedTabId: string;
  remainingTabs: number;
  newActiveTabId?: string;
  message: string;
}

// =============================================================================
// Browser Control Tools Metadata
// =============================================================================

/**
 * Browser Control Tools 정의
 */
export const BROWSER_CONTROL_TOOLS = {
  // Navigation
  browser_navigate: {
    name: 'browser_navigate',
    description: 'URL로 직접 이동합니다. "go to", "visit", "open", "접속" 요청 시 사용하세요.',
    parameters: {
      url: {
        type: 'string',
        description: '이동할 URL (http/https 자동 추가)',
        required: true,
      },
      timeout: {
        type: 'number',
        description: '페이지 로딩 최대 대기 시간 (ms)',
        required: false,
        default: 30000,
      },
      openInNewTab: {
        type: 'boolean',
        description: '새 탭에서 열기',
        required: false,
        default: false,
      },
    },
    category: 'navigation',
  },

  // Page Inspection
  browser_get_page_content: {
    name: 'browser_get_page_content',
    description:
      '현재 페이지의 semantic structure를 분석합니다. URL, 제목, 요약, 헤딩 구조, 섹션 정보를 반환합니다.',
    parameters: {
      includeMetadata: {
        type: 'boolean',
        description: '메타데이터 포함 여부',
        required: false,
        default: false,
      },
      maxContentLength: {
        type: 'number',
        description: '최대 콘텐츠 길이',
        required: false,
      },
    },
    category: 'inspection',
  },

  browser_get_interactive_elements: {
    name: 'browser_get_interactive_elements',
    description:
      '페이지의 모든 interactive 요소를 Accessibility Tree 기반으로 분석하여 반환합니다. Role, label, context 포함.',
    parameters: {
      maxElements: {
        type: 'number',
        description: '최대 반환 요소 수',
        required: false,
        default: 50,
      },
      filterByRole: {
        type: 'array',
        description: '특정 role만 필터링 (button, link, textbox 등)',
        required: false,
      },
      visibleOnly: {
        type: 'boolean',
        description: '보이는 요소만',
        required: false,
        default: true,
      },
      enabledOnly: {
        type: 'boolean',
        description: '활성화된 요소만',
        required: false,
        default: true,
      },
    },
    category: 'inspection',
  },

  browser_search_elements: {
    name: 'browser_search_elements',
    description:
      '자연어로 요소를 검색합니다. "search button", "email input", "login form" 같은 쿼리 사용 가능.',
    parameters: {
      query: {
        type: 'string',
        description: '자연어 검색 쿼리',
        required: true,
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 수',
        required: false,
        default: 10,
      },
      minScore: {
        type: 'number',
        description: '최소 관련성 점수 (0-1)',
        required: false,
        default: 0.5,
      },
    },
    category: 'inspection',
  },

  browser_get_selected_text: {
    name: 'browser_get_selected_text',
    description: '사용자가 선택/하이라이트한 텍스트를 가져옵니다.',
    parameters: {},
    category: 'inspection',
  },

  browser_take_screenshot: {
    name: 'browser_take_screenshot',
    description:
      '현재 페이지의 스크린샷을 캡처합니다. 전체 페이지 또는 현재 뷰포트만 선택 가능.',
    parameters: {
      fullPage: {
        type: 'boolean',
        description: '전체 페이지 스크린샷',
        required: false,
        default: false,
      },
      savePath: {
        type: 'string',
        description: '저장 경로',
        required: false,
      },
      returnBase64: {
        type: 'boolean',
        description: 'Base64 반환 여부',
        required: false,
        default: false,
      },
      includeTextPreview: {
        type: 'boolean',
        description: '텍스트 미리보기 포함',
        required: false,
        default: true,
      },
    },
    category: 'inspection',
  },

  // Page Interaction
  browser_click_element: {
    name: 'browser_click_element',
    description:
      'Element ID로 요소를 클릭합니다. 자동으로 가시성, 활성화 상태, 스크롤을 검증합니다.',
    parameters: {
      element_id: {
        type: 'string',
        description: 'AI Element ID (예: "ai-element-5")',
        required: true,
      },
      scrollIntoView: {
        type: 'boolean',
        description: '클릭 전 스크롤',
        required: false,
        default: true,
      },
      waitAfterClick: {
        type: 'number',
        description: '클릭 후 대기 시간 (ms)',
        required: false,
        default: 500,
      },
    },
    category: 'interaction',
  },

  browser_type_text: {
    name: 'browser_type_text',
    description:
      'Input/textarea에 텍스트를 입력합니다. React/Vue 앱을 위한 이벤트 트리거링 포함.',
    parameters: {
      element_id: {
        type: 'string',
        description: 'AI Element ID',
        required: true,
      },
      text: {
        type: 'string',
        description: '입력할 텍스트',
        required: true,
      },
      clearBefore: {
        type: 'boolean',
        description: '입력 전 기존 값 지우기',
        required: false,
        default: true,
      },
      pressEnter: {
        type: 'boolean',
        description: 'Enter 키 누르기 (폼 제출)',
        required: false,
        default: false,
      },
      typingDelay: {
        type: 'number',
        description: '입력 속도 (ms per character)',
        required: false,
        default: 0,
      },
    },
    category: 'interaction',
  },

  browser_scroll: {
    name: 'browser_scroll',
    description: '페이지를 스크롤합니다. 방향과 양을 지정할 수 있습니다.',
    parameters: {
      direction: {
        type: 'string',
        description: '스크롤 방향 (up, down, left, right)',
        required: true,
      },
      amount: {
        type: 'number',
        description: '스크롤 양 (픽셀)',
        required: false,
        default: 500,
      },
      toElementId: {
        type: 'string',
        description: '특정 요소로 스크롤',
        required: false,
      },
      smooth: {
        type: 'boolean',
        description: '부드러운 스크롤',
        required: false,
        default: true,
      },
    },
    category: 'interaction',
  },

  browser_wait_for_element: {
    name: 'browser_wait_for_element',
    description: 'CSS Selector로 요소가 나타날 때까지 대기합니다. 동적 콘텐츠 로딩에 유용.',
    parameters: {
      selector: {
        type: 'string',
        description: 'CSS Selector',
        required: true,
      },
      timeout_ms: {
        type: 'number',
        description: '최대 대기 시간 (ms)',
        required: false,
        default: 5000,
      },
      waitForVisible: {
        type: 'boolean',
        description: '보이는 상태까지 대기',
        required: false,
        default: true,
      },
      waitForEnabled: {
        type: 'boolean',
        description: '활성화 상태까지 대기',
        required: false,
        default: false,
      },
    },
    category: 'interaction',
  },

  // Tab Management
  browser_list_tabs: {
    name: 'browser_list_tabs',
    description: '모든 열린 탭의 목록을 가져옵니다. ID, 제목, URL, 활성 상태 포함.',
    parameters: {},
    category: 'tabs',
  },

  browser_create_tab: {
    name: 'browser_create_tab',
    description: '새 탭을 생성합니다. URL을 지정하거나 빈 탭 생성 가능.',
    parameters: {
      url: {
        type: 'string',
        description: '새 탭에서 열 URL',
        required: false,
      },
      activate: {
        type: 'boolean',
        description: '생성 후 즉시 활성화',
        required: false,
        default: true,
      },
    },
    category: 'tabs',
  },

  browser_switch_tab: {
    name: 'browser_switch_tab',
    description: 'Tab ID로 다른 탭으로 전환합니다.',
    parameters: {
      tabId: {
        type: 'string',
        description: 'Tab ID (browser_list_tabs에서 확인)',
        required: true,
      },
    },
    category: 'tabs',
  },

  browser_close_tab: {
    name: 'browser_close_tab',
    description: 'Tab ID로 탭을 닫습니다. 마지막 탭은 닫을 수 없습니다.',
    parameters: {
      tabId: {
        type: 'string',
        description: 'Tab ID',
        required: true,
      },
    },
    category: 'tabs',
  },
} as const;

/**
 * Browser Control Tool 이름 타입
 */
export type BrowserControlToolName = keyof typeof BROWSER_CONTROL_TOOLS;

/**
 * Browser Control Tool 카테고리
 */
export type BrowserControlToolCategory = 'navigation' | 'inspection' | 'interaction' | 'tabs';

/**
 * Browser Control Tools 목록 (배열)
 */
export const BROWSER_CONTROL_TOOLS_LIST = Object.values(BROWSER_CONTROL_TOOLS);

/**
 * 카테고리별 Browser Control Tools
 */
export const BROWSER_CONTROL_TOOLS_BY_CATEGORY = {
  navigation: BROWSER_CONTROL_TOOLS_LIST.filter((tool) => tool.category === 'navigation'),
  inspection: BROWSER_CONTROL_TOOLS_LIST.filter((tool) => tool.category === 'inspection'),
  interaction: BROWSER_CONTROL_TOOLS_LIST.filter((tool) => tool.category === 'interaction'),
  tabs: BROWSER_CONTROL_TOOLS_LIST.filter((tool) => tool.category === 'tabs'),
};
