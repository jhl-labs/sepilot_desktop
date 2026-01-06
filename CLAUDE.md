# SEPilot Desktop

Electron + Next.js 기반 LLM Desktop Application

- 다중 대화 세션 관리, 이미지 생성/해석, RAG, MCP Tool calling, LangGraph Agent 지원
- Frontend: Next.js (React, TypeScript, shadcn/ui)
- Backend: Electron Main Process (Node.js, TypeScript)
- 통신: IPC (Inter-Process Communication)

## 작업 전 필수 확인

1. 파일 수정 전 반드시 Read 도구로 먼저 읽기
2. 새 파일보다 기존 파일 수정 우선
3. 작업 완료 후 `pnpm run lint` 및 `pnpm run type-check` 실행
4. 항상 git pull 을 하여 merge conflict를 방지 할 것

## 작업 후 해야 할일

1. release_notes/ 폴더에 있는 현재 버전의 문서를 업데이트 할 것 (한국어로)

## 아키텍처 원칙

### Electron IPC 통신

- **Frontend → Backend**: `window.electron.invoke('channel-name', data)`
- **Backend → Frontend**: `event.sender.send('channel-name', data)`
- 스트리밍 데이터는 반드시 IPC 이벤트로 전송 (HTTP 불가)
- IPC 핸들러는 `electron/ipc/handlers/` 에 배치

### 데이터 저장

- 임시/캐시: localStorage 사용 가능
- 영구 저장: Electron fs API로 파일 시스템에 저장 (`app.getPath('userData')`)

### 컴포넌트 설계

- 작고 재사용 가능한 컴포넌트 구성
- shadcn/ui 컴포넌트 활용 (`components/ui/`)
- 비즈니스 로직과 UI 분리

## 보안 및 커밋

### 필수 검증

- API 키, 토큰, 비밀번호 하드코딩 금지
- 사용자 경로, 개인정보 포함 시 커밋 전 경고
- XSS, SQL Injection, Command Injection 방지

### 커밋 규칙

- **한국어** 커밋 메시지 작성
- Semantic Commit 형식: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`
- 관련 파일끼리 그룹화하여 분할 커밋

## 주요 디렉토리

```
app/                    # Next.js App Router (Frontend)
components/             # React 컴포넌트
electron/               # Electron Main/Preload
  ├── ipc/handlers/     # IPC 핸들러
  └── utils/            # Backend 유틸리티
lib/                    # 공유 라이브러리
  ├── langgraph/        # LangGraph 통합
  ├── llm/              # LLM 제공자
  └── mcp/              # MCP 통합
.claude/                # Claude Code 설정
  ├── settings.json     # 팀 공유 설정
  ├── commands/         # 커스텀 슬래시 명령어
  ├── agents/           # Subagent 정의
  └── skills/           # 프로젝트 전문 지식
```

## Claude Code 활용

### Skills (자동 활용되는 전문 지식)

Claude Code가 자동으로 참조하는 프로젝트별 전문 지식:

**기본 개발 패턴:**

- **electron-ipc**: Electron IPC 통신 패턴 및 보안 가이드
- **typescript-strict**: TypeScript strict mode 타입 작성 규칙
- **react-shadcn**: React + shadcn/ui 컴포넌트 개발 패턴

**품질 및 최적화:**

- **testing-patterns**: Jest, React Testing Library, Playwright 테스트 패턴
- **error-handling**: 에러 처리, 로깅, Error Boundary, 사용자 피드백
- **performance-optimization**: React 최적화, IPC 최적화, 번들 크기 최적화

**상태 및 데이터 관리:**

- **state-management**: Zustand 전역 상태 관리, Slice 패턴, Persistence
- **file-operations**: 파일 읽기/쓰기, PDF/Word/Excel 처리, 이미지 처리

**Extension 개발:**

- **extension-development**: Extension 구조, Manifest, Agent 통합, Store slice, Components, IPC 핸들러

**AI/ML 통합:**

- **langgraph-agent**: LangGraph 에이전트 구현 및 그래프 기반 워크플로우
- **mcp-integration**: MCP (Model Context Protocol) 도구 통합 패턴
- **rag-vector-search**: RAG 및 벡터 검색 구현 가이드

Skills는 자동으로 적용되며, 별도로 호출할 필요 없음.

### Slash Commands (바로가기 명령어)

자주 사용하는 작업을 위한 커스텀 명령어:

**코드 품질:**

- `/review [파일경로]` - 코드 리뷰 (품질, 보안, 타입 안전성)
- `/security` - 보안 취약점 검사 (커밋 전 필수)

**개발 작업:**

- `/feature [이름] [설명]` - 새 기능 설계 및 구현
- `/component [이름] [설명]` - React 컴포넌트 생성
- `/debug [이슈설명]` - 버그 디버깅 및 수정

**빌드 및 테스트:**

- `/test [패턴]` - 테스트 실행 및 실패 수정
- `/build` - 애플리케이션 빌드 및 에러 수정
- `/commit` - 변경사항 검토 및 한국어 커밋 생성

### Subagents (전문 에이전트)

복잡한 작업을 위한 전문화된 AI 에이전트 (한국어 응답 지원):

- **code-reviewer**: 코드 품질, 보안, 타입 안전성 검토
- **architect**: 시스템 설계, 아키텍처 결정, 기능 설계
- **debugger**: 버그 추적, 원인 분석, 수정 제안

사용 예:

```
"Use the architect subagent to design the multi-user feature"
"Have the code-reviewer check electron/ipc/handlers/"
```

또는 슬래시 명령어 사용 시 자동 호출됨.

## Hooks 설정

현재 모든 hooks는 비활성화 상태 (`disableAllHooks: true`):

- pre-commit hook이 변경사항을 되돌리지 않도록 설정됨
- Claude Code 작업 시 자유롭게 파일 수정 가능
- 커밋 전 수동으로 lint/type-check 실행 권장
