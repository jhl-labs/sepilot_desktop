# Browser Extension - Agent 개선 사항

## 🚀 주요 기능

### **Perplexity 모드 - 자동 웹 검색 & 정보 종합**

Browser Agent가 이제 **Perplexity처럼 작동**합니다!

**자동 검색 트리거**:
사용자가 명시적으로 "검색해줘"라고 요청하지 않아도, 다음 경우 자동으로 웹 검색을 수행합니다:

- ✅ **최신/실시간 정보**: "2024년 노벨상", "최신 AI 뉴스", "latest news"
- ✅ **사실 확인**: 통계, 가격, 날짜, 특정 사실
- ✅ **모르는 주제**: Agent가 확신 없는 정보
- ✅ **특정 엔티티**: 기업, 제품, 인물, 장소 등 최신 업데이트 가능성 있는 정보

**Perplexity 스타일 응답 프로세스**:

1. **자동 감지**: 질문 분석 후 웹 검색 필요 여부 판단
2. **다중 소스 조사**: 상위 2-3개 검색 결과 방문 및 정보 수집
3. **정보 종합**: 여러 소스의 정보를 일관된 답변으로 통합
4. **출처 인용**: 모든 답변에 `**출처:**` 섹션 포함 (링크 + 설명)
5. **관련 검색어**: 추가 탐색을 위한 관련 검색어 제안

**예시**:

```
사용자: "2024년 노벨 물리학상 수상자는?"

Agent 자동 실행:
1. google_search({ query: "2024 노벨 물리학상 수상자", dateFilter: "year" })
2. google_extract_results({ maxResults: 5 })
3. google_visit_result({ rank: 1, extractType: "summary" })
4. google_visit_result({ rank: 2, extractType: "summary" })
5. 정보 종합 및 출처 인용

응답:
"2024년 노벨 물리학상은 John Hopfield와 Geoffrey Hinton이 수상했습니다...

**출처:**
- [The Nobel Prize - 2024년 물리학상 발표](https://nobelprize.org/...)
- [한국일보 - 인공지능 선구자 힌튼 교수 노벨상 수상](https://www.hankookilbo.com/...)
"
```

**검색하지 않는 경우**:

- 단순 브라우저 자동화: "네이버 접속해줘"
- 특정 URL 방문: "github.com으로 가줘"
- UI 상호작용: 클릭, 타이핑, 스크롤 작업

**변경 위치**: `browser-agent.ts:508-539`

---

## 수정된 주요 버그

### 1. **무한 루프 방지 개선**

- **문제**: 같은 tool call이 계속 반복되어 agent가 멈춤
- **해결**:
  - 반복 감지 threshold를 3회 → 2회로 감소 (더 빠른 감지)
  - 시간 윈도우 추가 (10초 내 같은 호출 반복 감지)
  - 반복 감지 시 즉시 중단 및 에러 메시지 표시

**변경 위치**: `browser-agent.ts:1222-1273`

```typescript
// 연속 반복 감지: 최근 LOOP_THRESHOLD개가 모두 같은지 확인
const LOOP_THRESHOLD = 2; // 감소: 3 -> 2
const timeWindow = 10000; // 10초 내 반복
```

### 2. **Fallback 전략 충돌 해결**

- **문제**: 여러 fallback 전략(vision, scroll, wait)이 동시에 실행되어 혼란
- **해결**:
  - 우선순위 기반 실행 (한 번에 하나씩만)
  - 플래그 통합 관리 (fallbackState 객체)
  - 각 fallback은 한 번만 실행되도록 제한

**변경 위치**: `browser-agent.ts:998-1006, 1472-1665`

```typescript
const fallbackState = {
  visionFallbackUsed: false,
  postVerifyPending: false,
  lastPageFingerprint: null,
  unchangedCount: 0,
  scrollRecoveryUsed: false,
  waitInjected: false,
};
```

### 3. **State 동기화 개선**

- **문제**: tool_calls 제거 시 인덱스 오류
- **해결**:
  - 명확한 인덱스 사용 (lastMsgIndex)
  - 마지막 메시지만 안전하게 수정

**변경 위치**: `browser-agent.ts:1667-1678`

```typescript
const lastMsgIndex = updatedMessages.length - 1;
if (lastMsgIndex >= 0 && updatedMessages[lastMsgIndex]?.tool_calls) {
  updatedMessages[lastMsgIndex] = {
    ...updatedMessages[lastMsgIndex],
    tool_calls: undefined,
  };
}
```

### 4. **Tool Results 정리 로직 개선**

- **문제**: Tool results가 계속 누적되어 프롬프트 크기 증가
- **해결**:
  - 실패한 결과(8개)와 성공한 결과(4개)를 분리 저장
  - 총 12개 제한은 유지하되, 실패 정보를 더 오래 보관 (복구 전략용)

**변경 위치**: `browser-agent.ts:69-91`

### 5. **재시도 로직 개선**

- **문제**: 모든 에러에 대해 무조건 재시도
- **해결**:
  - 재시도 횟수 감소 (3 → 2)
  - 재시도 간격 감소 (1000ms → 500ms)
  - 선택적 재시도 조건 추가 (shouldRetry 콜백)

**변경 위치**: `browser-agent.ts:81-107`

### 6. **🔴 CRITICAL: 스크롤 복구 로직 반전 오류 수정**

- **문제**: 스크롤 복구 조건문이 반대로 되어 있어 **전혀 실행되지 않음**
  - 기존: `if (scrollRecoveryUsed && ...)` → 이미 사용된 경우에만 실행 (논리 오류!)
  - 결과: 페이지 변화 없음 상황에서 스크롤 재시도가 작동하지 않음
- **해결**:
  - 조건문 수정: `if (!scrollRecoveryUsed && ...)`
  - 아직 사용하지 않은 경우에 실행되도록 정상화

**변경 위치**: `browser-agent.ts:1704`

**영향**: Fallback 전략 중 하나가 완전히 비활성화되어 있던 중대한 버그

### 7. **Vision Fallback 중복 제거 및 우선순위 체계 개선**

- **문제**: 두 개의 Vision Fallback이 같은 플래그를 공유하여 경쟁 상태 발생
  - Vision #1 (unchangedCount >= 2): screenshot + search
  - Vision #2 (hasRepeatedFailure): screenshot만
  - 두 조건이 동시에 만족되면 첫 번째만 실행되어 우선순위 불명확
- **해결**:
  - 두 Vision Fallback을 하나로 통합
  - 조건: `unchangedCount >= 2 || hasRepeatedFailure`
  - **Aggressive 모드** (unchangedCount >= 2): screenshot + search (maxMarkers: 25)
  - **Normal 모드** (hasRepeatedFailure): screenshot만 (maxMarkers: 30)
  - Fallback 우선순위 명확화:
    - **우선순위 1**: Scroll Recovery (가볍고 빠름)
    - **우선순위 2**: Vision Fallback (무겁고 느림)

**변경 위치**: `browser-agent.ts:1658-1760`

**영향**: Fallback 전략 간 충돌 방지, 리소스 효율적인 복구 순서 확립

## 테스트 방법

1. **무한 루프 테스트**:
   - 같은 작업을 반복하는 시나리오 실행
   - 2회 연속 같은 tool call 시 즉시 중단되는지 확인

2. **Fallback 전략 테스트**:
   - 페이지 찾기 실패 시나리오
   - Scroll Recovery가 먼저 실행되는지 확인 (우선순위 1)
   - Vision Fallback이 그 다음 실행되는지 확인 (우선순위 2)
   - 각 fallback이 한 번만 실행되는지 확인
   - Fallback들이 충돌하지 않는지 확인

3. **스크롤 복구 테스트**:
   - 페이지가 1회 이상 변하지 않는 상황 생성
   - Scroll Recovery가 정상 실행되는지 확인
   - 스크롤 후 페이지 변화가 감지되는지 확인

4. **Vision Fallback 통합 테스트**:
   - **Aggressive 모드**: unchangedCount >= 2 상황에서 screenshot + search 실행 확인
   - **Normal 모드**: 반복 실패 상황에서 screenshot만 실행 확인
   - 두 조건이 동시 만족 시 Aggressive 모드 우선 실행 확인

5. **메모리 테스트**:
   - 긴 대화 세션 실행
   - Tool results가 12개 이상 누적되지 않는지 확인
   - 실패 정보가 우선 보존되는지 확인 (8개)
   - 성공 정보는 4개만 유지되는지 확인

## 알려진 제한사항

1. **Error Recovery 전략 (types/errors.ts)**:
   - 6가지 체계적인 Error Recovery 전략이 정의되어 있음
   - 현재는 수동 Fallback 전략으로 충분히 작동 중
   - 향후 확장을 위한 설계로 유지 (의도된 상태)

2. **Vision API 통합**:
   - `browser_analyze_with_vision` 도구 정의됨
   - 실제 Vision API 연동은 향후 구현 예정
   - 현재는 annotated screenshot으로 대체

3. **Workflow 및 Session 관리**:
   - types/workflow.ts에 정의되어 있지만 미사용
   - 향후 복잡한 다단계 작업 지원 시 활용 예정

4. **Agent 보고서**:
   - 완벽하게 구현되어 있으며 정상 작동 중
   - ExecutionContext 기반으로 상세한 보고서 생성
   - 통계, 성과, 문제점, 다음 단계 제안 포함

## 다음 개선 사항

1. ~~Error Recovery 전략 통합~~ → 현재 수동 Fallback으로 충분
2. ~~Tool Call 검증 강화~~ → 무한 루프 감지로 해결
3. ~~Agent 상태 관리 개선~~ → fallbackState 통합 완료
4. ~~더 스마트한 Fallback 전략~~ → 우선순위 체계 확립

### 새로운 개선 목표

1. Vision API 실제 연동 (GPT-4V, Claude Vision 등)
2. Workflow 기반 다단계 작업 지원
3. 더 세밀한 에러 분류 및 처리
4. Agent 학습 및 최적화 (Tool 선택 패턴 분석)

## 개선 완료 요약

✅ **2개의 중대한 버그 수정**:

- 스크롤 복구 로직 반전 오류 (CRITICAL)
- Vision Fallback 중복 및 경쟁 상태

✅ **Fallback 전략 체계 확립**:

- 우선순위 명확화 (Scroll → Vision)
- 통합된 상태 관리 (fallbackState)
- 리소스 효율적인 실행 순서

✅ **안정성 개선**:

- 무한 루프 조기 감지 (2회, 10초 윈도우)
- Tool results 메모리 최적화 (실패 8개, 성공 4개)
- 재시도 로직 개선 (2회, 500ms 간격)

✅ **검증 완료**:

- Agent 보고서 생성 로직 정상 작동
- Error Recovery 전략 의도적 미사용 확인
- 모든 Fallback 전략 우선순위 검증
