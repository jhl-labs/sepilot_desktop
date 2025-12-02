# Browser Agent 타입 정의 고도화 검토 보고서

**작성일**: 2025-12-03
**검토 대상**: `types/browser-agent.ts`
**비교 기준**: Perplexity Comet, OpenAI Operator

---

## 📊 종합 평가

| 항목 | 현재 수준 | 목표 수준 | 격차 |
|------|----------|----------|------|
| **Google Search** | ⭐⭐⭐⭐⭐ (5/5) | Perplexity Comet | ✅ 동등 |
| **Browser Control** | ⭐⭐☆☆☆ (2/5) | OpenAI Operator | ❌ 타입 누락 |
| **Vision/Multimodal** | ⭐⭐☆☆☆ (2/5) | OpenAI Operator | ❌ 타입 누락 |
| **Workflow Management** | ⭐⭐⭐☆☆ (3/5) | OpenAI Operator | 🟡 개선 필요 |
| **Error Recovery** | ⭐⭐⭐☆☆ (3/5) | Both | 🟡 개선 필요 |

**종합 점수: 3.0/5.0 (60%)**

---

## ✅ 현재 구현의 강점

### 1. **Google Search 도구 - Perplexity 수준 달성** ⭐⭐⭐⭐⭐

```typescript
// 9개 고도화된 검색 도구
- google_search           // 날짜, 사이트, 파일타입, 언어/지역 필터
- google_search_news      // 뉴스 검색 (시간 필터)
- google_search_scholar   // 학술 검색 (논문/연구)
- google_search_images    // 이미지 검색
- google_search_advanced  // 정확한 문구, 제외 단어, OR 연산
- google_extract_results  // 결과 추출 (제목, URL, 스니펫)
- google_visit_result     // 결과 방문 및 콘텐츠 추출
- google_get_related_searches // 관련 검색어
- google_next_page        // 페이지네이션
```

**강점:**
- ✅ 12가지 날짜 필터 (hour, day, week, month, year, custom)
- ✅ 12개 언어 코드 (ko, en, ja, zh-CN, zh-TW 등)
- ✅ 11개 지역 코드 (KR, US, JP, CN 등)
- ✅ 12개 파일 타입 (pdf, doc, xls, ppt 등)
- ✅ 고급 검색 연산 (정확한 문구, 제외, OR)
- ✅ 안전 검색 필터 (off, moderate, strict)
- ✅ 정렬 방식 (relevance, date)

**Perplexity Comet과 비교:**
- ✅ 실시간 웹 검색: 동일
- ✅ 출처 표시: GoogleSearchResultItem에 URL, displayUrl, source 포함
- ✅ 날짜 필터: 더 상세함 (custom 범위 지원)
- ✅ 다양한 검색 타입: Scholar, News, Images 모두 지원

### 2. **실행 컨텍스트 추적 및 분석** ⭐⭐⭐⭐☆

```typescript
export interface BrowserAgentReport {
  status: BrowserAgentCompletionStatus;
  summary: string;
  details: {
    totalIterations: number;
    maxIterations: number;
    duration: number;
    toolStats: BrowserAgentToolStats[];      // 도구별 성능
    visitedPages: BrowserAgentVisitedPage[]; // 방문 기록
    achievements: string[];
    issues: string[];
  };
  nextSteps?: string[];
  errorMessage?: string;
}
```

**강점:**
- ✅ Tool 사용 통계 (callCount, successCount, failureCount)
- ✅ 방문 페이지 추적 (URL, title, timestamp, visitedBy)
- ✅ 성과 및 문제 추적
- ✅ 다음 단계 제안

### 3. **검색 세션 관리** ⭐⭐⭐⭐☆

```typescript
export interface GoogleSearchSession {
  id: string;
  startTime: number;
  endTime?: number;
  context: GoogleSearchContext;
  parsingState: GoogleSearchParsingState;
  stats: GoogleSearchStats;
  status: 'active' | 'paused' | 'completed' | 'failed';
}
```

**강점:**
- ✅ 검색 기록 추적
- ✅ 파싱 진행률 모니터링
- ✅ 평균 검색 시간, 성공률 통계
- ✅ 방문한 페이지 기록

---

## ❌ 심각한 문제점

### 1. **Browser Control Tools 타입 누락** 🚨 CRITICAL

**문제:**
- `browser-agent.ts`에는 **28개 built-in tools** 구현됨
- `types/browser-agent.ts`에는 **Google Search 9개만** 정의됨
- **19개 Browser Control Tools의 타입 정의가 완전히 누락**

**누락된 도구 목록:**

#### A. Browser Navigation (1개)
```typescript
❌ browser_navigate - 타입 정의 없음
```

#### B. Page Inspection (5개)
```typescript
❌ browser_get_page_content
❌ browser_get_interactive_elements
❌ browser_search_elements
❌ browser_get_selected_text
❌ browser_take_screenshot
```

#### C. Page Interaction (4개)
```typescript
❌ browser_click_element
❌ browser_type_text
❌ browser_scroll
❌ browser_wait_for_element
```

#### D. Tab Management (4개)
```typescript
❌ browser_list_tabs
❌ browser_create_tab
❌ browser_switch_tab
❌ browser_close_tab
```

#### E. Vision-Based Tools (5개)
```typescript
❌ browser_capture_annotated_screenshot (Set-of-Mark)
❌ browser_click_coordinate
❌ browser_click_marker
❌ browser_get_clickable_coordinate
❌ browser_analyze_with_vision
```

**영향:**
- TypeScript 타입 체크 불가
- IDE 자동완성 지원 없음
- API 문서 자동 생성 불가
- 도구 메타데이터 관리 불가

### 2. **Interactive Element 타입 부족** 🚨

**문제:**
- `browser_get_interactive_elements`는 구현되어 있음
- 반환하는 `InteractiveElement` 타입이 정의되지 않음

**필요한 타입:**
```typescript
// 현재 없음 ❌
export interface InteractiveElement {
  id: string;  // "ai-element-1"
  role: 'button' | 'link' | 'textbox' | 'checkbox' | 'radio' | 'combobox' | ...;
  label: string;
  value?: string;
  placeholder?: string;
  ariaLabel?: string;
  position: BoundingBox;
  isVisible: boolean;
  isEnabled: boolean;
  isReadonly: boolean;
  context: {
    parent?: string;
    siblings?: string[];
    formName?: string;
  };
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

### 3. **Vision-Based Analysis 타입 누락** 🚨

**문제:**
- Set-of-Mark (SoM) 기능 구현되어 있음
- `browser_capture_annotated_screenshot` 반환 타입 없음

**필요한 타입:**
```typescript
// 현재 없음 ❌
export interface AnnotatedScreenshotResult {
  screenshotBase64: string;
  screenshotPath: string;
  markers: Array<{
    label: string;      // "A", "B", "C"
    elementId: string;  // "ai-element-5"
    role: string;       // "button"
    text: string;       // "Submit"
    boundingBox: BoundingBox;
    confidence: number;
  }>;
  totalMarkers: number;
  captureTime: number;
}

export interface CoordinateClickResult {
  success: boolean;
  clickedElement?: {
    tagName: string;
    id?: string;
    className?: string;
    text?: string;
  };
  actualCoordinates: { x: number; y: number };
  message: string;
}
```

### 4. **Page Content 구조화 타입 부족** 🚨

**문제:**
- `browser_get_page_content`가 semantic structure 반환
- 구조화된 반환 타입이 정의되지 않음

**필요한 타입:**
```typescript
// 현재 없음 ❌
export interface PageContent {
  url: string;
  title: string;
  summary: string;
  headings: Array<{
    level: 1 | 2 | 3 | 4 | 5 | 6;
    text: string;
  }>;
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
  interactiveElementCounts: {
    buttons: number;
    links: number;
    inputs: number;
    forms: number;
  };
  metadata?: {
    description?: string;
    keywords?: string[];
    author?: string;
    language?: string;
  };
}
```

### 5. **Tab Management 타입 누락**

**필요한 타입:**
```typescript
// 현재 없음 ❌
export interface BrowserTab {
  id: string;          // "tab-123"
  title: string;
  url: string;
  isActive: boolean;
  favicon?: string;
  loadingState: 'loading' | 'complete' | 'error';
}

export interface TabListResult {
  tabs: BrowserTab[];
  activeTabId: string;
  totalTabs: number;
}
```

---

## 🟡 개선이 필요한 부분

### 1. **Workflow/Task Management 타입 미흡**

**현재 상태:**
- GoogleSearchSession은 있음
- 일반적인 BrowserSession 타입 없음
- Multi-step workflow 타입 없음

**필요한 개선:**
```typescript
// 추가 필요
export interface BrowserSession {
  id: string;
  goal: string;
  startTime: number;
  endTime?: number;

  // Workflow
  plannedSteps: BrowserWorkflowStep[];
  currentStep: number;
  completedSteps: number;

  // State
  currentUrl?: string;
  currentTab?: string;
  visitedPages: string[];

  // Performance
  toolCalls: ToolCallRecord[];
  errors: BrowserError[];

  status: 'planning' | 'executing' | 'completed' | 'failed' | 'paused';
}

export interface BrowserWorkflowStep {
  id: string;
  type: 'navigate' | 'search' | 'click' | 'type' | 'extract' | 'verify';
  description: string;
  tool: string;
  arguments: Record<string, any>;
  expectedResult?: string;
  status: 'pending' | 'executing' | 'completed' | 'failed' | 'skipped';
  result?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
}
```

### 2. **Error Recovery 전략 타입 불완전**

**현재 상태:**
- GoogleSearchError는 잘 정의됨
- 일반적인 Browser 에러 타입 부족

**필요한 개선:**
```typescript
// 추가 필요
export type BrowserErrorType =
  | 'navigation_failed'
  | 'element_not_found'
  | 'element_not_visible'
  | 'element_not_clickable'
  | 'element_disabled'
  | 'timeout'
  | 'javascript_error'
  | 'network_error'
  | 'page_crash'
  | 'screenshot_failed'
  | 'invalid_coordinates'
  | 'unknown';

export interface BrowserError {
  type: BrowserErrorType;
  message: string;
  context: {
    url?: string;
    tool?: string;
    elementId?: string;
    coordinates?: { x: number; y: number };
  };
  timestamp: number;
  recoverable: boolean;
  suggestedAction?: string;
}

export interface ErrorRecoveryStrategy {
  errorType: BrowserErrorType;
  currentAttempt: number;
  maxAttempts: number;
  fallbackActions: Array<{
    tool: string;
    arguments: Record<string, any>;
    description: string;
  }>;
  lastError?: BrowserError;
}
```

### 3. **Form Understanding/Filling 타입 없음**

**OpenAI Operator 대비 부족:**
- 폼 구조 이해 타입 없음
- 자동 폼 작성 타입 없음

**필요한 추가:**
```typescript
// 추가 필요
export interface FormStructure {
  formId?: string;
  formName?: string;
  action?: string;
  method?: string;
  fields: Array<{
    elementId: string;
    name: string;
    type: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'checkbox' | 'radio' | 'select';
    label?: string;
    placeholder?: string;
    required: boolean;
    currentValue?: string;
    options?: string[]; // for select/radio
  }>;
  submitButton?: {
    elementId: string;
    label: string;
  };
}

export interface FormFillingPlan {
  formId: string;
  fillingSteps: Array<{
    fieldId: string;
    fieldName: string;
    value: string;
    requiresUserConfirmation: boolean;
  }>;
  submitAfterFill: boolean;
}
```

### 4. **Natural Language Element Search 결과 타입**

**현재 상태:**
- `browser_search_elements` 구현됨
- 반환 타입이 명확하지 않음

**필요한 명확화:**
```typescript
// 추가 필요
export interface ElementSearchResult {
  query: string;
  matches: Array<{
    elementId: string;
    role: string;
    label: string;
    score: number; // 0-1, relevance score
    reason: string; // why this element matched
    context?: string;
  }>;
  totalMatches: number;
  searchTime: number;
}
```

---

## 📋 OpenAI Operator vs 현재 구현 비교

| 기능 | OpenAI Operator | 현재 구현 | 타입 정의 |
|------|----------------|----------|----------|
| **Browser Navigation** | ✅ | ✅ | ❌ 타입 없음 |
| **Element Clicking** | ✅ | ✅ | ❌ 타입 없음 |
| **Text Input** | ✅ | ✅ | ❌ 타입 없음 |
| **Form Filling** | ✅ | 🟡 부분 | ❌ 타입 없음 |
| **Screenshot Analysis** | ✅ | ✅ | ❌ 타입 없음 |
| **Set-of-Mark (SoM)** | ✅ | ✅ | ❌ 타입 없음 |
| **Coordinate Clicking** | ✅ | ✅ | ❌ 타입 없음 |
| **Tab Management** | ✅ | ✅ | ❌ 타입 없음 |
| **Accessibility Tree** | ✅ | ✅ | ❌ 타입 없음 |
| **Multi-page Workflows** | ✅ | 🟡 부분 | ❌ 타입 없음 |
| **Error Recovery** | ✅ | 🟡 부분 | 🟡 Google만 |
| **Vision LLM Integration** | ✅ | 🟡 준비됨 | ❌ 타입 없음 |

---

## 📈 Perplexity Comet vs 현재 구현 비교

| 기능 | Perplexity Comet | 현재 구현 | 타입 정의 |
|------|-----------------|----------|----------|
| **Web Search** | ✅ | ✅ | ✅ 완벽 |
| **News Search** | ✅ | ✅ | ✅ 완벽 |
| **Scholar Search** | ✅ | ✅ | ✅ 완벽 |
| **Image Search** | ✅ | ✅ | ✅ 완벽 |
| **Advanced Filters** | ✅ | ✅ | ✅ 완벽 |
| **Date Filtering** | ✅ | ✅ | ✅ 완벽 |
| **Source Citation** | ✅ | ✅ | ✅ 완벽 |
| **Related Searches** | ✅ | ✅ | ✅ 완벽 |
| **Multi-step Reasoning** | ✅ | ✅ | 🟡 Session만 |
| **Interactive Follow-ups** | ✅ | 🟡 부분 | ❌ 타입 없음 |

---

## 🎯 우선순위별 개선 권장사항

### Priority 1: CRITICAL (즉시 수정 필요) 🚨

1. **Browser Control Tools 타입 정의 추가**
   ```typescript
   // types/browser-agent.ts에 추가
   export const BROWSER_CONTROL_TOOLS = {
     // Navigation
     browser_navigate: { ... },

     // Inspection
     browser_get_page_content: { ... },
     browser_get_interactive_elements: { ... },
     browser_search_elements: { ... },
     browser_get_selected_text: { ... },
     browser_take_screenshot: { ... },

     // Interaction
     browser_click_element: { ... },
     browser_type_text: { ... },
     browser_scroll: { ... },
     browser_wait_for_element: { ... },

     // Tab Management
     browser_list_tabs: { ... },
     browser_create_tab: { ... },
     browser_switch_tab: { ... },
     browser_close_tab: { ... },

     // Vision
     browser_capture_annotated_screenshot: { ... },
     browser_click_coordinate: { ... },
     browser_click_marker: { ... },
     browser_get_clickable_coordinate: { ... },
     browser_analyze_with_vision: { ... },
   } as const;
   ```

2. **핵심 반환 타입 정의**
   - `PageContent`
   - `InteractiveElement`
   - `AnnotatedScreenshotResult`
   - `BrowserTab`
   - `ElementSearchResult`

### Priority 2: HIGH (1주일 내) 🟡

3. **BrowserSession 타입 추가**
   - GoogleSearchSession과 동일한 수준
   - Multi-step workflow 지원

4. **BrowserError 및 ErrorRecoveryStrategy**
   - GoogleSearchError처럼 상세하게

5. **FormStructure 및 FormFillingPlan**
   - OpenAI Operator 수준의 폼 이해

### Priority 3: MEDIUM (2주일 내) 🔵

6. **Vision 관련 고급 타입**
   - VisionAnalysisResult
   - ScreenReasoningResult
   - MarkerOverlayConfig

7. **Performance Monitoring 타입**
   - ToolPerformanceMetrics
   - PageLoadMetrics
   - InteractionLatency

### Priority 4: LOW (향후 개선) ⚪

8. **AI Assistant 타입**
   - ConversationalContext
   - FollowUpSuggestions
   - UserIntentClassification

---

## 💡 구체적 개선 제안

### 제안 1: 타입 파일 구조 개선

**현재:**
```
types/browser-agent.ts (983 lines)
└── All types mixed together
```

**제안:**
```
types/browser-agent/
├── index.ts                 // Re-exports
├── google-search.ts         // Google Search 관련 (기존)
├── browser-control.ts       // Browser Control Tools (신규)
├── vision.ts                // Vision-based Tools (신규)
├── workflow.ts              // Session, Workflow (신규)
├── errors.ts                // Error & Recovery (신규)
└── reporting.ts             // Report, Stats (기존)
```

### 제안 2: Tool Metadata 통합

```typescript
// types/browser-agent/index.ts
export const ALL_BROWSER_AGENT_TOOLS = {
  ...GOOGLE_SEARCH_TOOLS,
  ...BROWSER_CONTROL_TOOLS,
} as const;

export type BrowserAgentToolName = keyof typeof ALL_BROWSER_AGENT_TOOLS;

export const TOOLS_BY_CATEGORY = {
  google_search: GOOGLE_SEARCH_TOOLS_LIST,
  browser_navigation: [...],
  browser_inspection: [...],
  browser_interaction: [...],
  browser_tabs: [...],
  browser_vision: [...],
} as const;
```

### 제안 3: Runtime Validation

```typescript
// lib/browser-agent/validation.ts
import { z } from 'zod';

export const PageContentSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  summary: z.string(),
  headings: z.array(z.object({
    level: z.number().min(1).max(6),
    text: z.string(),
  })),
  // ...
});

export type PageContent = z.infer<typeof PageContentSchema>;
```

---

## 📊 최종 평가 및 로드맵

### 현재 상태 (2025-12-03)

**점수: 3.0/5.0 (60%)**

- ✅ **Google Search**: 5/5 (Perplexity 수준)
- ❌ **Browser Control**: 2/5 (타입 누락으로 인한 감점)
- ❌ **Vision**: 2/5 (기능은 있으나 타입 없음)
- 🟡 **Workflow**: 3/5 (부분적)
- 🟡 **Error Handling**: 3/5 (Google만)

### 목표 상태 (4주 후)

**목표 점수: 4.5/5.0 (90%)**

- ✅ Google Search: 5/5 (유지)
- ✅ Browser Control: 5/5 (타입 추가)
- ✅ Vision: 4/5 (타입 추가, LLM 통합 대기)
- ✅ Workflow: 4/5 (BrowserSession 추가)
- ✅ Error Handling: 4/5 (통합 에러 시스템)

### 로드맵

**Week 1: Critical 타입 정의**
- [ ] Browser Control Tools 19개 타입 정의
- [ ] 핵심 반환 타입 5개 정의
- [ ] TypeScript strict mode 통과

**Week 2: High Priority 타입**
- [ ] BrowserSession 타입 체계
- [ ] BrowserError 통합 시스템
- [ ] FormStructure 타입

**Week 3: Medium Priority**
- [ ] Vision 고급 타입
- [ ] Performance Monitoring
- [ ] Runtime Validation (Zod)

**Week 4: 문서화 및 테스트**
- [ ] API 문서 자동 생성
- [ ] Type Coverage 90% 이상
- [ ] E2E 타입 테스트

---

## 🎯 결론

**현재 `types/browser-agent.ts`는**:
1. ✅ **Google Search 부분은 Perplexity Comet 수준**
2. ❌ **Browser Control 부분은 타입 정의가 완전히 누락됨**
3. 🟡 **기능은 OpenAI Operator 수준이나, 타입이 없어 활용도 저하**

**가장 시급한 작업**:
- **Browser Control Tools 19개의 타입 정의 추가**
- 이것만 해도 점수가 3.0 → 4.0으로 상승

**완전한 고도화를 위해**:
- Vision 타입 강화
- BrowserSession 추가
- 통합 에러 시스템
- Runtime Validation

→ **4주 내 4.5/5.0 달성 가능**
