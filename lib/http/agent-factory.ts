/**
 * HTTP 통신 중앙 집중화 모듈 - Agent Factory
 *
 * NetworkConfig 기반으로 HTTP Agent 생성
 * - 프록시 지원 (manual/system)
 * - SSL 검증 설정
 * - Node.js 환경에서만 동작
 */

import { NetworkConfig } from '@/types';
import { detectEnvironment } from './config';
import { logger } from '@/lib/utils/logger';

/** Agent 타입 (https-proxy-agent의 HttpsProxyAgent 포함) */
export type HttpAgentType = any;

/**
 * NetworkConfig 기반으로 HTTP Agent 생성
 *
 * @param networkConfig - 네트워크 설정
 * @param url - 요청 URL (프로토콜 판단용)
 * @returns HTTP Agent 또는 undefined
 */
export async function createHttpAgent(
  networkConfig: NetworkConfig | null | undefined,
  _url?: string
): Promise<HttpAgentType | undefined> {
  const env = detectEnvironment();

  // 브라우저 환경에서는 agent 사용 불가
  if (env === 'browser') {
    return undefined;
  }

  // Electron Renderer에서도 agent 사용 불가 (Main Process에서 처리해야 함)
  if (env === 'electron-renderer') {
    return undefined;
  }

  if (!networkConfig) {
    return undefined;
  }

  const agentOptions: Record<string, unknown> = {};

  // SSL 검증 설정
  if (networkConfig.ssl?.verify === false) {
    agentOptions.rejectUnauthorized = false;
    logger.debug('[HTTP Agent] SSL verification disabled');
  }

  // 프록시 설정
  if (networkConfig.proxy?.enabled && networkConfig.proxy.mode !== 'none') {
    if (networkConfig.proxy.mode === 'manual' && networkConfig.proxy.url) {
      return await createManualProxyAgent(networkConfig.proxy.url, agentOptions);
    } else if (networkConfig.proxy.mode === 'system') {
      return await createSystemProxyAgent(agentOptions);
    }
  }

  // SSL만 설정된 경우 (프록시 없음)
  if (agentOptions.rejectUnauthorized === false) {
    return await createSslOnlyAgent(agentOptions);
  }

  return undefined;
}

/**
 * 수동 프록시 Agent 생성
 */
async function createManualProxyAgent(
  proxyUrl: string,
  agentOptions: Record<string, unknown>
): Promise<HttpAgentType | undefined> {
  try {
    const { HttpsProxyAgent } = await import('https-proxy-agent');
    logger.debug('[HTTP Agent] Using manual proxy:', proxyUrl);
    return new HttpsProxyAgent(proxyUrl, agentOptions);
  } catch (error) {
    logger.warn('[HTTP Agent] https-proxy-agent not available:', error);
    return undefined;
  }
}

/**
 * 시스템 프록시 Agent 생성
 * 환경 변수 (HTTP_PROXY, HTTPS_PROXY) 자동 감지
 */
async function createSystemProxyAgent(
  agentOptions: Record<string, unknown>
): Promise<HttpAgentType | undefined> {
  try {
    const { ProxyAgent } = await import('proxy-agent');
    logger.debug('[HTTP Agent] Using system proxy (env variables)');
    return new ProxyAgent(agentOptions);
  } catch (error) {
    logger.warn('[HTTP Agent] proxy-agent not available:', error);
    return undefined;
  }
}

/**
 * SSL 설정만 적용된 Agent 생성 (프록시 없음)
 */
async function createSslOnlyAgent(
  agentOptions: Record<string, unknown>
): Promise<HttpAgentType | undefined> {
  try {
    // Use Function constructor to avoid webpack static analysis
    const importModule = new Function('name', 'return import(name)');
    const https = await importModule('node' + ':https');
    return new https.Agent(agentOptions);
  } catch (error) {
    logger.warn('[HTTP Agent] Failed to create HTTPS agent:', error);
    return undefined;
  }
}

/**
 * Octokit용 Agent 생성 (GitHub API)
 *
 * @param networkConfig - 네트워크 설정
 * @returns Octokit request options에 사용할 agent
 */
export async function createOctokitAgent(
  networkConfig: NetworkConfig | null | undefined
): Promise<{ agent?: HttpAgentType }> {
  const agent = await createHttpAgent(networkConfig);
  return agent ? { agent } : {};
}
