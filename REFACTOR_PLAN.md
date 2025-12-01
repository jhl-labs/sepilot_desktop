# Sepilot Desktop - 아키텍처 리팩토링 계획

이 문서는 `sepilot_desktop` 프로젝트의 현재 아키텍처를 검토하고, 개선이 필요한 주요 영역과 그에 대한 리팩토링 계획을 제시합니다.

## 1. 아키텍처 개요 (Architecture Overview)

*   **패턴:** Electron + Next.js (Static Export) 구조
*   **프론트엔드:** React (Next.js App Router), Tailwind CSS, Radix UI/Shadcn
*   **백엔드:** Electron 메인 프로세스 (Node.js 서비스)
*   **통신:** `preload.ts`를 통한 보안 IPC 브리지 (`contextBridge`)
*   **상태 관리:** 단일 거대 Zustand 스토어
*   **데이터베이스:** 메인 프로세스에서 관리되는 로컬 SQLite (`sql.js`, WASM)
*   **AI/LLM:** LangGraph를 활용한 하이브리드 실행 (로컬/IPC vs 직접 호출) 구조

## 2. 주요 강점 (Strengths)

*   **보안 중심의 IPC 설계:** Electron의 보안 모범 사례를 철저히 따르고 있습니다. `preload.ts`를 통해 Node.js 환경 전체를 노출하지 않고, `window.electronAPI`라는 구체적이고 타입이 정의된 API만 렌더러에 노출하는 방식은 매우 훌륭합니다.
*   **명확한 프로세스 분리:** 백엔드 로직(DB, 파일 시스템, 네이티브 서비스)은 `electron/` 및 `electron/services/` 폴더에 물리적으로 분리되어 있어, `app/` 내의 UI 코드가 프레젠테이션 로직에만 집중할 수 있게 되어 있습니다.
*   **테스트 인프라:** `tests/setup.ts`에서 Electron API를 효과적으로 모킹(Mocking)하고 있어, 실제 Electron 인스턴스 없이도 프론트엔드 컴포넌트의 단위 테스트가 용이한 구조입니다.

## 3. 핵심 리팩토링 포인트 (Critical Refactoring Points)

### A. 상태 관리: "God Store" 분리 (State Management)
**현황:** `lib/store/chat-store.ts` 파일이 채팅, 코드 에디터, 브라우저, 앱 설정 등 서로 다른 성격의 상태를 모두 관리하는 거대한 모놀리식(Monolithic) Zustand 스토어 형태입니다.
**문제점:**
*   **높은 결합도:** 에디터 로직의 변경이 채팅 UI의 불필요한 리렌더링을 유발할 수 있습니다.
*   **유지보수성:** 파일이 비대하여 코드 탐색과 수정이 어렵습니다.
**제안:** 기능별 스토어(Slice 패턴)로 분리해야 합니다.
*   `useChatStore`: 메시지, 대화 목록, 스트리밍 상태
*   `useEditorStore`: 열린 파일, 활성 탭, 변경 사항(dirty) 상태
*   `useSettingsStore`: 테마, LLM 설정, 사용자 환경설정
*   `useBrowserStore`: 탭, 히스토리, 북마크

### B. 데이터베이스 계층: 타입 안정성 및 추상화 (Database Layer)
**현황:** `electron/services/database.ts`에서 `sql.js`를 사용하며 원시 SQL 문자열(Raw String)로 쿼리를 작성하고 있습니다.
**문제점:**
*   **취약한 쿼리:** 문자열 기반 SQL은 오타나 구문 오류에 취약하며, 스키마 변경 시 유지보수가 어렵습니다.
*   **유지보수:** 테이블 생성 및 마이그레이션 로직이 수동으로 관리되고 있습니다.
**제안:**
*   **즉시 개선:** SQL 쿼리를 별도의 DAO(Data Access Object) 계층이나 상수 파일로 추출하여 서비스 로직을 정리합니다.
*   **이상적인 방향:** **Kysely** 같은 경량 쿼리 빌더나 SQLite/Electron 호환 ORM을 도입하여 TypeScript 레벨에서 SQL 타입 안정성을 확보하는 것이 좋습니다.

### C. LLM 서비스: 관심사 누수 (LLM Service)
**현황:** `lib/llm/service.ts` 파일 내에서 메인 프로세스 환경일 때 백엔드 코드(`import('../../electron/services/database')`)를 동적으로 import 하는 로직이 포함되어 있습니다.
**문제점:**
*   **추상화 누수:** 프론트엔드 서비스 코드가 백엔드 구현 세부 사항(파일 경로 등)을 알고 있습니다.
*   **번들링 위험:** 프론트엔드 코드에서 백엔드 파일을 참조하면 번들러(Webpack/Turbo) 설정이 복잡해지거나 런타임 오류가 발생할 위험이 있습니다.
**제안:**
*   완벽한 분리가 필요합니다. 프론트엔드의 `LLMService`는 오직 `window.electronAPI`를 통해서만 통신해야 합니다.
*   백엔드 전용 LLM 로직은 `electron/services/llm-service.ts` 등으로 완전히 분리하여 IPC를 통해서만 접근하도록 변경해야 합니다.

## 4. 제안하는 실행 계획 (Proposed Action Plan)

개발자 경험(DX)과 코드 안정성을 위해 **상태 관리 리팩토링**을 최우선으로 진행하는 것을 추천합니다.

**Phase 1: 상태 분리 (State Decoupling)**
1.  `lib/store/slices/` 디렉토리 생성
2.  `chat-store.ts`에서 `EditorSlice`, `SettingsSlice` 등을 추출하여 개별 스토어로 분리
3.  컴포넌트들이 새로운 전용 훅을 사용하도록 수정

**Phase 2: 데이터베이스 강화 (Database Hardening)**
1.  `electron/db/schema.ts`를 생성하여 테이블 구조 정의
2.  `database.ts`를 리팩토링하여 쿼리 빌더 패턴이나 명확한 DAO 인터페이스 도입

**Phase 3: LLM 서비스 정리 (LLM Service Cleanup)**
1.  프론트엔드 `LLMService`에서 백엔드 동적 import 제거
2.  모든 LLM 호출을 IPC 브리지로 표준화
