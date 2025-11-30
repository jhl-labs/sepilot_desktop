# 기여 가이드 (Contributing Guide)

SEPilot Desktop 프로젝트에 기여해주셔서 감사합니다! 이 문서는 프로젝트에 기여하는 방법을 안내합니다.

## 목차

- [행동 강령](#행동-강령)
- [시작하기](#시작하기)
- [개발 환경 설정](#개발-환경-설정)
- [코딩 규칙](#코딩-규칙)
- [커밋 메시지 규칙](#커밋-메시지-규칙)
- [Pull Request 프로세스](#pull-request-프로세스)
- [이슈 제출](#이슈-제출)

## 행동 강령

이 프로젝트는 모든 기여자가 서로 존중하고 협력하는 환경을 만들기 위해 노력합니다. 참여하는 모든 분들께서는 친절하고 건설적인 태도로 소통해주시기 바랍니다.

## 시작하기

1. **Repository Fork**

   ```bash
   # GitHub에서 프로젝트를 Fork합니다
   ```

2. **로컬 클론**

   ```bash
   git clone https://github.com/YOUR_USERNAME/sepilot-desktop.git
   cd sepilot-desktop
   ```

3. **의존성 설치**

   ```bash
   npm install
   # 또는
   pnpm install
   # 또는
   yarn install
   ```

4. **개발 브랜치 생성**
   ```bash
   git checkout -b feature/your-feature-name
   # 또는
   git checkout -b fix/your-bug-fix
   ```

## 개발 환경 설정

### 요구 사항

- Node.js >= 18.0.0
- npm, yarn, 또는 pnpm

### 개발 서버 실행

```bash
# Next.js + Electron 동시 실행 (권장)
npm run dev

# Next.js만 실행 (브라우저 테스트)
npm run dev:next
```

### 코드 품질 도구

```bash
# ESLint 실행
npm run lint

# ESLint 자동 수정 + Prettier 포맷팅
npm run lint:fix

# TypeScript 타입 체크
npm run type-check

# Prettier 포맷팅만 실행
npm run format
```

## 코딩 규칙

### TypeScript

- **엄격한 타입 체크 사용**: `strict: true` 모드 준수
- **any 타입 최소화**: 가능한 한 명시적 타입 정의
- **제네릭 활용**: 타입 안전성 확보
- **인터페이스 우선**: type보다 interface를 우선 사용 (확장 가능성)

### 코드 스타일

- **Prettier 설정 준수**: 자동 포맷팅 적용
- **ESLint 규칙 준수**: 모든 경고 및 에러 해결
- **명확한 변수명**: 축약어 지양, 의미 있는 이름 사용
- **함수 분리**: 단일 책임 원칙 준수 (하나의 함수는 하나의 일만)
- **주석 작성**: 복잡한 로직에 대한 설명 추가 (단, 코드 자체가 명확하면 주석 불필요)

### 파일 구조

```typescript
// 1. Import 그룹화 (외부 라이브러리 -> 내부 모듈 -> 타입)
import React from 'react';
import { Button } from '@/components/ui/button';
import { ChatMessage } from '@/types';

// 2. 타입 정의
interface Props {
  message: ChatMessage;
}

// 3. 컴포넌트/함수 구현
export function MessageBubble({ message }: Props) {
  // ...
}
```

### Next.js 규칙

- **App Router 사용**: pages router 아님
- **Server Components 기본**: 필요시에만 Client Components ('use client')
- **API Routes**: `/app/api/` 하위에 구성

### Electron 규칙

- **프로세스 분리**: Main 프로세스와 Renderer 프로세스 명확히 분리
- **안전한 IPC**: preload 스크립트를 통한 통신
- **보안 설정**: `nodeIntegration: false`, `contextIsolation: true` 유지

## 커밋 메시지 규칙

### 커밋 메시지 형식

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type

- `feat`: 새로운 기능 추가
- `fix`: 버그 수정
- `docs`: 문서 수정
- `style`: 코드 포맷팅 (기능 변경 없음)
- `refactor`: 코드 리팩토링
- `test`: 테스트 추가/수정
- `chore`: 빌드 프로세스, 도구 설정 등

### 예시

```
feat(chat): Add message edit functionality

- Add edit button to message hover actions
- Implement message update IPC handler
- Update UI to show edit mode

Closes #123
```

```
fix(electron): Fix window size on macOS

The window was not respecting minimum size constraints on macOS.
Added proper size validation in window creation.

Fixes #456
```

## Pull Request 프로세스

### PR 제출 전 체크리스트

- [ ] 코드가 프로젝트 코딩 규칙을 따르는가?
- [ ] `npm run lint`를 실행하여 모든 경고/에러를 수정했는가?
- [ ] `npm run type-check`를 실행하여 타입 에러가 없는가?
- [ ] 변경사항에 대한 테스트를 추가/수정했는가?
- [ ] 문서를 업데이트했는가? (README, PLAN.md 등)
- [ ] 커밋 메시지가 규칙을 따르는가?

### PR 템플릿

```markdown
## 변경 내용

<!-- 무엇을 변경했는지 간단히 설명 -->

## 변경 이유

<!-- 왜 이 변경이 필요한지 설명 -->

## 테스트 방법

<!-- 이 변경사항을 어떻게 테스트할 수 있는지 설명 -->

## 스크린샷 (선택사항)

<!-- UI 변경이 있다면 스크린샷 추가 -->

## 관련 이슈

<!-- Closes #123, Fixes #456 등 -->

## 체크리스트

- [ ] 코드 린팅 통과
- [ ] 타입 체크 통과
- [ ] 로컬에서 테스트 완료
- [ ] 문서 업데이트
```

### PR 리뷰 프로세스

1. **PR 제출**: 위 체크리스트를 모두 확인 후 제출
2. **자동 검사**: CI/CD 파이프라인이 자동으로 린트, 타입 체크, 빌드 검사
3. **코드 리뷰**: 메인테이너가 코드 리뷰 진행
4. **수정 요청**: 필요시 리뷰어의 피드백에 따라 수정
5. **승인 및 병합**: 모든 검사 통과 및 승인 후 메인 브랜치에 병합

## 이슈 제출

### 버그 제보

```markdown
## 버그 설명

<!-- 무엇이 잘못되었는지 명확하게 설명 -->

## 재현 방법

1. '...'로 이동
2. '...' 클릭
3. '...' 스크롤
4. 에러 발생

## 예상 동작

<!-- 어떻게 동작해야 하는지 설명 -->

## 실제 동작

<!-- 실제로 어떻게 동작하는지 설명 -->

## 환경

- OS: [예: macOS 14.0]
- Node.js: [예: v18.17.0]
- 앱 버전: [예: v0.1.0]

## 스크린샷 (선택사항)

<!-- 에러 스크린샷 -->

## 추가 정보

<!-- 기타 관련 정보 -->
```

### 기능 제안

```markdown
## 기능 설명

<!-- 어떤 기능을 추가하고 싶은지 설명 -->

## 필요 이유

<!-- 왜 이 기능이 필요한지 설명 -->

## 제안 구현 방법 (선택사항)

<!-- 어떻게 구현할 수 있을지 아이디어 제시 -->

## 대안 (선택사항)

<!-- 다른 접근 방법이 있다면 설명 -->
```

## 추가 리소스

- [Next.js Documentation](https://nextjs.org/docs)
- [Electron Documentation](https://www.electronjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
- [MCP Specification](https://modelcontextprotocol.io/)

## 질문이 있으신가요?

- GitHub Issues를 통해 질문을 남겨주세요
- 프로젝트 관련 토론은 Discussions를 활용해주세요

---

다시 한번, 기여해주셔서 감사합니다!
