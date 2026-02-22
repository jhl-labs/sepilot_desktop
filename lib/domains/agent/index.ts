/**
 * LangGraph 통합 - 메인 엔트리 포인트
 *
 * 주의: 이 파일은 Electron Main Process에서만 사용됩니다.
 * 브라우저 환경에서는 dynamic import로만 로드해야 합니다.
 */

// 타입 export (브라우저에서도 안전)
export * from './types';

// GraphFactory export (GraphRegistry 기반)
export { GraphFactory } from './factory/graph-factory';
export { GraphRegistry, graphRegistry } from './factory/graph-registry';

// BaseGraph export (커스텀 그래프 작성용)
export { BaseGraph } from './base/base-graph';
export type { BaseState } from './base/base-graph';

// State 생성 함수들 export
export {
  createInitialChatState,
  createInitialRAGState,
  createInitialAgentState,
  createInitialCodingAgentState,
} from './state';
