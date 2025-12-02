/**
 * Browser Agent 타입 정의 (하위 호환성 유지)
 *
 * ⚠️ DEPRECATED: 이 파일은 하위 호환성을 위해 유지됩니다.
 * 새 코드에서는 'types/browser-agent'에서 직접 import하세요.
 *
 * 변경 사항:
 * - types/browser-agent.ts → types/browser-agent/index.ts (통합 export)
 * - 파일 구조 개선:
 *   - google-search.ts: Google Search Tools (기존)
 *   - browser-control.ts: Browser Control Tools (신규 14개)
 *   - vision.ts: Vision-Based Tools (신규 5개)
 *   - errors.ts: Error & Recovery Strategy (신규)
 *   - workflow.ts: Session & Workflow Management (신규)
 *
 * @deprecated Use 'types/browser-agent' instead
 */

export * from './browser-agent/index';
