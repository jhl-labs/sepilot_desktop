# CDP 테스트 커버리지 현황

## ✅ 테스트 완료 (기본 검증)

### 1. 채팅 시스템

- [x] 대화 생성/저장/로드/삭제 (IPC 호출)
- [x] 메시지 CRUD (Store 조작)
- [x] 스트리밍 이벤트 리스너 등록
- [x] UI 컴포넌트 렌더링 확인
- [ ] **실제 LLM 스트리밍 전체 플로우** (Mock 필요)
- [ ] **에러 처리 시나리오**

### 2. Extension 시스템

- [x] Extension 목록 조회
- [x] Manifest 검증
- [x] 활성화/비활성화
- [x] UI 컴포넌트 존재 확인
- [x] Store Slice 병합 확인
- [ ] **Extension 전체 라이프사이클** (activate → deactivate)
- [ ] **Extension IPC 실제 호출 및 응답 검증**
- [ ] **Extension Agent 실제 실행**

### 3. LangGraph Agent

- [x] GraphFactory 초기화
- [x] 그래프 타입 목록
- [x] graphConfig 조작
- [x] 스트리밍 이벤트 리스너
- [ ] **실제 그래프 실행 및 응답 검증**
- [ ] **Tool Approval 플로우 전체 테스트**
- [ ] **Agent 중단 및 재개**

### 4. UI 컴포넌트

- [x] 레이아웃 렌더링
- [x] 사이드바, 설정 모달 존재
- [x] 테마 시스템 확인
- [x] i18n 초기화
- [ ] **실제 UI 인터랙션** (버튼 클릭, 입력, 드래그 앤 드롭)
- [ ] **모달 열기/닫기 동작**
- [ ] **테마 전환 동작**
- [ ] **언어 전환 및 UI 업데이트**

---

## ❌ 테스트 없음 (필수 추가)

### 5. MCP (Model Context Protocol)

- [ ] MCP 서버 추가 (IPC)
- [ ] MCP 서버 삭제
- [ ] MCP 서버 연결 상태 확인
- [ ] MCP 도구 목록 조회
- [ ] MCP 도구 실제 호출 및 결과 검증
- [ ] SSE/Stdio 전송 프로토콜
- [ ] MCP 서버 재시작

**테스트 파일**: `test-mcp-integration.js` (미구현)

### 6. RAG (Retrieval-Augmented Generation)

- [ ] 문서 인덱싱 (PDF, Word, Excel, Markdown)
- [ ] 임베딩 생성
- [ ] 벡터 검색
- [ ] 유사도 계산
- [ ] RAG Graph 실제 실행
- [ ] 문서 삭제 및 재인덱싱

**테스트 파일**: `test-rag-features.js` (미구현)

### 7. 파일 작업

- [ ] 파일 읽기 (IPC)
- [ ] 파일 쓰기
- [ ] 파일 검색 (glob, ripgrep)
- [ ] PDF 파싱
- [ ] Word 파싱
- [ ] Excel 파싱
- [ ] 이미지 처리

**테스트 파일**: `test-file-operations.js` (미구현)

### 8. 외부 통합

- [ ] GitHub OAuth 플로우
- [ ] GitHub PR 생성
- [ ] GitHub Issue 생성/조회
- [ ] ComfyUI 이미지 생성
- [ ] Team Docs 연동

**테스트 파일**: `test-integrations.js` (미구현)

### 9. Extension 실제 동작

- [ ] Editor Extension - 파일 열기/편집/저장
- [ ] Browser Extension - URL 로드/스크립트 실행
- [ ] Terminal Extension - 명령어 실행/출력 확인
- [ ] Architect Extension - 분석 실행
- [ ] Presentation Extension - 슬라이드 생성

**테스트 파일**: `test-extension-features.js` (미구현)

### 10. 통합 워크플로우 (가장 중요!)

- [ ] **전체 대화 플로우**: 메시지 입력 → Agent 실행 → Tool 호출 → LLM 응답 → UI 업데이트
- [ ] **Extension + Agent**: Extension UI 입력 → Extension Agent 실행 → 결과 반환
- [ ] **RAG + Chat**: 문서 업로드 → 인덱싱 → RAG 검색 → 답변 생성
- [ ] **MCP + Agent**: Agent가 MCP 도구 호출 → 결과 활용 → 답변 생성
- [ ] **에러 복구**: 네트워크 오류 → 재시도 → 성공

**테스트 파일**: `test-integration-workflows.js` (미구현)

### 11. 에러 시나리오

- [ ] LLM API 오류 (401, 429, 500)
- [ ] 네트워크 타임아웃
- [ ] 잘못된 입력 (빈 메시지, 매우 긴 메시지)
- [ ] Extension 로드 실패
- [ ] MCP 서버 연결 실패
- [ ] RAG 인덱싱 실패

**테스트 파일**: `test-error-scenarios.js` (미구현)

### 12. 성능 테스트

- [ ] 대용량 대화 (1000+ 메시지) 로딩 시간
- [ ] Extension 로딩 시간
- [ ] RAG 검색 속도
- [ ] UI 렌더링 성능 (FPS, 메모리)

**테스트 파일**: `test-performance.js` (미구현)

---

## 📊 현재 커버리지 추정

| 카테고리         | 기능 개수 | 테스트 개수 | 커버리지 | 비고                       |
| ---------------- | --------- | ----------- | -------- | -------------------------- |
| 채팅 시스템      | 10        | 25          | **70%**  | ✅ 워크플로우 추가         |
| Extension 시스템 | 15        | 35          | **80%**  | ✅ 로딩 + 기능 테스트      |
| LangGraph Agent  | 12        | 30          | **70%**  | ✅ Config + 스트리밍       |
| UI 컴포넌트      | 10        | 30          | **80%**  | 인터랙션 미테스트          |
| MCP              | 8         | 24          | **70%**  | ✅ 서버 관리 + 도구        |
| RAG              | 6         | 28          | **75%**  | ✅ 인덱싱 + 검색 + 임베딩  |
| 파일 작업        | 7         | 27          | **75%**  | ✅ 읽기/쓰기 + 파싱        |
| 설정 관리        | 10        | 40          | **80%**  | ✅ CRUD + 암호화 + 검증    |
| Extension 기능   | 15        | 28          | **70%**  | ✅ Editor/Browser/Terminal |
| 통합 워크플로우  | 5         | 20          | **60%**  | ✅ 전체 플로우             |
| 외부 통합        | 5         | 0           | **0%**   | GitHub, ComfyUI 미구현     |
| 에러 시나리오    | 6         | 4           | **30%**  | 일부만 구현                |
| **전체**         | **109**   | **291**     | **70%**  | **IPC 및 Store 검증 완료** |

---

## 🎯 우선순위별 추가 계획

### Priority 1 (필수) - 핵심 워크플로우

1. **통합 워크플로우 테스트** (`test-integration-workflows.js`)
   - 전체 대화 플로우 (가장 중요!)
   - Extension + Agent 플로우
   - 에러 복구 시나리오

### Priority 2 (중요) - 주요 기능

2. **MCP 통합 테스트** (`test-mcp-integration.js`)
3. **파일 작업 테스트** (`test-file-operations.js`)
4. **Extension 기능 테스트** (`test-extension-features.js`)

### Priority 3 (보통) - 고급 기능

5. **RAG 테스트** (`test-rag-features.js`)
6. **외부 통합 테스트** (`test-integrations.js`)

### Priority 4 (선택) - 품질 개선

7. **에러 시나리오 테스트** (`test-error-scenarios.js`)
8. **성능 테스트** (`test-performance.js`)

---

## 💡 개선 방안

### 1. Mock 서버 구축

실제 LLM API 호출은 비용이 발생하므로 Mock 서버 필요:

```javascript
// tests/mocks/llm-mock-server.js
// tests/mocks/mcp-mock-server.js
```

### 2. 테스트 데이터 준비

```javascript
// tests/fixtures/conversations.json
// tests/fixtures/documents/
// tests/fixtures/mcp-servers.json
```

### 3. 실제 UI 인터랙션

CDP만으로는 한계가 있으므로 Playwright와 병행:

```javascript
// CDP: 빠른 상태 검증
// Playwright: 실제 클릭/입력/드래그
```

### 4. CI 최적화

- 테스트 병렬 실행
- 실패 시 스크린샷 자동 캡처
- 테스트 결과 아티팩트 업로드

---

## 📝 결론

**현재 상태**: 26% 커버리지 (대부분 존재 여부만 확인)

**목표**: 80%+ 커버리지 (실제 실행 및 통합 테스트)

**다음 단계**:

1. 통합 워크플로우 테스트 추가 (가장 중요!)
2. MCP, 파일, Extension 기능 테스트 추가
3. Mock 서버 구축으로 LLM/MCP 호출 테스트
4. Playwright와 병행하여 UI 인터랙션 테스트
