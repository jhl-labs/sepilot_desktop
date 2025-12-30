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

  // 1. Manual Proxy (Highest Priority)
  // 사용자가 직접 입력한 프록시 설정을 최우선으로 적용
  if (
    networkConfig.proxy?.enabled &&
    networkConfig.proxy.mode === 'manual' &&
    networkConfig.proxy.url
  ) {
    logger.debug('[HTTP Agent] Using Manual Proxy (Priority: High)');
    return await createManualProxyAgent(networkConfig.proxy.url, agentOptions);
  }

  // 2. System Proxy
  // 시스템/환경 설정 사용 (ignoreEnvVars가 true이면 환경 변수 무시)
  if (networkConfig.proxy?.enabled && networkConfig.proxy.mode === 'system') {
    if (!networkConfig.proxy.ignoreEnvVars) {
      logger.debug('[HTTP Agent] Using System Proxy (Priority: Medium)');
      return await createSystemProxyAgent(agentOptions);
    }
    // Note: If ignoreEnvVars is true for System Proxy, it effectively behaves like No Proxy
    // regarding Env Vars, though proxy-agent might still read OS registry.
    // However, since we nuke env vars in fetch.ts, proxy-agent will rely on OS settings only.
    // For consistency with "Ignore Env Vars" intent, we still use System Agent but rely on cleared Env.
    logger.debug('[HTTP Agent] Using System Proxy with Env Vars Ignored (Priority: Medium)');
    return await createSystemProxyAgent(agentOptions);
  }

  // 3. No Proxy / Disabled (Lowest Priority)
  // 프록시가 명시적으로 비활성화되었거나, ignoreEnvVars가 설정된 경우
  // 직결(Direct) 연결을 강제하는 에이전트 생성
  if (
    networkConfig.proxy?.ignoreEnvVars ||
    !networkConfig.proxy?.enabled ||
    networkConfig.proxy?.mode === 'none'
  ) {
    logger.debug(
      '[HTTP Agent] Proxy explicitly disabled or ignored. Creating No-Proxy Agent (Priority: Low)'
    );
    return await createNoProxyAgent(agentOptions);
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
 * 프록시를 사용하지 않는 Agent 생성
 * 환경 변수(HTTPS_PROXY, HTTP_PROXY)를 명시적으로 무시
 */
async function createNoProxyAgent(
  agentOptions: Record<string, unknown>
): Promise<HttpAgentType | undefined> {
  try {
    // undici Agent 사용 - 환경 변수를 무시하도록 설정
    // Use dynamic import via new Function to avoid webpack bundling and type errors
    const importModule = new Function('name', 'return import(name)');
    const { Agent } = await importModule('undici');

    // undici Agent 옵션 변환
    const connectOptions: Record<string, unknown> = {};

    // SSL 검증 설정 변환 (rejectUnauthorized는 connect 옵션 내부)
    if (agentOptions.rejectUnauthorized === false) {
      connectOptions.rejectUnauthorized = false;
    }

    // connections.proxy를 빈 객체로 설정하여 환경 변수 프록시 무시
    const noProxyOptions: Record<string, unknown> = {
      connect: connectOptions,
    };

    logger.debug('[HTTP Agent] Creating undici no-proxy agent (ignores env vars)', {
      sslVerify: agentOptions.rejectUnauthorized !== false,
    });
    return new Agent(noProxyOptions);
  } catch (error) {
    logger.warn('[HTTP Agent] Failed to create no-proxy agent:', error);
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
