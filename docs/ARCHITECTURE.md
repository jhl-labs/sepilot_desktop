# SEPilot Desktop 아키텍처

> Electron + Next.js 기반 LLM Desktop Application

## 개요

SEPilot Desktop은 **Electron의 Main/Renderer 분리 아키텍처**를 따르는 데스크톱 애플리케이션입니다.

- **Frontend**: Next.js (React, TypeScript, shadcn/ui)
- **Backend**: Electron Main Process (Node.js, TypeScript)
- **통신**: IPC (Inter-Process Communication)

## 아키텍처 다이어그램

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SEPilot Desktop Architecture                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐         IPC 통신         ┌─────────────────────┐   │
│  │   Frontend (Renderer)│ <──────────────────────> │  Backend (Main)     │   │
│  │                      │  window.electronAPI      │                     │   │
│  │  ┌────────────────┐  │                          │  ┌───────────────┐  │   │
│  │  │   app/         │  │                          │  │ electron/     │  │   │
│  │  │  (Next.js 라우팅)│  │                          │  │ (Main Process)│  │   │
│  │  └───────┬────────┘  │                          │  └───────┬───────┘  │   │
│  │          │ 사용       │                          │          │ 사용     │   │
│  │          ▼           │                          │          ▼          │   │
│  │  ┌────────────────┐  │                          │  ┌───────────────┐  │   │
│  │  │ components/    │  │                          │  │  lib/         │  │   │
│  │  │ (React UI)     │  │                          │  │  (공유 로직)   │  │   │
│  │  └───────┬────────┘  │                          │  └───────────────┘  │   │
│  │          │ 사용       │                          │                     │   │
│  │          ▼           │                          │                     │   │
│  │  ┌────────────────┐  │                          │                     │   │
│  │  │ hooks/         │  │                          │                     │   │
│  │  │ (React Hooks)  │  │                          │                     │   │
│  │  └────────────────┘  │                          │                     │   │
│  └──────────────────────┘                          └─────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 핵심 폴더 구조

### 1. `app/` - Next.js App Router (Frontend 진입점)

Next.js App Router를 사용한 **프론트엔드 페이지 라우팅**을 담당합니다.

| 파일/폴더      | 설명                                           |
| -------------- | ---------------------------------------------- |
| `page.tsx`     | 메인 페이지 (ChatContainer, Extensions 렌더링) |
| `layout.tsx`   | 전역 레이아웃 (Theme, i18n Provider)           |
| `quick-input/` | Quick Input 팝업 페이지                        |
| `globals.css`  | 전역 스타일                                    |
| `api/`         | Next.js API Routes (현재 chat)                 |

**의존 관계**: `components/`, `hooks/`, `lib/store/` 를 import해서 사용

### 2. `electron/` - Electron Main Process (Backend)

**Electron 메인 프로세스**로 Node.js 환경에서 실행됩니다.

| 파일/폴더    | 설명                                         |
| ------------ | -------------------------------------------- |
| `main.ts`    | 앱 초기화, 창 생성, Tray, 단축키 등록        |
| `preload.ts` | `contextBridge`로 Frontend에 안전한 API 노출 |
| `ipc/`       | IPC 핸들러 (채팅, 파일, DB, LLM, MCP 등)     |
| `services/`  | 데이터베이스, 로깅, PTY, VectorDB 서비스     |
| `utils/`     | Backend 전용 유틸리티                        |

**의존 관계**: `lib/`의 비즈니스 로직을 사용하여 실제 작업 수행

### 3. `components/` - React UI 컴포넌트

**재사용 가능한 UI 컴포넌트**를 관리합니다.

| 폴더            | 설명                                                   |
| --------------- | ------------------------------------------------------ |
| `chat/`         | 채팅 관련 컴포넌트 (MessageBubble, ChatArea, InputBox) |
| `chat/unified/` | 통합 채팅 UI (hooks, plugins 포함)                     |
| `layout/`       | 레이아웃 컴포넌트 (MainLayout, Sidebar, ChatHistory)   |
| `ui/`           | shadcn/ui 기반 기본 UI 컴포넌트 (Button, Dialog, etc.) |
| `settings/`     | 설정 관련 컴포넌트                                     |
| `rag/`          | RAG 문서 관리 UI                                       |
| `mcp/`          | MCP 서버 설정 UI                                       |
| `markdown/`     | Markdown/Mermaid/Plotly 렌더러                         |
| `providers/`    | React Context Providers                                |
| `persona/`      | AI 페르소나 관리 UI                                    |
| `gallery/`      | 이미지 갤러리 UI                                       |

**의존 관계**: `hooks/`, `lib/store/`를 사용, `app/`에서 import

### 4. `hooks/` - React Custom Hooks

**Frontend 전용 React Hooks**를 관리합니다.

| 파일                       | 설명                |
| -------------------------- | ------------------- |
| `use-file-system.ts`       | 파일 시스템 조작 훅 |
| `use-file-clipboard.ts`    | 클립보드 파일 처리  |
| `use-confirm-dialog.ts`    | 확인 다이얼로그     |
| `use-theme-persistence.ts` | 테마 저장           |
| `use-resize-observer.ts`   | 리사이즈 감지       |

**의존 관계**: `components/`에서 사용, `lib/store/`와 연동

### 5. `lib/` - 공유 라이브러리 (핵심)

**Frontend/Backend 공유 비즈니스 로직**으로 가장 중요한 폴더입니다.

| 폴더          | 설명                                                                 |
| ------------- | -------------------------------------------------------------------- |
| `langgraph/`  | LangGraph Agent 구현 (chat, coding, deep-thinking, browser-agent 등) |
| `llm/`        | LLM 클라이언트 (OpenAI, Anthropic, Custom)                           |
| `mcp/`        | MCP (Model Context Protocol) 클라이언트, 도구 실행기                 |
| `store/`      | Zustand 상태 관리 (`chat-store.ts`)                                  |
| `vectordb/`   | VectorDB (SQLite-vec) 클라이언트                                     |
| `utils/`      | 공통 유틸리티 (logger, 타입 가드 등)                                 |
| `config/`     | 설정 관리, 마이그레이션                                              |
| `auth/`       | 인증 (세션 복원, GitHub OAuth)                                       |
| `extensions/` | Extension 시스템 (동적 모드 로딩)                                    |
| `documents/`  | 문서 처리 (PDF, DOCX 파싱)                                           |
| `github/`     | GitHub API 클라이언트                                                |
| `http/`       | HTTP 클라이언트 (프록시, SSL 지원)                                   |
| `i18n/`       | 다국어 초기화                                                        |
| `imagegen/`   | 이미지 생성 유틸리티                                                 |
| `comfyui/`    | ComfyUI 클라이언트                                                   |

**의존 관계**: `electron/`(Backend)와 `components/`(Frontend) 모두에서 사용

### 6. `extensions/` - 확장 모드 시스템

**플러그인 아키텍처로 동적 모드 추가**를 지원합니다.

| 폴더            | 설명                            |
| --------------- | ------------------------------- |
| `browser/`      | 브라우저 모드 (AI 웹 브라우저)  |
| `editor/`       | 에디터 모드 (코드 에디터 + AI)  |
| `presentation/` | 프레젠테이션 모드 (PPT 생성 AI) |

각 Extension은 다음 구조를 가집니다:

- `manifest.ts` - Extension 메타데이터 및 설정
- `components/` - 모드별 UI 컴포넌트
- `agents/` - AI Agent 구현
- `tools/` - 모드별 도구 정의
- `types/` - 타입 정의

`lib/extensions/use-extensions.ts`로 로드 및 활성화됩니다.

### 7. `types/` - TypeScript 타입 정의

**전역 타입 정의**를 관리합니다.

| 파일            | 설명                                               |
| --------------- | -------------------------------------------------- |
| `index.ts`      | 핵심 인터페이스 (Message, Conversation, AppConfig) |
| `electron.d.ts` | Electron API 타입 선언 (`window.electronAPI`)      |
| `persona.ts`    | AI 페르소나 타입                                   |
| `wiki-tree.ts`  | Wiki 트리 구조 타입                                |
| `node-pty.d.ts` | node-pty 타입 선언                                 |

## 기타 폴더들

| 폴더             | 설명                                        |
| ---------------- | ------------------------------------------- |
| `locales/`       | 다국어 지원 (en.json, ko.json, zh.json)     |
| `public/`        | 정적 리소스 (Monaco Editor, 이미지, WASM)   |
| `tests/`         | 테스트 코드 (frontend, lib, backend)        |
| `scripts/`       | 빌드 스크립트 (아이콘 생성, Monaco 복사 등) |
| `release_notes/` | 버전별 릴리즈 노트 (한국어)                 |
| `coverage/`      | 테스트 커버리지 리포트                      |
| `dist/`          | Electron 빌드 출력물                        |
| `out/`           | Next.js 빌드 출력물                         |
| `assets/`        | 앱 아이콘 리소스                            |

## 데이터 흐름

```
사용자 입력 (UI)
    ↓
components/ (React UI)
    ↓
lib/store/chat-store.ts (상태 관리 - Zustand)
    ↓
window.electronAPI.langgraph.stream() (IPC 호출)
    ↓
electron/ipc/ (IPC 핸들러)
    ↓
lib/langgraph/ (LangGraph Agent 실행)
    ↓ (MCP 도구 호출)
lib/mcp/ (MCP 클라이언트)
    ↓
스트리밍 응답 → IPC 이벤트 → components/ 업데이트
```

## IPC 통신 패턴

### Frontend → Backend

```typescript
// Frontend에서 호출
const result = await window.electronAPI.invoke('channel-name', data);
```

### Backend → Frontend (스트리밍)

```typescript
// Backend에서 전송
event.sender.send('channel-name', data);

// Frontend에서 수신
window.electronAPI.langgraph.onStreamEvent((event) => {
  // 스트리밍 이벤트 처리
});
```

### IPC 핸들러 위치

모든 IPC 핸들러는 `electron/ipc/handlers/` 디렉토리에 배치됩니다:

- `chat.ts` - 대화 관련
- `config.ts` - 설정 관련
- `file.ts` - 파일 시스템
- `langgraph.ts` - LangGraph Agent
- `llm.ts` - LLM API
- `mcp.ts` - MCP 서버
- `vectordb.ts` - VectorDB
- `terminal.ts` - 터미널 (PTY)
- `browser-view.ts` - 브라우저 뷰

## 주요 기술 스택

### Frontend

- **React 19** + **Next.js 16**
- **TypeScript 5.9**
- **Tailwind CSS 4**
- **shadcn/ui** (Radix UI 기반)
- **Zustand** (상태 관리)
- **Monaco Editor** (코드 에디터)
- **xterm.js** (터미널)
- **i18next** (다국어)

### Backend

- **Electron 39**
- **Node.js 18+**
- **better-sqlite3** / **sql.js** (SQLite)
- **node-pty** (터미널 PTY)

### AI/ML

- **LangChain Core** + **LangGraph**
- **OpenAI**, **Anthropic** API 지원
- **MCP (Model Context Protocol)**
- **RAG** (Vector Search)

## 참고 문서

- [CLAUDE.md](../CLAUDE.md) - Claude Code 가이드
- [CONTRIBUTING.md](../CONTRIBUTING.md) - 기여 가이드
- [README.md](../README.md) - 프로젝트 소개
