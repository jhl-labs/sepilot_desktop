/**
 * CDP Client Utility
 *
 * Chrome DevTools Protocol 클라이언트 유틸리티
 * 테스트 간 재사용을 위한 공통 CDP 통신 로직
 */

const WebSocket = require('ws');

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.pendingCallbacks = new Map();
  }

  /**
   * CDP 서버에 연결
   * @param {number} timeout - 연결 타임아웃 (ms)
   * @returns {Promise<void>}
   */
  connect(timeout = 5000) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      const timer = setTimeout(
        () => reject(new Error(`CDP connection timeout (${timeout}ms)`)),
        timeout
      );

      this.ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });

      this.ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      this.ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.id !== undefined && this.pendingCallbacks.has(msg.id)) {
            this.pendingCallbacks.get(msg.id)(msg);
            this.pendingCallbacks.delete(msg.id);
          }
        } catch (e) {
          console.error('CDP message parse error:', e);
        }
      });
    });
  }

  /**
   * JavaScript 표현식 평가
   * @param {string} expression - 실행할 JavaScript 코드
   * @param {number} timeout - 실행 타임아웃 (ms)
   * @returns {Promise<any>}
   */
  evaluate(expression, timeout = 15000) {
    return new Promise((resolve, reject) => {
      const id = ++this.msgId;
      const timer = setTimeout(() => {
        this.pendingCallbacks.delete(id);
        reject(new Error(`Timeout evaluating: ${expression.substring(0, 80)}...`));
      }, timeout);

      this.pendingCallbacks.set(id, (msg) => {
        clearTimeout(timer);
        if (msg.result?.exceptionDetails) {
          reject(
            new Error(
              msg.result.exceptionDetails.exception?.description ||
                msg.result.exceptionDetails.text ||
                'Runtime exception'
            )
          );
        } else {
          resolve(msg.result?.result);
        }
      });

      this.ws.send(
        JSON.stringify({
          id,
          method: 'Runtime.evaluate',
          params: {
            expression,
            returnByValue: true,
            awaitPromise: true,
          },
        })
      );
    });
  }

  /**
   * IPC invoke 헬퍼 (window.electronAPI.invoke)
   * @param {string} channel - IPC 채널 이름
   * @param  {...any} args - IPC 인자
   * @returns {Promise<any>}
   */
  async ipcInvoke(channel, ...args) {
    const argsJson = JSON.stringify(args);
    const result = await this.evaluate(`
      (async () => {
        const args = ${argsJson};
        return await window.electronAPI.invoke('${channel}', ...args);
      })()
    `);
    return result.value;
  }

  /**
   * Zustand store 상태 가져오기
   * @param {string} selector - 선택자 함수 (예: 's => s.appMode')
   * @returns {Promise<any>}
   */
  async getStoreState(selector = null) {
    const selectorStr = selector || '(s) => s';
    const result = await this.evaluate(`
      (() => {
        try {
          const storeModule = require('@/lib/store/chat-store');
          if (storeModule && storeModule.useChatStore) {
            const state = storeModule.useChatStore.getState();
            return (${selectorStr})(state);
          }
          return { error: 'store not found' };
        } catch(e) {
          return { error: e.message };
        }
      })()
    `);
    return result.value;
  }

  /**
   * DOM 쿼리 (querySelector)
   * @param {string} selector - CSS 선택자
   * @returns {Promise<boolean>} - 요소 존재 여부
   */
  async querySelector(selector) {
    const result = await this.evaluate(`document.querySelector('${selector}') !== null`);
    return result.value === true;
  }

  /**
   * DOM 쿼리 올 (querySelectorAll)
   * @param {string} selector - CSS 선택자
   * @returns {Promise<number>} - 요소 개수
   */
  async querySelectorAll(selector) {
    const result = await this.evaluate(`document.querySelectorAll('${selector}').length`);
    return result.value || 0;
  }

  /**
   * 대기 헬퍼 (조건이 참이 될 때까지)
   * @param {Function} conditionFn - 조건 함수 (CDP evaluate로 실행됨)
   * @param {number} timeout - 최대 대기 시간 (ms)
   * @param {number} interval - 확인 간격 (ms)
   * @returns {Promise<void>}
   */
  async waitFor(conditionFn, timeout = 10000, interval = 100) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = await this.evaluate(`(${conditionFn.toString()})()`);
      if (result.value === true) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error(`waitFor timeout after ${timeout}ms`);
  }

  /**
   * 연결 종료
   */
  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

module.exports = { CDPClient };
