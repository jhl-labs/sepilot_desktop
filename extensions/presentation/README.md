# Presentation Extension

AI 기반 프레젠테이션 생성 도구. 대화형 인터페이스로 PPT/PDF/HTML 슬라이드를 디자인하고 내보낼 수 있습니다.

## 개요

이 extension은 SEPilot Desktop의 플러그인 시스템 예시로, 독립적인 기능을 별도의 모듈로 분리하는 방법을 보여줍니다.

## 디렉토리 구조

```
extensions/presentation/
├── index.ts              # 메인 진입점 (모든 export 통합)
├── manifest.ts           # Extension 메타데이터 정의
├── README.md             # 이 문서
├── types/
│   └── index.ts          # 타입 정의
├── lib/
│   ├── index.ts          # 라이브러리 함수 export
│   ├── ppt-agent.ts      # PPT 생성 AI 에이전트
│   ├── ppt-tools.ts      # PPT 도구 정의
│   ├── templates.ts      # 프레젠테이션 템플릿
│   ├── exporters.ts      # 내보내기 (HTML/PDF/PPTX)
│   └── image-generation.ts # 슬라이드 이미지 생성
├── components/
│   ├── index.ts          # 컴포넌트 export
│   ├── PresentationChat.tsx    # 대화형 UI
│   ├── PresentationStudio.tsx  # 스튜디오 메인
│   ├── SlidePreview.tsx        # 슬라이드 미리보기
│   ├── SlideRenderer.tsx       # 슬라이드 렌더러
│   ├── SlideMasterPreview.tsx  # 디자인 마스터 미리보기
│   ├── DesignOptionsPreview.tsx # 디자인 옵션 비교
│   └── StylePresetBar.tsx      # 스타일 프리셋
└── store/
    └── index.ts          # Store slice 정의
```

## 사용 방법

### 1. Extension 전체 import

```typescript
import { manifest, PresentationChat, PresentationStudio } from '@/extensions/presentation';

// manifest로 extension 정보 확인
console.log(manifest.name); // "AI Presentation Designer"
```

### 2. 개별 모듈 import

```typescript
// 타입만 필요한 경우
import type { PresentationSlide, PresentationAgentState } from '@/extensions/presentation/types';

// 특정 함수만 필요한 경우
import { runPresentationAgent, createInitialState } from '@/extensions/presentation/lib';

// 컴포넌트만 필요한 경우
import { PresentationChat } from '@/extensions/presentation/components';
```

### 3. Store 통합

```typescript
// chat-store.ts에서 slice 통합 (필요한 경우)
import { createPresentationSlice } from '@/extensions/presentation/store';

const useChatStore = create<ChatStore>()((set, get) => ({
  ...createPresentationSlice(set, get),
  // ... other slices
}));
```

## Extension Manifest

모든 extension은 `manifest.ts`를 통해 메타데이터를 정의합니다:

```typescript
export interface ExtensionManifest {
  id: string; // 고유 식별자
  name: string; // 표시 이름
  description: string; // 설명
  version: string; // 버전 (semver)
  author: string; // 작성자
  icon: string; // lucide-react 아이콘 이름
  mode: string; // 활성화할 앱 모드
  showInSidebar: boolean; // 사이드바 표시 여부
  dependencies?: string[]; // 의존하는 다른 extension
  settingsSchema?: Record<string, unknown>; // 설정 스키마
}
```

## 주요 기능

### PPT Agent (ppt-agent.ts)

대화형 PPT 생성 에이전트. Step-by-step 워크플로우:

1. **Briefing**: 주제, 목적, 청중 파악
2. **Design Master**: 색상, 폰트, 분위기 설정
3. **Structure**: 슬라이드 구조 계획
4. **Slide Creation**: 슬라이드별 내용 작성
5. **Review**: 검토 및 수정
6. **Complete**: 완료 및 내보내기

```typescript
import { runPresentationAgent, createInitialState } from '@/extensions/presentation/lib';

const state = createInitialState();
const { response, state: newState } = await runPresentationAgent(messages, state, {
  onToken: (chunk) => console.log(chunk),
  onSlides: (slides) => setSlides(slides),
});
```

### Templates (templates.ts)

미리 정의된 프레젠테이션 템플릿:

- `profile`: 자기소개
- `tech-seminar`: 기술 세미나
- `paper-summary`: 논문 요약
- `project-intro`: 과제 소개

```typescript
import { PRESENTATION_TEMPLATES, getTemplateById } from '@/extensions/presentation/lib';

const template = getTemplateById('tech-seminar');
const state = template.generateState();
```

### Exporters (exporters.ts)

슬라이드 내보내기:

```typescript
import { exportPresentation, renderHtml } from '@/extensions/presentation/lib';

// HTML로 내보내기
const html = renderHtml(slides);

// 포맷별 내보내기 (html, pdf, pptx)
const filePath = await exportPresentation(slides, 'html');
```

## 새 Extension 만들기

이 extension을 참고하여 새 extension을 만들 때:

### 1. 디렉토리 구조 생성

```bash
extensions/
└── my-extension/
    ├── index.ts
    ├── manifest.ts
    ├── README.md
    ├── types/
    │   └── index.ts
    ├── lib/
    │   └── index.ts
    ├── components/
    │   └── index.ts
    └── store/
        └── index.ts
```

### 2. Manifest 정의

```typescript
// manifest.ts
export const manifest: ExtensionManifest = {
  id: 'my-extension',
  name: 'My Extension',
  description: '설명...',
  version: '1.0.0',
  author: 'Your Name',
  icon: 'Puzzle',
  mode: 'my-mode',
  showInSidebar: true,
};
```

### 3. 타입 정의

```typescript
// types/index.ts
export interface MyExtensionState {
  // ... state types
}

export interface MyExtensionActions {
  // ... action types
}
```

### 4. 메인 진입점 설정

```typescript
// index.ts
export { manifest } from './manifest';
export * from './types';
export * from './lib';
export * from './components';
```

## 의존성

이 extension은 다음 모듈에 의존합니다:

- `@/lib/store/chat-store`: 상태 관리
- `@/lib/llm/service`: LLM 서비스
- `@/lib/utils`: 유틸리티 함수
- `@/components/ui/*`: UI 컴포넌트 (shadcn/ui)
- `@/lib/comfyui/client`: 이미지 생성 (선택)
- `@/lib/imagegen/nanobanana-client`: 이미지 생성 (선택)

## 라이선스

SEPilot Desktop 프로젝트 라이선스를 따릅니다.
