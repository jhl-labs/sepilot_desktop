---
description: Run tests and fix any failures
argument-hint: '[test-file-pattern]'
---

# Run Tests

테스트를 실행하고 실패한 테스트를 분석 및 수정합니다.

**Target**: $1 (지정하지 않으면 전체 테스트)

## Test Execution Steps

1. **Run tests**:

   ```bash
   pnpm run test $1
   ```

2. **Analyze failures**:
   - 실패한 테스트 식별
   - 에러 메시지 분석
   - 실패 원인 파악

3. **Fix issues**:
   - 코드 수정
   - 테스트 업데이트 (필요시)
   - 다시 테스트 실행하여 확인

## Test Types

### Unit Tests

개별 함수/컴포넌트 테스트:

```bash
pnpm run test:unit
```

### Integration Tests

IPC 통신, 서비스 통합 테스트:

```bash
pnpm run test:integration
```

### E2E Tests

전체 애플리케이션 플로우 테스트:

```bash
pnpm run test:e2e
```

## Common Test Issues

### Type Errors

```typescript
// ❌ 타입 불일치
expect(result).toBe('string');

// ✅ 올바른 타입 검증
expect(typeof result).toBe('string');
expect(result).toEqual(expectedValue);
```

### Async Issues

```typescript
// ❌ async 처리 누락
test('async operation', () => {
  const result = asyncFunction(); // Promise<T> 반환
  expect(result).toBe(expected); // 실패
});

// ✅ async/await 사용
test('async operation', async () => {
  const result = await asyncFunction();
  expect(result).toBe(expected);
});
```

### Mock Issues

```typescript
// IPC mock 설정
beforeEach(() => {
  window.electron = {
    invoke: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
});
```

## Coverage

테스트 커버리지 확인:

```bash
pnpm run test:coverage
```

목표: 80% 이상 커버리지 유지

## After Testing

1. 모든 테스트 통과 확인
2. 커버리지 확인
3. 타입 체크 실행: `pnpm run type-check`
4. Lint 실행: `pnpm run lint`
5. 변경사항 커밋
