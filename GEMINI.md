# SEPilot Desktop (Gemini Context)

## 프로젝트 개요

**SEPilot Desktop**은 Claude Desktop 수준의 경험을 제공하는 **전문 LLM 데스크톱 애플리케이션**입니다. Next.js와 Electron을 기반으로 구축되었으며, LangGraph, RAG, MCP(Model Context Protocol) 등 최신 AI 기술을 통합하여 다양한 LLM 워크플로우를 지원합니다.

## 기술 스택

### Frontend

- **Framework**: Next.js 14 (App Router), React 18, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui (Radix UI 기반)
- **State Management**: Zustand
- **Theme**: next-themes (Dark/Light 모드 지원)

### Desktop (Backend)

- **Runtime**: Electron 31 (Node.js 기반)
- **Language**: TypeScript
- **Database**: better-sqlite3 (로컬 저장소)
- **Vector DB**: SQLite-vec 등 (RAG 지원)

### AI & LLM Core

- **Orchestration**: LangGraph (Chat, RAG, Agent 그래프)
- **Protocol**: MCP (Model Context Protocol) - 도구 및 컨텍스트 표준화
- **API**: OpenAI Compatible API (OpenAI, Anthropic, Custom LLM)

## 주요 디렉토리 구조

```
/
├── app/                  # Next.js App Router (Frontend 페이지 및 레이아웃)
├── components/           # React 컴포넌트
│   ├── ui/               # shadcn/ui 재사용 컴포넌트
│   └── ...               # 기타 비즈니스 컴포넌트
├── electron/             # Electron Main Process 코드
│   ├── ipc/              # IPC 통신 핸들러 (Frontend <-> Backend)
│   └── main.ts           # 애플리케이션 진입점
├── lib/                  # 공유 라이브러리 및 비즈니스 로직
│   ├── langgraph/        # AI 에이전트 및 그래프 로직
│   ├── mcp/              # MCP 클라이언트 및 서버 통합
│   └── ...
├── public/               # 정적 자산
└── scripts/              # 빌드 및 유틸리티 스크립트
```

## 개발 워크플로우 및 규칙

1.  **패키지 관리자**: `pnpm`을 사용합니다. (`npm`이나 `yarn` 대신 사용 권장)
2.  **명령어**:
    - `pnpm dev`: 개발 서버 실행 (Next.js + Electron)
    - `pnpm build`: 프로덕션 빌드
    - `pnpm lint`: 린트 검사
    - `pnpm type-check`: 타입 검사
3.  **코드 스타일**:
    - **Strict TypeScript**: 엄격한 타입 체크를 준수해야 합니다. `any` 사용을 지양하세요.
    - **Tailwind CSS**: 스타일링 시 Tailwind 유틸리티 클래스를 우선 사용합니다.
    - **Shadcn UI**: 새로운 UI 요소가 필요할 경우 `components/ui`의 기존 컴포넌트를 활용하거나 확장합니다.
4.  **Electron 통신**:
    - Frontend에서 Backend 로의 요청은 `window.electron.invoke`를 사용합니다.
    - 보안을 위해 `contextBridge`를 통한 안전한 IPC 통신 패턴을 유지합니다.

## 주의사항 (Gemini를 위한 팁)

- **파일 수정 전 읽기**: 파일을 수정하기 전에 반드시 내용을 읽어서 문맥을 파악하세요.
- **의존성 체크**: `package.json`을 확인하여 사용 가능한 라이브러리를 먼저 파악하세요.
- **경로 및 환경**: Browser 환경과 Node.js(Electron Main) 환경을 구분하여 코드를 작성해야 합니다. `app/` 내부는 주로 브라우저 환경이지만, IPC를 통해 Node.js 기능을 호출합니다.
- **커밋 메시지**: 커밋 메시지는 **한국어**로 작성하며, Semantic Commit 규칙(`feat:`, `fix:`, `refactor:` 등)을 따릅니다.

## 문서화 및 참고

- `CLAUDE.md`: Claude를 위한 컨텍스트 파일이지만 프로젝트 전반적인 규칙이 잘 정리되어 있습니다.
- `README.md`: 프로젝트 기능 및 설치 방법에 대한 일반적인 설명이 포함되어 있습니다.
