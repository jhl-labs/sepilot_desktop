/**
 * Browser Agent 실행 과정 가시성을 위한 타입 정의
 */

export type BrowserAgentLogLevel = 'info' | 'success' | 'warning' | 'error' | 'thinking';

// =============================================================================
// Google Search Built-in Tools
// =============================================================================

/**
 * Google 검색 타입
 */
export type GoogleSearchType =
  | 'web' // 일반 웹 검색
  | 'news' // 뉴스 검색
  | 'scholar' // 학술 검색 (Google Scholar)
  | 'images' // 이미지 검색
  | 'videos' // 비디오 검색
  | 'shopping' // 쇼핑 검색
  | 'books'; // 도서 검색

/**
 * Google 검색 날짜 필터
 */
export type GoogleDateFilter =
  | 'anytime' // 전체 기간
  | 'hour' // 1시간 이내
  | 'day' // 24시간 이내
  | 'week' // 1주일 이내
  | 'month' // 1개월 이내
  | 'year' // 1년 이내
  | 'custom'; // 사용자 지정 (dateStart, dateEnd 필요)

/**
 * Google 검색 언어 코드 (주요 언어만)
 */
export type GoogleLanguageCode =
  | 'ko' // 한국어
  | 'en' // 영어
  | 'ja' // 일본어
  | 'zh-CN' // 중국어 (간체)
  | 'zh-TW' // 중국어 (번체)
  | 'es' // 스페인어
  | 'fr' // 프랑스어
  | 'de' // 독일어
  | 'ru' // 러시아어
  | 'ar' // 아랍어
  | 'pt' // 포르투갈어
  | 'it'; // 이탈리아어

/**
 * Google 검색 지역 코드 (주요 국가만)
 */
export type GoogleRegionCode =
  | 'KR' // 대한민국
  | 'US' // 미국
  | 'GB' // 영국
  | 'JP' // 일본
  | 'CN' // 중국
  | 'DE' // 독일
  | 'FR' // 프랑스
  | 'ES' // 스페인
  | 'IT' // 이탈리아
  | 'CA' // 캐나다
  | 'AU'; // 호주

/**
 * Google 검색 파일 타입
 */
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

/**
 * Google 검색 정렬 방식
 */
export type GoogleSortBy = 'relevance' | 'date';

/**
 * Google 검색 옵션
 */
export interface GoogleSearchOptions {
  /** 검색어 */
  query: string;

  /** 검색 타입 (기본값: 'web') */
  type?: GoogleSearchType;

  /** 날짜 필터 (기본값: 'anytime') */
  dateFilter?: GoogleDateFilter;

  /** 사용자 지정 날짜 범위 시작 (dateFilter='custom'일 때) */
  dateStart?: string; // YYYY-MM-DD

  /** 사용자 지정 날짜 범위 종료 (dateFilter='custom'일 때) */
  dateEnd?: string; // YYYY-MM-DD

  /** 특정 사이트 내 검색 (예: 'example.com') */
  site?: string;

  /** 파일 타입 필터 */
  fileType?: GoogleFileType;

  /** 언어 필터 */
  language?: GoogleLanguageCode;

  /** 지역 필터 */
  region?: GoogleRegionCode;

  /** 정확한 문구 검색 */
  exactPhrase?: string;

  /** 제외할 단어 */
  excludeWords?: string[];

  /** 포함해야 할 단어 중 하나 (OR 연산) */
  orWords?: string[];

  /** 정렬 방식 (기본값: 'relevance') */
  sortBy?: GoogleSortBy;

  /** 결과 개수 제한 (기본값: 10, 최대: 100) */
  maxResults?: number;

  /** 안전 검색 필터 (기본값: 'off') */
  safeSearch?: 'off' | 'moderate' | 'strict';
}

/**
 * Google 검색 결과 항목
 */
export interface GoogleSearchResultItem {
  /** 검색 결과 순위 */
  rank: number;

  /** 제목 */
  title: string;

  /** URL */
  url: string;

  /** 표시되는 URL (짧은 형태) */
  displayUrl: string;

  /** 스니펫 (요약 텍스트) */
  snippet: string;

  /** 날짜 정보 (뉴스 등에서) */
  date?: string;

  /** 출처 (뉴스 등에서) */
  source?: string;

  /** 썸네일 이미지 URL (이미지 검색 등에서) */
  thumbnail?: string;

  /** 추가 메타데이터 */
  metadata?: Record<string, string | number | boolean>;
}

/**
 * Google 검색 결과
 */
export interface GoogleSearchResult {
  /** 검색어 */
  query: string;

  /** 검색 타입 */
  type: GoogleSearchType;

  /** 검색 옵션 */
  options: GoogleSearchOptions;

  /** 검색 결과 항목들 */
  results: GoogleSearchResultItem[];

  /** 총 결과 개수 (근사값) */
  totalResults: number;

  /** 검색 소요 시간 (초) */
  searchTime: number;

  /** 관련 검색어 */
  relatedSearches?: string[];

  /** 다음 페이지 토큰 (페이지네이션용) */
  nextPageToken?: string;
}

/**
 * Google 검색 결과 추출 옵션
 */
export interface GoogleExtractResultsOptions {
  /** 추출할 결과 개수 (기본값: 10) */
  maxResults?: number;

  /** 상세 정보 추출 여부 (느리지만 더 많은 정보) */
  detailed?: boolean;

  /** 스크린샷 캡처 여부 */
  captureScreenshot?: boolean;
}

/**
 * Google 검색 결과 방문 옵션
 */
export interface GoogleVisitResultOptions {
  /** 방문할 검색 결과 순위 (1부터 시작) */
  rank: number;

  /** 페이지에서 추출할 정보 타입 */
  extractType?: 'text' | 'structured' | 'markdown' | 'summary';

  /** 최대 대기 시간 (초, 기본값: 10) */
  maxWaitTime?: number;

  /** 스크린샷 캡처 여부 */
  captureScreenshot?: boolean;

  /** JavaScript 실행 대기 여부 */
  waitForJs?: boolean;
}

/**
 * Google 검색 결과 방문 결과
 */
export interface GoogleVisitResult {
  /** 방문한 페이지 URL */
  url: string;

  /** 페이지 제목 */
  title: string;

  /** 추출된 콘텐츠 */
  content: string;

  /** 콘텐츠 타입 */
  contentType: 'text' | 'structured' | 'markdown' | 'summary';

  /** 메타데이터 */
  metadata?: {
    /** 작성자 */
    author?: string;

    /** 게시 날짜 */
    publishDate?: string;

    /** 수정 날짜 */
    modifiedDate?: string;

    /** 언어 */
    language?: string;

    /** 설명 */
    description?: string;

    /** 키워드 */
    keywords?: string[];
  };

  /** 스크린샷 경로 (캡처했을 경우) */
  screenshotPath?: string;

  /** 방문 소요 시간 (초) */
  visitTime: number;
}

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

export interface BrowserAgentState {
  isRunning: boolean;
  currentIteration: number;
  maxIterations: number;
  logs: BrowserAgentLogEntry[];
}

// =============================================================================
// Google Search Built-in Tools Metadata
// =============================================================================

/**
 * Google 검색 도구 정의
 *
 * 이 도구들은 Browser Agent에 빌트인으로 포함되며,
 * LLM이 고급 검색 기능을 활용할 수 있게 합니다.
 */
export const GOOGLE_SEARCH_TOOLS = {
  /**
   * 기본 웹 검색
   * - 가장 일반적인 검색
   * - 모든 필터 옵션 지원
   */
  google_search: {
    name: 'google_search',
    description:
      'Google에서 웹 검색을 수행합니다. 날짜, 사이트, 파일 타입, 언어 등 다양한 필터를 지원합니다.',
    parameters: {
      query: {
        type: 'string',
        description: '검색할 키워드 또는 문구',
        required: true,
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터 (anytime, hour, day, week, month, year, custom)',
        required: false,
        default: 'anytime',
      },
      dateStart: {
        type: 'string',
        description: '사용자 지정 날짜 시작 (YYYY-MM-DD, dateFilter=custom일 때)',
        required: false,
      },
      dateEnd: {
        type: 'string',
        description: '사용자 지정 날짜 종료 (YYYY-MM-DD, dateFilter=custom일 때)',
        required: false,
      },
      site: {
        type: 'string',
        description: '특정 사이트 내 검색 (예: wikipedia.org)',
        required: false,
      },
      fileType: {
        type: 'string',
        description: '파일 타입 필터 (pdf, doc, xls, ppt 등)',
        required: false,
      },
      language: {
        type: 'string',
        description: '언어 필터 (ko, en, ja 등)',
        required: false,
      },
      region: {
        type: 'string',
        description: '지역 필터 (KR, US, JP 등)',
        required: false,
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수 (1-100)',
        required: false,
        default: 10,
      },
    },
    category: 'search',
  },

  /**
   * 뉴스 검색
   * - 최신 뉴스 기사 검색
   * - 날짜 필터가 특히 유용
   */
  google_search_news: {
    name: 'google_search_news',
    description:
      'Google 뉴스에서 최신 기사를 검색합니다. 날짜 필터를 통해 특정 기간의 뉴스를 찾을 수 있습니다.',
    parameters: {
      query: {
        type: 'string',
        description: '검색할 뉴스 키워드',
        required: true,
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터 (hour, day, week, month, year)',
        required: false,
        default: 'week',
      },
      language: {
        type: 'string',
        description: '언어 필터',
        required: false,
      },
      region: {
        type: 'string',
        description: '지역 필터',
        required: false,
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수',
        required: false,
        default: 10,
      },
    },
    category: 'search',
  },

  /**
   * 학술 검색 (Google Scholar)
   * - 학술 논문, 연구 자료 검색
   * - 인용 정보 포함
   */
  google_search_scholar: {
    name: 'google_search_scholar',
    description:
      'Google Scholar에서 학술 논문과 연구 자료를 검색합니다. 신뢰할 수 있는 학술 정보를 얻을 수 있습니다.',
    parameters: {
      query: {
        type: 'string',
        description: '검색할 학술 키워드',
        required: true,
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터 (최근 연구 우선)',
        required: false,
        default: 'anytime',
      },
      sortBy: {
        type: 'string',
        description: '정렬 방식 (relevance, date)',
        required: false,
        default: 'relevance',
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수',
        required: false,
        default: 10,
      },
    },
    category: 'search',
  },

  /**
   * 이미지 검색
   * - 이미지 검색
   * - 크기, 색상, 타입 필터 지원 (추후 확장 가능)
   */
  google_search_images: {
    name: 'google_search_images',
    description: 'Google 이미지 검색을 수행합니다. 관련 이미지를 찾을 수 있습니다.',
    parameters: {
      query: {
        type: 'string',
        description: '검색할 이미지 키워드',
        required: true,
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수',
        required: false,
        default: 10,
      },
      safeSearch: {
        type: 'string',
        description: '안전 검색 (off, moderate, strict)',
        required: false,
        default: 'moderate',
      },
    },
    category: 'search',
  },

  /**
   * 고급 검색
   * - 모든 검색 옵션을 세밀하게 제어
   * - 복잡한 쿼리 구성 가능
   */
  google_search_advanced: {
    name: 'google_search_advanced',
    description:
      'Google 고급 검색을 수행합니다. 정확한 문구, 제외 단어, OR 연산 등 복잡한 검색 조건을 사용할 수 있습니다.',
    parameters: {
      query: {
        type: 'string',
        description: '기본 검색어',
        required: true,
      },
      exactPhrase: {
        type: 'string',
        description: '정확히 일치해야 할 문구',
        required: false,
      },
      excludeWords: {
        type: 'array',
        description: '제외할 단어 목록',
        required: false,
      },
      orWords: {
        type: 'array',
        description: '포함되어야 할 단어 중 하나 (OR)',
        required: false,
      },
      site: {
        type: 'string',
        description: '특정 사이트 내 검색',
        required: false,
      },
      fileType: {
        type: 'string',
        description: '파일 타입 필터',
        required: false,
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터',
        required: false,
      },
      language: {
        type: 'string',
        description: '언어 필터',
        required: false,
      },
      region: {
        type: 'string',
        description: '지역 필터',
        required: false,
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수',
        required: false,
        default: 10,
      },
    },
    category: 'search',
  },

  /**
   * 검색 결과 추출
   * - 현재 검색 결과 페이지에서 정보 추출
   * - 제목, URL, 스니펫 등
   */
  google_extract_results: {
    name: 'google_extract_results',
    description:
      '현재 Google 검색 결과 페이지에서 검색 결과를 추출합니다. 검색을 먼저 수행한 후 이 도구를 사용하세요.',
    parameters: {
      maxResults: {
        type: 'number',
        description: '추출할 최대 결과 개수',
        required: false,
        default: 10,
      },
      detailed: {
        type: 'boolean',
        description: '상세 정보 추출 여부 (느리지만 더 많은 정보)',
        required: false,
        default: false,
      },
      captureScreenshot: {
        type: 'boolean',
        description: '스크린샷 캡처 여부',
        required: false,
        default: false,
      },
    },
    category: 'extraction',
  },

  /**
   * 검색 결과 방문
   * - 특정 검색 결과 페이지를 실제로 방문
   * - 페이지 내용 추출
   */
  google_visit_result: {
    name: 'google_visit_result',
    description:
      '검색 결과 중 특정 순위의 페이지를 방문하여 내용을 추출합니다. 검색 결과를 먼저 추출한 후 사용하세요.',
    parameters: {
      rank: {
        type: 'number',
        description: '방문할 검색 결과 순위 (1부터 시작)',
        required: true,
      },
      extractType: {
        type: 'string',
        description:
          '추출 타입 (text: 텍스트만, structured: 구조화된 데이터, markdown: 마크다운, summary: 요약)',
        required: false,
        default: 'text',
      },
      maxWaitTime: {
        type: 'number',
        description: '페이지 로딩 최대 대기 시간 (초)',
        required: false,
        default: 10,
      },
      captureScreenshot: {
        type: 'boolean',
        description: '스크린샷 캡처 여부',
        required: false,
        default: false,
      },
      waitForJs: {
        type: 'boolean',
        description: 'JavaScript 실행 완료 대기 여부',
        required: false,
        default: true,
      },
    },
    category: 'navigation',
  },

  /**
   * 관련 검색어 추출
   * - Google이 제안하는 관련 검색어
   * - 검색 쿼리 확장에 유용
   */
  google_get_related_searches: {
    name: 'google_get_related_searches',
    description: '현재 검색 결과 페이지에서 Google이 제안하는 관련 검색어를 추출합니다.',
    parameters: {},
    category: 'extraction',
  },

  /**
   * 다음 페이지 검색 결과
   * - 페이지네이션
   * - 더 많은 결과 탐색
   */
  google_next_page: {
    name: 'google_next_page',
    description: '검색 결과의 다음 페이지로 이동합니다. 더 많은 검색 결과를 얻을 수 있습니다.',
    parameters: {},
    category: 'navigation',
  },
} as const;

/**
 * 도구 이름 타입
 */
export type GoogleSearchToolName = keyof typeof GOOGLE_SEARCH_TOOLS;

/**
 * 도구 카테고리
 */
export type GoogleSearchToolCategory = 'search' | 'extraction' | 'navigation';

/**
 * Google 검색 도구 목록 (배열 형태)
 */
export const GOOGLE_SEARCH_TOOLS_LIST = Object.values(GOOGLE_SEARCH_TOOLS);

/**
 * 카테고리별 도구 목록
 */
export const GOOGLE_SEARCH_TOOLS_BY_CATEGORY = {
  search: GOOGLE_SEARCH_TOOLS_LIST.filter((tool) => tool.category === 'search'),
  extraction: GOOGLE_SEARCH_TOOLS_LIST.filter((tool) => tool.category === 'extraction'),
  navigation: GOOGLE_SEARCH_TOOLS_LIST.filter((tool) => tool.category === 'navigation'),
};

// =============================================================================
// Google Search Context & State
// =============================================================================

/**
 * Google 검색 컨텍스트
 * - Agent가 현재 검색 상태를 추적
 * - 여러 검색을 순차적으로 수행 가능
 */
export interface GoogleSearchContext {
  /** 현재 검색 쿼리 */
  currentQuery?: string;

  /** 현재 검색 타입 */
  currentType?: GoogleSearchType;

  /** 현재 검색 옵션 */
  currentOptions?: GoogleSearchOptions;

  /** 마지막 검색 결과 */
  lastSearchResult?: GoogleSearchResult;

  /** 현재 페이지 번호 */
  currentPage: number;

  /** 검색 기록 */
  searchHistory: Array<{
    query: string;
    type: GoogleSearchType;
    timestamp: number;
    resultCount: number;
  }>;

  /** 방문한 페이지 기록 */
  visitedPages: Array<{
    url: string;
    title: string;
    timestamp: number;
    rank: number;
  }>;
}

/**
 * Google 검색 에러 타입
 */
export type GoogleSearchErrorType =
  | 'network_error' // 네트워크 오류
  | 'parsing_error' // 파싱 오류
  | 'rate_limit' // 요청 제한
  | 'captcha_detected' // CAPTCHA 감지
  | 'invalid_parameters' // 잘못된 파라미터
  | 'no_results' // 검색 결과 없음
  | 'timeout' // 시간 초과
  | 'unknown'; // 알 수 없는 오류

/**
 * Google 검색 에러
 */
export interface GoogleSearchError {
  type: GoogleSearchErrorType;
  message: string;
  details?: string;
  recoverable: boolean; // 재시도 가능 여부
  suggestion?: string; // 해결 제안
}

/**
 * Google 검색 파싱 상태
 */
export interface GoogleSearchParsingState {
  /** 파싱 중 여부 */
  isParsing: boolean;

  /** 파싱 진행률 (0-100) */
  progress: number;

  /** 파싱된 결과 개수 */
  parsedCount: number;

  /** 총 결과 개수 */
  totalCount: number;

  /** 파싱 에러 */
  errors: GoogleSearchError[];

  /** 현재 단계 */
  currentStep?:
    | 'navigating' // 페이지 이동 중
    | 'loading' // 페이지 로딩 중
    | 'extracting' // 데이터 추출 중
    | 'processing' // 데이터 처리 중
    | 'completed' // 완료
    | 'failed'; // 실패
}

/**
 * Google 검색 통계
 */
export interface GoogleSearchStats {
  /** 총 검색 횟수 */
  totalSearches: number;

  /** 총 방문한 페이지 수 */
  totalVisits: number;

  /** 평균 검색 시간 (초) */
  avgSearchTime: number;

  /** 평균 페이지 방문 시간 (초) */
  avgVisitTime: number;

  /** 가장 많이 검색한 타입 */
  mostUsedType: GoogleSearchType;

  /** 총 검색 결과 개수 */
  totalResults: number;

  /** 성공률 (%) */
  successRate: number;
}

/**
 * Google 검색 세션
 * - 전체 검색 작업의 상태 관리
 */
export interface GoogleSearchSession {
  /** 세션 ID */
  id: string;

  /** 시작 시간 */
  startTime: number;

  /** 종료 시간 */
  endTime?: number;

  /** 검색 컨텍스트 */
  context: GoogleSearchContext;

  /** 파싱 상태 */
  parsingState: GoogleSearchParsingState;

  /** 통계 */
  stats: GoogleSearchStats;

  /** 세션 상태 */
  status: 'active' | 'paused' | 'completed' | 'failed';
}
