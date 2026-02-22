/**
 * Dynamic import wrapper for Extensions
 *
 * Extension에서 next/dynamic을 직접 사용하는 대신 이 래퍼를 사용합니다.
 * 이렇게 하면 Extension 빌드 시 next/dynamic을 external로 설정할 수 있고,
 * webpack 번들링 문제를 피할 수 있습니다.
 */

import dynamic from 'next/dynamic';

export { dynamic };

// Re-export all types
export type { DynamicOptions, Loader, LoaderComponent } from 'next/dynamic';
