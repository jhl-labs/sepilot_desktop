# components/chat/ - 채팅 UI 컴포넌트

> Unified 아키텍처 기반 채팅 UI (Main, Browser, Editor 모드 통합 지원)

## 📋 목차

- [개요](#개요)
- [폴더 구조](#폴더-구조)
- [주요 파일](#주요-파일)
- [Unified Chat 아키텍처](#unified-chat-아키텍처)
- [Hooks](#hooks)
- [Components](#components)
- [Plugins](#plugins)
- [사용 예제](#사용-예제)
- [새 기능 추가 가이드](#새-기능-추가-가이드)
- [주의사항](#주의사항)
- [관련 문서](#관련-문서)

---

## 개요

components/chat/ 폴더는 SEPilot Desktop의 채팅 UI를 담당합니다. Phase 1 리팩토링(2025-02-10)을 통해 **Unified 아키텍처**로 통합되었으며, Main Chat, Browser Chat, Editor Chat 모두 동일한 `UnifiedChatArea` + `UnifiedChatInput` 컴포넌트를 사용합니다.

**핵심 특징:**

- **모드 통합**: `ChatConfig`를 통해 Main/Browser/Editor 모드 자동 전환
- **Responsive Layout**: Width 기반 자동 레이아웃 (Ultra-Compact / Compact / Full)
- **플러그인 기반**: 기능별 Plugin으로 분리 (Persona, ToolApproval, ImageAttachment 등)
- **중앙화된 Hooks**: 메시지 스트리밍, 파일 업로드, 이미지 첨부 등 모든 로직 Hook으로 추상화
- **타입 안전성**: `ChatConfig`, `ChatFeatures`, `ChatDataSource` 타입으로 엄격한 타입 체킹

---

## 폴더 구조

```
components/chat/
├── unified/                      # Unified 채팅 아키텍처
│   ├── UnifiedChatArea.tsx       # 메시지 목록 표시 (18KB)
│   ├── UnifiedChatInput.tsx      # 입력 영역 (46KB, Responsive Layout)
│   ├── types.ts                  # ChatConfig 타입 정의
│   ├── hooks/                    # 채팅 Hooks (8개)
│   │   ├── useChatMessages.ts    # 메시지 로드 및 스크롤
│   │   ├── useMessageStreaming.ts# 메시지 스트리밍 핵심 로직 (29KB)
│   │   ├── useChatStreaming.ts   # Browser/Editor Chat 전용 스트리밍
│   │   ├── useChatInput.ts       # 입력 텍스트 관리
│   │   ├── useImageUpload.ts     # 이미지 첨부
│   │   ├── useFileUpload.ts      # 파일 업로드 (드래그 앤 드롭)
│   │   ├── useToolApproval.ts    # Tool 승인 (Human-in-the-loop)
│   │   └── useConfigLoader.ts    # LLM, ImageGen 설정 로드
│   ├── components/               # 서브 컴포넌트 (7개)
│   │   ├── MessageBubble.tsx     # 메시지 버블 (edit, regen, copy)
│   │   ├── LLMStatusBar.tsx      # LLM 상태 표시 (21KB)
│   │   ├── ToolResult.tsx        # Tool 실행 결과
│   │   ├── InteractiveSelect.tsx # 인터랙티브 선택 (Agent)
│   │   ├── InteractiveInput.tsx  # 인터랙티브 입력 (Agent)
│   │   ├── ImageGenerationProgressBar.tsx # 이미지 생성 진행률
│   │   └── ToolApprovalRequest.tsx # Tool 승인 요청 UI
│   └── plugins/                  # 기능별 플러그인 (9개)
│       ├── PersonaPlugin.tsx     # Persona 자동완성
│       ├── ToolApprovalDialog.tsx# Tool 승인 다이얼로그 (8KB)
│       ├── ToolApprovalPlugin.tsx# Tool 승인 플러그인
│       ├── ImageAttachmentPlugin.tsx # 이미지 첨부 버튼/프리뷰
│       ├── FileUploadPlugin.tsx  # 파일 업로드 버튼
│       ├── AgentLogsPlugin.tsx   # Agent 실행 로그 표시
│       ├── AgentProgressPlugin.tsx # Agent 진행 상태 표시
│       ├── EditRegeneratePlugin.tsx # 메시지 편집/재생성
│       └── FontScalePlugin.tsx   # 폰트 크기 조절
│
├── ChatContainer.tsx             # Main Chat 컨테이너 (8KB)
├── CodeDiffViewer.tsx            # 코드 diff 표시 (5KB)
├── WorkingDirectoryIndicator.tsx # 작업 디렉토리 표시 (4KB)
├── CompressConversationDialog.tsx# 대화 압축 다이얼로그 (13KB)
└── SaveKnowledgeDialog.tsx       # Knowledge 저장 다이얼로그 (11KB)
```

---

## 주요 파일

### ChatContainer.tsx (Main Chat)

Main Chat 컨테이너로, `UnifiedChatArea` + `UnifiedChatInput`을 조합하여 메인 대화 UI를 구성합니다.

**주요 기능:**

- `useChatStore`에서 메시지, 대화, Persona 로드
- `useMessageStreaming`으로 메시지 스트리밍 실행
- `ChatConfig` 생성 및 Unified 컴포넌트에 전달
- 메시지 편집(edit), 재생성(regenerate) 핸들러
- 빌트인 Persona 다국어 지원 (i18next)

**사용 위치:** `app/page.tsx`, `components/layout/MainLayout.tsx`

### unified/UnifiedChatArea.tsx

메시지 목록 표시 컴포넌트로, Main/Browser/Editor 모든 모드에서 사용됩니다.

**주요 기능:**

- `ChatConfig.mode`에 따라 렌더링 방식 자동 전환:
  - **Main mode**: `MessageBubble` 사용 (edit, regen, copy 지원)
  - **Browser/Editor mode**: Compact layout + Context menu
- Interactive Content 파싱 (`parseInteractiveContent`):
  - `<tool-result>`, `<interactive-select>`, `<interactive-input>` 태그 인식
  - Markdown과 Interactive 컴포넌트 혼합 렌더링
- 대화 리포트 버튼 (에러 발생 시 자동 표시)
- Chat width 설정 (localStorage 저장, 640px ~ 1536px)
- Empty state (모드별 다른 메시지)

### unified/UnifiedChatInput.tsx

입력 영역 컴포넌트로, Width 기반 Responsive Layout을 지원합니다.

**주요 기능:**

- **Responsive Layout** (ResizeObserver):
  - **Ultra-Compact** (< 500px): 모든 컨트롤 드롭다운 메뉴로 통합
  - **Compact** (500px ~ 800px): 주요 컨트롤만 표시
  - **Full** (≥ 800px): 모든 컨트롤 표시 (Main Chat 스타일)
- **Thinking Mode 선택기** (6개 모드):
  - instant, sequential, tree-of-thought, deep, deep-web-research, coding
- **RAG, Tools, ImageGen 토글**:
  - Tools 토글 시 MCP 도구 목록 표시 (Enable All / Disable All)
- **이미지 첨부** (ImageAttachmentPlugin):
  - 드래그 앤 드롭, 클립보드 붙여넣기, 파일 선택
- **Persona 자동완성** (PersonaPlugin):
  - `/persona {검색어}` 입력 시 자동완성
  - Arrow Up/Down으로 선택, Enter로 적용
- **Agent 진행 상태 표시**:
  - LangGraph Agent 실행 시 진행률 표시 (iteration/maxIterations)
- **Image Generation 진행 상태**:
  - ComfyUI/NanoBanana 이미지 생성 진행률 표시
- **Esc 키로 스트리밍 중단**

### unified/types.ts

Unified Chat의 타입 정의 파일입니다.

**주요 타입:**

```typescript
type ChatMode = 'main' | 'browser' | 'editor' | 'terminal';

interface ChatFeatures {
  enableEdit?: boolean; // 메시지 수정
  enableRegenerate?: boolean; // 응답 재생성
  enableCopy?: boolean; // 메시지 복사
  enableImageUpload?: boolean; // 이미지 첨부
  enableFileUpload?: boolean; // 파일 업로드
  enableToolApproval?: boolean; // Tool approval
  enableFontScale?: boolean; // 폰트 크기 조절
  enablePersona?: boolean; // Persona 표시
  enableAgentLogs?: boolean; // Agent 로그
  enableAgentProgress?: boolean; // Agent 진행 상태
  enableThinkingModeSelector?: boolean;
  enableRAGToggle?: boolean;
  enableToolsToggle?: boolean;
  enableImageGeneration?: boolean;
}

interface ChatConfig {
  mode: ChatMode;
  features: ChatFeatures;
  style?: ChatStyle;
  dataSource: ChatDataSource; // Store 연결 추상화
  conversationId?: string;
  activePersona?: Persona | null;
  thinkingMode?: ThinkingMode;
  enableRAG?: boolean;
  enableTools?: boolean;
  onCodeRun?: (code: string, language: string) => Promise<void>;
}
```

---

## Unified Chat 아키텍처

### ChatConfig 기반 구성

모든 Chat UI는 `ChatConfig` 객체를 받아 동작합니다.

```typescript
const chatConfig: ChatConfig = {
  mode: 'main',                  // 'main' | 'browser' | 'editor' | 'terminal'
  features: {
    enableEdit: true,            // Main Chat만 true
    enableRegenerate: true,      // Main Chat만 true
    enableCopy: true,            // 모든 모드
    enableImageUpload: true,     // isElectron() 체크
    enableFileUpload: true,
    enableToolApproval: true,    // Main Chat만 true
    enableThinkingModeSelector: true, // Main Chat만 true
    enableRAGToggle: true,       // Main Chat만 true
    enableToolsToggle: true,     // Main Chat만 true
    enableImageGeneration: true, // Main Chat + imageGenAvailable
  },
  dataSource: {
    messages: messages,          // useChatStore에서 가져온 메시지
    streamingState: streamingMessageId,
    addMessage: async (msg) => { /* Store 액션 */ },
    updateMessage: (id, updates) => { /* Store 액션 */ },
    clearMessages: () => {},
    startStreaming: () => {},
    stopStreaming: () => {},
  },
  conversationId: activeConversationId,
  activePersona: activePersona,
};

// Unified 컴포넌트 사용
<UnifiedChatArea config={chatConfig} onEdit={handleEdit} onRegenerate={handleRegenerate} />
<UnifiedChatInput config={chatConfig} onSendMessage={handleSend} onStopStreaming={handleStop} isStreaming={isStreaming} />
```

### Responsive Layout

`UnifiedChatInput`은 컨테이너 width를 실시간으로 관찰하여 레이아웃을 자동 전환합니다.

```typescript
function getLayoutMode(width: number): LayoutMode {
  if (width < 500) return 'ultra-compact';
  if (width < 800) return 'compact';
  return 'full';
}

// ResizeObserver 사용
useEffect(() => {
  const resizeObserver = new ResizeObserver(() => {
    const width = containerRef.current.clientWidth;
    setLayoutMode(getLayoutMode(width));
  });
  resizeObserver.observe(containerRef.current);
}, []);
```

**Ultra-Compact**: 모든 컨트롤 드롭다운 메뉴로 (Browser Extension 내부)
**Compact**: 주요 컨트롤만 표시 (BrowserView 사이드)
**Full**: 모든 컨트롤 표시 (Main Chat)

### Interactive Content 파싱

Agent가 생성한 인터랙티브 요소(`<tool-result>`, `<interactive-select>` 등)를 파싱하여 React 컴포넌트로 렌더링합니다.

```typescript
import { parseInteractiveContent } from '@/lib/utils/interactive-parser';

const parsed = parseInteractiveContent(message.content);
parsed.segments.map((segment) => {
  if (segment.type === 'text') {
    return <MarkdownRenderer content={segment.content} />;
  } else if (segment.type === 'component') {
    const block = segment.content;
    if (block.type === 'tool-result') {
      return <ToolResult {...block} />;
    } else if (block.type === 'interactive-select') {
      return <InteractiveSelect {...block} />;
    }
  }
});
```

---

## Hooks

### useChatMessages

메시지 로드 및 자동 스크롤을 담당합니다.

```typescript
const { messages, isStreaming, scrollRef } = useChatMessages(dataSource);

// dataSource.messages 변경 시 자동 스크롤
// streamingState 변경 시 스크롤 하단 이동
```

**위치:** `unified/hooks/useChatMessages.ts`

### useMessageStreaming

Main Chat의 메시지 스트리밍 핵심 로직입니다 (29KB, 가장 복잡).

```typescript
const { executeStreaming, stopCurrentStreaming } = useMessageStreaming();

await executeStreaming({
  conversationId: 'conv-123',
  userMessage: '안녕하세요',
  images: [{ id: 'img-1', base64: '...' }],
  systemMessage: null,
  personaSystemPrompt: '너는 전문 개발자입니다.',
});
```

**주요 기능:**

- LangGraph 스트리밍 실행 (`window.electronAPI.langgraph.stream`)
- 스트리밍 이벤트 처리:
  - `streaming`: 토큰 스트리밍 (content 누적)
  - `node`: 노드 실행 (이전 content와 diff 계산)
  - `tool_approval_request`: Human-in-the-loop 승인 요청
  - `done`: 스트리밍 완료
  - `error`: 에러 발생
- `conversationId` 기반 스트림 격리 (다중 대화 동시 스트리밍)
- AbortController로 스트림 취소
- Store 메시지 자동 업데이트 및 DB 저장

**위치:** `unified/hooks/useMessageStreaming.ts`

### useChatStreaming

Browser/Editor Chat 전용 경량 스트리밍 훅입니다.

```typescript
const { startStreaming, stopStreaming, isStreaming } = useChatStreaming(dataSource);

await startStreaming('안녕하세요', { mode: 'browser' });
```

**위치:** `unified/hooks/useChatStreaming.ts`

### useChatInput

입력 텍스트 관리 및 키보드 이벤트 처리를 담당합니다.

```typescript
const { input, setInput, textareaRef, handleKeyDown, clearInput, focusInput } = useChatInput();

// Enter: 전송, Shift+Enter: 줄바꿈, Esc: 취소
<Textarea ref={textareaRef} value={input} onKeyDown={(e) => handleKeyDown(e, handleSend)} />
```

**위치:** `unified/hooks/useChatInput.ts`

### useImageUpload

이미지 첨부 (드래그 앤 드롭, 클립보드, 파일 선택)를 담당합니다.

```typescript
const { selectedImages, addImages, handleImageSelect, handleRemoveImage, handlePaste, clearImages } = useImageUpload();

<Textarea onPaste={handlePaste} />
<input type="file" accept="image/*" multiple onChange={handleImageSelect} />
```

**위치:** `unified/hooks/useImageUpload.ts`

### useFileUpload

파일 드래그 앤 드롭 처리를 담당합니다.

```typescript
const { isDragging, setIsDragging, handleFileDrop } = useFileUpload();

await handleFileDrop(
  files,
  (textContent) => setInput(textContent),
  (images) => addImages(images)
);
```

**지원 포맷:**

- 텍스트: `.txt`, `.md`, `.json`, `.log`, `.csv`, `.xml`, `.yaml`
- 이미지: `.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`

**위치:** `unified/hooks/useFileUpload.ts`

### useToolApproval

Tool 승인 (Human-in-the-loop) 처리를 담당합니다.

```typescript
const { handleToolApprove, handleToolReject, handleToolAlwaysApprove } = useToolApproval();

// pendingToolApproval이 있을 때 ToolApprovalDialog 표시
<ToolApprovalDialog
  pendingApproval={pendingToolApproval}
  onApprove={handleToolApprove}
  onReject={handleToolReject}
  onAlwaysApprove={handleToolAlwaysApprove}
/>
```

**위치:** `unified/hooks/useToolApproval.ts`

### useConfigLoader

LLM 및 ImageGen 설정을 Electron IPC로 로드합니다.

```typescript
const { llmConfig, updateLLMConfig, imageGenAvailable, mounted } = useConfigLoader();

// llmConfig: { provider, model, apiKey, ... }
// imageGenAvailable: ComfyUI 또는 NanoBanana가 활성화되어 있는지
```

**위치:** `unified/hooks/useConfigLoader.ts`

---

## Components

### MessageBubble.tsx

메시지 버블 컴포넌트로, edit/regenerate/copy 기능을 제공합니다.

**주요 기능:**

- User/Assistant 역할별 스타일 (우측/좌측 정렬)
- Markdown 렌더링 (`MarkdownRenderer`)
- Code block 실행 버튼 (`onCodeRun`)
- Interactive Content 파싱 (Tool Result, Interactive Select/Input)
- Edit 모드 (Textarea + Save/Cancel)
- Regenerate 버튼 (마지막 Assistant 메시지에만 표시)
- Copy 버튼 (hover 시 표시)
- Persona 아바타 표시

**사용 위치:** `UnifiedChatArea` (Main mode)

**위치:** `unified/components/MessageBubble.tsx`

### LLMStatusBar.tsx

LLM 상태 표시 바로, 모델 정보, 토큰 수, 예상 비용을 실시간으로 표시합니다 (21KB).

**주요 기능:**

- 현재 모델 표시 (provider + model)
- 토큰 수 계산 (gpt-tokenizer):
  - 대화 토큰 수 (messages + persona systemPrompt)
  - 입력 토큰 수 (input)
- 예상 비용 계산 (모델별 요금표):
  - Input cost + Output cost (예상)
- RAG 활성화 시 "Search" 표시
- Tools 활성화 시 활성화된 도구 개수 표시
- 컨텍스트 길이 경고 (80% 이상 시 destructive)
- Model 선택 드롭다운

**사용 위치:** `UnifiedChatInput` (Main mode, Full layout)

**위치:** `unified/components/LLMStatusBar.tsx`

### ToolResult.tsx

Tool 실행 결과를 표시합니다.

```typescript
<ToolResult
  toolName="file_read"
  status="success"
  summary="/path/to/file.ts 읽기 완료"
  details="파일 내용: ..."
  duration={120}
/>
```

**상태:**

- `pending`: 실행 중 (회색, 스피너)
- `success`: 성공 (초록색)
- `error`: 실패 (빨간색)

**위치:** `unified/components/ToolResult.tsx`

### InteractiveSelect.tsx

Agent가 사용자에게 선택을 요청할 때 사용하는 드롭다운 컴포넌트입니다.

```typescript
<InteractiveSelect
  title="배포 환경을 선택하세요"
  options={[
    { value: 'dev', label: '개발 환경' },
    { value: 'prod', label: '프로덕션 환경' }
  ]}
/>
```

**위치:** `unified/components/InteractiveSelect.tsx`

### InteractiveInput.tsx

Agent가 사용자에게 텍스트 입력을 요청할 때 사용하는 입력 컴포넌트입니다.

```typescript
<InteractiveInput
  title="API 키를 입력하세요"
  placeholder="sk-..."
  multiline={false}
/>
```

**위치:** `unified/components/InteractiveInput.tsx`

### ImageGenerationProgressBar.tsx

이미지 생성 진행률을 표시합니다 (ComfyUI / NanoBanana).

```typescript
<ImageGenerationProgressBar
  progress={{
    status: 'processing',
    percentage: 65,
    currentStep: 'Sampling',
    eta: 15,
  }}
/>
```

**상태:**

- `queued`: 대기 중
- `processing`: 생성 중 (Progress Bar 표시)
- `completed`: 완료 (자동 숨김)
- `error`: 에러

**위치:** `unified/components/ImageGenerationProgressBar.tsx`

### ToolApprovalRequest.tsx

Tool 승인 요청을 메시지 내에 인라인으로 표시합니다.

```typescript
<ToolApprovalRequest
  messageId="msg-123"
  toolCalls={[
    { name: 'file_write', args: { path: '/path/to/file', content: '...' } }
  ]}
/>
```

**위치:** `unified/components/ToolApprovalRequest.tsx`

---

## Plugins

### PersonaPlugin.tsx

`/persona {검색어}` 입력 시 자동완성을 표시합니다.

**주요 기능:**

- 입력 텍스트 `/persona` 감지
- Persona 이름/설명으로 검색
- Arrow Up/Down으로 선택
- Enter로 Persona 적용
- 빌트인 Persona 다국어 지원 (i18next)

**위치:** `unified/plugins/PersonaPlugin.tsx`

### ToolApprovalDialog.tsx / ToolApprovalPlugin.tsx

Tool 승인 다이얼로그 (Human-in-the-loop)입니다.

**주요 기능:**

- Tool 호출 내역 표시 (이름, 인자)
- Approve / Reject / Always Approve 버튼
- "Always approve this tool" 체크박스
- JSON 인자 Syntax Highlighting

**위치:** `unified/plugins/ToolApprovalDialog.tsx`, `unified/plugins/ToolApprovalPlugin.tsx`

### ImageAttachmentPlugin.tsx

이미지 첨부 버튼 및 프리뷰를 표시합니다.

**주요 기능:**

- 파일 선택 버튼 (Image 아이콘)
- 이미지 프리뷰 (썸네일 + 삭제 버튼)
- 드래그 앤 드롭 지원
- Clipboard 붙여넣기 지원

**위치:** `unified/plugins/ImageAttachmentPlugin.tsx`

### FileUploadPlugin.tsx

파일 업로드 버튼을 표시합니다.

**지원 포맷:**

- 텍스트 파일: `.txt`, `.md`, `.json` 등
- 이미지 파일: `.png`, `.jpg` 등

**위치:** `unified/plugins/FileUploadPlugin.tsx`

### AgentLogsPlugin.tsx

Browser Agent 실행 로그를 표시합니다.

**표시 내용:**

- Tool 호출 내역
- Tool 실행 결과
- Thinking 로그

**위치:** `unified/plugins/AgentLogsPlugin.tsx`

### AgentProgressPlugin.tsx

Agent 진행 상태를 표시합니다 (Coding Agent, Editor Agent 등).

**표시 내용:**

- 현재 Iteration / 최대 Iteration
- 상태 메시지 (Thinking / Executing / Working)
- Progress Bar

**위치:** `unified/plugins/AgentProgressPlugin.tsx`

### EditRegeneratePlugin.tsx

메시지 편집/재생성 버튼을 표시합니다 (현재 미사용).

**위치:** `unified/plugins/EditRegeneratePlugin.tsx`

### FontScalePlugin.tsx

폰트 크기 조절 버튼을 표시합니다 (현재 미사용).

**위치:** `unified/plugins/FontScalePlugin.tsx`

---

## 사용 예제

### Main Chat (ChatContainer)

```typescript
import { ChatContainer } from '@/components/chat/ChatContainer';

export default function Page() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <ChatContainer />
    </div>
  );
}
```

`ChatContainer`가 내부에서 `UnifiedChatArea` + `UnifiedChatInput`을 자동 구성합니다.

### Browser Chat (Extension)

```typescript
import { UnifiedChatArea } from '@/components/chat/unified/UnifiedChatArea';
import { UnifiedChatInput } from '@/components/chat/unified/UnifiedChatInput';

const browserChatConfig: ChatConfig = {
  mode: 'browser',
  features: {
    enableCopy: true,
    enableAgentLogs: true,
  },
  style: {
    compact: true,
    fontSize: '12px',
  },
  dataSource: {
    messages: browserMessages,
    streamingState: null,
    agentLogs: browserAgentLogs,
    addMessage: async (msg) => { /* Browser Store */ },
    updateMessage: (id, updates) => { /* Browser Store */ },
    clearMessages: () => {},
    startStreaming: () => {},
    stopStreaming: () => {},
  },
};

<UnifiedChatArea config={browserChatConfig} />
<UnifiedChatInput
  config={browserChatConfig}
  onSendMessage={handleSendBrowserMessage}
  onStopStreaming={handleStopBrowserStreaming}
  isStreaming={isBrowserStreaming}
/>
```

### Editor Chat (Extension)

```typescript
const editorChatConfig: ChatConfig = {
  mode: 'editor',
  features: {
    enableCopy: true,
    enableToolApproval: true,
  },
  style: {
    compact: true,
  },
  dataSource: {
    messages: editorMessages,
    streamingState: null,
    addMessage: async (msg) => { /* Editor Store */ },
    updateMessage: (id, updates) => { /* Editor Store */ },
    clearMessages: () => {},
    startStreaming: () => {},
    stopStreaming: () => {},
  },
  workingDirectory: '/path/to/project',
  onCodeRun: async (code, language) => {
    // 코드 실행 로직
  },
};

<UnifiedChatArea config={editorChatConfig} />
<UnifiedChatInput
  config={editorChatConfig}
  onSendMessage={handleSendEditorMessage}
  onStopStreaming={handleStopEditorStreaming}
  isStreaming={isEditorStreaming}
/>
```

### 커스텀 Interactive Component

Agent가 생성한 커스텀 인터랙티브 컴포넌트를 파싱하여 렌더링할 수 있습니다.

**Agent 응답 예시:**

```
분석 결과입니다:

<tool-result
  toolName="analyze_code"
  status="success"
  summary="5개 파일 분석 완료"
  details="Total Lines: 1234\nComplexity: Medium"
  duration="2.5"
/>

다음 중 선택하세요:

<interactive-select
  title="리팩토링 전략을 선택하세요"
  options='[{"value":"extract","label":"함수 추출"},{"value":"inline","label":"인라인 리팩토링"}]'
/>
```

**파싱 및 렌더링:**

```typescript
const parsed = parseInteractiveContent(message.content);
parsed.segments.map((segment) => {
  if (segment.type === 'text') {
    return <MarkdownRenderer content={segment.content} />;
  } else {
    const block = segment.content;
    if (block.type === 'tool-result') {
      return <ToolResult {...block} />;
    } else if (block.type === 'interactive-select') {
      return <InteractiveSelect {...block} />;
    }
  }
});
```

---

## 새 기능 추가 가이드

### 새 Plugin 추가

1. **Plugin 파일 생성**

```typescript
// unified/plugins/MyPlugin.tsx
import { useEffect } from 'react';
import type { PluginProps } from '../types';

export function MyPlugin({ mode, config }: PluginProps) {
  useEffect(() => {
    console.log('MyPlugin activated for mode:', mode);
  }, [mode]);

  return (
    <div className="my-plugin">
      {/* Plugin UI */}
    </div>
  );
}
```

2. **Plugin을 `UnifiedChatInput` 또는 `UnifiedChatArea`에 추가**

```typescript
// UnifiedChatInput.tsx
import { MyPlugin } from './plugins/MyPlugin';

// JSX 내부
{features.enableMyFeature && <MyPlugin mode={mode} config={config} />}
```

3. **ChatFeatures 타입에 플래그 추가**

```typescript
// types.ts
export interface ChatFeatures {
  // ...
  enableMyFeature?: boolean;
}
```

### 새 Hook 추가

1. **Hook 파일 생성**

```typescript
// unified/hooks/useMyFeature.ts
import { useState, useCallback } from 'react';

export function useMyFeature() {
  const [state, setState] = useState(null);

  const executeFeature = useCallback(async () => {
    // 로직 구현
  }, []);

  return { state, executeFeature };
}
```

2. **Hook을 컴포넌트에서 사용**

```typescript
// UnifiedChatInput.tsx 또는 ChatContainer.tsx
import { useMyFeature } from './hooks/useMyFeature';

const { state, executeFeature } = useMyFeature();
```

### 새 Interactive Component 추가

1. **Component 파일 생성**

```typescript
// unified/components/MyInteractiveComponent.tsx
export function MyInteractiveComponent({ title, options }: any) {
  return (
    <div className="my-interactive-component">
      <h4>{title}</h4>
      {/* Component UI */}
    </div>
  );
}
```

2. **`parseInteractiveContent` 파서에 태그 등록**

```typescript
// lib/utils/interactive-parser.ts
// <my-interactive> 태그 인식 추가
```

3. **UnifiedChatArea에서 렌더링 로직 추가**

```typescript
// UnifiedChatArea.tsx
import { MyInteractiveComponent } from './components/MyInteractiveComponent';

// JSX 내부
if (block.type === 'my-interactive') {
  return <MyInteractiveComponent key={segIndex} {...block} />;
}
```

---

## 주의사항

### 1. ChatConfig는 불변 객체로 관리

`ChatConfig` 객체는 컴포넌트 외부에서 생성하여 props로 전달해야 합니다. 컴포넌트 내부에서 `config.mode = 'browser'`와 같이 변경하지 마세요.

**잘못된 예:**

```typescript
function MyChat() {
  const config: ChatConfig = { mode: 'main', features: {} };
  config.mode = 'browser'; // ❌ 불변 객체 변경
  return <UnifiedChatArea config={config} />;
}
```

**올바른 예:**

```typescript
function MyChat() {
  const config: ChatConfig = useMemo(() => ({
    mode: 'browser',
    features: { enableCopy: true },
    dataSource: { /* ... */ },
  }), []);
  return <UnifiedChatArea config={config} />;
}
```

### 2. Store 직접 접근 금지 (ChatDataSource 사용)

Unified 컴포넌트는 `useChatStore`를 직접 호출하지 않습니다. 대신 `ChatConfig.dataSource`를 통해 메시지 및 액션에 접근합니다.

**잘못된 예:**

```typescript
function UnifiedChatArea({ config }: UnifiedChatAreaProps) {
  const { messages } = useChatStore(); // ❌ Store 직접 접근
  return <div>{messages.map(...)}</div>;
}
```

**올바른 예:**

```typescript
function UnifiedChatArea({ config }: UnifiedChatAreaProps) {
  const { messages } = config.dataSource; // ✅ dataSource 사용
  return <div>{messages.map(...)}</div>;
}
```

### 3. Responsive Layout은 자동 전환됨

`UnifiedChatInput`의 레이아웃은 width에 따라 자동으로 전환됩니다. `style.compact` 플래그로 강제할 수 있지만, 일반적으로는 자동 전환을 신뢰하세요.

### 4. Interactive Content 파싱 시 보안 주의

`parseInteractiveContent`로 파싱한 데이터는 Agent가 생성한 것이므로, XSS 공격 위험이 있습니다. 반드시 `dangerouslySetInnerHTML`를 사용하지 말고, React 컴포넌트로 렌더링하세요.

**잘못된 예:**

```typescript
<div dangerouslySetInnerHTML={{ __html: block.content }} /> // ❌ XSS 위험
```

**올바른 예:**

```typescript
<ToolResult toolName={block.toolName} status={block.status} /> // ✅ 안전
```

### 5. Tool Approval 승인 후 즉시 재전송

Tool 승인 후 Agent는 자동으로 재실행되지 않습니다. `handleToolApprove`에서 `window.electronAPI.langgraph.respondToolApproval`을 호출하여 Agent에게 알려야 합니다.

```typescript
const handleToolApprove = useCallback(async () => {
  if (!activeConversationId || !pendingToolApproval) return;

  // IPC로 승인 응답 전송
  await window.electronAPI.langgraph.respondToolApproval(
    activeConversationId,
    true // approved
  );

  // Store에서 pendingToolApproval 제거
  setPendingToolApproval(null);
}, [activeConversationId, pendingToolApproval]);
```

### 6. 메시지 ID 충돌 방지

메시지 ID는 `uuidv4()` 또는 `nanoid()`로 생성하세요. 타임스탬프 기반 ID는 빠른 연속 생성 시 충돌할 수 있습니다.

**잘못된 예:**

```typescript
const messageId = Date.now().toString(); // ❌ 충돌 가능
```

**올바른 예:**

```typescript
import { v4 as uuidv4 } from 'uuid';
const messageId = uuidv4(); // ✅ 고유성 보장
```

### 7. 빌트인 Persona 다국어 지원

빌트인 Persona(`isBuiltin: true`)는 `i18next` 번역을 사용합니다. `persona.builtin.{id}.name`, `persona.builtin.{id}.systemPrompt` 키로 번역을 가져옵니다.

```typescript
const getPersonaDisplayText = (persona: Persona, field: 'name' | 'description'): string => {
  if (persona.isBuiltin) {
    const translationKey = `persona.builtin.${persona.id}.${field}`;
    const translated = t(translationKey);
    return translated !== translationKey ? translated : persona[field];
  }
  return persona[field];
};
```

### 8. 스트리밍 중단 시 AbortController 사용

스트리밍 중단 시 반드시 IPC에 `abort` 명령을 전송하고, `removeAllStreamListeners`로 이벤트 리스너를 제거하세요.

```typescript
const handleStopStreaming = useCallback(async () => {
  if (!activeConversationId) return;

  // IPC Abort
  if (window.electronAPI?.langgraph) {
    await window.electronAPI.langgraph.abort(activeConversationId);
    window.electronAPI.langgraph.removeAllStreamListeners();
  }

  // Store 상태 업데이트
  stopCurrentStreaming();
}, [activeConversationId, stopCurrentStreaming]);
```

---

## 관련 문서

### 컴포넌트 가이드

- [components/README.md](../README.md) - 전체 컴포넌트 개발 가이드
- [components/ui/README.md](../ui/README.md) - shadcn/ui 기본 컴포넌트
- [components/markdown/MarkdownRenderer.tsx](../markdown/MarkdownRenderer.tsx) - Markdown 렌더링

### 상태 관리

- [lib/store/README.md](../../lib/store/README.md) - Zustand 전역 상태 관리
- [lib/store/chat-store.ts](../../lib/store/chat-store.ts) - Chat Store 구현 (79KB)

### 도메인 로직

- [lib/domains/llm/README.md](../../lib/domains/llm/README.md) - LLM 클라이언트
- [lib/domains/agent/README.md](../../lib/domains/agent) - LangGraph Agent
- [lib/domains/mcp/README.md](../../lib/domains/mcp/README.md) - MCP Tool calling

### IPC 통신

- [electron/ipc/README.md](../../electron/ipc/README.md) - IPC 핸들러 가이드
- [electron/ipc/handlers/llm/](../../electron/ipc/handlers/llm/) - LLM 스트리밍 IPC

### 프로젝트 가이드

- [CLAUDE.md](../../CLAUDE.md) - 프로젝트 전체 가이드
- [docs/architecture/folder-structure.md](../../docs/architecture/folder-structure.md) - 폴더 구조

---

## 변경 이력

- **2025-02-10**: Phase 1 리팩토링 완료 (Unified Chat 아키텍처 통합)
  - 기존 `ChatArea`, `InputBox` 제거
  - `UnifiedChatArea` + `UnifiedChatInput` 도입
  - Responsive Layout 지원 (Ultra-Compact / Compact / Full)
  - Plugin 기반 기능 분리
  - ChatConfig 타입 도입으로 모드 통합
- **2025-01-17**: 초기 Chat 컴포넌트 구축
