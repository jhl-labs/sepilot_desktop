/**
 * Google Search Built-in Tools
 *
 * Perplexity 수준의 고급 검색 기능을 제공하는 Google 검색 도구들
 * - 날짜 범위, 언어, 지역 필터
 * - 전문 검색 (뉴스, 학술, 이미지)
 * - 검색 결과 추출 및 페이지 방문
 */

import { MCPTool } from '../types';

// =============================================================================
// 검색 도구 (5개)
// =============================================================================

/**
 * Google 기본 웹 검색
 */
export const googleSearchTool: MCPTool = {
  name: 'google_search',
  description:
    'Google에서 웹 검색을 수행합니다. 날짜, 사이트, 파일 타입, 언어 등 다양한 필터를 지원합니다.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '검색할 키워드 또는 문구',
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터 (anytime, hour, day, week, month, year, custom). 기본값: anytime',
        enum: ['anytime', 'hour', 'day', 'week', 'month', 'year', 'custom'],
      },
      dateStart: {
        type: 'string',
        description: '사용자 지정 날짜 시작 (YYYY-MM-DD, dateFilter=custom일 때만)',
      },
      dateEnd: {
        type: 'string',
        description: '사용자 지정 날짜 종료 (YYYY-MM-DD, dateFilter=custom일 때만)',
      },
      site: {
        type: 'string',
        description: '특정 사이트 내 검색 (예: wikipedia.org)',
      },
      fileType: {
        type: 'string',
        description: '파일 타입 필터 (pdf, doc, xls, ppt 등)',
        enum: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
      },
      language: {
        type: 'string',
        description: '언어 필터 (ko, en, ja 등)',
        enum: ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'ru', 'ar', 'pt', 'it'],
      },
      region: {
        type: 'string',
        description: '지역 필터 (KR, US, JP 등)',
        enum: ['KR', 'US', 'GB', 'JP', 'CN', 'DE', 'FR', 'ES', 'IT', 'CA', 'AU'],
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수 (1-100). 기본값: 10',
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['query'],
  },
};

/**
 * Google 뉴스 검색
 */
export const googleSearchNewsTool: MCPTool = {
  name: 'google_search_news',
  description:
    'Google 뉴스에서 최신 기사를 검색합니다. 날짜 필터를 통해 특정 기간의 뉴스를 찾을 수 있습니다.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '검색할 뉴스 키워드',
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터 (hour, day, week, month, year). 기본값: week',
        enum: ['hour', 'day', 'week', 'month', 'year'],
      },
      language: {
        type: 'string',
        description: '언어 필터',
        enum: ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'ru', 'ar', 'pt', 'it'],
      },
      region: {
        type: 'string',
        description: '지역 필터',
        enum: ['KR', 'US', 'GB', 'JP', 'CN', 'DE', 'FR', 'ES', 'IT', 'CA', 'AU'],
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수. 기본값: 10',
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['query'],
  },
};

/**
 * Google Scholar 학술 검색
 */
export const googleSearchScholarTool: MCPTool = {
  name: 'google_search_scholar',
  description:
    'Google Scholar에서 학술 논문과 연구 자료를 검색합니다. 신뢰할 수 있는 학술 정보를 얻을 수 있습니다.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '검색할 학술 키워드',
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터 (최근 연구 우선). 기본값: anytime',
        enum: ['anytime', 'year', 'custom'],
      },
      sortBy: {
        type: 'string',
        description: '정렬 방식 (relevance, date). 기본값: relevance',
        enum: ['relevance', 'date'],
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수. 기본값: 10',
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['query'],
  },
};

/**
 * Google 이미지 검색
 */
export const googleSearchImagesTool: MCPTool = {
  name: 'google_search_images',
  description: 'Google 이미지 검색을 수행합니다. 관련 이미지를 찾을 수 있습니다.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '검색할 이미지 키워드',
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수. 기본값: 10',
        minimum: 1,
        maximum: 100,
      },
      safeSearch: {
        type: 'string',
        description: '안전 검색 (off, moderate, strict). 기본값: moderate',
        enum: ['off', 'moderate', 'strict'],
      },
    },
    required: ['query'],
  },
};

/**
 * Google 고급 검색
 */
export const googleSearchAdvancedTool: MCPTool = {
  name: 'google_search_advanced',
  description:
    'Google 고급 검색을 수행합니다. 정확한 문구, 제외 단어, OR 연산 등 복잡한 검색 조건을 사용할 수 있습니다.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '기본 검색어',
      },
      exactPhrase: {
        type: 'string',
        description: '정확히 일치해야 할 문구',
      },
      excludeWords: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: '제외할 단어 목록',
      },
      orWords: {
        type: 'array',
        items: {
          type: 'string',
        },
        description: '포함되어야 할 단어 중 하나 (OR 연산)',
      },
      site: {
        type: 'string',
        description: '특정 사이트 내 검색',
      },
      fileType: {
        type: 'string',
        description: '파일 타입 필터',
        enum: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf'],
      },
      dateFilter: {
        type: 'string',
        description: '날짜 필터',
        enum: ['anytime', 'hour', 'day', 'week', 'month', 'year', 'custom'],
      },
      language: {
        type: 'string',
        description: '언어 필터',
        enum: ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'es', 'fr', 'de', 'ru', 'ar', 'pt', 'it'],
      },
      region: {
        type: 'string',
        description: '지역 필터',
        enum: ['KR', 'US', 'GB', 'JP', 'CN', 'DE', 'FR', 'ES', 'IT', 'CA', 'AU'],
      },
      maxResults: {
        type: 'number',
        description: '최대 결과 개수. 기본값: 10',
        minimum: 1,
        maximum: 100,
      },
    },
    required: ['query'],
  },
};

// =============================================================================
// 추출 도구 (2개)
// =============================================================================

/**
 * Google 검색 결과 추출
 */
export const googleExtractResultsTool: MCPTool = {
  name: 'google_extract_results',
  description:
    '현재 Google 검색 결과 페이지에서 검색 결과를 추출합니다. 검색을 먼저 수행한 후 이 도구를 사용하세요.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      maxResults: {
        type: 'number',
        description: '추출할 최대 결과 개수. 기본값: 10',
        minimum: 1,
        maximum: 100,
      },
      detailed: {
        type: 'boolean',
        description: '상세 정보 추출 여부 (느리지만 더 많은 정보). 기본값: false',
      },
      captureScreenshot: {
        type: 'boolean',
        description: '스크린샷 캡처 여부. 기본값: false',
      },
    },
    required: [],
  },
};

/**
 * Google 관련 검색어 추출
 */
export const googleGetRelatedSearchesTool: MCPTool = {
  name: 'google_get_related_searches',
  description:
    '현재 검색 결과 페이지에서 Google이 제안하는 관련 검색어를 추출합니다. 검색 쿼리 확장에 유용합니다.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// =============================================================================
// 탐색 도구 (2개)
// =============================================================================

/**
 * Google 검색 결과 방문
 */
export const googleVisitResultTool: MCPTool = {
  name: 'google_visit_result',
  description:
    '검색 결과 중 특정 순위의 페이지를 방문하여 내용을 추출합니다. 검색 결과를 먼저 추출한 후 사용하세요.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      rank: {
        type: 'number',
        description: '방문할 검색 결과 순위 (1부터 시작)',
        minimum: 1,
      },
      extractType: {
        type: 'string',
        description:
          '추출 타입 (text: 텍스트만, structured: 구조화된 데이터, markdown: 마크다운, summary: 요약). 기본값: text',
        enum: ['text', 'structured', 'markdown', 'summary'],
      },
      maxWaitTime: {
        type: 'number',
        description: '페이지 로딩 최대 대기 시간 (초). 기본값: 10',
        minimum: 1,
        maximum: 60,
      },
      captureScreenshot: {
        type: 'boolean',
        description: '스크린샷 캡처 여부. 기본값: false',
      },
      waitForJs: {
        type: 'boolean',
        description: 'JavaScript 실행 완료 대기 여부. 기본값: true',
      },
    },
    required: ['rank'],
  },
};

/**
 * Google 검색 결과 다음 페이지
 */
export const googleNextPageTool: MCPTool = {
  name: 'google_next_page',
  description: '검색 결과의 다음 페이지로 이동합니다. 더 많은 검색 결과를 탐색할 수 있습니다.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};
