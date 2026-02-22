/**
 * CDP URL 자동 탐지 유틸리티
 *
 * Electron 앱의 CDP WebSocket URL을 자동으로 찾습니다.
 * CI 환경에서 동적으로 URL을 가져오기 위해 사용합니다.
 */

const http = require('http');

/**
 * CDP JSON endpoint에서 WebSocket URL 가져오기
 * @param {string} host - CDP 호스트 (기본: localhost)
 * @param {number} port - CDP 포트 (기본: 9222)
 * @param {number} timeout - 타임아웃 (ms)
 * @returns {Promise<string>} WebSocket URL
 */
async function getCDPUrl(host = 'localhost', port = 9222, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://${host}:${port}/json/list`, { timeout }, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          // type이 'page'인 첫 번째 타겟 선택
          const pageTarget = targets.find((t) => t.type === 'page');
          if (pageTarget && pageTarget.webSocketDebuggerUrl) {
            resolve(pageTarget.webSocketDebuggerUrl);
          } else {
            reject(new Error('No page target found in CDP targets'));
          }
        } catch (e) {
          reject(new Error(`Failed to parse CDP JSON: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Failed to connect to CDP server: ${err.message}`));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`CDP connection timeout (${timeout}ms)`));
    });
  });
}

/**
 * CDP URL을 환경 변수 또는 자동 탐지로 가져오기
 * @returns {Promise<string>}
 */
async function getCDPUrlFromEnvOrAuto() {
  // 환경 변수 우선
  if (process.env.CDP_WS_URL) {
    return process.env.CDP_WS_URL;
  }

  // 자동 탐지
  try {
    return await getCDPUrl();
  } catch (e) {
    console.error('CDP URL 자동 탐지 실패:', e.message);
    console.error(
      '환경 변수 CDP_WS_URL을 설정하거나 Electron을 --remote-debugging-port=9222로 실행하세요.'
    );
    throw e;
  }
}

module.exports = { getCDPUrl, getCDPUrlFromEnvOrAuto };
