# SEPilot Desktop

> A professional LLM desktop application built with Next.js and Electron
>
> Claude Desktop과 같은 수준의 LLM 데스크톱 애플리케이션

[English](#english) | [한국어](#korean)

---

<a name="english"></a>

## English

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.2-black)](https://nextjs.org/)
[![Electron](https://img.shields.io/badge/Electron-31.0-47848F)](https://www.electronjs.org/)
[![License](https://img.shields.io/badge/license-Custom-green)](./LICENSE)

</div>

### ✨ Features

- 🤖 **LangGraph-based Workflow**: Support for Chat, RAG, and Agent graphs
- 🔌 **OpenAI Compatible API**: Works with OpenAI, Anthropic, and custom LLM servers
- 📚 **RAG (Retrieval-Augmented Generation)**: Multi-vector database support
  - SQLite-vec, OpenSearch, Elasticsearch, pgvector
- 🛠️ **MCP (Model Context Protocol)**: Standard tool and context integration
- 🔐 **GitHub OAuth**: AES-256-GCM encrypted configuration synchronization
- 💬 **Advanced Chat Features**
  - Automatic title generation
  - Message editing and regeneration
  - Code block copying
- ⌨️ **Keyboard Shortcuts**: Cmd/Ctrl+N, Cmd/Ctrl+,, Cmd/Ctrl+Shift+C
- 🌓 **Dark/Light Mode**: Automatic theme detection
- 💻 **Cross-Platform**: Windows, macOS, Linux
- ✨ **Real-time Streaming**: Live LLM response rendering
- 📝 **Markdown & Mermaid**: Rich content rendering with diagrams

### 🏗️ Tech Stack

#### Frontend
- **Framework**: Next.js 14 (App Router), React 18
- **Styling**: Tailwind CSS, shadcn/ui
- **State Management**: Zustand
- **Theme**: next-themes

#### Desktop
- **Runtime**: Electron 31
- **IPC**: Context Bridge (secure communication)
- **Storage**: better-sqlite3

#### LLM & AI
- **Workflow**: LangGraph (custom implementation)
- **Embeddings**: OpenAI text-embedding-3
- **Vector DB**: SQLite-vec (default)
- **Protocol**: MCP (Model Context Protocol)

#### Development
- **Language**: TypeScript 5.4 (strict mode)
- **Linter**: ESLint 8.57
- **Formatter**: Prettier 3.2
- **Builder**: electron-builder 24

### 📦 Installation

#### Requirements

- Node.js >= 18.0.0
- npm, yarn, or pnpm

#### Install Dependencies

```bash
# Using npm
npm install

# Using pnpm (recommended)
pnpm install

# Using yarn
yarn install
```

#### Environment Setup (Optional)

```bash
cp .env.example .env
# Edit .env file to configure API keys and settings
```

### 🚀 Usage

#### Development Mode

```bash
# Run Next.js + Electron together (recommended)
npm run dev

# Run Next.js only (browser testing)
npm run dev:next

# Run Electron only
npm run dev:electron
```

The Electron window will open automatically when the development server starts.

#### Building

```bash
# Production build (Next.js + Electron)
npm run build

# Platform-specific builds
npm run build:app      # Current platform
npm run build:mac      # macOS (dmg, zip)
npm run build:win      # Windows (nsis, portable)
npm run build:linux    # Linux (AppImage, deb)
```

Built applications will be created in the `dist/` directory.

### 🎯 Getting Started

1. **Configure LLM Settings**
   - Click the settings icon in the bottom left
   - Select your LLM provider (OpenAI / Anthropic / Custom)
   - Enter your API key
   - Choose a model (e.g., gpt-4, claude-3-5-sonnet)

2. **Select Graph Type**
   - **Basic Chat**: Simple LLM conversation
   - **RAG Chat**: Document-based retrieval-augmented generation
   - **Agent**: Autonomous agent with MCP tools

3. **Configure Vector DB (for RAG)**
   - Go to VectorDB tab in settings
   - Select SQLite-vec (default) or configure other databases
   - Set up embedding provider (OpenAI recommended)
   - Upload and index documents in the Documents tab

4. **Add MCP Servers (for Agent)**
   - Go to MCP Server tab
   - Choose from predefined templates or create custom configurations
   - Add servers and verify available tools

5. **GitHub Sync (Optional)**
   - Configure GitHub OAuth in the Account tab
   - Set a master password
   - Save to or restore from GitHub

### 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guidelines](CONTRIBUTING.md) before submitting pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### 📄 License

This project is licensed under a custom license. See the [LICENSE](LICENSE) file for details.

### 🙏 Acknowledgments

- Built with [Claude Code](https://claude.com/claude-code)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

---

<a name="korean"></a>

## 한국어

### ✨ 주요 기능

- 🤖 **LangGraph 기반 워크플로우**: Chat, RAG, Agent 그래프 지원
- 🔌 **OpenAI Compatible API**: OpenAI, Anthropic, 커스텀 LLM 서버 지원
- 📚 **RAG (검색 증강 생성)**: 다중 벡터 DB 지원
  - SQLite-vec, OpenSearch, Elasticsearch, pgvector
- 🛠️ **MCP (Model Context Protocol)**: 표준 도구 및 컨텍스트 통합
- 🔐 **GitHub OAuth**: AES-256-GCM 암호화된 설정 동기화
- 💬 **고급 채팅 기능**
  - 자동 제목 생성
  - 메시지 편집/재생성
  - 코드 블록 복사
- ⌨️ **키보드 단축키**: Cmd/Ctrl+N, Cmd/Ctrl+,, Cmd/Ctrl+Shift+C
- 🌓 **다크/라이트 모드**: 시스템 설정 자동 감지
- 💻 **크로스 플랫폼**: Windows, macOS, Linux
- ✨ **실시간 스트리밍**: LLM 응답 실시간 표시
- 📝 **Markdown & Mermaid**: 다이어그램을 포함한 풍부한 콘텐츠 렌더링

### 🏗️ 기술 스택

#### 프론트엔드
- **프레임워크**: Next.js 14 (App Router), React 18
- **스타일링**: Tailwind CSS, shadcn/ui
- **상태 관리**: Zustand
- **테마**: next-themes

#### 데스크톱
- **런타임**: Electron 31
- **IPC**: Context Bridge (안전한 통신)
- **저장소**: better-sqlite3

#### LLM & AI
- **워크플로우**: LangGraph (커스텀 구현)
- **임베딩**: OpenAI text-embedding-3
- **벡터 DB**: SQLite-vec (기본값)
- **프로토콜**: MCP (Model Context Protocol)

#### 개발
- **언어**: TypeScript 5.4 (strict mode)
- **린터**: ESLint 8.57
- **포매터**: Prettier 3.2
- **빌더**: electron-builder 24

### 📦 설치

#### 요구사항

- Node.js >= 18.0.0
- npm, yarn, 또는 pnpm

#### 의존성 설치

```bash
# npm 사용
npm install

# pnpm 사용 (권장)
pnpm install

# yarn 사용
yarn install
```

#### 환경 설정 (선택사항)

```bash
cp .env.example .env
# .env 파일을 편집하여 API 키 및 설정 구성
```

### 🚀 사용법

#### 개발 모드

```bash
# Next.js + Electron 동시 실행 (권장)
npm run dev

# Next.js만 실행 (브라우저 테스트)
npm run dev:next

# Electron만 실행
npm run dev:electron
```

개발 서버가 시작되면 Electron 윈도우가 자동으로 열립니다.

#### 빌드

```bash
# 프로덕션 빌드 (Next.js + Electron)
npm run build

# 플랫폼별 빌드
npm run build:app      # 현재 플랫폼
npm run build:mac      # macOS (dmg, zip)
npm run build:win      # Windows (nsis, portable)
npm run build:linux    # Linux (AppImage, deb)
```

빌드된 애플리케이션은 `dist/` 디렉토리에 생성됩니다.

### 🎯 시작하기

1. **LLM 설정**
   - 왼쪽 하단의 설정 아이콘 클릭
   - LLM 제공자 선택 (OpenAI / Anthropic / Custom)
   - API 키 입력
   - 모델 선택 (예: gpt-4, claude-3-5-sonnet)

2. **그래프 타입 선택**
   - **기본 채팅**: 단순 LLM 대화
   - **RAG 채팅**: 문서 기반 검색 증강 생성
   - **Agent**: MCP 도구를 활용한 자율 에이전트

3. **벡터 DB 설정 (RAG 사용 시)**
   - 설정의 VectorDB 탭으로 이동
   - SQLite-vec 선택 (기본값) 또는 다른 데이터베이스 구성
   - 임베딩 제공자 설정 (OpenAI 권장)
   - Documents 탭에서 문서 업로드 및 인덱싱

4. **MCP 서버 추가 (Agent 사용 시)**
   - MCP Server 탭으로 이동
   - 사전 정의된 템플릿 선택 또는 커스텀 구성 생성
   - 서버 추가 및 사용 가능한 도구 확인

5. **GitHub 동기화 (선택사항)**
   - Account 탭에서 GitHub OAuth 구성
   - 마스터 패스워드 설정
   - GitHub에 저장하거나 GitHub에서 복원

### 🤝 기여

기여를 환영합니다! Pull Request를 제출하기 전에 [기여 가이드라인](CONTRIBUTING.md)을 읽어주세요.

1. 저장소 포크
2. 기능 브랜치 생성 (`git checkout -b feature/AmazingFeature`)
3. 변경사항 커밋 (`git commit -m 'Add some AmazingFeature'`)
4. 브랜치에 푸시 (`git push origin feature/AmazingFeature`)
5. Pull Request 생성

### 📄 라이선스

이 프로젝트는 커스텀 라이선스로 제공됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

### 🙏 감사의 말

- [Claude Code](https://claude.com/claude-code)로 제작되었습니다
- UI 컴포넌트는 [shadcn/ui](https://ui.shadcn.com/)를 사용했습니다
- 아이콘은 [Lucide](https://lucide.dev/)를 사용했습니다
