# Browser Extension - Agent 개선 사항

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

## 테스트 방법

1. **무한 루프 테스트**:
   - 같은 작업을 반복하는 시나리오 실행
   - 2회 연속 같은 tool call 시 즉시 중단되는지 확인

2. **Fallback 전략 테스트**:
   - 페이지 찾기 실패 시나리오
   - Vision fallback이 한 번만 실행되는지 확인
   - 다른 fallback들과 충돌하지 않는지 확인

3. **메모리 테스트**:
   - 긴 대화 세션 실행
   - Tool results가 12개 이상 누적되지 않는지 확인
   - 실패 정보가 우선 보존되는지 확인

## 알려진 제한사항

1. Error Recovery 전략은 정의되어 있지만 아직 agent에 통합되지 않음
2. Vision API 통합은 향후 구현 예정
3. Workflow 및 Session 관리는 향후 개선 예정

## 다음 개선 사항

1. Error Recovery 전략 통합
2. Tool Call 검증 강화
3. Agent 상태 관리 개선
4. 더 스마트한 Fallback 전략
