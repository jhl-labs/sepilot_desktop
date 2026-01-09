/**
 * Skill Manager
 *
 * Skills의 생명주기를 관리하는 싱글톤 서비스
 * - Progressive Loading: 앱 시작 시 manifest만 로드
 * - Lazy Loading: 필요 시점에 전체 content 로드
 * - Memory Management: 메모리 사용량 제한 및 자동 언로드
 */

import type {
  SkillManifest,
  LoadedSkill,
  InstalledSkill,
  ContextMatchResult,
} from '../../types/skill';

/**
 * SkillManager 설정
 */
interface SkillManagerConfig {
  maxLoadedSkills: number; // 동시에 메모리에 로드할 수 있는 최대 스킬 수
  autoUnloadThreshold: number; // 자동 언로드 임계값 (분)
}

/**
 * Skill Manager 클래스 (싱글톤)
 *
 * Electron Main Process에서만 사용
 * Renderer Process는 IPC를 통해 접근
 */
export class SkillManager {
  private static instance: SkillManager | null = null;

  // Progressive loading: 모든 설치된 스킬의 manifest
  private manifests: Map<string, SkillManifest> = new Map();

  // Lazy loading: 실제로 로드된 스킬들 (content 포함)
  private loadedSkills: Map<string, LoadedSkill> = new Map();

  // 스킬 마지막 사용 시간 추적 (자동 언로드용)
  private lastUsed: Map<string, number> = new Map();

  // 설정
  private config: SkillManagerConfig = {
    maxLoadedSkills: 5, // 최대 5개 동시 로드
    autoUnloadThreshold: 30, // 30분 미사용 시 자동 언로드
  };

  // 초기화 상태
  private initialized = false;

  private constructor() {}

  /**
   * 싱글톤 인스턴스 가져오기
   */
  static getInstance(): SkillManager {
    if (!SkillManager.instance) {
      SkillManager.instance = new SkillManager();
    }
    return SkillManager.instance;
  }

  /**
   * 초기화
   * - 앱 시작 시 호출
   * - 모든 설치된 스킬의 manifest만 로드 (Progressive Loading)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log('[SkillManager] Already initialized');
      return;
    }

    try {
      console.log('[SkillManager] Initializing...');

      // Main process에서만 import (Electron API 사용)
      const { skillDatabaseService } = await import('../../electron/services/skill-database');

      // 모든 설치된 스킬의 manifest 로드
      const installedSkills = skillDatabaseService.getAllSkills();

      this.manifests.clear();
      for (const skill of installedSkills) {
        this.manifests.set(skill.id, skill.manifest);
      }

      console.log(`[SkillManager] Loaded ${this.manifests.size} skill manifests`);

      // 자동 언로드 타이머 시작
      this.startAutoUnloadTimer();

      this.initialized = true;
      console.log('[SkillManager] Initialization complete');
    } catch (error) {
      console.error('[SkillManager] Initialization failed:', error);
      throw new Error(`Failed to initialize SkillManager: ${error}`);
    }
  }

  /**
   * 스킬 로드 (Lazy Loading)
   * - 전체 content를 파일시스템에서 로드하여 메모리에 적재
   * - 이미 로드된 경우 기존 것 반환
   */
  async loadSkill(skillId: string): Promise<LoadedSkill> {
    // 이미 로드된 경우
    if (this.loadedSkills.has(skillId)) {
      console.log(`[SkillManager] Skill already loaded: ${skillId}`);
      this.updateLastUsed(skillId);
      return this.loadedSkills.get(skillId)!;
    }

    // manifest 확인
    const manifest = this.manifests.get(skillId);
    if (!manifest) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    try {
      console.log(`[SkillManager] Loading skill: ${skillId}`);

      // 메모리 제한 확인 및 정리
      await this.ensureMemoryLimit();

      // Main process에서만 import
      const { skillStorageService } = await import('../../electron/services/skill-storage');

      // 파일시스템에서 전체 스킬 패키지 로드
      const skillPackage = await skillStorageService.loadSkillFromFileSystem(skillId);

      // LoadedSkill 생성
      const loadedSkill: LoadedSkill = {
        skillId,
        package: skillPackage,
        loadedAt: Date.now(),
      };

      // 메모리에 적재
      this.loadedSkills.set(skillId, loadedSkill);
      this.updateLastUsed(skillId);

      console.log(`[SkillManager] Skill loaded successfully: ${skillId}`);

      return loadedSkill;
    } catch (error) {
      console.error(`[SkillManager] Failed to load skill ${skillId}:`, error);
      throw new Error(`Failed to load skill ${skillId}: ${error}`);
    }
  }

  /**
   * 스킬 언로드
   * - 메모리에서 제거
   * - manifest는 유지 (Progressive Loading)
   */
  unloadSkill(skillId: string): void {
    if (!this.loadedSkills.has(skillId)) {
      console.warn(`[SkillManager] Skill not loaded: ${skillId}`);
      return;
    }

    this.loadedSkills.delete(skillId);
    this.lastUsed.delete(skillId);

    console.log(`[SkillManager] Skill unloaded: ${skillId}`);
  }

  /**
   * 모든 로드된 스킬 언로드
   */
  unloadAll(): void {
    const count = this.loadedSkills.size;
    this.loadedSkills.clear();
    this.lastUsed.clear();

    console.log(`[SkillManager] Unloaded ${count} skills`);
  }

  /**
   * 스킬 재로드 (manifest 갱신)
   * - DB에서 최신 manifest를 다시 가져옴
   * - 로드된 content는 유지
   */
  async reloadManifests(): Promise<void> {
    try {
      console.log('[SkillManager] Reloading manifests...');

      const { skillDatabaseService } = await import('../../electron/services/skill-database');
      const installedSkills = skillDatabaseService.getAllSkills();

      this.manifests.clear();
      for (const skill of installedSkills) {
        this.manifests.set(skill.id, skill.manifest);

        // 로드된 스킬의 manifest도 업데이트
        const loadedSkill = this.loadedSkills.get(skill.id);
        if (loadedSkill) {
          loadedSkill.package.manifest = skill.manifest;
        }
      }

      console.log(`[SkillManager] Reloaded ${this.manifests.size} manifests`);
    } catch (error) {
      console.error('[SkillManager] Failed to reload manifests:', error);
      throw error;
    }
  }

  /**
   * 스킬이 로드되었는지 확인
   */
  isLoaded(skillId: string): boolean {
    return this.loadedSkills.has(skillId);
  }

  /**
   * 스킬이 설치되었는지 확인
   */
  isInstalled(skillId: string): boolean {
    return this.manifests.has(skillId);
  }

  /**
   * 로드된 스킬 가져오기
   */
  getLoadedSkill(skillId: string): LoadedSkill | undefined {
    return this.loadedSkills.get(skillId);
  }

  /**
   * 모든 로드된 스킬 목록
   */
  getLoadedSkills(): LoadedSkill[] {
    return Array.from(this.loadedSkills.values());
  }

  /**
   * 설치된 스킬의 manifest 목록
   */
  getInstalledManifests(): SkillManifest[] {
    return Array.from(this.manifests.values());
  }

  /**
   * 특정 스킬의 manifest 가져오기
   */
  getManifest(skillId: string): SkillManifest | undefined {
    return this.manifests.get(skillId);
  }

  /**
   * 활성화된 스킬 목록
   */
  async getEnabledSkills(): Promise<InstalledSkill[]> {
    const { skillDatabaseService } = await import('../../electron/services/skill-database');
    return skillDatabaseService.getEnabledSkills();
  }

  /**
   * 메모리 제한 확인 및 정리
   * - 최대 로드 개수 초과 시 가장 오래 사용하지 않은 스킬 언로드
   */
  private async ensureMemoryLimit(): Promise<void> {
    if (this.loadedSkills.size < this.config.maxLoadedSkills) {
      return;
    }

    console.log(
      `[SkillManager] Memory limit reached (${this.loadedSkills.size}/${this.config.maxLoadedSkills}), unloading least recently used skill`
    );

    // 가장 오래 사용하지 않은 스킬 찾기
    let oldestSkillId: string | null = null;
    let oldestTime = Date.now();

    for (const [skillId, lastUsedTime] of this.lastUsed.entries()) {
      if (lastUsedTime < oldestTime) {
        oldestTime = lastUsedTime;
        oldestSkillId = skillId;
      }
    }

    if (oldestSkillId) {
      this.unloadSkill(oldestSkillId);
    }
  }

  /**
   * 마지막 사용 시간 업데이트
   */
  private updateLastUsed(skillId: string): void {
    this.lastUsed.set(skillId, Date.now());
  }

  /**
   * 자동 언로드 타이머 시작
   * - 일정 시간 사용하지 않은 스킬 자동 언로드
   */
  private startAutoUnloadTimer(): void {
    setInterval(
      () => {
        const now = Date.now();
        const threshold = this.config.autoUnloadThreshold * 60 * 1000; // 분 → 밀리초

        const toUnload: string[] = [];

        for (const [skillId, lastUsedTime] of this.lastUsed.entries()) {
          if (now - lastUsedTime > threshold) {
            toUnload.push(skillId);
          }
        }

        if (toUnload.length > 0) {
          console.log(`[SkillManager] Auto-unloading ${toUnload.length} unused skills`);
          for (const skillId of toUnload) {
            this.unloadSkill(skillId);
          }
        }
      },
      5 * 60 * 1000
    ); // 5분마다 체크
  }

  /**
   * 설정 업데이트
   */
  updateConfig(config: Partial<SkillManagerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[SkillManager] Config updated:', this.config);
  }

  /**
   * 현재 설정 가져오기
   */
  getConfig(): SkillManagerConfig {
    return { ...this.config };
  }

  /**
   * 통계 정보
   */
  getStats(): {
    totalInstalled: number;
    totalLoaded: number;
    memoryUsage: number;
    manifests: number;
  } {
    return {
      totalInstalled: this.manifests.size,
      totalLoaded: this.loadedSkills.size,
      memoryUsage: this.loadedSkills.size / this.config.maxLoadedSkills,
      manifests: this.manifests.size,
    };
  }

  /**
   * 컨텍스트 기반 관련 스킬 감지 및 로드 (Phase 3)
   *
   * @param userMessage - 사용자 메시지
   * @param manualSkillIds - 수동으로 선택된 스킬 ID (@skill-name)
   * @returns 로드된 스킬과 관련성 점수
   */
  async detectAndLoadRelevantSkills(
    userMessage: string,
    manualSkillIds?: string[]
  ): Promise<ContextMatchResult[]> {
    try {
      console.log(
        `[SkillManager] Detecting relevant skills for message: "${userMessage.substring(0, 50)}..."`
      );

      // 활성화된 스킬 목록 가져오기
      const enabledSkills = await this.getEnabledSkills();
      if (enabledSkills.length === 0) {
        console.log('[SkillManager] No enabled skills found');
        return [];
      }

      // ContextMatcher 동적 import (순환 의존성 방지)
      const { contextMatcher } = await import('./context-matcher');

      // 관련성 점수 계산
      const manifests = enabledSkills.map((s) => s.manifest);
      const matchResults = contextMatcher.match(userMessage, manifests);

      if (matchResults.length === 0) {
        console.log('[SkillManager] No relevant skills found');
        return [];
      }

      console.log(`[SkillManager] Found ${matchResults.length} relevant skills`);

      // 수동 선택된 스킬 우선 로드
      const loadedResults: ContextMatchResult[] = [];

      if (manualSkillIds && manualSkillIds.length > 0) {
        for (const skillId of manualSkillIds) {
          try {
            await this.loadSkill(skillId);
            loadedResults.push({
              skillId,
              score: 1.0, // 수동 선택은 최고 점수
              matchedPatterns: ['@mention'],
            });
          } catch (error) {
            console.error(`[SkillManager] Failed to load manual skill ${skillId}:`, error);
          }
        }
      }

      // 자동 매칭된 스킬 로드 (상위 3개)
      const autoMatches = matchResults.slice(0, 3);
      for (const match of autoMatches) {
        try {
          // 이미 수동으로 로드된 경우 스킵
          if (manualSkillIds && manualSkillIds.includes(match.skillId)) {
            continue;
          }

          await this.loadSkill(match.skillId);
          loadedResults.push(match);

          console.log(
            `[SkillManager] Auto-loaded skill: ${match.skillId} (score: ${match.score.toFixed(2)})`
          );
        } catch (error) {
          console.error(`[SkillManager] Failed to load skill ${match.skillId}:`, error);
        }
      }

      return loadedResults;
    } catch (error) {
      console.error('[SkillManager] Error detecting relevant skills:', error);
      return [];
    }
  }

  /**
   * 스킬 사용 이력 기록
   *
   * @param skillId - 스킬 ID
   * @param conversationId - 대화 ID
   * @param contextPattern - 매칭된 컨텍스트 패턴 (optional)
   */
  async recordUsage(
    skillId: string,
    conversationId: string,
    contextPattern?: string
  ): Promise<void> {
    try {
      // SkillRegistry에 위임
      const { skillRegistry } = await import('./registry');
      await skillRegistry.recordUsage(skillId, conversationId, contextPattern);
    } catch (error) {
      console.error(`[SkillManager] Failed to record usage for skill ${skillId}:`, error);
      // 사용 이력 기록 실패는 치명적이지 않으므로 throw하지 않음
    }
  }

  /**
   * 초기화 여부 확인
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * 재설정 (테스트용)
   */
  reset(): void {
    this.manifests.clear();
    this.loadedSkills.clear();
    this.lastUsed.clear();
    this.initialized = false;
    console.log('[SkillManager] Reset complete');
  }
}

// Singleton instance export
export const skillManager = SkillManager.getInstance();
