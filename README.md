# SEPilot Desktop

<div align="center">

**The All-in-One AI Workspace**

_Thinking, Coding, Editor, Browser, Vision을 하나로 통합한 궁극의 데스크톱 AI 워크스페이스_

![Version](https://img.shields.io/badge/version-0.9.1-blue.svg)
[![License](https://img.shields.io/badge/license-Custom-green)](./LICENSE)

<p>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.4-blue" alt="TypeScript"></a>
  <a href="https://nextjs.org/"><img src="https://img.shields.io/badge/Next.js-14.0-black" alt="Next.js"></a>
  <a href="https://www.electronjs.org/"><img src="https://img.shields.io/badge/Electron-31.0-47848F" alt="Electron"></a>
</p>

<p>
  <a href="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/ci.yml"><img src="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/release.yml"><img src="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/release.yml/badge.svg" alt="Release"></a>
  <a href="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/deploy-pages.yml"><img src="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/deploy-pages.yml/badge.svg" alt="Deploy Pages"></a>
  <br/>
  <a href="https://codecov.io/gh/jhl-labs/sepilot_desktop"><img src="https://codecov.io/gh/jhl-labs/sepilot_desktop/branch/main/graph/badge.svg?token=RTDC27F34B" alt="codecov"></a>
  <a href="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/codeql.yml"><img src="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/codeql.yml/badge.svg" alt="CodeQL"></a>
  <a href="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/security-scan.yml"><img src="https://github.com/jhl-labs/sepilot_desktop/actions/workflows/security-scan.yml/badge.svg" alt="Security Scan"></a>
</p>

<p align="center">
  <a href="https://codecov.io/gh/jhl-labs/sepilot_desktop">
    <img src="https://codecov.io/gh/jhl-labs/sepilot_desktop/graphs/tree.svg?token=RTDC27F34B&width=600&height=120" alt="Codecov Tree" height="120">
  </a>
  <br>
  <br>
  <a href="https://codecov.io/gh/jhl-labs/sepilot_desktop">
    <img src="https://codecov.io/gh/jhl-labs/sepilot_desktop/graphs/sunburst.svg?token=RTDC27F34B&width=600&height=220" alt="Codecov Sunburst" height="220">
  </a>
</p>

[English](#english) | [한국어](#korean)

</div>

---

<a name="english"></a>

## English

### 🚀 Overview

**SEPilot Desktop** is not just a chatbot. It is an integrated open-source desktop application that combines **Thinking, Coding, Editor, Browser, and Vision** into a seamless workflow. Experience the familiarity of ChatGPT with the power of a professional workspace.

### ✨ Key Features

#### 💬 Native Chat Experience

_Familiarity of ChatGPT, flexibility beyond._

- **No Learning Curve**: Provides the familiar interface you already know.
- **Model Hot-swap**: Switch between GPT-4o, Claude 3.5, and local Ollama models with a single click.
- **Perfect Rendering**: Beautiful Markdown, LaTeX support, and real-time streaming.
- **Secure**: Chat history is safely stored in a local database.

#### 🧠 Depth of Thought (Thinking Models)

_Choose AI thinking process matching problem complexity._

- **Sequential Thinking**: Step-by-step reasoning where AI self-verifies logical gaps before moving forward.
- **Tree of Thought**: Generates multiple solution possibilities simultaneously (Branching) to find the optimal path.
- **Deep Thinking (Graph)**: Combines Sequential and Tree of Thought. Analyzes problems from 4 distinct perspectives (Analytical, Practical, Critical, Creative).

#### 👨‍💻 Autonomous Coding Agent (Beta)

_Experimental autonomous coding support._

- **Think -> Action -> Observe**: Repeats the cycle of thinking, file I/O, and result analysis.
- **Full Control**: Can create/edit/delete files and execute terminal commands.
- **Auto-debugging**: Automatically analyzes error logs and attempts to fix issues.

#### 📝 Full-featured Editor & Terminal

_Power of VS Code, but lighter._

- **Monaco Editor**: Built-in VS Code core with syntax highlighting, minimap, and multi-cursor support.
- **Integrated Terminal**: Run `npm install`, `git commit`, or python scripts directly within the app.
- **AI Context Menu**: Drag text to access Notion-style AI tools (Refactor, Translate, Fix Typos, etc.).

#### 👁️ Vision Browser Agent

_Understands as it sees, moves like a human._

- **Hybrid Control**: Combines semantic DOM analysis with Vision (Set-of-Mark) to interact with complex web pages.
- **Automation**: Supports over 27 browser actions including click, scroll, type, and navigation.

#### 📚 Knowledge Base (RAG)

_Turn your documents into AI's knowledge._

- **Local RAG**: Uses local SQLite-vec vector DB. Drag & drop Markdown/Text files to build a secure knowledge base.
- **Team Docs**: Link GitHub repositories to auto-sync team documentation and code snippets.

#### 🎨 Vision & Visualization

- **Vision Analysis**: Paste images for instant analysis by Vision models (e.g., "Analyze this error log").
- **Image Generation**: Integrate with Nano Banana and ComfyUI for complex image generation workflows.
- **Mermaid & Plotly**: Generate diagrams from text and visualize CSV/Excel data with interactive charts.

#### 🚀 Super Productivity

- **Quick Input**: Call SEPilot instantly with a global shortcut without leaving your current app.
- **Quick Search**: Ripgrep-powered search finds files and content in milliseconds.

---

---

### 🏗️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui
- **Desktop**: Electron 31, Context Bridge IPC, better-sqlite3
- **AI Core**: LangGraph (Custom Implementation), OpenAI Compatible API, MCP (Model Context Protocol)
- **DevOps**: TypeScript 5.4, ESLint, Prettier, electron-builder

### 📁 Project Structure

```
sepilot_desktop/
├── app/                          # Next.js App Router (Frontend entry point)
├── components/                   # React UI components
├── electron/                     # Electron Main Process (Backend)
├── lib/                          # Shared libraries (core business logic)
├── hooks/                        # Global React custom hooks
├── types/                        # TypeScript type definitions
├── resources/extensions/         # Extension source code (8 extensions)
├── extensions/                   # Built .sepx package files (production)
├── locales/                      # i18n resources (ko, en, zh)
├── public/                       # Static assets
├── assets/                       # Build assets (app icons)
├── scripts/                      # Build & dev scripts
├── tests/                        # Unit / integration tests
├── e2e_tests/                    # E2E tests (Playwright)
├── docs/                         # Project documentation
├── release_notes/                # Version release notes
├── builtin-skills/               # Built-in skill definitions
└── deepreview/                   # DeepReview materials
```

#### `app/` — Next.js App Router

Frontend entry point based on Next.js App Router. Defines page routing and layouts.

```
app/
├── layout.tsx              # Root layout (Providers, global config)
├── page.tsx                # Main chat page
├── globals.css             # Global CSS styles
├── api/chat/stream/        # Streaming chat API route
├── notification/           # Notification popup page
└── quick-input/            # Quick input popup page
```

#### `components/` — React UI Components

All React components organized by feature domain.

```
components/
├── ui/                     # shadcn/ui base components (Button, Dialog, Input, etc.)
├── chat/                   # Chat UI (ChatArea, InputBox, MessageBubble, ToolApproval)
├── layout/                 # Layout (MainLayout, Sidebar, ChatHistory, WikiTree)
├── settings/               # Settings panel (LLM, MCP, Extension, Network, 20+ tabs)
├── markdown/               # Markdown rendering (code highlighting, LaTeX)
├── rag/                    # RAG document management UI
├── mcp/                    # MCP server management UI
├── skills/                 # Skills management UI
├── persona/                # Persona management UI
├── gallery/                # Image gallery
├── providers/              # React Context Providers (Theme, I18n)
└── theme/                  # Theme components
```

#### `electron/` — Electron Main Process

Electron backend process with IPC handlers, services, and utilities.

```
electron/
├── main.ts                 # App entry (BrowserWindow, protocol, service init)
├── preload.ts              # Preload script (exposes window.electronAPI)
├── ipc/
│   ├── index.ts            # IPC handler registration hub
│   └── handlers/           # IPC handlers (35 files)
│       ├── llm.ts          #   LLM streaming / chat
│       ├── langgraph.ts    #   LangGraph agent execution
│       ├── mcp.ts          #   MCP server management & tool calls
│       ├── chat.ts         #   Conversation save / load / delete
│       ├── file.ts         #   File system operations
│       ├── browser-view.ts #   BrowserView tab management
│       ├── terminal.ts     #   Terminal sessions (PTY)
│       ├── vectordb.ts     #   Vector DB operations
│       ├── extension-*.ts  #   Extension APIs (handlers, fs, llm, mcp, vectordb)
│       └── ...             #   Others (auth, config, scheduler, skills, etc.)
├── services/               # Backend services (15 files)
│   ├── database.ts         #   SQLite database management
│   ├── vectordb.ts         #   Vector DB service
│   ├── pty-manager.ts      #   PTY terminal management
│   ├── scheduler.ts        #   Task scheduler
│   └── ...                 #   Others (logger, token-manager, webhook, etc.)
├── agents/                 # Electron-side agents
└── utils/                  # Utilities (paths, update-checker)
```

#### `lib/` — Shared Libraries

Core business logic shared between frontend and backend.

```
lib/
├── langgraph/              # LangGraph agent system
│   ├── base/               #   Base graph classes (BaseGraph, ThinkingGraph)
│   ├── graphs/             #   Graph implementations (15: chat, agent, coding-agent, rag, etc.)
│   ├── nodes/              #   Graph nodes (generate, retrieve, tools)
│   ├── factory/            #   GraphFactory + GraphRegistry
│   └── prompts/            #   System prompts
├── llm/                    # LLM client
│   ├── base.ts             #   BaseLLMProvider (abstract class)
│   ├── client.ts           #   LLMClient singleton
│   └── providers/          #   LLM providers (OpenAI-compatible, Ollama)
├── mcp/                    # MCP (Model Context Protocol)
│   ├── client.ts           #   MCP client (JSON-RPC 2.0)
│   ├── server-manager.ts   #   MCP server lifecycle management
│   └── tools/              #   MCP tools (Google Search, Browser, etc.)
├── extensions/             # Extension system (18 files)
│   ├── loader.ts           #   Renderer environment loader
│   ├── loader-main.ts      #   Main Process loader
│   ├── registry.ts         #   Extension registry
│   └── context-factory.ts  #   Runtime context creation
├── extension-sdk/          # Extension SDK (@sepilot/extension-sdk)
│   └── src/                #   Types, hooks, IPC helpers, runtime API, UI
├── store/                  # Zustand global state
│   ├── chat-store.ts       #   Core state (conversations, messages, mode, extensions)
│   └── extension-slices.ts #   Dynamic extension store slices
├── hooks/                  # Library-level React hooks
├── vectordb/               # Vector DB (embeddings, indexing, adapters)
├── auth/                   # Authentication (GitHub OAuth)
├── config/                 # Configuration (encryption, sync, migration)
├── http/                   # HTTP client (proxy / SSL support)
├── skills/                 # Skills management (manager, validator, loader)
├── documents/              # Document processing (PDF, Word, Excel)
├── github/                 # GitHub integration
├── imagegen/               # Image generation
├── comfyui/                # ComfyUI integration
├── i18n/                   # Internationalization (i18next, ko/en/zh)
└── utils/                  # Common utilities (logger, token-counter, error-handler)
```

#### `hooks/` — Global React Custom Hooks

General-purpose React custom hooks used across the entire app.

| File | Description |
|------|-------------|
| `use-confirm-dialog.ts` | Confirmation dialog hook |
| `use-file-clipboard.ts` | File clipboard hook |
| `use-file-system.ts` | File system access hook |
| `use-resize-observer.ts` | Resize detection hook |
| `use-theme-persistence.ts` | Theme persistence hook |

#### `types/` — TypeScript Type Definitions

Project-wide TypeScript types and interfaces.

| File | Description |
|------|-------------|
| `index.ts` | Core types (Message, Conversation, LLMConfig, etc.) |
| `electron.d.ts` | `window.electronAPI` type declarations |
| `ipc-channels.ts` | IPC channel name constants |
| `persona.ts` | Persona types |
| `skill.ts` | Skill types |
| `scheduler.ts` | Scheduler types |
| `wiki-tree.ts` | Wiki tree types |

#### `resources/extensions/` — Extension Source Code

8 extensions, each structured as an independent project.

| Extension | Description |
|-----------|-------------|
| `editor/` | Code editor (Monaco Editor) |
| `browser/` | Web browser (BrowserView tabs) |
| `terminal/` | Terminal (xterm.js + PTY) |
| `architect/` | Architecture diagrams |
| `presentation/` | Presentation creation |
| `github-actions/` | GitHub Actions management |
| `github-pr-review/` | GitHub PR review |
| `github-project/` | GitHub Project management |

#### Other Directories

| Directory | Description |
|-----------|-------------|
| `extensions/` | Built `.sepx` packages for production deployment |
| `locales/` | i18n translation files (`ko.json`, `en.json`, `zh.json`) |
| `public/` | Static assets (favicon, Monaco files, sql-wasm binaries) |
| `assets/` | Build assets (app icon) |
| `scripts/` | Build & dev scripts (Extension bundler, SDK build, Monaco copy, etc.) |
| `tests/` | Unit / integration tests (Jest + React Testing Library) |
| `e2e_tests/` | E2E tests (Playwright) |
| `docs/` | Architecture docs, dev guides, Extension docs |
| `release_notes/` | Version release notes (v0.5.0 ~ v0.9.1) |
| `builtin-skills/` | Built-in AI skill definitions |
| `deepreview/` | DeepReview training materials & workshops |

---

### 📦 Installation

Download the latest installer from [Releases](https://github.com/jhl-labs/sepilot_desktop/releases).

### 🛠️ Development Setup

**For developers**: See [SETUP.md](./SETUP.md) for detailed development environment setup instructions.

**Quick start**:

```bash
# Clone both repositories
git clone <sepilot_desktop-repo> sepilot_desktop
git clone <sepilot-extensions-repo> sepilot-extensions

# Install and run
cd sepilot_desktop
pnpm install
pnpm run dev
```

**Note**: The main app requires the `sepilot-extensions` directory at the same level for Extension source code.

#### Optional: Terminal Features (Windows)

Terminal features require native node modules. If you encounter build errors during `pnpm install`:

**Option 1: Install Visual Studio Build Tools**

1. Download [Build Tools for Visual Studio 2022](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022)
2. Install with "Desktop development with C++" workload
3. Run `pnpm run rebuild:node-pty`

**Option 2: Continue without terminal features**

- The app works perfectly without terminal features
- You can enable them later when needed

### 🧪 Development & Testing

#### Running Tests

**Unit Tests**:

```bash
pnpm run test              # Run all unit tests
pnpm run test:frontend     # Frontend tests only
pnpm run test:backend      # Backend tests only
pnpm run test:coverage     # With coverage report
```

**E2E Tests**:

E2E tests require a display server. For headless environments (e.g., CI/CD):

```bash
# Install Xvfb (Ubuntu/Debian)
sudo apt-get install xvfb

# Install Xvfb (Fedora/RHEL)
sudo dnf install xorg-x11-server-Xvfb

# Run E2E tests
pnpm run test:e2e
```

For GUI environments (macOS, Windows, Linux Desktop), tests will run directly without Xvfb.

#### Test Coverage

**View Coverage Reports**:

We use [Codecov](https://codecov.io/gh/jhl-labs/sepilot_desktop) for comprehensive test coverage tracking. Visit the dashboard to see:

- Overall project coverage with interactive sunburst and tree visualizations
- Component-specific coverage (Chat, LangGraph, MCP, RAG, Electron IPC)
- Coverage trends over time
- Pull request impact analysis

**Local Coverage Reports**:

```bash
# Generate coverage reports
pnpm run test:coverage             # All tests with coverage
pnpm run test:coverage:frontend    # Frontend only
pnpm run test:coverage:backend     # Backend only

# View HTML report (after running tests)
open coverage/lcov-report/index.html   # macOS
start coverage/lcov-report/index.html  # Windows
xdg-open coverage/lcov-report/index.html  # Linux
```

**Coverage Targets**:

| Component       | Target | Current                                                                                                                                                   |
| --------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall Project | 55%    | [![codecov](https://codecov.io/gh/jhl-labs/sepilot_desktop/branch/main/graph/badge.svg?token=RTDC27F34B)](https://codecov.io/gh/jhl-labs/sepilot_desktop) |
| Frontend (UI)   | 50%    | -                                                                                                                                                         |
| Backend (Core)  | 55%    | -                                                                                                                                                         |
| Chat System     | 60%    | -                                                                                                                                                         |
| LangGraph Agent | 65%    | -                                                                                                                                                         |
| MCP Integration | 60%    | -                                                                                                                                                         |
| Electron IPC    | 70%    | -                                                                                                                                                         |

**Automated Coverage Checks**:

- ✅ **PR Comments**: Every pull request receives detailed coverage analysis
- ✅ **Status Checks**: PRs must maintain coverage within threshold (±2-5%)
- ✅ **Component Tracking**: Individual components tracked separately
- ✅ **Bundle Analysis**: JavaScript bundle size monitoring
- ✅ **Test Results**: Test pass/fail tracking integrated with coverage

---

<a name="korean"></a>

## 한국어

### 🚀 개요

**SEPilot Desktop**은 단순한 챗봇이 아닙니다. **Thinking, Coding, Editor, Browser, Vision**이 완벽하게 통합된 오픈소스 데스크톱 애플리케이션입니다. ChatGPT와 같은 익숙한 사용성에 전문적인 워크스페이스의 강력함을 더했습니다.

### ✨ 주요 기능

#### 💬 네이티브 채팅 경험 (Native Chat Experience)

_ChatGPT와 같은 편안함, 그 이상의 유연함._

- **익숙한 UI**: 새로운 도구를 배울 필요 없이 바로 사용할 수 있습니다.
- **모델 핫스왑**: GPT-4o, Claude 3.5, Ollama 로컬 모델 등을 클릭 한 번으로 전환합니다.
- **완벽한 렌더링**: GitHub 스타일의 마크다운 렌더링과 수식(LaTeX) 지원.
- **보안**: 모든 대화 내용은 로컬 데이터베이스에 안전하게 저장됩니다.

#### 🧠 사고 모델 (Depth of Thought)

_문제의 복잡도에 맞춰 AI의 사고 방식을 선택하세요._

- **Sequential Thinking**: 단계별(Step-by-Step)로 논리를 전개하며 스스로 허점을 검증합니다.
- **Tree of Thought**: 여러 해결 경로를 동시에 탐색(Branching)하여 최적의 해를 도출합니다. 브레인스토밍에 강력합니다.
- **Deep Thinking (Graph)**: 4가지 관점(분석적, 실용적, 비판적, 창의적)으로 문제를 입체적으로 분석하고 검증합니다.

#### 👨‍💻 자율 코딩 에이전트 (Coding Agent)

_실험적인 자율 코딩 지원._

- **Think -> Action -> Observe**: 생각하고, 파일을 수행하고, 결과를 확인하는 주기를 반복합니다.
- **완전한 제어**: 파일 생성/수정/삭제 권한과 터미널 명령어 실행 능력을 가집니다.
- **자동 디버깅**: 에러 발생 시 로그를 분석하여 스스로 코드를 수정(Self-correction)합니다.

#### 📝 풀 피처 에디터 & 터미널

_VS Code의 강력함을 그대로, 더 가볍게._

- **Monaco Editor**: VS Code의 핵심 엔진을 탑재하여 구문 강조, 미니맵, 멀티 커서 등을 지원합니다.
- **내장 터미널**: 앱 내에서 바로 `npm install`, `git commit` 등을 실행할 수 있습니다.
- **AI 컨텍스트 메뉴**: 텍스트를 드래그하면 Notion 스타일의 AI 메뉴(리팩토링, 주석 생성 등)가 나타납니다.

#### 👁️ 비전 브라우저 에이전트 (Vision Browser Agent)

_보이는 대로 이해하고, 사람처럼 움직입니다._

- **하이브리드 제어**: DOM 분석과 Vision AI(Set-of-Mark)를 결합하여 복잡한 웹 페이지도 정확하게 제어합니다.
- **브라우저 자동화**: 클릭, 스크롤, 타이핑 등 27개 이상의 브라우저 액션을 지원합니다.

#### 📚 지식 기반 (RAG)

_당신의 문서를 AI의 지식으로._

- **로컬 RAG**: 로컬 SQLite-vec 벡터 DB를 사용합니다. 마크다운/텍스트 파일을 드래그하여 안전한 개인 지식 저장소를 구축하세요.
- **팀 문서**: GitHub 저장소를 연결하여 팀의 위키나 코드를 자동으로 동기화하고 공유할 수 있습니다.

#### 🎨 비전 & 시각화

- **비전 분석**: 이미지나 에러 스크린샷을 붙여넣으면 Qwen2-VL 모델이 즉시 분석합니다.
- **이미지 생성**: ComfyUI, Nano Banana와 연동하여 복잡한 노드 기반 이미지 생성 워크플로우를 제어합니다.
- **Mermaid & Plotly**: 텍스트로 다이어그램을 요청하거나, 엑셀/CSV 데이터를 인터랙티브 차트로 시각화합니다.

#### 🚀 초생산성 (Super Productivity)

- **Quick Input**: 단축키 하나로 어디서든 SEPilot을 호출하여 빠르게 질문하세요.
- **Quick Search**: Ripgrep 엔진을 탑재하여 수만 개의 파일을 0.1초 만에 검색합니다.

---

- **Quick Search**: Ripgrep 엔진을 탑재하여 수만 개의 파일을 0.1초 만에 검색합니다.

---

### 🏗️ 기술 스택

- **Frontend**: Next.js 14 (App Router), React 18, Tailwind CSS, shadcn/ui
- **Desktop**: Electron 31, Context Bridge IPC, better-sqlite3
- **AI Core**: LangGraph (Custom Implementation), OpenAI Compatible API, MCP (Model Context Protocol)
- **DevOps**: TypeScript 5.4, ESLint, Prettier, electron-builder

### 📁 프로젝트 구조

```
sepilot_desktop/
├── app/                          # Next.js App Router (프론트엔드 진입점)
├── components/                   # React UI 컴포넌트
├── electron/                     # Electron Main Process (백엔드)
├── lib/                          # 공유 라이브러리 (핵심 비즈니스 로직)
├── hooks/                        # 전역 React 커스텀 훅
├── types/                        # TypeScript 타입 정의
├── resources/extensions/         # Extension 소스 코드 (8개)
├── extensions/                   # 빌드된 .sepx 패키지 파일 (프로덕션용)
├── locales/                      # 다국어 리소스 (ko, en, zh)
├── public/                       # 정적 자산
├── assets/                       # 빌드 자산 (앱 아이콘)
├── scripts/                      # 빌드 및 개발 스크립트
├── tests/                        # 단위 / 통합 테스트
├── e2e_tests/                    # E2E 테스트 (Playwright)
├── docs/                         # 프로젝트 문서
├── release_notes/                # 버전별 릴리스 노트
├── builtin-skills/               # 내장 스킬 정의
└── deepreview/                   # DeepReview 교육 자료
```

#### `app/` — Next.js App Router

Next.js App Router 기반 프론트엔드 진입점입니다. 페이지 라우팅과 레이아웃을 정의합니다.

```
app/
├── layout.tsx              # Root 레이아웃 (Provider, 글로벌 설정)
├── page.tsx                # 메인 채팅 페이지
├── globals.css             # 글로벌 CSS 스타일
├── api/chat/stream/        # 스트리밍 채팅 API Route
├── notification/           # 알림 팝업 페이지
└── quick-input/            # 빠른 입력 팝업 페이지
```

#### `components/` — React UI 컴포넌트

모든 React 컴포넌트가 기능별로 분류되어 있습니다.

```
components/
├── ui/                     # shadcn/ui 기본 컴포넌트 (Button, Dialog, Input 등)
├── chat/                   # 채팅 UI (ChatArea, InputBox, MessageBubble, ToolApproval)
├── layout/                 # 레이아웃 (MainLayout, Sidebar, ChatHistory, WikiTree)
├── settings/               # 설정 패널 (LLM, MCP, Extension, Network 등 20+ 탭)
├── markdown/               # Markdown 렌더링 (코드 하이라이팅, LaTeX)
├── rag/                    # RAG 문서 관리 UI
├── mcp/                    # MCP 서버 관리 UI
├── skills/                 # 스킬 관리 UI
├── persona/                # 페르소나 관리 UI
├── gallery/                # 이미지 갤러리
├── providers/              # React Context Provider (Theme, I18n)
└── theme/                  # 테마 관련 컴포넌트
```

#### `electron/` — Electron Main Process

Electron 백엔드 프로세스입니다. IPC 핸들러, 서비스, 유틸리티로 구성됩니다.

```
electron/
├── main.ts                 # 앱 진입점 (BrowserWindow, 프로토콜 등록, 서비스 초기화)
├── preload.ts              # Preload 스크립트 (window.electronAPI 노출)
├── ipc/
│   ├── index.ts            # IPC 핸들러 등록 총괄
│   └── handlers/           # IPC 핸들러 (35개 파일)
│       ├── llm.ts          #   LLM 스트리밍/채팅
│       ├── langgraph.ts    #   LangGraph 에이전트 실행
│       ├── mcp.ts          #   MCP 서버 관리 및 도구 호출
│       ├── chat.ts         #   대화 저장/로드/삭제
│       ├── file.ts         #   파일 시스템 작업
│       ├── browser-view.ts #   BrowserView 탭 관리
│       ├── terminal.ts     #   터미널 세션 (PTY)
│       ├── vectordb.ts     #   벡터 DB 작업
│       ├── extension-*.ts  #   Extension 전용 API (handlers, fs, llm, mcp, vectordb)
│       └── ...             #   기타 (auth, config, scheduler, skills 등)
├── services/               # 백엔드 서비스 (15개 파일)
│   ├── database.ts         #   SQLite 데이터베이스 관리
│   ├── vectordb.ts         #   벡터 DB 서비스
│   ├── pty-manager.ts      #   PTY 터미널 관리
│   ├── scheduler.ts        #   작업 스케줄러
│   └── ...                 #   기타 (logger, token-manager, webhook 등)
├── agents/                 # Electron 측 에이전트
└── utils/                  # 유틸리티 (paths, update-checker)
```

#### `lib/` — 공유 라이브러리

프론트엔드와 백엔드에서 공유하는 핵심 비즈니스 로직입니다.

```
lib/
├── langgraph/              # LangGraph 에이전트 시스템
│   ├── base/               #   기본 그래프 클래스 (BaseGraph, ThinkingGraph)
│   ├── graphs/             #   그래프 구현체 (15개: chat, agent, coding-agent, rag 등)
│   ├── nodes/              #   그래프 노드 (generate, retrieve, tools)
│   ├── factory/            #   GraphFactory + GraphRegistry
│   └── prompts/            #   시스템 프롬프트
├── llm/                    # LLM 클라이언트
│   ├── base.ts             #   BaseLLMProvider (추상 클래스)
│   ├── client.ts           #   LLMClient 싱글톤
│   └── providers/          #   LLM 제공자 (OpenAI 호환, Ollama)
├── mcp/                    # MCP (Model Context Protocol)
│   ├── client.ts           #   MCP 클라이언트 (JSON-RPC 2.0)
│   ├── server-manager.ts   #   MCP 서버 생명주기 관리
│   └── tools/              #   MCP 도구 (Google Search, Browser 등)
├── extensions/             # Extension 시스템 (18개 파일)
│   ├── loader.ts           #   Renderer 환경 로더
│   ├── loader-main.ts      #   Main Process 로더
│   ├── registry.ts         #   Extension 레지스트리
│   └── context-factory.ts  #   런타임 컨텍스트 생성
├── extension-sdk/          # Extension SDK (@sepilot/extension-sdk)
│   └── src/                #   타입, 훅, IPC 헬퍼, 런타임 API, UI
├── store/                  # Zustand 전역 상태
│   ├── chat-store.ts       #   핵심 상태 (대화, 메시지, 모드, Extension 슬라이스)
│   └── extension-slices.ts #   동적 Extension Store 슬라이스
├── hooks/                  # 라이브러리 레벨 React 훅
├── vectordb/               # 벡터 DB (임베딩, 인덱싱, 어댑터)
├── auth/                   # 인증 (GitHub OAuth)
├── config/                 # 설정 관리 (암호화, 동기화, 마이그레이션)
├── http/                   # HTTP 클라이언트 (프록시/SSL 지원)
├── skills/                 # 스킬 관리 (manager, validator, loader)
├── documents/              # 문서 처리 (PDF, Word, Excel)
├── github/                 # GitHub 통합
├── imagegen/               # 이미지 생성
├── comfyui/                # ComfyUI 통합
├── i18n/                   # 국제화 (i18next, 한/영/중)
└── utils/                  # 공통 유틸리티 (logger, token-counter, error-handler)
```

#### `hooks/` — 전역 React 커스텀 훅

앱 전체에서 사용되는 범용 React 커스텀 훅입니다.

| 파일 | 설명 |
|------|------|
| `use-confirm-dialog.ts` | 확인 다이얼로그 훅 |
| `use-file-clipboard.ts` | 파일 클립보드 훅 |
| `use-file-system.ts` | 파일 시스템 접근 훅 |
| `use-resize-observer.ts` | 리사이즈 감지 훅 |
| `use-theme-persistence.ts` | 테마 영속화 훅 |

#### `types/` — TypeScript 타입 정의

프로젝트 전역에서 사용되는 TypeScript 타입과 인터페이스입니다.

| 파일 | 설명 |
|------|------|
| `index.ts` | 핵심 타입 (Message, Conversation, LLMConfig 등) |
| `electron.d.ts` | `window.electronAPI` 타입 선언 |
| `ipc-channels.ts` | IPC 채널명 상수 |
| `persona.ts` | 페르소나 타입 |
| `skill.ts` | 스킬 타입 |
| `scheduler.ts` | 스케줄러 타입 |
| `wiki-tree.ts` | Wiki 트리 타입 |

#### `resources/extensions/` — Extension 소스 코드

8개의 Extension이 각각 독립적인 프로젝트로 구성되어 있습니다.

| Extension | 설명 |
|-----------|------|
| `editor/` | 코드 에디터 (Monaco Editor 기반) |
| `browser/` | 웹 브라우저 (BrowserView 탭 관리) |
| `terminal/` | 터미널 (xterm.js + PTY) |
| `architect/` | 아키텍처 다이어그램 |
| `presentation/` | 프레젠테이션 생성 |
| `github-actions/` | GitHub Actions 관리 |
| `github-pr-review/` | GitHub PR 리뷰 |
| `github-project/` | GitHub Project 관리 |

#### 기타 디렉토리

| 디렉토리 | 설명 |
|-----------|------|
| `extensions/` | 프로덕션 배포용 빌드된 `.sepx` 패키지 |
| `locales/` | 다국어 번역 파일 (`ko.json`, `en.json`, `zh.json`) |
| `public/` | 정적 자산 (favicon, Monaco 파일, sql-wasm 바이너리) |
| `assets/` | 빌드 자산 (앱 아이콘) |
| `scripts/` | 빌드/개발 스크립트 (Extension 번들러, SDK 빌드, Monaco 복사 등) |
| `tests/` | 단위/통합 테스트 (Jest + React Testing Library) |
| `e2e_tests/` | E2E 테스트 (Playwright) |
| `docs/` | 아키텍처 문서, 개발 가이드, Extension 문서 |
| `release_notes/` | 버전별 릴리스 노트 (v0.5.0 ~ v0.9.1) |
| `builtin-skills/` | AI 에이전트 내장 스킬 정의 |
| `deepreview/` | DeepReview 교육 자료 및 워크샵 |

---

### 📦 설치

[Releases](https://github.com/jhl-labs/sepilot_desktop/releases) 페이지에서 최신 설치 파일을 다운로드하세요.

### 🛠️ 개발 환경 설정

**개발자용**: 상세한 개발 환경 설정은 [SETUP.md](./SETUP.md)를 참조하세요.

**빠른 시작**:

```bash
# 두 저장소 모두 클론
git clone <sepilot_desktop-repo> sepilot_desktop
git clone <sepilot-extensions-repo> sepilot-extensions

# 설치 및 실행
cd sepilot_desktop
pnpm install
pnpm run dev
```

**중요**: 메인 앱은 Extension 소스코드를 위해 같은 레벨에 `sepilot-extensions` 디렉토리가 필요합니다.

### 🧪 개발 & 테스트

#### 테스트 실행

**단위 테스트**:

```bash
pnpm run test              # 모든 단위 테스트 실행
pnpm run test:frontend     # 프론트엔드 테스트만
pnpm run test:backend      # 백엔드 테스트만
pnpm run test:coverage     # 커버리지 리포트 포함
```

**E2E 테스트**:

E2E 테스트는 디스플레이 서버가 필요합니다. 헤드리스 환경(CI/CD)에서는:

```bash
# Xvfb 설치 (Ubuntu/Debian)
sudo apt-get install xvfb

# Xvfb 설치 (Fedora/RHEL)
sudo dnf install xorg-x11-server-Xvfb

# E2E 테스트 실행
pnpm run test:e2e
```

GUI 환경(macOS, Windows, Linux 데스크톱)에서는 Xvfb 없이 바로 실행됩니다.

#### 테스트 커버리지

**커버리지 리포트 확인**:

[Codecov](https://codecov.io/gh/jhl-labs/sepilot_desktop)를 사용하여 포괄적인 테스트 커버리지를 추적합니다. 대시보드에서 다음을 확인할 수 있습니다:

- 대화형 선버스트 및 트리 시각화를 통한 전체 프로젝트 커버리지
- 컴포넌트별 커버리지 (Chat, LangGraph, MCP, RAG, Electron IPC)
- 시간별 커버리지 추이
- Pull Request 영향 분석

**로컬 커버리지 리포트**:

```bash
# 커버리지 리포트 생성
pnpm run test:coverage             # 모든 테스트 + 커버리지
pnpm run test:coverage:frontend    # 프론트엔드만
pnpm run test:coverage:backend     # 백엔드만

# HTML 리포트 보기 (테스트 실행 후)
open coverage/lcov-report/index.html   # macOS
start coverage/lcov-report/index.html  # Windows
xdg-open coverage/lcov-report/index.html  # Linux
```

**커버리지 목표**:

| 컴포넌트        | 목표 | 현재                                                                                                                                                      |
| --------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 전체 프로젝트   | 55%  | [![codecov](https://codecov.io/gh/jhl-labs/sepilot_desktop/branch/main/graph/badge.svg?token=RTDC27F34B)](https://codecov.io/gh/jhl-labs/sepilot_desktop) |
| 프론트엔드 (UI) | 50%  | -                                                                                                                                                         |
| 백엔드 (Core)   | 55%  | -                                                                                                                                                         |
| Chat 시스템     | 60%  | -                                                                                                                                                         |
| LangGraph Agent | 65%  | -                                                                                                                                                         |
| MCP 통합        | 60%  | -                                                                                                                                                         |
| Electron IPC    | 70%  | -                                                                                                                                                         |

**자동 커버리지 체크**:

- ✅ **PR 코멘트**: 모든 Pull Request에 상세한 커버리지 분석 제공
- ✅ **Status Checks**: PR은 임계값(±2-5%) 내에서 커버리지 유지 필수
- ✅ **컴포넌트 추적**: 개별 컴포넌트를 별도로 추적
- ✅ **번들 분석**: JavaScript 번들 크기 모니터링
- ✅ **테스트 결과**: 테스트 통과/실패 추적이 커버리지와 통합

---

### 📄 License

This project is licensed under a custom license. See the [LICENSE](LICENSE) file for details.
