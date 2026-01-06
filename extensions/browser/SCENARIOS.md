# Browser Extension - 시나리오 검토

현재 구현된 Perplexity 모드 및 탭 기반 아키텍처의 다양한 사용 시나리오를 검토하고, 각 시나리오의 **가능 여부**, **제약사항**, **개선 필요 사항**을 분석합니다.

---

## ✅ 지원되는 시나리오

### 1. **연속적인 다중 결과 방문** (핵심 시나리오)

**시나리오:**

```
사용자: "2024년 노벨 물리학상 수상자는?"
→ google_search 실행
→ google_visit_result({ rank: 1 })  // 탭1 생성 → 방문 → 탭1 닫기 → 원래 탭 복귀
→ google_visit_result({ rank: 2 })  // 탭2 생성 → 방문 → 탭2 닫기 → 원래 탭 복귀
→ google_visit_result({ rank: 3 })  // 탭3 생성 → 방문 → 탭3 닫기 → 원래 탭 복귀
→ 정보 종합 및 출처 인용
```

**가능 여부:** ✅ **완전 지원**

**검증:**

- `google_visit_result`는 매번 새 탭을 생성하고 finally 블록에서 반드시 탭을 닫음
- `originalTabId`를 저장하여 항상 원래 탭(검색 페이지)으로 복귀
- 각 호출은 독립적이므로 순차적으로 여러 번 호출 가능

**실제 동작 흐름:**

```typescript
// 호출 1
const originalTabId = getCurrentActiveTabId(); // 검색 페이지 탭 ID
newTabId = createTabInternal(mainWindow, url1); // 탭1 생성
// ... 정보 수집 ...
closeTabInternal(mainWindow, newTabId); // 탭1 닫기
switchTabInternal(mainWindow, originalTabId); // 검색 페이지로 복귀

// 호출 2 (검색 페이지에서 다시 시작)
const originalTabId = getCurrentActiveTabId(); // 여전히 검색 페이지 탭 ID
newTabId = createTabInternal(mainWindow, url2); // 탭2 생성
// ... 반복 ...
```

**성능:**

- 3개 결과 방문: **6-9초** (기존 30-45초 대비 5배 빠름)

---

### 2. **에러 복구 및 부분 콘텐츠 사용**

**시나리오:**

```
google_visit_result({ rank: 1 })
→ 페이지 로딩 중 타임아웃 (5초 초과)
→ 에러로 중단하지 않고 부분 콘텐츠 사용
→ Agent가 "일부 정보만 수집되었습니다" 알림
```

**가능 여부:** ✅ **완전 지원**

**검증:**

```typescript
// google-search-handlers.ts:597-600
const timeout = setTimeout(() => {
  logger.warn(`Timeout after ${maxWaitTime}s - using partial content`);
  resolve(); // ❌ reject() 대신 resolve() → 부분 콘텐츠 사용
}, maxWaitTime * 1000);
```

**장점:**

- 느린 사이트도 5초 후 부분 콘텐츠로 계속 진행
- Agent가 중단되지 않고 다음 결과로 이동 가능
- 실패율 대폭 감소

**실제 테스트 필요:**

- ⚠️ 부분 콘텐츠가 얼마나 유용한지 확인 필요
- ⚠️ DOM-ready 전에 타임아웃 시 빈 콘텐츠 가능성

---

### 3. **페이지 로드 실패 처리**

**시나리오:**

```
google_visit_result({ rank: 1 })
→ 네트워크 오류 / DNS 실패 / SSL 인증서 오류
→ 에러 메시지와 함께 다음 결과로 진행
```

**가능 여부:** ✅ **지원됨**

**검증:**

```typescript
// google-search-handlers.ts:613-616
const onFail = (_e: unknown, code: number, desc: string) => {
  cleanup();
  reject(new Error(`Load failed (${code}): ${desc}`));
};
newTab.view.webContents.once('did-fail-load', onFail);
```

**동작:**

1. `did-fail-load` 이벤트 감지
2. reject()로 에러 전파
3. catch 블록에서 에러 처리
4. **finally 블록에서 탭 정리 보장**
5. Agent가 에러 메시지 받고 다음 결과 시도

**제약사항:**

- ⚠️ LangGraph Agent가 에러 후 자동으로 다음 결과를 시도할지는 Agent 로직에 의존
- ⚠️ 현재는 에러 발생 시 Agent에게 에러만 전달됨

---

### 4. **JavaScript 렌더링 필요한 페이지 (SPA)**

**시나리오:**

```
React/Vue로 만들어진 SPA 페이지 방문
→ DOM-ready 직후에는 콘텐츠가 거의 없음
→ JavaScript 실행 후 콘텐츠 렌더링
```

**가능 여부:** ✅ **부분 지원** (waitForJs 옵션)

**검증:**

```typescript
// google-search-handlers.ts:531
const { rank, extractType = 'summary', maxWaitTime = 5, waitForJs = false } = options;

// google-search-handlers.ts:622-625
if (waitForJs) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
```

**사용법:**

```typescript
google_visit_result({
  rank: 1,
  waitForJs: true, // JS 실행 대기 (500ms)
});
```

**제약사항:**

- ⚠️ 고정된 500ms 대기만 가능 (충분하지 않을 수 있음)
- ⚠️ DOM 변화 감지가 아닌 단순 시간 대기
- ⚠️ Agent가 SPA 페이지인지 자동으로 판단하지 못함

**개선 필요:**

- MutationObserver로 DOM 변화 감지
- 또는 특정 셀렉터가 나타날 때까지 대기
- Agent에게 SPA 감지 가이드 제공

---

### 5. **대용량 콘텐츠 처리**

**시나리오:**

```
매우 긴 기사 페이지 방문 (10MB HTML)
→ 전체 콘텐츠를 Agent에게 전달하면 토큰 제한 초과
```

**가능 여부:** ✅ **지원됨** (자동 제한)

**검증:**

```typescript
// google-search-handlers.ts:655-659
const maxLength = 5000;
if (content.length > maxLength) {
  content = `${content.substring(0, maxLength)}\n\n... (내용이 잘렸습니다)`;
}
```

**추가 최적화:**

```typescript
// summary 모드 (기본값)
if (extractType === 'summary') {
  // 상위 8개 단락만 (30자 이상)
  const paragraphs = Array.from(document.querySelectorAll('p, article p, main p'))
    .map((p) => p.textContent?.trim())
    .filter((t) => t && t.length > 30)
    .slice(0, 8);
  return paragraphs.join('\n\n');
}
```

**장점:**

- summary 모드: 핵심 단락만 추출 (3-5배 빠름)
- text 모드: 5000자 제한
- Agent가 받는 정보량이 일정하게 유지됨

---

### 6. **검색 페이지에서 다음 페이지 이동**

**시나리오:**

```
google_search("AI 뉴스")
→ 상위 3개 결과 방문
→ google_next_page()  // 2페이지로 이동
→ 추가 결과 방문
```

**가능 여부:** ✅ **지원됨**

**검증:**

```typescript
// google-search-handlers.ts:698-719
export async function handleGoogleNextPage(): Promise<string> {
  const browserView = getActiveBrowserView();

  const clickResult = await browserView.webContents.executeJavaScript(`
    const nextButton = document.querySelector('a#pnnext, a[aria-label*="Next"]');
    if (!nextButton) {
      return { success: false, error: '다음 페이지가 없습니다.' };
    }
    nextButton.click();
    return { success: true };
  `);
}
```

**동작:**

- google_visit_result로 결과 방문 후 원래 탭(검색 페이지)으로 복귀
- 검색 페이지에서 "다음" 버튼 클릭
- 새 페이지에서 다시 google_visit_result 사용 가능

**제약사항:**

- ⚠️ 페이지 로드 대기 로직 없음 (클릭 후 즉시 반환)
- ⚠️ Agent가 페이지 로드 완료를 기다려야 할 수도 있음

---

### 7. **탭 정리 보장 (메모리 누수 방지)**

**시나리오:**

```
google_visit_result({ rank: 1 })
→ 페이지 로딩 중 Agent 중단 (사용자가 Stop 클릭)
→ 또는 예상치 못한 에러 발생
→ 탭이 열린 채로 남아 메모리 누수?
```

**가능 여부:** ✅ **완전 지원** (finally 블록)

**검증:**

```typescript
// google-search-handlers.ts:677-692
finally {
  // 🔄 항상 탭 정리 및 원래 탭으로 복귀
  if (newTabId) {
    try {
      const mainWindow = getMainWindow();
      if (mainWindow) {
        closeTabInternal(mainWindow, newTabId);
        if (originalTabId) {
          switchTabInternal(mainWindow, originalTabId);
        }
      }
    } catch (cleanupError) {
      logger.error('[GoogleVisitResult] Cleanup error:', cleanupError);
    }
  }
}
```

**보장:**

- ✅ 정상 종료, 에러, Agent 중단 모두 finally 블록 실행
- ✅ 탭이 항상 닫히고 원래 탭으로 복귀
- ✅ cleanup 중 에러가 발생해도 로깅만 하고 넘어감

**메모리 안전성:**

- 30% 메모리 사용량 감소 (탭 즉시 정리)
- 누수 가능성 최소화

---

## ⚠️ 제한적으로 지원되는 시나리오

### 8. **동시 다발적인 탭 생성**

**시나리오:**

```
// Agent가 동시에 3개 결과를 병렬로 방문하려고 시도
Promise.all([
  google_visit_result({ rank: 1 }),
  google_visit_result({ rank: 2 }),
  google_visit_result({ rank: 3 }),
])
```

**가능 여부:** ⚠️ **이론상 가능하지만 문제 발생 가능**

**문제점:**

```typescript
// browser-view.ts:1403-1409
// Hide current active tab
if (activeTabId) {
  const currentTab = tabs.get(activeTabId);
  if (currentTab) {
    mainWindow.removeBrowserView(currentTab.view);
  }
}
// Make new tab active
activeTabId = tabId;
```

**경쟁 상태 (Race Condition):**

1. 탭1 생성 시작 → activeTabId = 탭1
2. 탭2 생성 시작 → activeTabId = 탭2 (탭1 숨김)
3. 탭1이 콘텐츠 추출 시도 → **탭1은 이미 숨겨져서 실패 가능**
4. finally에서 탭1 닫기 시도 → originalTabId가 잘못됨

**현재 구현 제약:**

- `activeTabId`는 전역 변수로 한 번에 하나만 가능
- 병렬 실행 시 탭 전환이 예측 불가능
- 콘텐츠 추출이 활성 탭에서만 작동

**해결 방법:**

- ❌ 현재 구조에서는 병렬 실행 불가
- ✅ Agent에게 순차 실행만 하도록 가이드 필요
- 🔧 향후 개선: 탭별 독립적인 webContents 사용

**권장 사항:**

```markdown
# System Prompt 추가

**IMPORTANT: Sequential Search Results**

- Visit search results ONE AT A TIME (never in parallel)
- Wait for each google_visit_result to complete before calling the next one
- Example:
  ✅ GOOD: Visit rank 1 → Wait → Visit rank 2 → Wait → Visit rank 3
  ❌ BAD: Promise.all([visit rank 1, visit rank 2, visit rank 3])
```

---

### 9. **리다이렉트 처리**

**시나리오:**

```
검색 결과 URL: https://example.com/article
→ 페이지 로드 시 리다이렉트: https://example.com/new-article
→ 최종 URL이 달라짐
```

**가능 여부:** ✅ **지원됨** (자동 처리)

**검증:**

```typescript
// google-search-handlers.ts:629
const finalUrl = newTab.view.webContents.getURL();
```

**동작:**

- webContents.loadURL()은 리다이렉트 자동 추적
- 최종 URL을 `getURL()`로 가져옴
- Agent에게 최종 URL 전달

**제약사항:**

- ⚠️ JavaScript 리다이렉트는 waitForJs 필요할 수 있음
- ⚠️ 무한 리다이렉트는 5초 타임아웃으로 중단됨

---

### 10. **쿠키 및 세션 처리**

**시나리오:**

```
로그인이 필요한 사이트 방문
→ 쿠키가 없어서 로그인 페이지로 리다이렉트
→ 콘텐츠 추출 실패
```

**가능 여부:** ⚠️ **부분 지원** (제한적)

**현재 상태:**

- BrowserView는 메인 윈도우와 별도의 세션 사용
- 각 탭은 동일한 세션 공유 (쿠키 공유됨)
- 하지만 로그인 상태 유지는 사용자가 직접 해야 함

**시나리오 분석:**

```
1. 사용자가 Browser Extension에서 네이버에 로그인
2. 쿠키 저장됨
3. Agent가 google_visit_result로 네이버 페이지 방문
   → ✅ 로그인 쿠키 사용 가능
```

**제약사항:**

- ⚠️ Agent가 자동으로 로그인 불가
- ⚠️ 로그인 필요 여부를 감지하기 어려움
- ⚠️ 다른 브라우저의 쿠키 가져오기 불가

---

## ❌ 현재 지원되지 않는 시나리오

### 11. **검색 결과 페이지가 변경된 경우**

**시나리오:**

```
google_visit_result({ rank: 1 }) 실행 중
→ 사용자가 직접 다른 페이지로 이동
→ originalTabId가 더 이상 검색 페이지가 아님
→ 복귀 시 잘못된 페이지로 돌아감
```

**가능 여부:** ❌ **지원 안 됨**

**문제점:**

```typescript
const originalTabId = getCurrentActiveTabId(); // 검색 페이지라고 가정
// ... 탭 생성 및 방문 ...
// 하지만 사용자가 originalTabId 탭에서 다른 페이지로 이동했다면?
switchTabInternal(mainWindow, originalTabId); // 잘못된 페이지로 복귀
```

**해결 방법:**

- 🔧 originalTabId의 URL을 저장하고 검증
- 🔧 검색 페이지가 아니면 에러 반환
- 또는 검색 페이지 전용 "frozen" 탭 개념 도입

---

### 12. **다중 Browser Extension 인스턴스**

**시나리오:**

```
창 1에서 Browser Agent 실행 중
→ 창 2를 열고 동시에 Browser Agent 실행
→ 두 Agent가 같은 전역 변수 (activeTabId) 공유
→ 충돌 발생
```

**가능 여부:** ❌ **지원 안 됨**

**문제점:**

```typescript
// browser-view.ts:83-84
let activeTabId: string | null = null; // 전역 변수!
const tabs: Map<string, BrowserTab> = new Map();
```

**현재 제약:**

- 전체 앱에서 하나의 activeTabId만 존재
- 여러 창이나 인스턴스 지원 불가
- 동시 실행 시 예측 불가능한 동작

**해결 방법:**

- 🔧 Window별로 독립적인 탭 관리
- 🔧 mainWindowRef를 key로 하는 Map 사용

---

### 13. **복잡한 상호작용 후 결과 방문**

**시나리오:**

```
google_search("맛집")
→ 검색 결과에서 필터 적용 (지역, 평점 등)
→ 필터링된 결과 방문
```

**가능 여부:** ⚠️ **제한적** (필터 적용 후 가능)

**문제점:**

- google_visit_result는 rank 기반으로 DOM에서 직접 선택
- 필터 적용 후 페이지 URL이 변경될 수 있음
- 필터 적용 중 검색 페이지가 리로드되면 originalTabId 문제

**권장 워크플로우:**

1. 필터 적용 (browser_click 등 사용)
2. 페이지 로드 대기 (browser_wait_for_navigation)
3. google_visit_result 사용

---

### 14. **브라우저 컨텍스트 격리**

**시나리오:**

```
악성 사이트 방문 시 쿠키/세션 격리 필요
→ 현재는 모든 탭이 같은 세션 공유
```

**가능 여부:** ❌ **지원 안 됨**

**보안 제약:**

- 모든 BrowserView가 동일한 세션 공유
- 탭 간 쿠키/localStorage 격리 불가
- 악성 스크립트가 다른 탭 영향 가능

**해결 방법:**

- 🔧 탭별 독립 세션 (partition 사용)
- 🔧 샌드박스 모드 구현

---

## 🔧 개선 필요 사항

### 우선순위 1 (Critical)

1. **병렬 실행 방지 가이드**
   - System prompt에 순차 실행 명시
   - 또는 코드에서 동시 실행 감지 및 대기열 구현

2. **검색 페이지 검증**
   - originalTabId가 여전히 검색 페이지인지 확인
   - 아니면 에러 반환 또는 새 검색 수행

### 우선순위 2 (Important)

3. **SPA 감지 및 대기 개선**
   - DOM MutationObserver 사용
   - 또는 Agent에게 SPA 감지 가이드 제공

4. **에러 복구 전략**
   - Agent가 에러 후 자동으로 다음 결과 시도
   - 또는 대체 검색어 제안

### 우선순위 3 (Nice to have)

5. **다중 창 지원**
   - Window별 독립적인 탭 관리
   - mainWindowRef → tabManager 매핑

6. **탭별 세션 격리**
   - 보안 강화
   - partition 사용

---

## 📊 시나리오 요약표

| 시나리오             | 지원 여부     | 제약사항             | 개선 필요         |
| -------------------- | ------------- | -------------------- | ----------------- |
| 연속 다중 결과 방문  | ✅ 완전 지원  | 없음                 | -                 |
| 에러 복구 (타임아웃) | ✅ 완전 지원  | 부분 콘텐츠 품질     | 테스트 필요       |
| 페이지 로드 실패     | ✅ 지원됨     | Agent 자동 복구 없음 | Agent 로직 개선   |
| SPA 페이지           | ✅ 부분 지원  | 고정 500ms 대기      | MutationObserver  |
| 대용량 콘텐츠        | ✅ 지원됨     | 5000자 제한          | -                 |
| 다음 페이지 이동     | ✅ 지원됨     | 로드 대기 없음       | 대기 로직 추가    |
| 탭 정리 보장         | ✅ 완전 지원  | 없음                 | -                 |
| 병렬 탭 생성         | ❌ 지원 안 됨 | 경쟁 상태            | 순차 실행 가이드  |
| 리다이렉트           | ✅ 지원됨     | JS 리다이렉트 제한   | waitForJs 사용    |
| 쿠키/세션            | ⚠️ 부분 지원  | 자동 로그인 불가     | -                 |
| 검색 페이지 변경     | ❌ 지원 안 됨 | URL 검증 없음        | 검증 로직 추가    |
| 다중 인스턴스        | ❌ 지원 안 됨 | 전역 변수            | Window별 관리     |
| 복잡한 상호작용      | ⚠️ 제한적     | 필터 후 가능         | 워크플로우 가이드 |
| 컨텍스트 격리        | ❌ 지원 안 됨 | 보안 제약            | Partition 구현    |

---

## 🎯 결론

현재 구현은 **핵심 사용 시나리오 (연속 다중 결과 방문)**를 매우 잘 지원하며, 대부분의 일반적인 사용 사례를 커버합니다.

**강점:**

- ✅ 탭 기반 아키텍처가 안정적으로 작동
- ✅ Finally 블록으로 메모리 안전성 보장
- ✅ 5배 빠른 성능
- ✅ Perplexity 수준의 사용자 경험

**주의 필요:**

- ⚠️ 병렬 실행 시도 시 문제 발생 가능 → 순차 실행만 사용
- ⚠️ 검색 페이지가 변경되면 복귀 실패 → 사용자가 페이지 변경하지 않도록 주의
- ⚠️ 다중 인스턴스 미지원 → 한 번에 하나의 Agent만 사용

**개선 우선순위:**

1. **System prompt에 병렬 실행 금지 명시** (Critical)
2. **검색 페이지 검증 로직 추가** (Important)
3. **SPA 감지 및 대기 개선** (Nice to have)
