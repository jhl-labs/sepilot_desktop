# Code Review Prompt

이 프롬프트를 사용하여 Cursor AI에게 코드 리뷰를 요청하세요.

## 사용 방법

1. Cursor Chat 열기 (Ctrl/Cmd + L)
2. 아래 프롬프트 복사하여 붙여넣기
3. `[코드]` 부분에 리뷰할 코드 붙여넣기

## 프롬프트

```
다음 코드를 SEPilot Desktop 프로젝트의 기준에 따라 리뷰해주세요:

[코드]

다음 항목을 확인해주세요:

1. **TypeScript Strict Mode**: any 사용, 타입 안전성
2. **보안**: Path Traversal, XSS, SQL Injection, Command Injection
3. **IPC 통신**: 에러 처리, 입력 검증, 채널 네이밍
4. **성능**: 불필요한 리렌더, IPC 호출 최적화
5. **에러 처리**: try-catch, 명확한 에러 메시지
6. **코딩 스타일**: shadcn/ui 패턴, Zustand 슬라이스 패턴
7. **테스트**: 테스트 가능성, 의존성 주입

각 항목에 대해:
- ✅ 잘 작성된 부분
- ⚠️ 개선이 필요한 부분
- ❌ 반드시 수정해야 하는 부분

개선된 코드를 제시해주세요.
```

## 예시

### Input

```typescript
function getData(id) {
  const data = await window.electron.invoke('data:get', id);
  return data;
}
```

### Expected Output

```
❌ **반드시 수정해야 하는 부분:**

1. TypeScript 타입 누락
2. 에러 처리 없음
3. IPC 응답 검증 없음

✅ **개선된 코드:**

typescript
async function getData(id: string): Promise<Data | null> {
  try {
    const result = await window.electron.invoke('data:get', { id });

    if (!result.success) {
      logger.error('Failed to get data:', result.error);
      return null;
    }

    return result.data;
  } catch (error) {
    logger.error('IPC call failed:', error);
    return null;
  }
}
```
