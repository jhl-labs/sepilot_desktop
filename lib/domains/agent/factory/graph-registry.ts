/**
 * GraphRegistry - 그래프 등록 및 관리를 위한 싱글톤 레지스트리
 *
 * 기능:
 * - 그래프 클래스 등록
 * - 그래프 인스턴스 조회 (Singleton 캐싱)
 * - 등록된 키 목록 조회
 * - 캐시 초기화 (테스트용)
 *
 * 사용 예:
 * ```typescript
 * const registry = GraphRegistry.getInstance();
 * registry.register('chat', ChatGraph);
 * const chatGraph = registry.get('chat');
 * ```
 */

import type { BaseGraph, BaseState } from '../base/base-graph';
import { logger } from '@/lib/utils/logger';

/**
 * 그래프 생성자 타입
 */
export type GraphConstructor<TState extends BaseState = BaseState> = new () => BaseGraph<TState>;

/**
 * GraphRegistry 클래스 (싱글톤)
 */
export class GraphRegistry {
  private static instance: GraphRegistry | null = null;

  // 그래프 클래스 레지스트리 (key → GraphConstructor)
  private registry = new Map<string, GraphConstructor>();

  // 그래프 인스턴스 캐시 (key → BaseGraph instance)
  private instances = new Map<string, BaseGraph<any>>();

  /**
   * Private 생성자 (싱글톤 패턴)
   */
  private constructor() {
    logger.info('[GraphRegistry] Initialized');
  }

  /**
   * 싱글톤 인스턴스 가져오기
   */
  public static getInstance(): GraphRegistry {
    if (!GraphRegistry.instance) {
      GraphRegistry.instance = new GraphRegistry();
    }
    return GraphRegistry.instance;
  }

  /**
   * 그래프 클래스 등록
   *
   * @param key - 그래프 키 (예: 'chat', 'agent', 'sequential-thinking')
   * @param graphClass - 그래프 생성자 함수
   */
  public register<TState extends BaseState>(
    key: string,
    graphClass: GraphConstructor<TState>
  ): void {
    if (this.registry.has(key)) {
      logger.warn(`[GraphRegistry] Overwriting existing graph: ${key}`);
    }

    this.registry.set(key, graphClass as GraphConstructor);
    logger.info(`[GraphRegistry] Registered graph: ${key}`);
  }

  /**
   * 그래프 인스턴스 가져오기 (Lazy initialization + 캐싱)
   *
   * @param key - 그래프 키
   * @returns 그래프 인스턴스 또는 null
   */
  public get(key: string): BaseGraph<any> | null {
    // 캐시된 인스턴스가 있으면 반환
    if (this.instances.has(key)) {
      logger.debug(`[GraphRegistry] Returning cached instance: ${key}`);
      return this.instances.get(key)!;
    }

    // 등록된 클래스가 없으면 null 반환
    const GraphClass = this.registry.get(key);
    if (!GraphClass) {
      logger.warn(`[GraphRegistry] Graph not found: ${key}`);
      return null;
    }

    // 새 인스턴스 생성 및 캐싱
    try {
      const instance = new GraphClass();
      this.instances.set(key, instance);
      logger.info(`[GraphRegistry] Created and cached instance: ${key}`);
      return instance;
    } catch (error) {
      logger.error(`[GraphRegistry] Failed to create instance: ${key}`, error);
      return null;
    }
  }

  /**
   * 등록된 모든 그래프 키 목록 가져오기
   *
   * @returns 그래프 키 배열
   */
  public getKeys(): string[] {
    return Array.from(this.registry.keys());
  }

  /**
   * 특정 그래프가 등록되어 있는지 확인
   *
   * @param key - 그래프 키
   * @returns 등록 여부
   */
  public has(key: string): boolean {
    return this.registry.has(key);
  }

  /**
   * 인스턴스 캐시 초기화 (테스트용)
   *
   * 주의: 등록된 클래스는 유지되고 인스턴스 캐시만 삭제됨
   */
  public clearCache(): void {
    const cacheSize = this.instances.size;
    this.instances.clear();
    logger.info(`[GraphRegistry] Cleared ${cacheSize} cached instances`);
  }

  /**
   * 모든 등록 및 캐시 초기화 (테스트용)
   *
   * 주의: 모든 등록된 그래프 클래스와 인스턴스가 삭제됨
   */
  public reset(): void {
    const registrySize = this.registry.size;
    const cacheSize = this.instances.size;
    this.registry.clear();
    this.instances.clear();
    logger.warn(
      `[GraphRegistry] Reset: cleared ${registrySize} registrations and ${cacheSize} instances`
    );
  }

  /**
   * 통계 정보 가져오기
   *
   * @returns 등록된 그래프 수, 캐시된 인스턴스 수
   */
  public getStats(): { registered: number; cached: number } {
    return {
      registered: this.registry.size,
      cached: this.instances.size,
    };
  }
}

/**
 * 편의를 위한 싱글톤 인스턴스 export
 */
export const graphRegistry = GraphRegistry.getInstance();
