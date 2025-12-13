# SEPilot Desktop v0.6.5 릴리스 노트

이번 릴리스는 v0.6.0부터 v0.6.4까지의 기능을 통합하고 안정화한 버전입니다. 주요 변경 사항은 다음과 같습니다.

## ✨ 주요 기능 하이라이트

### 1. 차세대 Editor 및 Browser 통합

- **Editor 모드**: Monaco Editor 기반의 강력한 코딩 환경을 제공하며, Chat과 Editor를 매끄럽게 오갈 수 있습니다.
- **통합 브라우저**: Electron 내장 Chromium 엔진을 활용한 웹 브라우저가 통합되어, 앱 내에서 검색 및 문서 참조가 가능합니다. Browser Agent를 통해 웹 자동화 작업도 지원합니다.
- **통합 터미널**: xterm.js 기반의 크로스 플랫폼 터미널이 내장되어, 탭 관리 및 테마 동기화를 지원합니다.

### 2. 향상된 AI 에이전트

- **Advanced Editor Agent**: 파일 읽기/쓰기, 터미널 실행, Git 작업 등 복잡한 코딩 작업을 수행하는 Cursor 스타일의 에이전트가 도입되었습니다.
- **PPT Agent**: 프레젠테이션 생성, 수정, 디자인 변경 등을 수행하는 전용 도구가 추가되었습니다.
- **Coding Agent 개선**: ReAct 패턴, Self-Reflection, Loop Detection 등 최신 연구가 적용되어 복잡한 작업 처리 능력이 향상되었습니다 (최대 반복 50회).
- **AI Persona**: 다양한 역할(번역가, 시니어 개발자 등)을 부여할 수 있는 페르소나 시스템이 추가되었습니다.

### 3. GitHub 및 문서 동기화

- **GitHub Sync**: Personal Access Token을 사용하여 설정, 문서, 페르소나 등을 GitHub 레포지토리와 동기화할 수 있습니다.
- **Team Docs**: 여러 GitHub 레포지토리를 팀 문서 소스로 연결하여 RAG(검색 증강 생성)에 활용할 수 있습니다.
- **VectorDB 관리**: 문서 청킹 최적화 및 문서 Export/Import 기능이 추가되었습니다.

### 4. 생산성 도구

- **Notion 스타일 도구**: 텍스트 선택 시 요약, 번역, 톤 변경, 맞춤법 수정 등을 수행하는 컨텍스트 메뉴가 제공됩니다.
- **Quick Input**: 전역 단축키(Ctrl+Shift+Space)로 어디서든 빠르게 AI에게 질문할 수 있습니다.
- **스마트 검색**: ripgrep 기반의 전체 파일 검색 및 Browser Agent를 이용한 지능형 웹 검색이 가능합니다.

---

## 🛠 상세 변경 내역 (v0.6.0 ~ v0.6.4 통합)

### 새로운 기능

#### Editor & 개발 환경

- **듀얼 모드**: Chat 모드와 Editor 모드(FileExplorer + Monaco Editor) 전환 지원
- **Markdown 미리보기**: 실시간 렌더링, Mermaid 다이어그램, Plotly 차트 지원
- **이미지 붙여넣기**: Markdown 편집 중 클립보드 이미지 붙여넣기 시 파일 자동 저장 및 경로 삽입 (v0.6.3)
- **FileExplorer 기능**:
  - 드래그 앤 드롭으로 파일/폴더 이동 및 복사 (v0.6.3)
  - 파일/폴더 생성, 이름 변경, 삭제 컨텍스트 메뉴
  - 폴더 확장 상태 유지 (v0.6.3)

#### AI & RAG

- **LLM 기반 자동완성**: 에디터 내에서 문맥을 인식하는 코드 자동완성 및 AI 수정 제안
- **문서 관리 개선**:
  - DocumentList에서 Personal/Team 탭 분리 및 Repository 선택 UI 추가 (v0.6.3)
  - 문서 업로드 시 Team Docs 메타데이터 자동 설정

#### Browser Agent & Automation

- **Browser Control Tools**: URL 이동, 클릭, 입력, 스크롤, 스크린샷 등 12개 제어 도구
- **Vision 기능**: 화면 요소를 시각적으로 분석하여 상호작용
- **스냅샷 & 북마크**: 웹 페이지 캡처 저장 및 즐겨찾기 관리

### 버그 수정 및 최적화

#### UI/UX

- **DocumentDialog 통합**: 문서 업로드와 편집 다이얼로그를 통합하여 코드 중복 제거 및 Monaco Editor 높이 문제 해결 (v0.6.3, v0.6.4)
- **LLMStatusBar 수정**: 실제 설정 상태를 정확히 반영하도록 수정 (v0.6.4)
- **DocumentList 안내**: Team Docs 설정 상태에 따라 명확한 안내 메시지 표시 (v0.6.3)

#### 시스템 안정성

- **Windows 경로 호환성**: 드래그 앤 드롭 및 파일 작업 시 Windows 경로(`\`) 처리 오류 수정 (v0.6.3)
- **단축키 복원**: Monaco Editor에서 기본 단축키(Ctrl+C/V 등)가 정상 작동하도록 이벤트 핸들링 개선 (v0.6.4)
- **GitHub Push 안정화**: 파일명 변경 시 이전 파일 자동 삭제 및 에러 방지 로직 추가 (v0.6.3)
- **인프라**: GitHub Actions 릴리스 워크플로우에 재시도 로직 추가로 빌드 안정성 확보 (v0.6.4)

### 기술적 개선

- **Editor Agent 아키텍처**: LangGraph 기반의 독립 에이전트 시스템으로 리팩토링
- **IPC 핸들러 최적화**: 파일 시스템 및 LLM 작업을 위한 안전한 IPC 통신 구현
- **VectorDB 최적화**: 청킹 사이즈 2500자로 증대 및 청크 자동 병합 표시

---

_이 릴리스 노트는 v0.6.0, v0.6.3, v0.6.4의 변경 사항을 종합한 것입니다._
