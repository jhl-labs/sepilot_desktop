# 프론트엔드 UX 테스트

이 디렉토리에는 UI 컴포넌트의 다양한 UX 측면에 대한 테스트 케이스가 포함되어 있습니다.

## 테스트 파일 구조

### `accessibility.test.tsx`

접근성(A11y) 테스트 케이스

- 키보드 네비게이션 (Tab, Shift+Tab, Enter, Space)
- ARIA 속성 검증
- 포커스 관리
- 스크린 리더 지원
- 색상 대비
- 키보드 단축키 문서화

### `interactions.test.tsx`

사용자 인터랙션 테스트 케이스

- 버튼 클릭 인터랙션
- 폼 입력 (텍스트, 여러 줄)
- 드래그 앤 드롭
- 키보드 단축키 동작
- 마우스 인터랙션 (더블 클릭, 호버, 우클릭)
- 스크롤 인터랙션
- 포커스 관리

### `theme.test.tsx`

테마 및 UI 상태 테스트 케이스

- 다크/라이트 모드 전환
- 테마 초기화 및 저장
- 하이드레이션 처리
- 로딩 상태 표시
- 에러 상태 표시
- 빈 상태 표시
- 성공 상태 피드백
- 반응형 디자인

### `user-flows.test.tsx`

사용자 플로우 테스트 케이스

- 대화 생성 플로우
- 대화 선택 플로우
- 대화 삭제 플로우
- 대화 제목 편집 플로우
- 메시지 전송 플로우
- 대화 검색 플로우
- 설정 변경 플로우
- 통합 플로우

### `error-handling.test.tsx`

에러 처리 및 로딩 상태 테스트 케이스

- 네트워크 에러 처리
- 입력 검증 에러
- 권한 에러
- 데이터 로딩 에러
- 로딩 상태 표시
- 경계 케이스 (빈 상태, 매우 긴 콘텐츠)
- 동시 작업 처리
- 특수 문자 처리

## 테스트 실행

### 모든 프론트엔드 테스트 실행

```bash
pnpm test tests/frontend
```

### 특정 테스트 파일 실행

```bash
pnpm test tests/frontend/accessibility.test.tsx
```

### Watch 모드로 실행

```bash
pnpm test:watch tests/frontend
```

### 커버리지 확인

```bash
pnpm test:coverage tests/frontend
```

## 테스트 작성 가이드

### 기본 구조

```typescript
import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { YourComponent } from '@/components/YourComponent';

describe('컴포넌트 테스트', () => {
  beforeEach(() => {
    // 테스트 전 초기화
  });

  it('기능이 올바르게 동작해야 함', async () => {
    const user = userEvent.setup();
    render(<YourComponent />);

    // 테스트 로직
  });
});
```

### 모킹

- `window.electronAPI`: `tests/setup.ts`의 `mockElectronAPI` 사용
- `useChatStore`: `jest.mock('@/lib/store/chat-store')` 사용
- `next-themes`: `jest.mock('next-themes')` 사용

### 접근성 테스트

- `screen.getByRole()`: 역할 기반 요소 찾기
- `screen.getByLabelText()`: 레이블로 입력 필드 찾기
- `toHaveAttribute()`: ARIA 속성 검증
- `toHaveFocus()`: 포커스 상태 검증

### 사용자 인터랙션 테스트

- `userEvent.click()`: 클릭 시뮬레이션
- `userEvent.type()`: 텍스트 입력 시뮬레이션
- `userEvent.keyboard()`: 키보드 입력 시뮬레이션
- `fireEvent`: 낮은 수준의 이벤트 시뮬레이션

### 비동기 처리

- `waitFor()`: 비동기 작업 완료 대기
- `findBy*` 쿼리: 자동으로 waitFor 포함

## 베스트 프랙티스

1. **사용자 관점에서 테스트**: 실제 사용자가 어떻게 상호작용하는지 시뮬레이션
2. **접근성 우선**: 키보드 네비게이션과 스크린 리더 지원 확인
3. **에러 케이스 포함**: 정상 케이스뿐만 아니라 에러 상황도 테스트
4. **명확한 테스트 이름**: 테스트가 무엇을 검증하는지 명확히 표현
5. **독립적인 테스트**: 각 테스트는 독립적으로 실행 가능해야 함

## 참고 자료

- [React Testing Library 문서](https://testing-library.com/react)
- [Jest 문서](https://jestjs.io/)
- [Accessibility Testing 가이드](https://www.w3.org/WAI/test-evaluate/)
- [User Event 문서](https://testing-library.com/docs/user-event/intro)
