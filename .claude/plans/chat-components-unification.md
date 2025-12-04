# Chat 컴포넌트 통합 계획

## 1. 현재 상황 분석

### 파편화된 구조

현재 Chat 관련 컴포넌트가 3개의 독립적인 구현으로 나뉘어 있음:

1. **Main Chat** (`components/chat/`)
   - `ChatArea.tsx` (593줄) + `InputBox.tsx` (1000줄+)
   - Full-featured: 이미지, 파일 업로드, Tool approval, Persona, Font scale, Edit/Regenerate

2. **Browser Chat** (`components/browser/`)
   - `SimpleChatArea.tsx` (106줄) + `SimpleChatInput.tsx` (398줄)
   - Compact: Agent logs, 압축된 UI, Tool approval 없음

3. **Editor Chat** (`components/editor/`)
   - `EditorChatArea.tsx` (70줄) + `EditorChatInput.tsx` (445줄)
   - Minimal: Editor tools, Tool approval 포함, Working directory

### 중복된 기능들

#### 100% 중복 (모든 컴포넌트):

- 메시지 표시 (user/assistant 구분)
- 스트리밍 처리 및 표시
- 자동 스크롤
- Markdown 렌더링
- 입력 textarea 관리
- Send/Stop 버튼
- Keyboard event 처리 (Enter, Esc)
- Store 연동 (messages, streaming state)

#### 부분 중복:

- Tool approval dialog (Main, Editor에만)
- Agent progress display (Browser, Editor에만)
- File upload (Main에만)
- Image attachment (Main에만)
- Edit/Regenerate (Main에만)
- Font scale (Main에만)
- Persona display (Main에만)
- Agent logs (Browser에만)

### 문제점

1. **코드 중복**: 동일 기능이 3곳에서 각각 구현 → 버그 수정 시 3곳 모두 수정 필요
2. **일관성 부족**: UI/UX가 제각각 → 사용자 경험 혼란
3. **유지보수 어려움**: 새 기능 추가 시 3곳 모두 업데이트 필요
4. **기능 격차**: 각 컴포넌트마다 다른 기능 세트 → 예상치 못한 동작
5. **테스트 어려움**: 3개 독립적으로 테스트 필요

## 2. 통합 설계

### 아키텍처 원칙

```
통합 컴포넌트 = 공통 코어 + 모드별 플러그인
```

- **공통 코어**: 모든 chat에서 필요한 기본 기능 (100% 중복 기능)
- **모드별 플러그인**: 각 모드에서만 필요한 특화 기능

### 컴포넌트 구조

```
components/chat/unified/
  ├── UnifiedChatArea.tsx        # 통합 채팅 영역 (메시지 표시)
  ├── UnifiedChatInput.tsx       # 통합 입력 영역
  ├── UnifiedChatContainer.tsx   # Area + Input 컨테이너
  ├── hooks/
  │   ├── useChatMessages.ts     # 메시지 관리 훅
  │   ├── useChatStreaming.ts    # 스트리밍 관리 훅
  │   └── useChatInput.ts        # 입력 관리 훅
  ├── plugins/
  │   ├── ToolApprovalPlugin.tsx      # Tool approval 기능
  │   ├── ImageAttachmentPlugin.tsx   # 이미지 첨부 기능
  │   ├── FileUploadPlugin.tsx        # 파일 업로드 기능
  │   ├── FontScalePlugin.tsx         # 폰트 크기 조절
  │   ├── PersonaPlugin.tsx           # Persona 표시/선택
  │   ├── AgentLogsPlugin.tsx         # Agent 실행 로그
  │   ├── AgentProgressPlugin.tsx     # Agent 진행 상태
  │   └── EditRegeneratePlugin.tsx    # 메시지 수정/재생성
  └── types.ts                   # 공통 타입 정의

components/chat/
  ChatContainer.tsx              # Main chat용 래퍼 (기존 ChatArea 대체)
components/browser/
  BrowserChat.tsx                # Browser chat용 래퍼 (기존 SimpleChatArea 대체)
components/editor/
  EditorChat.tsx                 # Editor chat용 래퍼 (기존 EditorChatArea 대체)
```

### 타입 정의

```typescript
// components/chat/unified/types.ts

export type ChatMode = 'main' | 'browser' | 'editor';

export interface ChatFeatures {
  // 메시지 기능
  enableEdit?: boolean;
  enableRegenerate?: boolean;
  enableCopy?: boolean;

  // 입력 기능
  enableImageUpload?: boolean;
  enableFileUpload?: boolean;
  enableToolApproval?: boolean;

  // UI 기능
  enableFontScale?: boolean;
  enablePersona?: boolean;
  enableAgentLogs?: boolean;
  enableAgentProgress?: boolean;

  // 고급 기능
  enableThinkingModeSelector?: boolean;
  enableRAGToggle?: boolean;
  enableToolsToggle?: boolean;
  enableImageGeneration?: boolean;
}

export interface ChatStyle {
  compact?: boolean; // Compact mode (smaller fonts, padding)
  fontSize?: string; // Base font size
  maxWidth?: string; // Max content width
  showAvatar?: boolean; // Show user/assistant avatars
  theme?: 'default' | 'minimal' | 'comfortable';
}

export interface ChatDataSource {
  // Store에서 가져올 데이터
  messages: Message[];
  streamingState: string | null; // streaming messageId or null

  // Store 액션
  addMessage: (message: Omit<Message, 'id' | 'created_at'>) => Promise<Message>;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  clearMessages: () => void;
  startStreaming: (messageId: string) => void;
  stopStreaming: () => void;
}

export interface ChatConfig {
  mode: ChatMode;
  features: ChatFeatures;
  style?: ChatStyle;
  dataSource: ChatDataSource;

  // 모드별 설정
  workingDirectory?: string; // Coding/Editor agent용
  conversationId?: string; // Main chat용
  systemMessage?: string; // Custom system message

  // Callbacks
  onSend?: (message: string, images?: ImageAttachment[]) => void;
  onStop?: () => void;
}
```

### 통합 컴포넌트 인터페이스

```typescript
// UnifiedChatContainer.tsx
export function UnifiedChatContainer({
  mode,
  features,
  style,
  dataSource,
  workingDirectory,
  conversationId,
  systemMessage,
  onSend,
  onStop,
}: ChatConfig) {
  return (
    <div className="flex flex-col h-full">
      <UnifiedChatArea
        mode={mode}
        features={features}
        style={style}
        dataSource={dataSource}
      />
      <UnifiedChatInput
        mode={mode}
        features={features}
        style={style}
        dataSource={dataSource}
        workingDirectory={workingDirectory}
        conversationId={conversationId}
        systemMessage={systemMessage}
        onSend={onSend}
        onStop={onStop}
      />
    </div>
  );
}
```

### 사용 예시

```typescript
// components/chat/ChatContainer.tsx (Main Chat)
export function ChatContainer() {
  const store = useChatStore();

  return (
    <UnifiedChatContainer
      mode="main"
      features={{
        enableEdit: true,
        enableRegenerate: true,
        enableImageUpload: true,
        enableFileUpload: true,
        enableToolApproval: true,
        enableFontScale: true,
        enablePersona: true,
        enableThinkingModeSelector: true,
        enableRAGToggle: true,
        enableToolsToggle: true,
        enableImageGeneration: true,
      }}
      style={{
        theme: 'default',
        maxWidth: '4xl',
        showAvatar: true,
      }}
      dataSource={{
        messages: store.messages,
        streamingState: store.streamingConversations.get(store.activeConversationId),
        addMessage: store.addMessage,
        updateMessage: store.updateMessage,
        clearMessages: store.clearMessages,
        startStreaming: (msgId) => store.startStreaming(store.activeConversationId, msgId),
        stopStreaming: () => store.stopStreaming(store.activeConversationId),
      }}
      conversationId={store.activeConversationId}
    />
  );
}

// components/browser/BrowserChat.tsx
export function BrowserChat() {
  const store = useChatStore();

  return (
    <UnifiedChatContainer
      mode="browser"
      features={{
        enableAgentLogs: true,
        enableAgentProgress: true,
        enableCopy: true,
      }}
      style={{
        compact: true,
        theme: 'minimal',
        fontSize: '11px',
        showAvatar: false,
      }}
      dataSource={{
        messages: store.browserChatMessages,
        streamingState: store.browserAgentIsRunning ? 'streaming' : null,
        addMessage: async (msg) => {
          store.addBrowserChatMessage(msg);
          return { id: generateId(), ...msg, created_at: Date.now() };
        },
        updateMessage: store.updateBrowserChatMessage,
        clearMessages: store.clearBrowserChat,
        startStreaming: () => store.setBrowserAgentIsRunning(true),
        stopStreaming: () => store.setBrowserAgentIsRunning(false),
      }}
    />
  );
}

// components/editor/EditorChat.tsx
export function EditorChat() {
  const store = useChatStore();

  return (
    <UnifiedChatContainer
      mode="editor"
      features={{
        enableToolApproval: true,
        enableAgentProgress: true,
        enableCopy: true,
      }}
      style={{
        compact: true,
        theme: 'minimal',
        fontSize: '12px',
        showAvatar: false,
      }}
      dataSource={{
        messages: store.editorChatMessages,
        streamingState: store.editorChatStreaming ? 'streaming' : null,
        addMessage: async (msg) => {
          store.addEditorChatMessage(msg);
          return { id: generateId(), ...msg, created_at: Date.now() };
        },
        updateMessage: store.updateEditorChatMessage,
        clearMessages: store.clearEditorChat,
        startStreaming: () => store.setEditorChatStreaming(true),
        stopStreaming: () => store.setEditorChatStreaming(false),
      }}
      workingDirectory={store.workingDirectory}
    />
  );
}
```

## 3. 구현 계획

### Phase 1: 기반 구축 (3-4시간)

#### 1.1 디렉토리 구조 생성

- `components/chat/unified/` 폴더 생성
- `hooks/`, `plugins/` 서브폴더 생성
- `types.ts` 파일 생성

#### 1.2 공통 타입 정의

- `ChatMode`, `ChatFeatures`, `ChatStyle`, `ChatConfig` 타입 정의
- 기존 타입과의 호환성 확인

#### 1.3 Custom Hooks 구현

- `useChatMessages`: 메시지 CRUD 로직
- `useChatStreaming`: 스트리밍 상태 관리 및 RAF 최적화
- `useChatInput`: 입력 상태 관리 (textarea, composition, keyboard)

### Phase 2: 코어 컴포넌트 구현 (4-5시간)

#### 2.1 UnifiedChatArea 구현

```typescript
// 책임: 메시지 목록 표시
- 스크롤 영역 관리 (auto-scroll)
- 메시지 렌더링 (user/assistant 구분)
- Markdown 렌더링
- 빈 상태 표시
- 로딩 인디케이터
- 플러그인 마운트 포인트
```

**핵심 로직:**

- ChatArea.tsx의 메시지 렌더링 로직 추출
- SimpleChatArea.tsx의 compact 스타일 적용
- MessageBubble 재사용 (main mode에서만)

#### 2.2 UnifiedChatInput 구현

```typescript
// 책임: 사용자 입력 처리
- Textarea 관리 (auto-resize, composition)
- Send/Stop 버튼
- Keyboard events (Enter, Esc)
- 스트리밍 트리거
- 플러그인 마운트 포인트
```

**핵심 로직:**

- InputBox.tsx의 입력 처리 로직 추출
- SimpleChatInput.tsx의 compact UI 적용
- 공통 스트리밍 로직 통합

#### 2.3 UnifiedChatContainer 구현

```typescript
// 책임: Area + Input 조합 및 플러그인 관리
- Layout 관리
- 플러그인 로딩 및 초기화
- Context 제공 (ChatContext)
```

### Phase 3: 플러그인 구현 (5-6시간)

#### 3.1 필수 플러그인

1. **ToolApprovalPlugin** (Main, Editor)
   - 기존 ToolApprovalDialog 재사용
   - IPC 통신 및 이벤트 처리

2. **AgentProgressPlugin** (Browser, Editor)
   - 진행 상태 표시 (iteration, status, message)
   - Progress bar

3. **AgentLogsPlugin** (Browser)
   - 실행 로그 표시 (마지막 3개)
   - Phase별 아이콘 표시

#### 3.2 선택적 플러그인

4. **ImageAttachmentPlugin** (Main)
   - 이미지 선택 및 미리보기
   - Drag & drop

5. **FileUploadPlugin** (Main)
   - 텍스트 파일 업로드
   - Drag & drop

6. **FontScalePlugin** (Main)
   - Floating selector
   - localStorage 저장

7. **PersonaPlugin** (Main)
   - Persona 표시 및 선택
   - Autocomplete

8. **EditRegeneratePlugin** (Main)
   - 메시지 수정
   - 재생성

### Phase 4: 마이그레이션 (2-3시간)

#### 4.1 Main Chat 마이그레이션

- `components/chat/ChatContainer.tsx` 생성 (통합 컴포넌트 래퍼)
- `app/page.tsx`에서 ChatArea → ChatContainer 교체
- 기존 ChatArea.tsx, InputBox.tsx 백업 (삭제하지 않음)
- 테스트

#### 4.2 Browser Chat 마이그레이션

- `components/browser/BrowserChat.tsx` 업데이트
- SimpleChatArea, SimpleChatInput 대체
- 테스트

#### 4.3 Editor Chat 마이그레이션

- `components/editor/EditorChat.tsx` 생성
- EditorChatArea, EditorChatInput 대체
- 테스트

### Phase 5: 검증 및 정리 (2-3시간)

#### 5.1 기능 검증

- [ ] Main chat: 모든 기능 동작 확인
- [ ] Browser chat: Agent logs, 스트리밍 확인
- [ ] Editor chat: Tool approval, 파일 생성 확인
- [ ] 이미지 업로드 및 생성
- [ ] Tool approval dialog
- [ ] Regenerate 기능
- [ ] Font scale 동작
- [ ] Persona 전환

#### 5.2 성능 검증

- [ ] 스트리밍 성능 (RAF 최적화 확인)
- [ ] 메모리 누수 체크
- [ ] 렌더링 최적화 확인

#### 5.3 코드 정리

- [ ] 기존 컴포넌트 삭제 (백업 확인 후)
- [ ] Unused imports 제거
- [ ] Type errors 수정
- [ ] Lint 통과

## 4. 위험 요소 및 대응

### 위험 요소

1. **기존 기능 손실**: 마이그레이션 중 일부 기능이 누락될 수 있음
   - **대응**: 체크리스트 작성 및 기능별 테스트

2. **성능 저하**: 통합 컴포넌트가 복잡해져 성능 저하 가능
   - **대응**: RAF 최적화 유지, React.memo 활용

3. **타입 에러**: 복잡한 타입 정의로 인한 컴파일 에러
   - **대응**: 단계적 타입 정의, any 최소화

4. **Store 변경 필요**: 일부 store 구조 변경이 필요할 수 있음
   - **대응**: 최소한의 변경으로 호환성 유지

### 호환성 전략

- **Backward compatibility**: 기존 store API 그대로 사용
- **Feature parity**: 모든 기존 기능 유지
- **Gradual migration**: 한 번에 하나씩 마이그레이션

## 5. 성공 기준

- [ ] 모든 기존 기능이 동작함
- [ ] 3개 컴포넌트가 통합 컴포넌트 사용
- [ ] 코드 중복 제거 (예상: 전체 LOC 30-40% 감소)
- [ ] 일관된 UI/UX
- [ ] 타입 체크 통과
- [ ] Lint 통과
- [ ] 성능 저하 없음

## 6. 다음 단계 (추후)

통합 완료 후 개선 가능한 사항:

1. **테스트 코드 작성**: 통합 컴포넌트에 대한 단위/통합 테스트
2. **문서화**: 사용법, 플러그인 개발 가이드
3. **추가 플러그인**: 음성 입력, 파일 검색, 코드 블록 실행 등
4. **접근성 개선**: ARIA labels, 키보드 네비게이션
5. **성능 최적화**: Virtualization, lazy loading

## 7. 예상 소요 시간

- Phase 1 (기반): 3-4시간
- Phase 2 (코어): 4-5시간
- Phase 3 (플러그인): 5-6시간
- Phase 4 (마이그레이션): 2-3시간
- Phase 5 (검증/정리): 2-3시간

**총 예상 시간: 16-21시간** (2-3일 작업)

## 8. 최종 결정 사항

사용자 선택에 따른 구현 방향:

1. **마이그레이션 순서**: ✅ **Main Chat 먼저**
   - 가장 복잡한 Main Chat을 먼저 통합하여 핵심 아키텍처를 검증
   - 성공 시 Editor Chat, Browser Chat은 상대적으로 쉽게 마이그레이션 가능

2. **기능 범위**: ✅ **모든 기능 한 번에**
   - 모든 플러그인(이미지 업로드, Tool approval, Font scale 등)을 한 번에 구현
   - 완전한 통합을 통한 일관성 확보

3. **기존 컴포넌트 처리**: ✅ **\_deprecated로 이동**
   - `components/_deprecated/` 폴더로 이동하여 보관
   - 필요시 참조 가능, 추후 안전하게 삭제

4. **Store 리팩토링**: 최소한의 변경으로 호환성 유지
   - 기존 store API 그대로 사용
   - 추후 별도 작업으로 개선

5. **테스트 전략**: Phase 5에서 수동 테스트
   - 체크리스트 기반 기능 검증
   - 추후 자동화 테스트 추가 고려
