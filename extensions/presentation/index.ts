/**
 * Presentation Extension
 *
 * AI 기반 프레젠테이션 생성 도구.
 * 대화형 인터페이스로 PPT/PDF/HTML 슬라이드를 디자인하고 내보낼 수 있습니다.
 *
 * @example
 * ```typescript
 * // Extension 사용
 * import { manifest, PresentationChat, PresentationStudio } from '@/extensions/presentation';
 *
 * // 또는 개별 import
 * import { runPresentationAgent } from '@/extensions/presentation/lib';
 * import { PresentationSlide } from '@/extensions/presentation/types';
 * ```
 */

// Manifest
export { manifest } from './manifest';
export type { ExtensionManifest } from './manifest';

// Types
export * from './types';

// Library functions
export * from './lib';

// Components
export * from './components';

// Store
export { createPresentationSlice, initialPresentationState } from './store';
