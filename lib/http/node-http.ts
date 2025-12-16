/**
 * HTTP 통신 중앙 집중화 모듈 - Node.js HTTP
 *
 * Node.js 네이티브 http/https 모듈 래퍼
 * - 프록시 지원
 * - SSL 검증 설정
 * - update-checker, presentation-export 등에서 사용
 */

import { NodeHttpOptions, NodeHttpResponse } from './types';
import { getNetworkConfig, detectEnvironment } from './config';
import { createHttpAgent, HttpAgentType } from './agent-factory';
import { logger } from '@/lib/utils/logger';

/**
 * Node.js https.request 래퍼 (프록시/SSL 지원)
 *
 * @param url - 요청 URL
 * @param options - 요청 옵션
 * @returns HTTP 응답
 *
 * @example
 * const response = await httpsRequest('https://api.github.com/repos/owner/repo/releases/latest', {
 *   headers: {
 *     'User-Agent': 'MyApp',
 *     'Accept': 'application/vnd.github.v3+json',
 *   },
 * });
 * console.log(response.body.toString());
 */
export async function httpsRequest(
  url: string,
  options: NodeHttpOptions = {}
): Promise<NodeHttpResponse> {
  const env = detectEnvironment();

  // Node.js 환경에서만 동작
  if (env === 'browser' || env === 'electron-renderer') {
    throw new Error('httpsRequest is only available in Node.js environment');
  }

  const { networkConfig: injectedConfig, body, ...requestOptions } = options;
  const networkConfig = injectedConfig ?? (await getNetworkConfig());

  // Use Function constructor to avoid webpack static analysis
  const importModule = new Function('name', 'return import(name)');
  const https = await importModule('node' + ':https');
  const http = await importModule('node' + ':http');
  const { URL } = await importModule('node' + ':url');

  const parsedUrl = new URL(url);
  const isHttps = parsedUrl.protocol === 'https:';
  const client = isHttps ? https : http;

  const agent = await createHttpAgent(networkConfig, url);

  // 커스텀 헤더 병합
  const mergedHeaders: Record<string, string> = { ...requestOptions.headers };
  if (networkConfig?.customHeaders) {
    Object.entries(networkConfig.customHeaders).forEach(([key, value]) => {
      if (!(key in mergedHeaders)) {
        mergedHeaders[key] = value;
      }
    });
  }

  return new Promise((resolve, reject) => {
    const reqOptions: any = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: requestOptions.method || 'GET',
      headers: mergedHeaders,
      timeout: requestOptions.timeout,
    };

    if (agent) {
      reqOptions.agent = agent as HttpAgentType;
    }

    const req = client.request(reqOptions, (res: any) => {
      const chunks: Buffer[] = [];

      res.on('data', (chunk: Buffer) => chunks.push(chunk));

      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers as Record<string, string | string[] | undefined>,
          body: Buffer.concat(chunks),
        });
      });
    });

    req.on('error', (error: any) => {
      logger.error('[Node HTTP] Request error:', error);
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timeout: ${url}`));
    });

    // 요청 본문 전송
    if (body) {
      req.write(body);
    }

    req.end();
  });
}

/**
 * 간단한 GET 요청
 *
 * @param url - 요청 URL
 * @param options - 요청 옵션
 * @returns 응답 본문 Buffer
 *
 * @example
 * const imageBuffer = await httpsGet('https://example.com/image.png');
 * fs.writeFileSync('image.png', imageBuffer);
 */
export async function httpsGet(url: string, options?: NodeHttpOptions): Promise<Buffer> {
  const result = await httpsRequest(url, { ...options, method: 'GET' });

  if (result.statusCode && result.statusCode >= 400) {
    throw new Error(`HTTP ${result.statusCode}: ${url}`);
  }

  return result.body;
}

/**
 * 간단한 POST 요청
 *
 * @param url - 요청 URL
 * @param body - 요청 본문
 * @param options - 요청 옵션
 * @returns HTTP 응답
 */
export async function httpsPost(
  url: string,
  body: string | Buffer,
  options?: NodeHttpOptions
): Promise<NodeHttpResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  return httpsRequest(url, {
    ...options,
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : body,
  });
}

/**
 * JSON 응답을 파싱하는 GET 요청
 *
 * @param url - 요청 URL
 * @param options - 요청 옵션
 * @returns 파싱된 JSON
 */
export async function httpsGetJson<T>(url: string, options?: NodeHttpOptions): Promise<T> {
  const response = await httpsRequest(url, {
    ...options,
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...options?.headers,
    },
  });

  if (response.statusCode && response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}: ${url}`);
  }

  return JSON.parse(response.body.toString('utf-8'));
}

/**
 * 이미지 다운로드 유틸리티
 *
 * @param url - 이미지 URL
 * @param options - 요청 옵션
 * @returns 이미지 Buffer 및 Content-Type
 */
export async function downloadImage(
  url: string,
  options?: NodeHttpOptions
): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await httpsRequest(url, {
    ...options,
    method: 'GET',
  });

  if (response.statusCode && response.statusCode >= 400) {
    throw new Error(`HTTP ${response.statusCode}: Failed to download image from ${url}`);
  }

  const contentType = (response.headers['content-type'] as string) || 'application/octet-stream';

  return {
    buffer: response.body,
    contentType,
  };
}
