# SEPilot Desktop 테스트 가이드

## 개요

SEPilot Desktop의 테스트는 Jest와 Testing Library를 사용하여 구성되어 있습니다.
Frontend (React 컴포넌트)와 Backend (Node.js 라이브러리) 테스트로 분리되어 있습니다.

## 테스트 구조

```
tests/
├── frontend/              # Frontend 테스트 (React components, hooks)
│   ├── components/        # 컴포넌트 테스트
│   │   ├── chat/          # 채팅 컴포넌트
│   │   │   ├── unified/   # 통합 채팅 컴포넌트
│   │   │   └── ...
│   │   ├── settings/      # 설정 컴포넌트
│   │   ├── browser/       # 브라우저 컴포넌트
│   │   ├── editor/        # 에디터 컴포넌트
│   │   ├── markdown/      # 마크다운 렌더러
│   │   ├── mcp/           # MCP 서버 설정
│   │   ├── rag/           # RAG 컴포넌트
│   │   └── ui/            # UI 컴포넌트 (shadcn/ui)
│   ├── hooks/             # 커스텀 훅 테스트
│   ├── lib/               # 프론트엔드 유틸리티 테스트
│   ├── accessibility.test.tsx     # 접근성 테스트
│   ├── error-handling.test.tsx    # 에러 처리 테스트
│   ├── interactions.test.tsx      # 사용자 상호작용 테스트
│   ├── theme.test.tsx             # 테마 테스트
│   └── user-flows.test.tsx        # 사용자 플로우 테스트
├── lib/                   # Backend/Library 테스트
│   ├── auth/              # 인증 테스트
│   ├── chat/              # 채팅 로직 테스트
│   ├── comfyui/           # ComfyUI 클라이언트 테스트
│   ├── config/            # 설정 관리 테스트
│   ├── documents/         # 문서 처리 테스트
│   ├── langgraph/         # LangGraph 테스트
│   ├── llm/               # LLM 클라이언트 테스트
│   ├── mcp/               # MCP 클라이언트 테스트
│   ├── presentation/      # 프레젠테이션 테스트
│   ├── store/             # 상태 관리 테스트
│   └── utils/             # 유틸리티 테스트
├── __mocks__/             # Mock 파일
│   ├── fileMock.js        # 파일 mock
│   ├── mermaid.js         # Mermaid mock
│   ├── react-syntax-highlighter.js
│   └── react-syntax-highlighter-styles.js
├── setup.ts               # Frontend 테스트 설정
├── setup.backend.ts       # Backend 테스트 설정
└── README.md              # 이 파일

```

## 테스트 실행

### 전체 테스트 실행

```bash
pnpm test
```

### Frontend 테스트만 실행

```bash
pnpm test:frontend
```

### Backend 테스트만 실행

```bash
pnpm test:backend
```

### Watch 모드

```bash
pnpm test:watch              # 전체 watch
pnpm test:watch:frontend     # Frontend watch
pnpm test:watch:backend      # Backend watch
```

### 커버리지 리포트

```bash
pnpm test:coverage           # 전체 커버리지
pnpm test:coverage:frontend  # Frontend 커버리지
pnpm test:coverage:backend   # Backend 커버리지
```

## Jest 설정

### Frontend 프로젝트 (tests/frontend)

- **환경**: jsdom (브라우저 환경 시뮬레이션)
- **프리셋**: ts-jest
- **테스트 대상**: React 컴포넌트, 훅, 프론트엔드 유틸리티
- **Setup 파일**: `tests/setup.ts`

### Backend 프로젝트 (tests/lib)

- **환경**: node
- **프리셋**: ts-jest
- **테스트 대상**: 라이브러리, 유틸리티, 백엔드 로직
- **Setup 파일**: `tests/setup.backend.ts`

## Mock 파일

### electronAPI Mock

`setup.ts`와 `setup.backend.ts`에서 전역 `window.electronAPI` mock을 제공합니다.

```typescript
// 테스트에서 Electron 모드 활성화
import { enableElectronMode, mockElectronAPI } from '../../../setup';

enableElectronMode();
mockElectronAPI.config.load.mockResolvedValue({ success: true, data: {...} });
```

### localStorage Mock

localStorage는 자동으로 mock되어 있습니다.

```typescript
localStorage.setItem('key', 'value');
expect(localStorage.getItem('key')).toBe('value');
```

### i18n Mock

react-i18next는 한국어 번역을 기본으로 mock되어 있습니다.

```typescript
const { t } = useTranslation();
// t('settings.title') => '설정'
```

## 테스트 작성 가이드

### 1. 컴포넌트 테스트 기본 구조

```typescript
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MyComponent } from '@/components/MyComponent';

describe('MyComponent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    render(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('should handle click event', () => {
    const mockOnClick = jest.fn();
    render(<MyComponent onClick={mockOnClick} />);

    fireEvent.click(screen.getByRole('button'));
    expect(mockOnClick).toHaveBeenCalled();
  });
});
```

### 2. 비동기 테스트

```typescript
import { waitFor } from '@testing-library/react';

it('should load data asynchronously', async () => {
  render(<MyComponent />);

  await waitFor(() => {
    expect(screen.getByText('Loaded')).toBeInTheDocument();
  });
});
```

### 3. 사용자 이벤트 테스트

```typescript
import userEvent from '@testing-library/user-event';

it('should handle user input', async () => {
  const user = userEvent.setup();
  render(<MyComponent />);

  const input = screen.getByRole('textbox');
  await user.type(input, 'Hello World');

  expect(input).toHaveValue('Hello World');
});
```

### 4. Store 테스트

```typescript
import { useChatStore } from '@/lib/store/chat-store';

jest.mock('@/lib/store/chat-store');

it('should use chat store', () => {
  const mockStore = {
    messages: [],
    addMessage: jest.fn(),
  };

  (useChatStore as unknown as jest.Mock).mockReturnValue(mockStore);

  render(<MyComponent />);
  // Test component behavior
});
```

## 주의사항

### Skip된 테스트

일부 테스트는 다음 이유로 skip되어 있습니다:

#### describe.skip (파일 레벨)

1. **langgraph/state.test.ts**: ESM 파싱 문제 (p-retry 의존성)
   - 실제 환경에서는 정상 작동하므로 skip 유지

#### it.skip (개별 테스트)

1. **Sidebar 구조 변경**: ChatHistory 컴포넌트로 기능 이동
   - `user-flows.test.tsx`: 대화 생성/선택/검색 플로우 (11개)
   - `error-handling.test.tsx`: 동시 작업 테스트 (1개)
   - `interactions.test.tsx`: 키보드 단축키 (1개)
   - `Sidebar.test.tsx`: 채팅 뷰 모드 버튼 (4개)
   - `ChatHistory.test.tsx`: 활성 대화 하이라이트 (1개)

2. **SSR 테스트**: JSDOM 환경에서 테스트 불가
   - `platform.test.ts`: window undefined 테스트 (2개)
   - `config/manager.test.ts`: SSR 환경 테스트 (3개)

3. **비동기/타이밍 문제**
   - `SimpleChatInput.test.tsx`: 스트림 이벤트 에러, abort 시그널 (2개)
   - `DocumentList.test.tsx`: 성공 메시지 타이밍 (1개)

4. **예외 처리 catch 블록**
   - `BookmarksList.test.tsx`: 폴더 추가/북마크 삭제 예외 (3개)

5. **제거된 UI 기능**
   - `BrowserSettings.test.tsx`: 미래 설정 메시지 (1개)
   - `SidebarEditor.test.tsx`: Settings 버튼 관련 (3개)

### Skip 정책

- **유지 필요**: ESM/환경 제약, 아키텍처 변경
- **개선 필요**: 비동기 타이밍, 예외 처리 테스트
- **제거 가능**: 제거된 기능, 구조 변경으로 불필요해진 테스트

### 테스트 격리

- 각 테스트는 독립적으로 실행되어야 합니다
- `beforeEach`에서 mock을 초기화하세요
- 전역 상태를 변경하는 경우 `afterEach`에서 복원하세요

### Performance

- 불필요한 컴포넌트 렌더링을 피하기 위해 적절한 mock 사용
- 대용량 데이터 테스트는 작은 샘플 데이터 사용
- timeout이 필요한 경우 명시적으로 설정

## 커버리지 목표

현재 커버리지 목표:

- Branches: 42%
- Functions: 48%
- Lines: 50%
- Statements: 50%

목표는 점진적으로 향상될 예정입니다.

## 트러블슈팅

### Mock이 작동하지 않을 때

```bash
# Jest 캐시 클리어
pnpm test --clearCache
```

### TypeScript 타입 에러

```bash
# 타입 체크
pnpm type-check
```

### 특정 테스트만 실행

```bash
pnpm test <파일명 또는 패턴>
# 예: pnpm test ChatArea
```

## 참고 자료

- [Jest 공식 문서](https://jestjs.io/)
- [Testing Library 공식 문서](https://testing-library.com/)
- [Testing Library React 가이드](https://testing-library.com/docs/react-testing-library/intro/)
- [Jest DOM Matchers](https://github.com/testing-library/jest-dom)
