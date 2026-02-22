# SEPilot Desktop

Electron + Next.js 기반 LLM Desktop Application

- 다중 대화 세션 관리, 이미지 생성/해석, RAG, MCP Tool calling, LangGraph Agent 지원
- Frontend: Next.js 16 (React 19, TypeScript 5.9, shadcn/ui, Tailwind CSS 4)
- Backend: Electron 39 Main Process (Node.js, TypeScript)
- 상태 관리: Zustand 5 (Slice 패턴, Persistence)
- AI/ML: LangChain + LangGraph 1.0.7, MCP (Model Context Protocol)
- 통신: IPC (Inter-Process Communication)

## 작업 전 필수 확인

1. **파일 읽기 우선**: 수정 전 반드시 내용을 먼저 읽어서 컨텍스트 파악 (특히 기존 패턴 확인)
2. **기존 코드 존중**: 새 파일 생성보다 기존 로직/파일 수정 우선. 일관성 유지.
3. **품질 검증**: 작업 완료 후 `pnpm run lint` 및 `pnpm run type-check` 반드시 실행.
4. **최신 상태 유지**: 작업 시작 전 항상 `git pull` 실행.

## 작업 후 해야 할 일

1. `release_notes/` 폴더에 있는 현재 버전의 문서를 업데이트 할 것 (한국어로).

---

## 핵심 규칙 및 트러블슈팅 (CRITICAL)

최근 발생한 이슈들을 기반으로 한 **절대 규칙**입니다.

### 1. Electron Extension 번들링 이슈 (safeRequire)

**문제**: Extension이 빌드될 때 Node.js 네이티브 모듈이나 dynamic import가 Webpack에 의해 잘못 번들링되어 런타임 에러(`require is not defined` 등)가 발생함.
**해결**: Node.js 런타임에서만 동작해야 하는 모듈(fs, child_process 등)이나 동적 로딩이 필요한 모듈은 번들러가 건드리지 못하게 해야 함.

**규칙**:

- Extension 내에서 Node.js 모듈을 동적으로 불러올 때는 반드시 `safeRequire` 유틸리티나 그와 유사한 패턴을 사용.
- `require()`를 직접 사용하면 Webpack이 transpile 하려고 시도하므로 피할 것.

### 2. Frontend/Backend 의존성 분리

**문제**: Backend(Electron Main/Node.js) 코드에서 Frontend 전용 라이브러리(예: `react-syntax-highlighter`, `framer-motion`)를 import 하면 `ERR_UNSUPPORTED_DIR_IMPORT` 등의 에러 발생.
**해결**:

- Backend Agent/Tool 코드는 **철저하게** 순수 TypeScript/Node.js 로직만 포함해야 함.
- UI 컴포넌트나 React 훅은 별도 파일로 분리하고, Backend 로직에서 절대 import 하지 말 것.
- 필요한 경우 타입을 `import type`으로 가져오거나 인터페이스를 공유 라이브러리로 분리.

### 3. IPC 통신 보안 및 검증

- 모든 IPC 핸들러는 입력값(payload)을 철저히 검증해야 함.
- 파일 경로 접근 시 반드시 `sanitizePath` 등 검증 로직 통과 필수 (Path Traversal 방지).

### 4. Extension i18n 번들링 격리 (Split Brain 방지)

**문제**: Extension 번들에 `react-i18next`나 `i18next`가 포함되면, Host App과 서로 다른 i18n 인스턴스를 사용하게 되어 `useTranslation`이 작동하지 않음 (Context 상실).
**해결**:

- Extension `package.json`에서 `react-i18next`, `i18next`는 반드시 `peerDependencies`로만 선언 (devDependencies 금지).
- `tsup.config.ts`에서 해당 모듈들을 반드시 `external`로 설정.
- Extension 코드 내에서 `useTranslation('extension-id')`와 같이 Namespace를 명시적으로 사용.

---

## 아키텍처 원칙

### Electron IPC 통신

**Frontend → Backend 통신:**

```typescript
// Frontend (Renderer Process)
const result = await window.electron.invoke('channel-name', { data: 'value' });
```

**Backend → Frontend 통신:**

```typescript
// Backend (Main Process)
event.sender.send('channel-name', { data: 'value' });
```

**중요 규칙:**

- 스트리밍 데이터는 반드시 IPC 이벤트로 전송 (HTTP 불가).
- IPC 핸들러는 `electron/ipc/handlers/` 에 배치.
- 모든 IPC 채널은 명확한 네이밍 규칙 사용 (`module:action` 형식).
- 에러 처리는 `{ success: boolean, error?: string, data?: any }` 형식 반환.

### Extension 시스템 아키텍처

**구조**:
모든 Extension은 `resources/extensions/{id}/` 디렉토리에 위치하며 External (.sepx) 방식으로 로드됩니다.

```
resources/extensions/{id}/
├── src/
│   ├── definition.ts         # ExtensionDefinition export
│   ├── manifest.ts           # Manifest 정의
│   ├── main.ts               # Main Process 진입점 (IPC 핸들러)
│   ├── renderer.tsx          # Renderer 진입점 (UI)
│   ├── components/           # Extension UI 컴포넌트
│   ├── agents/               # LangGraph Agent 구현 (순수 Backend 로직)
│   ├── tools/                # Tool Registry (순수 Backend 로직)
│   └── ...
├── dist/                     # 빌드 출력
└── package.json
```

**개발 주의사항**:

- `agents/` 및 `tools/` 디렉토리 내의 코드는 **절대로** React 컴포넌트나 Frontend 라이브러리를 import 하면 안 됨.
- Frontend 코드는 `components/` 및 `renderer.tsx`에만 위치.

---

## 주요 디렉토리 구조

```
sepilot_desktop/
├── app/                          # Next.js App Router (Frontend)
├── components/                   # React 컴포넌트
│   ├── ui/                       # shadcn/ui 재사용 컴포넌트
│   └── ...
├── electron/                     # Electron Main Process
│   ├── main.ts                   # 진입점
│   ├── preload.ts                # Context Bridge
│   └── ipc/handlers/             # IPC 핸들러
├── lib/                          # 공유 라이브러리
│   ├── langgraph/                # LangGraph 통합 (Agents)
│   ├── llm/                      # LLM 클라이언트
│   ├── mcp/                      # MCP 통합
│   └── store/                    # Zustand 상태 관리
├── resources/extensions/         # Extension 소스 코드 (Editor, Browser, Terminal 등)
├── extensions/                   # .sepx 패키지 파일 (배포용)
├── .claude/                      # 설정 및 Skills
│   └── skills/                   # 프로젝트 전문 지식 (필독)
└── tests/                        # 테스트
```

---

## 개발 팁 (Gemini)

### 파일 읽기 전략

1. 수정을 요청받은 파일의 전체 내용을 먼저 `read_file`로 확인.
2. 관련되어 보이는 import 파일들도 필요하다면 확인.
3. 기존 코드 스타일(들여쓰기, 네이밍, 패턴)을 그대로 모방하여 작성.

### 환경 구분 철저

- **Browser (Frontend)**: `window`, `document`, `localStorage` 사용 가능. `fs`, `path` 사용 불가.
- **Node.js (Backend)**: `fs`, `path`, `child_process` 사용 가능. `window`, `document` 사용 불가.
- **Next.js Server Component**: Server 환경이지만 DOM API 없음.

### 로그 활용

```typescript
import { logger } from '@/lib/utils/logger';

// Backend
logger.info('Operation started', { data });

// 디버깅이 어려울 땐 로그를 적극 추가하여 흐름 추적
```

---

## 문서 참고 (Skills)

`.claude/skills/` 디렉토리에 상세 가이드가 있습니다. 작업 중 막히면 해당 문서를 참고하세요.
(예: `electron-ipc`, `extension-development`, `langgraph-agent` 등)
