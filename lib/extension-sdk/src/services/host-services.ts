/**
 * Host Services Registry
 *
 * Database, Network, ImageGen, MCP 등 Host-only 서비스에 대한
 * 서비스 레지스트리입니다. Extension은 이 레지스트리를 통해 Host 서비스에 접근합니다.
 */

import type { NetworkConfig } from '../types/config';

/**
 * Host Database 서비스 인터페이스
 */
export interface HostDatabaseService {
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  query(sql: string, params?: any[]): any[];
}

/**
 * Host Network 서비스 인터페이스
 */
export interface HostNetworkService {
  getNetworkConfig(): NetworkConfig | null;
  createOctokitAgent(): any;
}

/**
 * Host ImageGen 서비스 인터페이스
 */
export interface HostImageGenService {
  getComfyUIClient(): any;
  initializeComfyUIClient(config: any): any;
  generateWithNanoBanana(config: any): Promise<any>;
}

/**
 * Host MCP 서비스 인터페이스
 */
export interface HostMCPService {
  executeBuiltinTool(name: string, args: any, options?: any): Promise<any>;
  getGoogleSearchTools(): any[];
  getBrowserTools(): any[];
  getMCPServerManager(): any;
}

/**
 * Host LLM 서비스 인터페이스 (직접 클라이언트 접근)
 */
export interface HostLLMService {
  getLLMClient(): any;
  getWebLLMClient?(): any;
  getLLMService(): any;
}

/**
 * Host Language 서비스 인터페이스
 */
export interface HostLanguageService {
  getUserLanguage(source?: string): Promise<string>;
  getLanguageInstruction(lang: string): string;
}

/**
 * Host Graph 서비스 인터페이스
 * Legacy BaseGraph 클래스 접근 제공
 */
export interface HostGraphService {
  getBaseGraphClass(): any;
}

/**
 * Host Streaming 서비스 인터페이스
 * LLM 응답 스트리밍 청크를 IPC로 전송
 */
export interface HostStreamingService {
  emitChunk(chunk: string, conversationId?: string): boolean;
  setCurrentConversationId(conversationId: string | null): void;
  getCurrentConversationId(): string | null;
}

/**
 * Host Services 통합 인터페이스
 */
export interface HostServices {
  database?: HostDatabaseService;
  network?: HostNetworkService;
  imagegen?: HostImageGenService;
  mcp?: HostMCPService;
  llm?: HostLLMService;
  language?: HostLanguageService;
  graph?: HostGraphService;
  streaming?: HostStreamingService;
}

// globalThis를 사용하여 싱글톤 보장 (webpack/tsup 여러 인스턴스 대응)
const GLOBAL_KEY = '__SEPILOT_SDK_HOST_SERVICES__';

function getRegistry(): HostServices | null {
  return (globalThis as any)[GLOBAL_KEY] ?? null;
}

function setRegistry(services: HostServices): void {
  (globalThis as any)[GLOBAL_KEY] = services;
}

/**
 * Host App에서 서비스를 등록합니다.
 */
export function registerHostServices(services: HostServices): void {
  setRegistry(services);
}

/**
 * 등록된 Host 서비스 가져오기
 */
export function getHostServices(): HostServices {
  const services = getRegistry();
  if (!services) {
    throw new Error(
      '[SDK] HostServices not initialized. Host must call registerHostServices() first.'
    );
  }
  return services;
}

/**
 * Host 서비스 등록 여부 확인
 */
export function isHostServicesRegistered(): boolean {
  return getRegistry() !== null;
}
