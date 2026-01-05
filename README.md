# SEPilot Desktop

<div align="center">

**The All-in-One AI Workspace**

_Thinking, Coding, Editor, Browser, Vision을 하나로 통합한 궁극의 데스크톱 AI 워크스페이스_

![Version](https://img.shields.io/badge/version-0.6.5-blue.svg)
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

### 📦 Installation

Download the latest installer from [Releases](https://github.com/jhl-labs/sepilot_desktop/releases).

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

### 📦 설치

[Releases](https://github.com/jhl-labs/sepilot_desktop/releases) 페이지에서 최신 설치 파일을 다운로드하세요.

### 🧪 개발 & 테스트

### 📄 License

This project is licensed under a custom license. See the [LICENSE](LICENSE) file for details.
