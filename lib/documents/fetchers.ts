/* eslint-disable no-undef */
import { DocumentSource, FetchedDocument } from './types';
import { httpFetch } from '@/lib/http';
import type { NetworkConfig } from '@/types';

/**
 * 지수 백오프로 대기
 */
async function exponentialBackoff(attempt: number, baseDelay: number = 1000): Promise<void> {
  const delay = baseDelay * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // 0-1초 랜덤 지터
  await new Promise((resolve) => setTimeout(resolve, delay + jitter));
}

/**
 * GitHub API Rate Limit 확인 및 대기
 */
async function checkGitHubRateLimit(headers: Headers): Promise<void> {
  const remaining = headers.get('x-ratelimit-remaining');
  const reset = headers.get('x-ratelimit-reset');

  if (remaining && parseInt(remaining) === 0 && reset) {
    const resetTime = parseInt(reset) * 1000; // milliseconds
    const now = Date.now();
    const waitTime = resetTime - now;

    if (waitTime > 0) {
      console.warn(
        `[GitHub] Rate limit exceeded. Waiting ${Math.ceil(waitTime / 1000)}s until reset...`
      );
      await new Promise((resolve) => setTimeout(resolve, waitTime + 1000)); // +1초 버퍼
    }
  }
}

/**
 * GitHub API 요청 (재시도 로직 포함)
 */
async function fetchWithRetry(
  url: string,
  headers: Record<string, string>,
  maxRetries: number = 3,
  networkConfig?: NetworkConfig | null
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await httpFetch(url, {
        headers,
        networkConfig: networkConfig ?? undefined,
        timeout: 30000,
      });

      // Rate Limit 체크
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 60000; // 기본 1분

        console.warn(
          `[GitHub] Rate limit hit (429). Retrying after ${waitTime / 1000}s... (attempt ${attempt + 1}/${maxRetries})`
        );

        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, waitTime));
          continue;
        }
      }

      // Rate Limit 정보 확인 (다음 요청 대비)
      await checkGitHubRateLimit(response.headers);

      return response;
    } catch (error: any) {
      lastError = error;
      console.error(`[GitHub] Fetch attempt ${attempt + 1} failed:`, error.message);

      if (attempt < maxRetries - 1) {
        await exponentialBackoff(attempt);
      }
    }
  }

  throw new Error(
    `GitHub API request failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
  );
}

/**
 * HTTP를 통해 문서를 가져옵니다
 */
export async function fetchHttpDocument(
  url: string,
  networkConfig?: NetworkConfig | null
): Promise<FetchedDocument> {
  try {
    const response = await httpFetch(url, {
      networkConfig: networkConfig ?? undefined,
      timeout: 60000,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';
    let content: string;

    // Content-Type에 따라 처리
    if (contentType.includes('application/json')) {
      const data = await response.json();
      content = JSON.stringify(data, null, 2);
    } else {
      content = await response.text();
    }

    // URL에서 파일명 추출
    const urlObj = new URL(url);
    const filename = urlObj.pathname.split('/').pop() || 'Untitled';

    return {
      content,
      metadata: {
        source: 'http',
        url,
        title: filename,
        contentType,
        uploadedAt: Date.now(),
      },
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch HTTP document: ${error.message}`);
  }
}

/**
 * GitHub API를 통해 파일 내용을 가져옵니다
 */
export async function fetchGitHubDocument(
  repoUrl: string,
  path: string,
  token?: string,
  branch: string = 'main',
  networkConfig?: NetworkConfig | null
): Promise<FetchedDocument> {
  try {
    // GitHub repo URL에서 owner와 repo 추출
    // 예: https://github.com/owner/repo -> owner/repo
    const repoMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!repoMatch) {
      throw new Error('Invalid GitHub repository URL');
    }

    const owner = repoMatch[1];
    const repo = repoMatch[2].replace(/\.git$/, ''); // .git 제거

    // GitHub API endpoint
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithRetry(apiUrl, headers, 3, networkConfig);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('File not found in repository');
      } else if (response.status === 403) {
        throw new Error('Access denied. Please check your GitHub token.');
      } else if (response.status === 429) {
        throw new Error(
          'GitHub rate limit exceeded. Please try again later or provide a GitHub token.'
        );
      }
      throw new Error(`GitHub API error! status: ${response.status}`);
    }

    const data = await response.json();

    // GitHub API는 파일 내용을 base64로 인코딩하여 반환
    if (data.type !== 'file') {
      throw new Error('Path must point to a file, not a directory');
    }

    const content = atob(data.content.replace(/\n/g, ''));

    const filename = path.split('/').pop() || 'Untitled';

    return {
      content,
      metadata: {
        source: 'github',
        repoUrl,
        path,
        branch,
        title: filename,
        sha: data.sha,
        uploadedAt: Date.now(),
      },
    };
  } catch (error: any) {
    throw new Error(`Failed to fetch GitHub document: ${error.message}`);
  }
}

/**
 * GitHub 디렉토리의 모든 파일을 재귀적으로 가져옵니다
 */
export async function fetchGitHubDirectory(
  repoUrl: string,
  path: string,
  token?: string,
  branch: string = 'main',
  fileExtensions: string[] = ['.md', '.txt', '.json', '.yaml', '.yml'],
  networkConfig?: NetworkConfig | null
): Promise<FetchedDocument[]> {
  try {
    const repoMatch = repoUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!repoMatch) {
      throw new Error('Invalid GitHub repository URL');
    }

    const owner = repoMatch[1];
    const repo = repoMatch[2].replace(/\.git$/, '');

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithRetry(apiUrl, headers, 3, networkConfig);

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error(
          'GitHub rate limit exceeded. Please try again later or provide a GitHub token.'
        );
      }
      throw new Error(`GitHub API error! status: ${response.status}`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error('Path must point to a directory');
    }

    const documents: FetchedDocument[] = [];

    for (const item of data) {
      if (item.type === 'file') {
        // 파일 확장자 필터링
        const hasValidExtension = fileExtensions.some((ext) =>
          item.name.toLowerCase().endsWith(ext)
        );

        if (hasValidExtension) {
          try {
            const doc = await fetchGitHubDocument(repoUrl, item.path, token, branch, networkConfig);
            documents.push(doc);
          } catch (error) {
            console.error(`Failed to fetch ${item.path}:`, error);
          }
        }
      } else if (item.type === 'dir') {
        // 재귀적으로 디렉토리 탐색
        try {
          const subDocs = await fetchGitHubDirectory(
            repoUrl,
            item.path,
            token,
            branch,
            fileExtensions,
            networkConfig
          );
          documents.push(...subDocs);
        } catch (error) {
          console.error(`Failed to fetch directory ${item.path}:`, error);
        }
      }
    }

    return documents;
  } catch (error: any) {
    throw new Error(`Failed to fetch GitHub directory: ${error.message}`);
  }
}

/**
 * 문서 소스에 따라 적절한 fetcher를 호출합니다
 */
export async function fetchDocument(
  source: DocumentSource,
  networkConfig?: NetworkConfig | null
): Promise<FetchedDocument[]> {
  switch (source.type) {
    case 'http':
      if (!source.url) {
        throw new Error('URL is required for HTTP documents');
      }
      return [await fetchHttpDocument(source.url, networkConfig)];

    case 'github': {
      if (!source.repoUrl || !source.path) {
        throw new Error('Repository URL and path are required for GitHub documents');
      }

      // path가 디렉토리인지 파일인지 판단하기 위해 확장자 확인
      const hasExtension = /\.[a-z0-9]+$/i.test(source.path);

      if (hasExtension) {
        // 단일 파일
        return [
          await fetchGitHubDocument(
            source.repoUrl,
            source.path,
            source.token,
            source.branch || 'main',
            networkConfig
          ),
        ];
      } else {
        // 디렉토리
        return await fetchGitHubDirectory(
          source.repoUrl,
          source.path,
          source.token,
          source.branch || 'main',
          undefined, // fileExtensions - use default
          networkConfig
        );
      }
    }

    case 'manual':
      throw new Error('Manual documents should be handled separately');

    default:
      throw new Error(`Unknown document source type: ${source.type}`);
  }
}
