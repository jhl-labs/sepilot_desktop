# Editor Agent 완전 구현 계획

## 목표
사용자가 Editor에서 할 수 있는 모든 작업을 Agent도 수행할 수 있게 만들기

## 현재 상태
- ✅ RAG 통합 완료 (벡터 DB 검색)
- ✅ Autocomplete 인프라 구축
- ✅ Writing Tools & Code Actions UI (Monaco Context Menu)
- ❌ Built-in Tools 미구현 (모두 Placeholder)
- ❌ 탭 제어 기능 없음
- ❌ 실제 파일 조작 기능 없음
- ❌ 동적 Tool 리스트 표시 없음

---

## Phase 1: 기초 인프라 구축 (1-2시간)

### 1.1 Tool Registry 시스템 구축
**목표**: 중앙화된 Tool 관리 시스템

**작업**:
- [ ] `lib/langgraph/tools/editor-tools-registry.ts` 생성
  - Tool 정의 인터페이스
  - Tool 등록/조회 함수
  - Tool 메타데이터 (name, description, category, icon)
- [ ] Tool Category 정의
  - `file`: 파일 관리
  - `tab`: 탭 제어
  - `terminal`: 터미널 실행
  - `git`: Git 작업
  - `code`: 코드 분석
  - `rag`: RAG 검색

**파일**:
```typescript
// lib/langgraph/tools/editor-tools-registry.ts
interface EditorTool {
  name: string;
  category: 'file' | 'tab' | 'terminal' | 'git' | 'code' | 'rag';
  description: string;
  icon: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required: string[];
  };
  execute: (args: any, context: any) => Promise<any>;
}
```

### 1.2 EditorChatArea Tool 리스트 UI
**목표**: 사용 가능한 Tool을 동적으로 표시

**작업**:
- [ ] `components/editor/EditorToolsList.tsx` 생성
  - Tool Registry에서 Tool 목록 가져오기
  - Category별 그룹화 표시
  - Collapsible UI (접기/펴기)
- [ ] `EditorChatArea.tsx` 업데이트
  - 하드코딩된 텍스트 제거
  - `<EditorToolsList />` 컴포넌트 사용

**UI 스케치**:
```
┌─────────────────────────────────┐
│ 💬 Editor Agent                 │
│                                  │
│ 📂 파일 관리 (6개)        [▼]  │
│   • 파일 읽기                   │
│   • 파일 쓰기                   │
│   • 파일 수정                   │
│   ...                            │
│                                  │
│ 📑 탭 제어 (5개)          [▼]  │
│   • 탭 목록 조회                │
│   • 탭 열기                     │
│   ...                            │
└─────────────────────────────────┘
```

---

## Phase 2: 파일 관리 Tools (2-3시간)

### 2.1 IPC 핸들러 확인 및 보완
**기존 확인**:
- ✅ `fs:read` - 파일 읽기
- ✅ `fs:write` - 파일 쓰기
- ✅ `fs:list` - 디렉토리 목록
- ✅ `fs:search` - 파일 검색 (ripgrep)
- ⚠️ Edit 기능 확인 필요

**작업**:
- [ ] `electron/ipc/handlers/file.ts` 확인
- [ ] 부족한 핸들러 추가
  - `fs:edit-file` (특정 라인 범위 수정)
  - `fs:append-file` (파일 끝에 추가)
  - `fs:insert-at-line` (특정 라인에 삽입)

### 2.2 Editor Tools 구현
**파일**: `lib/langgraph/tools/editor-file-tools.ts`

**작업**:
- [ ] `read_file` Tool
  ```typescript
  {
    name: 'read_file',
    category: 'file',
    description: '파일 내용을 읽습니다',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: '읽을 파일 경로' }
      },
      required: ['filePath']
    }
  }
  ```

- [ ] `write_file` Tool
- [ ] `edit_file` Tool (라인 범위 지정 가능)
- [ ] `list_files` Tool
- [ ] `search_files` Tool (ripgrep)
- [ ] `delete_file` Tool

### 2.3 editor-agent.ts 통합
**작업**:
- [ ] `getEditorTools()` 업데이트
  - Tool Registry에서 파일 관리 Tool 가져오기
  - Placeholder 제거
- [ ] `executeTool()` 업데이트
  - Tool Registry의 execute 함수 호출
  - IPC 통신 연결

---

## Phase 3: 탭 제어 Tools (2-3시간)

### 3.1 Zustand Store 확장
**파일**: `lib/store/chat-store.ts`

**작업**:
- [ ] 탭 관련 State/Action 확인
  - ✅ `openFiles`, `activeFilePath` 존재
  - ✅ `openFile()`, `closeFile()` 존재
  - ✅ `setActiveFile()` 존재
- [ ] IPC 이벤트로 노출
  - `editor:list-tabs`
  - `editor:open-tab`
  - `editor:close-tab`
  - `editor:switch-tab`
  - `editor:get-active-file`

### 3.2 IPC 핸들러 구현
**파일**: `electron/ipc/handlers/editor.ts` (새 파일)

**작업**:
- [ ] 탭 제어 IPC 핸들러 생성
  ```typescript
  ipcMain.handle('editor:list-tabs', async () => {
    // Renderer로부터 현재 열린 탭 정보 받기
    // BrowserWindow.webContents를 통해 통신
  });
  ```
- [ ] Renderer ↔ Main 양방향 통신 구조 설계
  - Main에서 Renderer의 상태 조회 방법
  - `ipcRenderer.send()` + `ipcMain.on()` 패턴

### 3.3 Editor Tab Tools 구현
**파일**: `lib/langgraph/tools/editor-tab-tools.ts`

**작업**:
- [ ] `list_open_tabs` Tool
- [ ] `open_tab` Tool
- [ ] `close_tab` Tool
- [ ] `switch_tab` Tool
- [ ] `get_active_file` Tool

---

## Phase 4: 터미널 & Git Tools (1-2시간)

### 4.1 기존 기능 활용
**확인**:
- ✅ Terminal Panel 존재 (`components/terminal/TerminalPanel.tsx`)
- ✅ Working Directory 설정 가능
- ⚠️ Agent가 터미널 명령 실행 가능한지 확인 필요

### 4.2 Terminal Tools 구현
**파일**: `lib/langgraph/tools/editor-terminal-tools.ts`

**작업**:
- [ ] `run_terminal_command` Tool
  - IPC: `terminal:run-command`
  - 비동기 실행, jobId 반환
- [ ] `get_terminal_output` Tool
  - IPC: `terminal:get-output`
  - jobId로 출력 조회

### 4.3 Git Tools 구현
**파일**: `lib/langgraph/tools/editor-git-tools.ts`

**작업**:
- [ ] `git_status` Tool
- [ ] `git_diff` Tool
- [ ] `git_log` Tool (선택사항)
- [ ] `git_commit` Tool (선택사항, 위험 주의)

---

## Phase 5: 코드 분석 Tools (2-3시간)

### 5.1 기존 Placeholder 구현
**파일**: `lib/langgraph/tools/editor-code-tools.ts`

**작업**:
- [ ] `get_file_context` 실제 구현
  - AST 파싱 (선택사항)
  - Import 문 추출
  - Type 정의 추출
  - 커서 주변 코드 추출

- [ ] `search_similar_code` 실제 구현
  - ripgrep으로 패턴 검색
  - AST 기반 구조 유사도 (선택사항)

- [ ] `get_documentation` 실제 구현
  - TSDoc/JSDoc 파싱
  - 온라인 문서 검색 (MDN, DevDocs)

### 5.2 추가 유용한 Tools
**작업**:
- [ ] `find_definition` - 정의로 이동
- [ ] `find_references` - 참조 찾기
- [ ] `get_type_info` - 타입 정보 조회
- [ ] `format_code` - 코드 포맷팅

---

## Phase 6: Tool 실행 안전성 & UX (1-2시간)

### 6.1 Tool Approval 시스템
**목표**: 위험한 작업은 사용자 승인 필요

**작업**:
- [ ] Dangerous Tools 분류
  - `write_file`, `delete_file`, `run_terminal_command`, `git_commit`
- [ ] Approval UI 구현
  - 실행 전 확인 다이얼로그
  - Tool 이름, 파라미터, 예상 결과 표시
- [ ] Auto-approve 설정 (선택사항)

### 6.2 실행 상태 피드백
**작업**:
- [ ] EditorChatArea에 Tool 실행 상태 표시
  - "🛠️ 파일 읽는 중: src/App.tsx..."
  - "✅ 완료: 150줄 읽음"
  - "❌ 실패: 파일 없음"
- [ ] Progress indicator
- [ ] 실행 히스토리 로깅

---

## Phase 7: 테스트 & 문서화 (1-2시간)

### 7.1 단위 테스트
**작업**:
- [ ] Tool Registry 테스트
- [ ] 각 Tool의 기본 동작 테스트
- [ ] IPC 통신 테스트

### 7.2 통합 테스트 시나리오
**시나리오**:
1. "src 폴더의 모든 .tsx 파일 목록 보여줘"
2. "App.tsx 파일 열고 내용 읽어줘"
3. "import 문 추가해줘"
4. "git status 확인해줘"
5. "변경사항 커밋해줘"

### 7.3 문서화
**작업**:
- [ ] Tool 사용 가이드 작성
- [ ] 예제 프롬프트 모음
- [ ] Troubleshooting 가이드

---

## 우선순위 제안

### High Priority (먼저 구현)
1. **Phase 1**: Tool Registry & UI (기반)
2. **Phase 2**: 파일 관리 Tools (핵심)
3. **Phase 3**: 탭 제어 Tools (UX 개선)

### Medium Priority
4. **Phase 4**: 터미널 & Git Tools (편의성)
5. **Phase 6**: Tool 승인 시스템 (안전성)

### Low Priority (나중에)
6. **Phase 5**: 고급 코드 분석 Tools
7. **Phase 7**: 테스트 & 문서화

---

## 예상 작업 시간

| Phase | 작업 내용 | 예상 시간 |
|-------|----------|----------|
| 1 | 기초 인프라 | 1-2시간 |
| 2 | 파일 관리 | 2-3시간 |
| 3 | 탭 제어 | 2-3시간 |
| 4 | 터미널 & Git | 1-2시간 |
| 5 | 코드 분석 | 2-3시간 |
| 6 | 안전성 & UX | 1-2시간 |
| 7 | 테스트 & 문서 | 1-2시간 |
| **총계** | | **10-17시간** |

---

## 다음 단계

계획 승인 후:
1. Phase 1부터 순차적으로 진행
2. 각 Phase 완료 후 커밋 & 테스트
3. 사용자 피드백 반영하며 진행

**시작할 준비가 되면 "Phase 1 시작"이라고 말씀해주세요!**
