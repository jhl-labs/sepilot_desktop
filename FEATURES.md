# SEPilot Desktop - 전체 기능 목록

> **버전**: 0.6.0
> **최종 업데이트**: 2025-11-30

SEPilot Desktop은 Electron + Next.js 기반의 전문적인 LLM 데스크톱 애플리케이션입니다. Claude Desktop과 유사한 수준의 기능을 제공하며, 다중 LLM 제공자, RAG, MCP, 브라우저 자동화, 코드 편집 등 다양한 고급 기능을 통합한 올인원 AI 데스크톱 솔루션입니다.

---

## 목차

1. [애플리케이션 모드](#1-애플리케이션-모드)
2. [AI/LLM 통합](#2-aillm-통합)
3. [Browser Automation](#3-browser-automation)
4. [Editor 기능](#4-editor-기능)
5. [MCP 통합](#5-mcp-통합)
6. [RAG (Retrieval-Augmented Generation)](#6-rag-retrieval-augmented-generation)
7. [이미지 생성 (ComfyUI)](#7-이미지-생성-comfyui)
8. [인증 및 동기화](#8-인증-및-동기화)
9. [설정 및 구성](#9-설정-및-구성)
10. [기타 주요 기능](#10-기타-주요-기능)

---

## 1. 애플리케이션 모드

SEPilot Desktop은 3가지 주요 모드를 제공합니다:

### 1.1 Chat 모드 (대화형 AI 인터페이스)

**파일**: `components/chat/`

#### 핵심 기능

- ✅ **실시간 스트리밍 응답** (LangGraph 기반)
- ✅ **멀티모달 지원** (텍스트 + 이미지)
- ✅ **다중 대화 세션 관리**
  - 대화 목록 (ChatHistory)
  - 검색 및 필터링
  - 제목 자동 생성
  - 대화 삭제 및 편집
- ✅ **페르소나 시스템**
  - 대화별 페르소나 지정
  - AI 프로필 표시 (이모지, 이름)
  - 슬래시 커맨드 자동완성 (`/persona`)
- ✅ **메시지 기능**
  - 메시지 재생성
  - 메시지 편집
  - 코드 블록 복사
  - 마크다운 렌더링
  - Mermaid 다이어그램
  - Plotly 차트
- ✅ **도구 승인 시스템** (Human-in-the-loop)
  - 파일 작업 승인
  - 명령 실행 승인
  - 세션별 자동 승인 옵션
- ✅ **Activity 로그**
  - 도구 실행 이력 추적
  - 메시지와 분리 관리
  - 성공/실패 상태
  - 실행 시간 측정
- ✅ **파일 및 문서 참조**
  - 이미지 첨부 (멀티모달)
  - RAG 문서 참조
  - 파일 변경 사항 Diff 뷰어

#### 지원 컴포넌트

| 컴포넌트                     | 기능                                     |
| ---------------------------- | ---------------------------------------- |
| `ChatArea.tsx`               | 메시지 렌더링, 스트리밍 처리             |
| `InputBox.tsx`               | 사용자 입력, 이미지/문서 첨부            |
| `MessageBubble.tsx`          | 개별 메시지, 코드 블록, 마크다운         |
| `ChatHistory.tsx`            | 대화 목록, 검색, 삭제                    |
| `ActivityPanel.tsx`          | AI 도구 실행 이력                        |
| `ToolApprovalDialog.tsx`     | 도구 승인 UI                             |
| `WorkingDirectoryIndicator`  | 현재 작업 디렉토리 표시                  |
| `LLMStatusBar.tsx`           | LLM 상태 및 모델 정보                    |
| `ImageGenerationProgress`    | 이미지 생성 진행률                       |
| `CodeDiffViewer.tsx`         | 파일 변경 사항 Diff                      |

---

### 1.2 Editor 모드 (코드 편집기)

**파일**: `components/editor/`

#### 핵심 기능

- ✅ **Monaco Editor 통합**
  - VS Code와 동일한 편집 엔진
  - 100+ 언어 구문 강조
  - IntelliSense (자동 완성, 파라미터 힌트)
  - 다중 커서
  - 검색 및 바꾸기
  - Minimap, 줄 번호, 줄바꿈
  - 다크/라이트 테마
- ✅ **파일 시스템 관리**
  - 작업 디렉토리 선택
  - 파일 트리 탐색
  - 파일 읽기/쓰기/생성/삭제/이름 변경
  - 다중 파일 탭 관리
  - Dirty 상태 표시 (변경된 파일 ●)
  - 저장 단축키 (Ctrl+S / Cmd+S)
- ✅ **전체 파일 검색**
  - ripgrep 기반 고속 검색
  - 정규식 지원
  - 파일 타입 필터
  - 결과 미리보기
  - Ctrl+Shift+F 단축키
- ✅ **통합 터미널**
  - xterm.js + node-pty
  - Windows: PowerShell
  - macOS/Linux: bash/zsh
  - 한글 입출력 지원
  - 실시간 양방향 통신
  - 다중 세션 관리
- ✅ **에디터 설정**
  - 폰트 크기/종류 (9가지 옵션)
  - 테마 (다크/라이트)
  - 탭 크기 (2/4/8)
  - 자동 줄바꿈
  - 미니맵 표시
  - 줄 번호 표시
- ✅ **AI 채팅 통합**
  - 코드 설명 요청
  - 리팩토링 제안
  - 버그 수정 (향후)
  - 자동 완성 (향후)

#### 지원 컴포넌트

| 컴포넌트                | 기능                                |
| ----------------------- | ----------------------------------- |
| `Editor.tsx`            | Monaco Editor, 파일 탭 관리         |
| `FileExplorer.tsx`      | 파일 트리, 디렉토리 선택            |
| `SearchPanel.tsx`       | ripgrep 검색                        |
| `TerminalPanel.tsx`     | 통합 터미널 (xterm.js)              |
| `EditorSettings.tsx`    | 에디터 외형 설정                    |
| `EditorChatInput.tsx`   | 에디터용 AI 채팅                    |
| `EditorChatArea.tsx`    | AI 응답 표시                        |

---

### 1.3 Browser 모드 (웹 브라우저)

**파일**: `components/browser/`

#### 핵심 기능

- ✅ **Chromium 기반 브라우저**
  - Electron BrowserView API
  - 네이티브 성능
  - 보안 샌드박스 (nodeIntegration 비활성화)
- ✅ **다중 탭 지원**
  - 크롬 스타일 탭 UI
  - 탭 스크롤 (< > 버튼)
  - 탭 hover 시 닫기 버튼
  - 탭 클릭으로 전환
- ✅ **브라우저 컨트롤**
  - URL 입력창
  - 뒤로/앞으로/새로고침/홈 버튼
  - 로딩 상태 표시
  - URL 자동 업데이트
- ✅ **북마크 관리**
  - 폴더 기반 북마크
  - 현재 페이지 북마크 추가
  - 북마크 클릭으로 이동
  - 북마크/폴더 삭제
  - JSON 형식 영구 저장
- ✅ **페이지 스냅샷** (Pocket 스타일)
  - 전체 화면 캡처 + 썸네일
  - 페이지 제목, URL, 생성일시 저장
  - 그리드 카드 뷰
  - 클릭으로 로드
  - PNG 형식 저장
- ✅ **Browser Agent** (AI 기반 웹 자동화)
  - 18개 built-in tool
  - Vision 기반 도구 5개
  - 자동 도구 실행 (승인 불필요)
  - 최대 30회 반복
  - 무한 루프 감지
- ✅ **Browser 설정**
  - LLM 설정 (maxTokens, temperature, topP, maxIterations)
  - 폰트 설정 (10가지 폰트, 크기 조정)
  - 스냅샷/북마크 폴더 열기
- ✅ **개발자 도구**
  - 크롬 DevTools
  - 콘솔, 네트워크, Elements

#### 지원 컴포넌트

| 컴포넌트                   | 기능                              |
| -------------------------- | --------------------------------- |
| `BrowserPanel.tsx`         | BrowserView 관리, 탭 UI           |
| `SimpleChatInput.tsx`      | Browser Agent 채팅                |
| `SimpleChatArea.tsx`       | Agent 로그 및 응답                |
| `BookmarksDialog.tsx`      | 북마크 관리                       |
| `BookmarksList.tsx`        | 북마크 목록                       |
| `SnapshotsDialog.tsx`      | 스냅샷 관리                       |
| `SnapshotsList.tsx`        | 스냅샷 그리드 카드                |
| `BrowserSettings.tsx`      | Browser 설정                      |
| `BrowserToolsList.tsx`     | Browser Agent 도구 목록           |
| `BrowserAgentLogsView.tsx` | Agent 실행 로그                   |

---

## 2. AI/LLM 통합

**파일**: `lib/llm/`, `lib/langgraph/`

### 2.1 LLM 제공자 및 모델

#### 지원 제공자

| 제공자     | 모델                                       | 비고                         |
| ---------- | ------------------------------------------ | ---------------------------- |
| OpenAI     | GPT-4, GPT-4 Turbo, GPT-3.5, GPT-4 Vision  | 공식 API                     |
| Anthropic  | Claude 3.5 Sonnet, Claude 3 Opus/Haiku     | 공식 API                     |
| Custom     | OpenAI Compatible API                      | Ollama, LM Studio, LiteLLM 등 |

#### Connection 기반 설정 (v2)

- ✅ **다중 Connection 등록**
  - Connection별 API 키, baseURL
  - 커스텀 HTTP 헤더
  - 활성화/비활성화
- ✅ **모델별 세부 설정**
  - temperature, maxTokens, topP
  - 역할 태그 (base, vision, autocomplete)
  - 스트리밍 활성화
- ✅ **Vision 모델 지원**
  - GPT-4 Vision, Claude 3.5 Sonnet
  - 이미지 첨부 및 분석
  - maxImageTokens 설정
- ✅ **Autocomplete 모델**
  - 에디터 자동 완성 전용
  - debounceMs로 요청 조절
- ✅ **Network 설정**
  - Proxy (system/manual/none)
  - SSL 인증서 검증
  - 타임아웃 설정

### 2.2 LangGraph 워크플로우

#### GraphFactory 클래스

- ✅ 싱글톤 패턴으로 그래프 재사용
- ✅ Lazy initialization (dynamic import)
- ✅ 동적 그래프 선택 (GraphConfig 기반)

#### 지원 그래프 타입

| 그래프 타입            | 설명                                      | 파일                          |
| ---------------------- | ----------------------------------------- | ----------------------------- |
| **Chat**               | 기본 대화 (RAG/Tool 비활성화)             | `graphs/chat.ts`              |
| **RAG**                | VectorDB 검색 + 생성                      | `graphs/rag.ts`               |
| **Agent**              | 도구 호출 + RAG                           | `graphs/chat-agent.ts`        |
| **Sequential Thinking**| 순차적 추론 (Chain of Thought)            | `graphs/sequential-thinking.ts` |
| **Tree of Thought**    | 트리 기반 다중 경로 탐색                  | `graphs/tree-of-thought.ts`   |
| **Deep Thinking**      | 깊은 사고 반복                            | `graphs/deep-thinking.ts`     |
| **Coding Agent**       | 파일 작업, 명령 실행, grep 검색           | `graphs/coding-agent.ts`      |
| **Browser Agent**      | 웹 브라우징 자동화 (18개 도구)            | `graphs/browser-agent.ts`     |
| **Editor Agent**       | 에디터 자동화 (최대 50회 반복)            | `graphs/editor-agent.ts`      |

#### 스트리밍 이벤트

| 이벤트                    | 설명                     |
| ------------------------- | ------------------------ |
| `streaming`               | LLM 응답 청크            |
| `node`                    | 노드 실행 상태           |
| `image_progress`          | 이미지 생성 진행률       |
| `tool_approval_request`   | 도구 승인 요청           |
| `tool_approval_result`    | 도구 승인 결과           |
| `error`                   | 오류 발생                |
| `end`                     | 스트림 종료              |

### 2.3 페르소나 시스템

**파일**: `types/persona.ts`, `components/persona/PersonaDialog.tsx`

#### Persona 인터페이스

```typescript
interface Persona {
  id: string;
  name: string; // "번역가", "영어 선생님"
  description: string;
  systemPrompt: string; // LLM에 전달될 시스템 메시지
  avatar?: string; // 이모지 또는 이미지 URL
  color?: string;
  isBuiltin: boolean;
  created_at: number;
  updated_at: number;
}
```

#### 기본 제공 페르소나

| 페르소나          | 이모지 | 설명                           |
| ----------------- | ------ | ------------------------------ |
| 일반 어시스턴트   | 🤖     | 범용 AI 어시스턴트             |
| 번역가            | 🌐     | 전문 번역 서비스               |
| 영어 선생님       | 📚     | 영어 학습 도우미               |
| 시니어 개발자     | 👨‍💻     | 기술 멘토링 및 코드 리뷰      |

#### 기능

- ✅ 대화별 페르소나 지정
- ✅ ChatArea에서 AI 프로필 표시 (이모지, 이름)
- ✅ 슬래시 커맨드 자동완성 (`/persona`)
- ✅ 키보드 네비게이션 (위/아래 화살표, Enter, Escape)
- ✅ 실시간 검색 필터링
- ✅ 사용자 정의 페르소나 추가/편집/삭제
- ✅ SQLite 데이터베이스 영구 저장

---

## 3. Browser Automation

**파일**: `lib/langgraph/graphs/browser-agent.ts`, `lib/mcp/tools/`

### 3.1 Built-in Browser Control Tools (18개)

#### Navigation (1개)

| 도구               | 설명          |
| ------------------ | ------------- |
| `browser_navigate` | URL 직접 이동 |

#### Page Inspection (5개)

| 도구                            | 설명                                    |
| ------------------------------- | --------------------------------------- |
| `browser_get_page_content`      | 페이지 내용 파악 (의미론적 구조 분석)  |
| `browser_get_interactive_elements` | 인터랙티브 요소 추출 (역할 기반 분류) |
| `browser_search_elements`       | 자연어 검색 (신규)                      |
| `browser_get_selected_text`     | 선택된 텍스트 읽기                      |
| `browser_take_screenshot`       | 화면 캡처 + 텍스트 미리보기             |

#### Page Interaction (3개)

| 도구                   | 설명                                |
| ---------------------- | ----------------------------------- |
| `browser_click_element`| 요소 클릭 (가시성/상태 검증)       |
| `browser_type_text`    | 텍스트 입력 (이벤트 트리거링)       |
| `browser_scroll`       | 페이지 스크롤                       |

#### Tab Management (4개)

| 도구                  | 설명            |
| --------------------- | --------------- |
| `browser_list_tabs`   | 탭 목록 조회    |
| `browser_create_tab`  | 새 탭 열기      |
| `browser_switch_tab`  | 탭 전환         |
| `browser_close_tab`   | 탭 닫기         |

#### Vision-based Tools (5개, 신규)

| 도구                                   | 설명                                     |
| -------------------------------------- | ---------------------------------------- |
| `browser_capture_annotated_screenshot` | Set-of-Mark 스타일 라벨링 (A, B, C...)   |
| `browser_click_coordinate`             | 좌표 클릭                                |
| `browser_click_marker`                 | 마커 클릭 (A, B, C...)                   |
| `browser_get_clickable_coordinate`     | 요소 좌표 추출                           |
| `browser_analyze_with_vision`          | LLM Vision 모델 통합 (향후)              |

### 3.2 Browser Agent 특징

- ✅ **자동 도구 실행** (Human-in-the-loop 불필요)
- ✅ **최대 30회 반복** (복잡한 브라우저 작업 지원)
- ✅ **무한 루프 감지**
  - 같은 도구를 같은 인수로 3번 반복 시 중단
  - 사용자에게 경고 메시지 표시
- ✅ **실시간 진행 상태 표시**
  - 노드 실행 상태
  - 도구 호출 이력
  - 오류 메시지
- ✅ **사용자 중단 기능**

### 3.3 사용 사례

- "네이버에서 TypeScript 검색해줘"
- "구글에서 오늘의 뉴스를 보여줘"
- "GitHub에서 Electron 저장소 찾아줘"
- 웹 폼 자동 작성
- 데이터 수집 및 스크래핑
- E-commerce 자동 주문 (테스트)
- 웹 테스팅 자동화

---

## 4. Editor 기능

**파일**: `components/editor/`

### 4.1 Monaco Editor 통합

- ✅ VS Code와 동일한 편집 엔진 (`@monaco-editor/react`)
- ✅ 100+ 언어 구문 강조
- ✅ IntelliSense (자동 완성, 파라미터 힌트)
- ✅ 다중 커서
- ✅ 검색 및 바꾸기
- ✅ Minimap, 줄 번호, 줄바꿈
- ✅ 다크/라이트 테마 (`vs-dark`, `vs-light`)

### 4.2 파일 시스템 관리

**IPC 핸들러**: `electron/ipc/handlers/file.ts`

| API               | 설명                    |
| ----------------- | ----------------------- |
| `readDirectory`   | 디렉토리 트리 읽기      |
| `readFile`        | 파일 내용 읽기          |
| `writeFile`       | 파일 저장               |
| `createFile`      | 새 파일 생성            |
| `createDirectory` | 새 폴더 생성            |
| `delete`          | 파일/폴더 삭제          |
| `rename`          | 이름 변경               |
| `searchFiles`     | ripgrep 기반 검색       |

### 4.3 통합 터미널

**기술 스택**:

- **xterm.js**: 터미널 UI
- **node-pty**: 크로스 플랫폼 셸 지원
- **FitAddon**: 자동 리사이즈
- **WebLinksAddon**: URL 클릭

**기능**:

- ✅ Windows: PowerShell
- ✅ macOS/Linux: bash/zsh
- ✅ 한글 입출력 지원 (LANG=ko_KR.UTF-8)
- ✅ 실시간 양방향 통신 (IPC 스트리밍)
- ✅ 다중 세션 관리
- ✅ 세션별 탭 UI
- ✅ 터미널 재시작/종료

### 4.4 전체 파일 검색

**ripgrep 기반**:

- ✅ 정규식 지원
- ✅ 파일 타입 필터
- ✅ 대소문자 구분/무시
- ✅ 결과 미리보기
- ✅ 파일 경로 클릭으로 열기
- ✅ Ctrl+Shift+F 단축키

### 4.5 에디터 설정

| 설정          | 옵션                                      |
| ------------- | ----------------------------------------- |
| 폰트 종류     | Consolas, Monaco, Menlo, Courier New, Fira Code, Source Code Pro, JetBrains Mono, D2Coding, Nanum Gothic Coding |
| 폰트 크기     | 10-24px                                   |
| 테마          | Dark (`vs-dark`), Light (`vs-light`)      |
| 탭 크기       | 2, 4, 8                                   |
| 줄바꿈        | On, Off                                   |
| Minimap       | 표시, 숨김                                |
| 줄 번호       | 표시, 숨김                                |

### 4.6 AI 기능 (향후)

**EditorLLMPromptsConfig**:

- `autoCompletePrompt`: 자동 완성 프롬프트
- `explainCodePrompt`: 코드 설명 프롬프트
- `refactorCodePrompt`: 리팩토링 프롬프트
- `fixBugPrompt`: 버그 수정 프롬프트
- `addCommentsPrompt`: 주석 추가 프롬프트
- `generateTestPrompt`: 테스트 생성 프롬프트

**현재 상태**: 프론트엔드 UI만 구현, 백엔드 로직 미구현

---

## 5. MCP 통합

**파일**: `lib/mcp/`

### 5.1 MCP 아키텍처

**MCPServerManager 클래스**:

- ✅ stdio 및 SSE 전송 방식 지원
- ✅ 다중 MCP 서버 관리
- ✅ 서버별 활성화/비활성화
- ✅ 도구 목록 통합
- ✅ 자동 재연결

**전송 방식**:

| 전송 방식 | 설명                                      |
| --------- | ----------------------------------------- |
| **stdio** | 로컬 프로세스 (npx, Python 등)            |
| **SSE**   | HTTP 기반 스트리밍 (원격 서버)            |

### 5.2 Built-in Tools

**파일**: `lib/mcp/tools/builtin-tools.ts`

#### 파일 작업

| 도구          | 설명                              |
| ------------- | --------------------------------- |
| `file_read`   | 파일 읽기                         |
| `file_write`  | 파일 쓰기 (덮어쓰기)              |
| `file_edit`   | 파일 편집 (old_str → new_str 대체)|
| `file_list`   | 디렉토리 목록                     |

#### 명령 실행

| 도구              | 설명                       |
| ----------------- | -------------------------- |
| `command_execute` | 셸 명령 실행 (npm, git 등) |
| `grep_search`     | ripgrep 패턴 검색          |

#### Browser Control

- 18개 브라우저 제어 도구 (위 3절 참조)

### 5.3 MCP 도구 실행 순서

**ToolsNode 실행 순서**:

1. **ComfyUI** (이미지 생성)
2. **Built-in Tools** (파일, 명령, 브라우저)
3. **MCP Tools** (외부 서버)

### 5.4 MCP 서버 설정

**MCPServerConfig**:

```typescript
interface MCPServerConfig {
  name: string; // 서버 이름
  command: string; // 실행 명령 (stdio)
  args?: string[]; // 명령 인수
  env?: Record<string, string>; // 환경 변수
  transport: 'stdio' | 'sse'; // 전송 방식
  url?: string; // SSE URL
  enabled: boolean; // 활성화 상태
}
```

**저장 위치**: `userData/mcp-servers.json`

---

## 6. RAG (Retrieval-Augmented Generation)

**파일**: `lib/vectordb/`

### 6.1 Vector Database 지원

| Vector DB       | 상태      | 어댑터 파일                |
| --------------- | --------- | -------------------------- |
| **SQLite-vec**  | ✅ 구현됨 | `adapters/sqlite-vec.ts`   |
| **OpenSearch**  | ⏳ 예정   | `adapters/opensearch.ts`   |
| **Elasticsearch**| ⏳ 예정  | `adapters/elasticsearch.ts`|
| **pgvector**    | ⏳ 예정   | `adapters/pgvector.ts`     |

**SQLite-vec 어댑터**:

- ✅ `vec0` 확장 사용
- ✅ 코사인 유사도 검색
- ✅ SQLite 기반 경량 벡터 DB
- ✅ 로컬 파일 시스템 저장

### 6.2 Embeddings

**파일**: `lib/vectordb/embeddings/`

**지원 제공자**:

| 제공자    | 모델                                        |
| --------- | ------------------------------------------- |
| **OpenAI**| `text-embedding-3-small`, `text-embedding-3-large` |
| **Local** | 로컬 임베딩 모델 (향후)                    |

**EmbeddingClient**:

- ✅ 단일/배치 임베딩 생성
- ✅ Network Config 적용 (proxy, SSL)
- ✅ 검증 API

### 6.3 문서 인덱싱

**파일**: `lib/vectordb/indexing.ts`

**지원 형식**:

| 형식      | 라이브러리    |
| --------- | ------------- |
| PDF       | `pdf-parse`   |
| DOCX      | `mammoth`     |
| TXT       | Node.js `fs`  |
| Markdown  | Node.js `fs`  |

**청크 전략**:

| 파라미터       | 기본값 | 설명                  |
| -------------- | ------ | --------------------- |
| `chunkSize`    | 1000   | 청크 크기 (문자)      |
| `chunkOverlap` | 200    | 청크 겹침 (문자)      |
| `batchSize`    | 100    | 배치 크기             |

**인덱싱 워크플로우**:

1. 문서 업로드 (`DocumentUploader.tsx`)
2. 파일 파싱 및 청크 분할
3. 임베딩 생성 (OpenAI)
4. VectorDB에 저장
5. 검색 가능

### 6.4 RAG Graph

**파일**: `lib/langgraph/graphs/rag.ts`

**노드**:

| 노드       | 설명                                      |
| ---------- | ----------------------------------------- |
| `retrieve` | VectorDB에서 관련 문서 검색 (Top-K)       |
| `generate` | 검색된 문서를 컨텍스트로 LLM 응답 생성    |

**파라미터**:

- `topK`: 검색할 문서 수 (기본: 3)
- `scoreThreshold`: 유사도 임계값 (기본: 0.7)

### 6.5 문서 관리 UI

**파일**: `components/rag/`, `components/pages/DocumentsPage.tsx`

**기능**:

- ✅ 문서 업로드 (PDF, DOCX, TXT, MD)
- ✅ 문서 목록 (제목, 형식, 크기, 청크 수)
- ✅ 문서 편집 (제목 수정)
- ✅ 문서 삭제
- ✅ VectorDB 설정
- ✅ Embedding 제공자 설정

---

## 7. 이미지 생성 (ComfyUI)

**파일**: `lib/comfyui/client.ts`

### 7.1 ComfyUI 통합

**ComfyUIClient 클래스**:

- ✅ HTTP API로 워크플로우 큐 전송
- ✅ WebSocket으로 진행 상황 모니터링
- ✅ 이미지 다운로드 및 base64 변환

### 7.2 지원 워크플로우

**Qwen Image**:

- ✅ Qwen 2.5 VL 7B 기반 이미지 생성
- ✅ 4-step Lightning 모델
- ✅ 1328x1328 기본 해상도
- ✅ CFG Scale, Seed 조정 가능

### 7.3 진행 상황 표시

| 상태        | 설명          |
| ----------- | ------------- |
| Queued      | 대기열 추가   |
| Executing   | 실행 중 (단계별 진행률) |
| Completed   | 완료          |

**ImageGenerationProgressBar.tsx**:

- ✅ 진행률 바
- ✅ 현재 단계 / 전체 단계
- ✅ 예상 시간

### 7.4 이미지 저장

- ✅ 저장 경로: `userData/comfyui/images/`
- ✅ 형식: PNG
- ✅ base64로 UI에 표시
- ✅ 메시지에 첨부

### 7.5 ComfyUI 설정

**ComfyUISettingsTab.tsx**:

| 설정            | 설명                          |
| --------------- | ----------------------------- |
| 활성화          | ComfyUI 사용 여부             |
| HTTP URL        | ComfyUI API 엔드포인트        |
| WebSocket URL   | WebSocket 엔드포인트          |
| Workflow ID     | 워크플로우 선택               |
| API Key         | 인증 키 (선택)                |
| Positive Prompt | 생성할 이미지 설명            |
| Negative Prompt | 피할 요소                     |
| Steps           | 생성 단계 수 (1-50)           |
| CFG Scale       | 프롬프트 가이던스 (1-20)      |
| Seed            | 시드 값 (-1 = 랜덤)           |

---

## 8. 인증 및 동기화

**파일**: `lib/auth/`

### 8.1 GitHub OAuth

**OAuth Flow**:

1. `initiateLogin`: GitHub OAuth URL 생성 (PKCE)
2. `githubLogin`: 외부 브라우저에서 인증
3. `exchangeCode`: Authorization Code → Access Token
4. `getUserInfo`: GitHub 사용자 정보 조회

**GitHub App 설정**:

| 설정            | 설명                          |
| --------------- | ----------------------------- |
| App ID          | GitHub App ID                 |
| Installation ID | Installation ID               |
| Private Key     | RSA 개인 키                   |
| Repository      | 저장소 선택 (owner/repo)      |

### 8.2 설정 동기화

**암호화**:

- ✅ AES-256-GCM
- ✅ Master Password 기반 키 파생 (PBKDF2)
- ✅ IV, Auth Tag 포함

**동기화 플로우**:

**Push to GitHub**:

1. 설정을 JSON으로 직렬화
2. Master Password로 AES-256-GCM 암호화
3. GitHub 저장소의 `config.encrypted.json`에 커밋

**Pull from GitHub**:

1. GitHub에서 `config.encrypted.json` 읽기
2. Master Password로 복호화
3. 로컬 설정 업데이트

**저장소 권한**:

- Repository Contents (Read/Write)
- Metadata (Read)

### 8.3 계정 프로필

**AccountProfile.tsx**:

- ✅ GitHub 사용자 정보 표시
- ✅ 로그인/로그아웃
- ✅ Push to GitHub
- ✅ Pull from GitHub
- ✅ Master Password 입력

---

## 9. 설정 및 구성

**파일**: `components/settings/`

### 9.1 LLM Settings

**LLMSettingsTab.tsx**:

- ✅ Connection 관리 (추가/편집/삭제/활성화)
- ✅ 모델 목록 가져오기 (Fetch Models)
- ✅ 모델별 세부 설정 (temperature, maxTokens, 역할 태그)
- ✅ 활성 모델 선택 (base, vision, autocomplete)

**ConnectionManager.tsx**:

- ✅ Connection 추가/편집/삭제
- ✅ API 키, baseURL, 커스텀 헤더
- ✅ 활성화/비활성화 토글

**ModelListView.tsx**:

- ✅ 모델 목록 표시
- ✅ 역할 태그 배지 (base, vision, autocomplete)
- ✅ 활성 모델 체크 표시
- ✅ 모델별 설정 편집

### 9.2 VectorDB Settings

**VectorDBSettings.tsx**:

- ✅ VectorDB 타입 선택
- ✅ SQLite-vec: DB 경로
- ✅ OpenSearch/Elasticsearch: 호스트, 포트, 인증
- ✅ pgvector: 연결 문자열
- ✅ Embedding 제공자 설정
- ✅ 연결 테스트

### 9.3 MCP Settings

**MCPSettingsTab.tsx**:

- ✅ MCP 서버 추가/삭제
- ✅ stdio/SSE 전송 방식 선택
- ✅ 서버별 활성화/비활성화
- ✅ 도구 목록 확인
- ✅ 서버 상태 모니터링

### 9.4 ComfyUI Settings

**ComfyUISettingsTab.tsx**:

- ✅ ComfyUI 활성화/비활성화
- ✅ HTTP URL, WebSocket URL
- ✅ Workflow ID
- ✅ API Key (선택)
- ✅ Positive/Negative Prompt
- ✅ Steps, CFG Scale, Seed
- ✅ 연결 테스트

### 9.5 Network Settings

**NetworkSettingsTab.tsx**:

- ✅ Proxy 설정 (system/manual/none)
- ✅ Manual Proxy: HTTP/HTTPS/SOCKS 프록시
- ✅ SSL 인증서 검증
- ✅ 커스텀 HTTP 헤더

### 9.6 Quick Input Settings

**QuickInputSettingsTab.tsx**:

- ✅ Quick Input 단축키 설정 (Cmd+Shift+Space)
- ✅ Quick Question 설정 (최대 5개)
  - 이름, 단축키, 프롬프트
  - 클립보드 내용 + 시스템 메시지 → LLM
- ✅ Quick Question 추가/편집/삭제

### 9.7 Backup & Restore

**BackupRestoreSettings.tsx**:

- ✅ 전체 설정 JSON 내보내기
- ✅ 파일에서 설정 가져오기
- ✅ 설정 초기화
- ✅ 백업 파일 미리보기

### 9.8 Editor Settings

**EditorSettings.tsx**:

- ✅ 폰트 크기/종류
- ✅ 테마 (다크/라이트)
- ✅ 탭 크기 (2/4/8)
- ✅ 자동 줄바꿈
- ✅ Minimap 표시
- ✅ 줄 번호 표시
- ✅ LLM 프롬프트 커스터마이징 (향후)

### 9.9 Browser Settings

**BrowserSettings.tsx**:

- ✅ Browser Agent LLM 설정
  - Max Tokens: 256-16384 (기본: 4096)
  - Temperature: 0-2 (기본: 0.7)
  - Top P: 0-1 (기본: 1.0)
  - Max Iterations: 1-50 (기본: 20)
- ✅ Browser Chat 폰트 설정
  - 폰트 종류 (10가지 옵션)
  - 폰트 크기 (10-24px)
  - 다국어 미리보기 (한국어, 영어, 일본어)
- ✅ 스냅샷/북마크 폴더 열기

---

## 10. 기타 주요 기능

### 10.1 Quick Input (전역 입력창)

**파일**: `app/quick-input/page.tsx`

**기능**:

- ✅ Cmd+Shift+Space (macOS) / Ctrl+Shift+Space (Windows)
- ✅ 전역 단축키로 즉시 입력창 표시
- ✅ 클립보드 내용 + Quick Question 프롬프트 → LLM
- ✅ 결과를 클립보드에 복사
- ✅ 별도 창으로 표시 (항상 위)
- ✅ Quick Question 단축키 (Cmd+1~5)

**Quick Question 예시**:

- "한국어로 번역"
- "문법 교정"
- "요약"
- "코드 설명"
- "마크다운 변환"

### 10.2 업데이트 체크

**파일**: `electron/utils/update-checker.ts`

**기능**:

- ✅ GitHub Releases API로 최신 버전 확인
- ✅ 시작 시 자동 체크
- ✅ 새 버전 알림 다이얼로그 (UpdateNotificationDialog.tsx)
- ✅ 릴리즈 노트 표시
- ✅ 다운로드 링크

### 10.3 Activity Logging

**파일**: `types/index.ts`, `electron/services/chat-logger.ts`

**Activity 인터페이스**:

```typescript
interface Activity {
  id: string;
  conversation_id: string;
  tool_name: string; // file_read, command_execute, etc.
  tool_args: Record<string, unknown>;
  result: string;
  status: 'success' | 'error';
  created_at: number;
  duration_ms?: number;
}
```

**특징**:

- ✅ 메시지와 분리하여 관리 (컨텍스트 낭비 방지)
- ✅ SQLite 데이터베이스 영구 저장
- ✅ ActivityPanel에서 시각화
- ✅ 도구 실행 이력 추적
- ✅ 성공/실패 상태
- ✅ 실행 시간 측정

### 10.4 데이터베이스

**파일**: `electron/services/database.ts`

**better-sqlite3 기반**:

| 테이블              | 설명                      |
| ------------------- | ------------------------- |
| `conversations`     | 대화 목록                 |
| `messages`          | 메시지 (role, content, tool_calls, images, referenced_documents) |
| `activities`        | 도구 실행 이력            |
| `personas`          | 사용자 정의 페르소나      |
| `bookmarks`         | 북마크                    |
| `bookmark_folders`  | 북마크 폴더               |
| `snapshots`         | 페이지 스냅샷             |

**데이터 경로**:

- Windows: `%APPDATA%/sepilot-desktop`
- macOS: `~/Library/Application Support/sepilot-desktop`
- Linux: `~/.config/sepilot-desktop`

### 10.5 Theme System

**파일**: `components/providers/theme-provider.tsx`

**next-themes 기반**:

- ✅ Dark/Light 모드
- ✅ 시스템 설정 자동 감지
- ✅ CSS 변수 기반 색상 팔레트
- ✅ Tailwind CSS 통합

**ThemeToggle.tsx**:

- ✅ Sun/Moon 아이콘
- ✅ 드롭다운 메뉴 (Light/Dark/System)

### 10.6 Markdown Rendering

**파일**: `components/markdown/`

**MarkdownRenderer.tsx**:

- ✅ `markdown-to-jsx` 사용
- ✅ 코드 블록 (react-syntax-highlighter)
- ✅ Mermaid 다이어그램
- ✅ Plotly 차트

**CodeBlock.tsx**:

- ✅ 언어별 구문 강조
- ✅ 코드 복사 버튼
- ✅ 라인 번호

**MermaidDiagram.tsx**:

- ✅ Flowchart, Sequence Diagram, Class Diagram 등
- ✅ SVG 렌더링

**PlotlyChart.tsx**:

- ✅ JSON 기반 차트 데이터
- ✅ 인터랙티브 그래프 (줌, 팬, 호버)

### 10.7 UI Components (shadcn/ui)

**파일**: `components/ui/`

**기본 컴포넌트**:

| 컴포넌트       | 설명                      |
| -------------- | ------------------------- |
| Button         | 버튼 (variant, size)      |
| Input          | 입력 필드                 |
| Textarea       | 다중 줄 입력              |
| Dialog         | 모달 대화상자             |
| AlertDialog    | 경고 대화상자             |
| Popover        | 팝오버                    |
| Tooltip        | 툴팁                      |
| Select         | 드롭다운 선택             |
| DropdownMenu   | 드롭다운 메뉴             |
| ContextMenu    | 우클릭 메뉴               |
| Tabs           | 탭                        |
| Collapsible    | 접기/펼치기               |
| ScrollArea     | 스크롤 영역               |
| Card           | 카드                      |
| Badge          | 배지                      |
| Avatar         | 아바타                    |
| Switch         | 토글 스위치               |
| Label          | 라벨                      |
| Alert          | 알림                      |

---

## 11. 보안 및 프라이버시

### 11.1 보안 설계

**Electron 보안**:

- ✅ `nodeIntegration: false`
- ✅ `contextIsolation: true`
- ✅ `sandbox: true` (BrowserView)
- ✅ Context Bridge를 통한 안전한 IPC

**데이터 암호화**:

- ✅ GitHub 동기화: AES-256-GCM
- ✅ Master Password 기반 키 파생 (PBKDF2)

**API 키 저장**:

- ✅ SQLite DB에 저장 (평문, 로컬 디스크 암호화 권장)
- ✅ 환경 변수 지원 (.env)

### 11.2 프라이버시

**로컬 우선**:

- ✅ 모든 데이터는 로컬 저장
- ✅ GitHub 동기화는 선택사항 (암호화됨)

**사용자 데이터 경로**:

- Windows: `%APPDATA%/sepilot-desktop`
- macOS: `~/Library/Application Support/sepilot-desktop`
- Linux: `~/.config/sepilot-desktop`

**로그**:

- ✅ 개발 모드에서만 콘솔 출력
- ✅ 파일 로그 없음 (ChatLogger 제외)

---

## 12. 주요 기술 스택

### Frontend

| 기술          | 버전   | 설명                    |
| ------------- | ------ | ----------------------- |
| Next.js       | 16     | App Router              |
| React         | 19     | UI 라이브러리           |
| TypeScript    | 5.9    | strict mode             |
| Tailwind CSS  | 4      | 유틸리티 CSS            |
| shadcn/ui     | -      | UI 컴포넌트             |
| Zustand       | 5      | 상태 관리               |

### Desktop

| 기술               | 버전   | 설명                    |
| ------------------ | ------ | ----------------------- |
| Electron           | 39     | 데스크톱 프레임워크     |
| better-sqlite3     | -      | SQLite 데이터베이스     |
| node-pty           | -      | 터미널 (PTY)            |
| Monaco Editor      | -      | 코드 편집기             |
| xterm.js           | -      | 터미널 UI               |

### AI & LLM

| 기술                  | 버전   | 설명                    |
| --------------------- | ------ | ----------------------- |
| LangGraph             | -      | AI 워크플로우           |
| OpenAI SDK            | -      | OpenAI API              |
| Anthropic SDK         | -      | Anthropic API           |
| SQLite-vec            | -      | 벡터 DB                 |
| pdf-parse             | -      | PDF 파싱                |
| mammoth               | -      | DOCX 파싱               |

### Development

| 기술            | 버전   | 설명                    |
| --------------- | ------ | ----------------------- |
| ESLint          | 9      | 코드 린팅               |
| Prettier        | 3      | 코드 포맷팅             |
| Jest            | 30     | 테스트 프레임워크       |
| electron-builder| 26     | 빌드 도구               |

---

## 13. 향후 로드맵

### 계획된 기능

- ⏳ **플러그인 시스템**
  - 사용자 정의 플러그인 개발
  - 플러그인 마켓플레이스
- ⏳ **다국어 UI 지원**
  - 영어, 일본어, 중국어
  - i18n 통합
- ⏳ **음성 입력/출력**
  - 음성 인식 (Speech-to-Text)
  - 음성 합성 (Text-to-Speech)
- ⏳ **협업 채팅 세션**
  - 실시간 대화 공유
  - WebSocket 기반 동기화
- ⏳ **모바일 컴패니언 앱**
  - iOS/Android 앱
  - 데스크톱과 동기화
- ⏳ **LLM Vision 모델 통합**
  - `browser_analyze_with_vision` 구현
  - 스크린샷 분석 및 추론
- ⏳ **Editor LLM 프롬프트 커스터마이징 백엔드**
  - 자동 완성 백엔드 로직
  - 코드 설명, 리팩토링, 버그 수정 백엔드
- ⏳ **VectorDB 어댑터 구현**
  - pgvector, OpenSearch, Elasticsearch

---

## 14. 라이선스 및 기여

**라이선스**: Custom License (상세 내용은 `LICENSE` 파일 참조)

**기여 방법**:

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

**이슈 리포트**: [GitHub Issues](https://github.com/jhl-labs/sepilot_desktop/issues)

---

## 15. 참고 자료

- [README.md](./README.md) - 프로젝트 개요 및 설치 가이드
- [CLAUDE.md](./CLAUDE.md) - Claude Code 작업 가이드
- [CONTRIBUTING.md](./CONTRIBUTING.md) - 기여 가이드
- [release_notes/](./release_notes/) - 릴리즈 노트

---

## 16. 결론

SEPilot Desktop은 Claude Desktop 수준의 기능을 제공하는 종합 AI 데스크톱 애플리케이션입니다. 다중 LLM 제공자, RAG, MCP, 브라우저 자동화, 코드 편집, 터미널 등 다양한 기능을 단일 애플리케이션에 통합하여 개발자와 일반 사용자 모두에게 강력한 AI 도구를 제공합니다.

**핵심 강점**:

- ✅ **통합 환경**: Chat, Editor, Browser 모드를 하나의 앱에서
- ✅ **유연한 AI**: 다중 LLM 제공자, 페르소나 시스템, 다양한 Thinking Mode
- ✅ **자동화**: Browser Agent, Coding Agent, MCP 도구 통합
- ✅ **개발자 친화**: Monaco Editor, 터미널, ripgrep 검색
- ✅ **확장성**: MCP 프로토콜, 플러그인 시스템 (향후)
- ✅ **프라이버시**: 로컬 우선, 암호화된 동기화

**연락처**:

- GitHub: [https://github.com/jhl-labs/sepilot_desktop](https://github.com/jhl-labs/sepilot_desktop)
- Issues: [https://github.com/jhl-labs/sepilot_desktop/issues](https://github.com/jhl-labs/sepilot_desktop/issues)

---

**마지막 업데이트**: 2025-11-30
**버전**: 0.6.0
