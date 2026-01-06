import { logger } from '@/lib/utils/logger';
/**
 * Google Search Handlers
 *
 * Google 검색 도구의 실제 구현
 * BrowserView를 제어하여 Google 검색을 수행하고 결과를 파싱합니다.
 */

import { getActiveBrowserView } from '../../../electron/ipc/handlers/browser-control';
import {
  getCurrentActiveTabId,
  getMainWindow,
  getTabs,
  createTabInternal,
  switchTabInternal,
  closeTabInternal,
} from '../../../electron/ipc/handlers/browser-view';
import type {
  GoogleSearchOptions,
  GoogleSearchResultItem,
  GoogleExtractResultsOptions,
  GoogleVisitResultOptions,
} from '@/extensions/browser/types';

/**
 * 자연스러운 지연 (bot 감지 방지)
 * Perplexity-level 속도: 100-300ms (기존 500-1500ms에서 5배 빠름)
 */
async function naturalDelay(minMs = 100, maxMs = 300) {
  const delay = Math.random() * (maxMs - minMs) + minMs;
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Google 검색 URL 생성
 */
function buildGoogleSearchURL(options: GoogleSearchOptions): string {
  const params = new URLSearchParams();

  // 기본 검색어
  let searchQuery = options.query;

  // 고급 검색 연산자 추가
  if (options.exactPhrase) {
    searchQuery += ` "${options.exactPhrase}"`;
  }

  if (options.orWords && options.orWords.length > 0) {
    searchQuery += ` (${options.orWords.join(' OR ')})`;
  }

  if (options.excludeWords && options.excludeWords.length > 0) {
    options.excludeWords.forEach((word) => {
      searchQuery += ` -${word}`;
    });
  }

  if (options.site) {
    searchQuery += ` site:${options.site}`;
  }

  if (options.fileType) {
    searchQuery += ` filetype:${options.fileType}`;
  }

  params.append('q', searchQuery);

  // 검색 타입에 따른 URL
  let baseURL = 'https://www.google.com';
  switch (options.type) {
    case 'news':
      baseURL += '/search';
      params.append('tbm', 'nws');
      break;
    case 'scholar':
      baseURL = 'https://scholar.google.com/scholar';
      break;
    case 'images':
      baseURL += '/search';
      params.append('tbm', 'isch');
      break;
    case 'videos':
      baseURL += '/search';
      params.append('tbm', 'vid');
      break;
    case 'shopping':
      baseURL += '/search';
      params.append('tbm', 'shop');
      break;
    case 'books':
      baseURL += '/search';
      params.append('tbm', 'bks');
      break;
    default:
      baseURL += '/search';
  }

  // 날짜 필터
  if (options.dateFilter && options.dateFilter !== 'anytime') {
    const dateRangeMap: Record<string, string> = {
      hour: 'qdr:h',
      day: 'qdr:d',
      week: 'qdr:w',
      month: 'qdr:m',
      year: 'qdr:y',
    };

    if (dateRangeMap[options.dateFilter]) {
      params.append('tbs', dateRangeMap[options.dateFilter]);
    } else if (options.dateFilter === 'custom' && options.dateStart && options.dateEnd) {
      // Custom date range: cdr:1,cd_min:MM/DD/YYYY,cd_max:MM/DD/YYYY
      const startDate = new Date(options.dateStart);
      const endDate = new Date(options.dateEnd);
      params.append(
        'tbs',
        `cdr:1,cd_min:${startDate.getMonth() + 1}/${startDate.getDate()}/${startDate.getFullYear()},cd_max:${endDate.getMonth() + 1}/${endDate.getDate()}/${endDate.getFullYear()}`
      );
    }
  }

  // 언어
  if (options.language) {
    params.append('lr', `lang_${options.language}`);
  }

  // 지역
  if (options.region) {
    params.append('gl', options.region.toLowerCase());
  }

  // 정렬 방식 (Scholar)
  if (options.sortBy === 'date' && options.type === 'scholar') {
    params.append('scisbd', '1');
  }

  // 결과 개수
  if (options.maxResults) {
    params.append('num', Math.min(options.maxResults, 100).toString());
  }

  // 안전 검색
  if (options.safeSearch) {
    const safeSearchMap: Record<string, string> = {
      off: '0',
      moderate: '1',
      strict: '2',
    };
    params.append('safe', safeSearchMap[options.safeSearch] || '1');
  }

  return `${baseURL}?${params.toString()}`;
}

/**
 * Google 검색 수행
 */
export async function handleGoogleSearch(options: GoogleSearchOptions): Promise<string> {
  try {
    const browserView = getActiveBrowserView();
    if (!browserView) {
      throw new Error('No active browser view');
    }

    // 기본값 설정
    const searchOptions: GoogleSearchOptions = {
      ...options,
      type: options.type || 'web',
      dateFilter: options.dateFilter || 'anytime',
      maxResults: options.maxResults || 10,
      safeSearch: options.safeSearch || 'moderate',
    };

    // Google 검색 URL 생성
    const searchURL = buildGoogleSearchURL(searchOptions);

    // 현재 URL 확인
    const currentURL = browserView.webContents.getURL();

    // Google 홈페이지가 아니면 먼저 방문 (쿠키 및 세션 설정)
    // 단, 타임아웃을 짧게 설정하여 빠르게 실패하도록 함
    if (!currentURL.includes('google.com')) {
      logger.warn('[GoogleSearch] Visiting Google homepage first to establish session...');

      try {
        await browserView.webContents.loadURL('https://www.google.com');

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            logger.warn(
              '[GoogleSearch] Homepage load timeout (5s) - skipping and going directly to search'
            );
            reject(new Error('Homepage load timeout (5s)'));
          }, 5000); // 5초로 단축 - 빠르게 실패하고 검색으로 진행

          const cleanup = () => {
            clearTimeout(timeout);
            browserView.webContents.off('did-finish-load', onFinish);
            browserView.webContents.off('did-fail-load', onFail);
          };

          const onFinish = () => {
            logger.info('[GoogleSearch] Homepage loaded successfully');
            cleanup();
            resolve();
          };

          const onFail = (_event: unknown, errorCode: number, errorDescription: string) => {
            logger.warn(
              `[GoogleSearch] Homepage load failed (${errorCode}): ${errorDescription} - proceeding to search`
            );
            cleanup();
            // Homepage 실패는 무시하고 계속 진행
            resolve();
          };

          browserView.webContents.once('did-finish-load', onFinish);
          browserView.webContents.once('did-fail-load', onFail);
        });

        // 홈페이지 로딩 후 짧은 대기
        await naturalDelay(500, 1000);
      } catch {
        // 홈페이지 로드 실패 시에도 검색은 시도 (에러 로그만 출력)
        logger.warn('[GoogleSearch] Homepage load timed out, continuing with direct search');
        // 타임아웃 시 대기 없이 바로 진행
      }
    } else {
      logger.info('[GoogleSearch] Already on Google, skipping homepage visit');
    }

    // 자연스러운 지연 추가 (bot 감지 방지)
    await naturalDelay(500, 1000);

    logger.warn('[GoogleSearch] Navigating to search URL:', searchURL);

    // 검색 페이지로 이동 (추가 헤더 포함)
    await browserView.webContents.loadURL(searchURL, {
      extraHeaders: [
        'Accept-Language: en-US,en;q=0.9,ko;q=0.8',
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Referer: https://www.google.com/',
        'Sec-Fetch-Dest: document',
        'Sec-Fetch-Mode: navigate',
        'Sec-Fetch-Site: same-origin',
        'Upgrade-Insecure-Requests: 1',
      ].join('\n'),
    });

    // 페이지 로딩 완료 대기 (에러 핸들링 포함)
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          logger.warn('[GoogleSearch] Page load timeout (30s) - attempting to continue anyway');
          // 타임아웃이지만 페이지가 부분적으로 로드되었을 수 있으므로 계속 진행
          reject(new Error('Page load timeout (30s)'));
        }, 30000);

        const cleanup = () => {
          clearTimeout(timeout);
          browserView.webContents.off('did-finish-load', onFinish);
          browserView.webContents.off('did-fail-load', onFail);
        };

        const onFinish = () => {
          cleanup();
          resolve();
        };

        const onFail = (
          _event: unknown,
          errorCode: number,
          errorDescription: string,
          _validatedURL: string
        ) => {
          logger.warn(`[GoogleSearch] Page load failed (${errorCode}): ${errorDescription}`);
          cleanup();
          reject(
            new Error(
              `페이지 로드 실패 (ERR ${errorCode}): ${errorDescription}. Google이 요청을 차단했을 수 있습니다.`
            )
          );
        };

        browserView.webContents.once('did-finish-load', onFinish);
        browserView.webContents.once('did-fail-load', onFail);
      });
    } catch (loadError) {
      // 타임아웃 또는 로드 실패 시
      logger.warn('[GoogleSearch] Load error, checking page state:', loadError);

      // 페이지가 부분적으로라도 로드되었는지 확인
      try {
        const currentURL = browserView.webContents.getURL();
        const title = browserView.webContents.getTitle();

        // Google 페이지에 있고 제목이 있으면 부분 성공으로 간주
        if (currentURL.includes('google.com') && title) {
          logger.warn(
            '[GoogleSearch] Partial page load detected, continuing with available content'
          );
          // 부분 로드 성공 - 계속 진행
        } else {
          // 완전 실패
          throw new Error(
            `Google 검색 페이지 로드 실패. CAPTCHA가 표시되었거나 Google이 요청을 차단했을 수 있습니다.\n\n해결 방법:\n1. Browser 탭을 직접 열어서 CAPTCHA를 해결하세요\n2. 잠시 후 다시 시도하세요\n3. 다른 검색 방법을 사용하세요 (browser_navigate로 직접 이동)`
          );
        }
      } catch {
        throw new Error(
          `Google 검색 실패: ${loadError instanceof Error ? loadError.message : String(loadError)}`
        );
      }
    }

    // 자연스러운 추가 대기 (JavaScript 실행 + 사람처럼 보이기)
    await naturalDelay(800, 1500);

    const result = `Google 검색이 완료되었습니다.
검색어: ${searchOptions.query}
검색 타입: ${searchOptions.type}
URL: ${searchURL}

다음 도구를 사용하여 결과를 추출하세요:
- google_extract_results: 검색 결과 목록 추출
- google_get_related_searches: 관련 검색어 확인
- google_visit_result: 특정 결과 방문`;

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[GoogleSearch] Error:', error);
    throw new Error(`Google 검색 실패: ${message}`);
  }
}

/**
 * Google 검색 결과 추출
 */
export async function handleGoogleExtractResults(
  options: GoogleExtractResultsOptions = {}
): Promise<string> {
  try {
    const browserView = getActiveBrowserView();
    if (!browserView) {
      throw new Error('No active browser view');
    }

    const maxResults = options.maxResults || 10;

    // 자연스러운 지연 (bot 감지 방지)
    await naturalDelay(400, 900);

    // 검색 결과 파싱을 위한 스크립트 실행
    const results: GoogleSearchResultItem[] = await browserView.webContents.executeJavaScript(`
      (function() {
        const results = [];
        const maxResults = ${maxResults};

        // Google 검색 결과 선택자 (여러 버전 시도)
        let resultElements = document.querySelectorAll('div.MjjYud, div.g, div[data-sokoban-container], div[jscontroller]');

        // Fallback: h3를 포함한 div 찾기
        if (resultElements.length === 0) {
          const allDivs = document.querySelectorAll('div');
          const divsWithH3 = Array.from(allDivs).filter(div => {
            const h3 = div.querySelector('h3');
            const link = div.querySelector('a[href]');
            return h3 && link && link.getAttribute('href')?.startsWith('http');
          });
          resultElements = divsWithH3;
        }

        let rank = 1;
        for (const el of resultElements) {
          if (rank > maxResults) break;

          // 제목 추출
          const titleEl = el.querySelector('h3');
          if (!titleEl) continue;

          const title = titleEl.textContent?.trim() || '';
          if (!title) continue;

          // URL 추출
          const linkEl = el.querySelector('a[href]');
          if (!linkEl) continue;

          const url = linkEl.getAttribute('href') || '';
          if (!url.startsWith('http')) continue;
          if (url.includes('google.com/search') || url.includes('google.com/url')) continue;

          // 표시 URL 추출
          const citeEl = el.querySelector('cite');
          const displayUrl = citeEl ? citeEl.textContent?.trim() || url : url;

          // 스니펫 추출 (여러 선택자 시도)
          let snippet = '';
          const snippetSelectors = ['[data-sncf]', '[style*="line-height"]', 'div[data-content-feature]', 'div.VwiC3b', 'div.yDYNvb', 'span.aCOpRe'];
          for (const selector of snippetSelectors) {
            const snippetEl = el.querySelector(selector);
            if (snippetEl) {
              snippet = snippetEl.textContent?.trim() || '';
              if (snippet) break;
            }
          }

          // 날짜 정보 (뉴스 등)
          const dateEl = el.querySelector('span[data-ttu], span.f, span.LEwnzc');
          const date = dateEl ? dateEl.textContent?.trim() || undefined : undefined;

          // 출처 정보 (뉴스 등)
          const sourceEl = el.querySelector('[data-st-cnt], span.source');
          const source = sourceEl ? sourceEl.textContent?.trim() || undefined : undefined;

          results.push({
            rank: rank++,
            title,
            url,
            displayUrl,
            snippet,
            date,
            source,
          });
        }

        return results;
      })();
    `);

    if (results.length === 0) {
      return '검색 결과를 찾을 수 없습니다. 페이지가 제대로 로드되었는지 확인하세요.';
    }

    // 결과 포맷팅
    let output = `Google 검색 결과 (총 ${results.length}개):\n\n`;

    for (const result of results) {
      output += `[${result.rank}] ${result.title}\n`;
      output += `    URL: ${result.url}\n`;
      if (result.snippet) {
        output += `    설명: ${result.snippet}\n`;
      }
      if (result.date) {
        output += `    날짜: ${result.date}\n`;
      }
      if (result.source) {
        output += `    출처: ${result.source}\n`;
      }
      output += '\n';
    }

    output += `\n다음 단계:
- google_visit_result: 특정 순위의 페이지 방문 (예: { rank: 1 })
- google_next_page: 다음 페이지의 결과 확인`;

    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[GoogleExtractResults] Error:', error);
    throw new Error(`검색 결과 추출 실패: ${message}`);
  }
}

/**
 * Google 관련 검색어 추출
 */
export async function handleGoogleGetRelatedSearches(): Promise<string> {
  try {
    const browserView = getActiveBrowserView();
    if (!browserView) {
      throw new Error('No active browser view');
    }

    const relatedSearches: string[] = await browserView.webContents.executeJavaScript(`
      (function() {
        const searches = [];

        // "연관 검색어" 섹션 찾기
        const relatedElements = document.querySelectorAll('[data-hveid] a[href*="/search"]');

        for (const el of relatedElements) {
          const text = el.textContent?.trim();
          if (text && !searches.includes(text)) {
            searches.push(text);
          }
        }

        return searches;
      })();
    `);

    if (relatedSearches.length === 0) {
      return '관련 검색어를 찾을 수 없습니다.';
    }

    let output = `Google 관련 검색어 (${relatedSearches.length}개):\n\n`;
    relatedSearches.forEach((search, index) => {
      output += `${index + 1}. ${search}\n`;
    });

    output += `\n이 검색어들로 새로운 검색을 수행할 수 있습니다.
예: google_search({ query: "${relatedSearches[0]}" })`;

    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[GoogleGetRelatedSearches] Error:', error);
    throw new Error(`관련 검색어 추출 실패: ${message}`);
  }
}

/**
 * Google 검색 결과 방문
 */
/**
 * Google 검색 결과 방문 (NEW - 탭 기반 + Perplexity-level 속도)
 *
 * 새 탭에서 열어 검색 페이지 유지 + 5배 빠른 속도
 */
export async function handleGoogleVisitResult(options: GoogleVisitResultOptions): Promise<string> {
  const startTime = Date.now();
  let newTabId: string | null = null;
  const originalTabId = getCurrentActiveTabId();

  try {
    const mainWindow = getMainWindow();
    if (!mainWindow) {
      throw new Error('Main window not found');
    }

    const { rank, extractType = 'summary', maxWaitTime = 5, waitForJs = false } = options;

    // 빠른 지연 (Perplexity-level: 100-300ms)
    await naturalDelay();

    // 현재 검색 페이지에서 URL 추출
    const browserView = getActiveBrowserView();
    if (!browserView) {
      throw new Error('No active browser view');
    }

    const linkData = await browserView.webContents.executeJavaScript(`
      (function() {
        let resultElements = document.querySelectorAll('div.MjjYud, div.g, div[data-sokoban-container], div[jscontroller]');

        if (resultElements.length === 0) {
          const allDivs = document.querySelectorAll('div');
          const divsWithH3 = Array.from(allDivs).filter(div => {
            const h3 = div.querySelector('h3');
            const link = div.querySelector('a[href]');
            return h3 && link && link.getAttribute('href')?.startsWith('http');
          });
          resultElements = divsWithH3;
        }

        const validResults = Array.from(resultElements).filter(el => {
          const linkEl = el.querySelector('a[href]');
          if (!linkEl) return false;
          const url = linkEl.getAttribute('href') || '';
          return url.startsWith('http') && !url.includes('google.com/search') && !url.includes('google.com/url');
        });

        if (${rank} > validResults.length) {
          return { success: false, error: '해당 순위의 검색 결과가 없습니다. (총 ' + validResults.length + '개)' };
        }

        const targetResult = validResults[${rank - 1}];
        const linkEl = targetResult.querySelector('a[href]');

        if (!linkEl) return { success: false, error: '링크를 찾을 수 없습니다.' };

        return {
          success: true,
          url: linkEl.getAttribute('href'),
          title: targetResult.querySelector('h3')?.textContent?.trim() || 'No title'
        };
      })();
    `);

    if (!linkData.success) {
      throw new Error(linkData.error);
    }

    logger.info(`[GoogleVisitResult] Opening rank ${rank} in new tab: ${linkData.url}`);

    // 🚀 새 탭 생성 (빠르게)
    newTabId = createTabInternal(mainWindow, linkData.url);
    const newTab = getTabs().get(newTabId);
    if (!newTab) {
      throw new Error('Failed to create new tab');
    }

    // 페이지 로드 (DOM-ready만 대기, 리소스 로딩 X)
    await newTab.view.webContents.loadURL(linkData.url);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        logger.warn(`[GoogleVisitResult] Timeout after ${maxWaitTime}s - using partial content`);
        resolve(); // 타임아웃이어도 부분 콘텐츠 사용
      }, maxWaitTime * 1000);

      const cleanup = () => {
        clearTimeout(timeout);
        newTab.view.webContents.off('dom-ready', onReady);
        newTab.view.webContents.off('did-fail-load', onFail);
      };

      const onReady = () => {
        cleanup();
        resolve();
      };

      const onFail = (_e: unknown, code: number, desc: string) => {
        cleanup();
        reject(new Error(`Load failed (${code}): ${desc}`));
      };

      newTab.view.webContents.once('dom-ready', onReady);
      newTab.view.webContents.once('did-fail-load', onFail);
    });

    // 빠른 JS 대기 (500ms, 기존 1500ms에서 3배 빠름)
    if (waitForJs) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // 빠른 콘텐츠 추출
    let content = '';
    const finalUrl = newTab.view.webContents.getURL();

    if (extractType === 'summary') {
      content = await newTab.view.webContents.executeJavaScript(`
        (function() {
          const paragraphs = Array.from(document.querySelectorAll('p, article p, main p'))
            .map(p => p.textContent?.trim())
            .filter(t => t && t.length > 30)
            .slice(0, 8);
          return paragraphs.join('\\n\\n');
        })();
      `);
    } else {
      content = await newTab.view.webContents.executeJavaScript(`
        document.body.innerText || document.body.textContent || ''
      `);
    }

    // 빠른 메타데이터 추출 (병렬 처리)
    const [title, description] = await Promise.all([
      newTab.view.webContents.getTitle(),
      newTab.view.webContents.executeJavaScript(`
        document.querySelector('meta[name="description"], meta[property="og:description"]')?.getAttribute('content') || ''
      `),
    ]);

    // 콘텐츠 길이 제한
    const maxLength = 5000;
    if (content.length > maxLength) {
      content = `${content.substring(0, maxLength)}\n\n... (내용이 잘렸습니다)`;
    }

    const elapsedMs = Date.now() - startTime;
    logger.info(`[GoogleVisitResult] ✅ Completed in ${elapsedMs}ms (Perplexity-level!)`);

    let output = `✅ 페이지 방문 완료 (${(elapsedMs / 1000).toFixed(1)}초)\n\n`;
    output += `제목: ${title}\n`;
    output += `URL: ${finalUrl}\n`;
    if (description) {
      output += `설명: ${description}\n`;
    }
    output += `\n━━━━━━━━━━━━━━━━━━━━\n콘텐츠:\n\n${content}`;

    return output;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[GoogleVisitResult] Error:', error);
    throw new Error(`검색 결과 방문 실패: ${message}`);
  } finally {
    // 🔄 항상 탭 정리 및 원래 탭으로 복귀
    if (newTabId) {
      try {
        const mainWindow = getMainWindow();
        if (mainWindow) {
          closeTabInternal(mainWindow, newTabId);
          if (originalTabId) {
            switchTabInternal(mainWindow, originalTabId);
          }
        }
      } catch (cleanupError) {
        logger.error('[GoogleVisitResult] Cleanup error:', cleanupError);
      }
    }
  }
}

/**
 * Google 검색 다음 페이지
 */
export async function handleGoogleNextPage(): Promise<string> {
  try {
    const browserView = getActiveBrowserView();
    if (!browserView) {
      throw new Error('No active browser view');
    }

    // "다음" 버튼 찾기 및 클릭
    const clickResult = await browserView.webContents.executeJavaScript(`
      (function() {
        // "다음" 버튼 찾기
        const nextButton = document.querySelector('a#pnnext, a[aria-label*="Next"], a[aria-label*="다음"]');

        if (!nextButton) {
          return { success: false, error: '다음 페이지가 없습니다.' };
        }

        const href = nextButton.getAttribute('href');
        nextButton.click();

        return { success: true, href };
      })();
    `);

    if (!clickResult.success) {
      throw new Error(clickResult.error);
    }

    // 페이지 로딩 완료 대기
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 2000);
    });

    return `다음 페이지로 이동했습니다.

이제 google_extract_results를 사용하여 새로운 검색 결과를 확인하세요.`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[GoogleNextPage] Error:', error);
    throw new Error(`다음 페이지 이동 실패: ${message}`);
  }
}
