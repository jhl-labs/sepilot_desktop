/**
 * Presentation Extension
 *
 * AI 기반 프레젠테이션 생성 도구.
 * 대화형 인터페이스로 PPT/PDF/HTML 슬라이드를 디자인하고 내보낼 수 있습니다.
 *
 * NOTE: This file exports only client-safe components.
 * Server-side code (IPC Handlers) should be imported directly from their respective files.
 *
 * @example
 * ```typescript
 * // Extension 사용 (client-safe)
 * import { manifest, PresentationChat, PresentationStudio } from '@/extensions/presentation';
 *
 * // Server-side code import
 * import { setupPresentationIpcHandlers } from '@/extensions/presentation/ipc/handlers';
 * ```
 */

// Manifest
export { manifest } from './manifest';

// Types (client-safe)
export * from './types';

// Library functions (client-safe)
export * from './lib';

// Main Components (client-safe)
export {
  PresentationChat,
  PresentationStudio,
  PresentationHeaderActions,
  PresentationSettings,
  SlidePreview,
  SlideRenderer,
  SlideMasterPreview,
  DesignOptionsPreview,
  StylePresetBar,
} from './components';

// Store (client-safe)
export { createPresentationSlice, initialPresentationState } from './store';

// NOTE: IPC Handlers are NOT exported here to avoid bundling server-only code in client.
// They should be imported directly in server-side code:
// - import { setupPresentationIpcHandlers } from '@/extensions/presentation/ipc/handlers';
