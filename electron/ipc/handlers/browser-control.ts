import { ipcMain, BrowserView } from 'electron';
import { logger } from '../../services/logger';

/**
 * Browser Control IPC Handlers
 * AI Agent가 BrowserView를 제어할 수 있는 도구들
 */

// Active BrowserView 참조 (browser-view.ts에서 공유)
let activeBrowserView: BrowserView | null = null;

export function setActiveBrowserView(view: BrowserView | null) {
  activeBrowserView = view;
}

export function getActiveBrowserView(): BrowserView | null {
  return activeBrowserView;
}

export function setupBrowserControlHandlers() {
  /**
   * 페이지의 interactive elements 추출
   * 클릭/입력 가능한 모든 요소들을 식별
   */
  ipcMain.handle('browser-control:get-interactive-elements', async () => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      // 페이지에서 interactive elements 추출하는 JavaScript 실행
      const elements = await activeBrowserView.webContents.executeJavaScript(`
        (function() {
          const interactiveSelectors = [
            'a[href]',
            'button',
            'input',
            'textarea',
            'select',
            '[role="button"]',
            '[role="link"]',
            '[role="textbox"]',
            '[onclick]',
            '[tabindex]'
          ];

          const elements = [];
          const selector = interactiveSelectors.join(', ');
          const nodes = document.querySelectorAll(selector);

          nodes.forEach((node, index) => {
            const rect = node.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 &&
                            window.getComputedStyle(node).visibility !== 'hidden' &&
                            window.getComputedStyle(node).display !== 'none';

            if (isVisible) {
              // Unique identifier 생성
              if (!node.hasAttribute('data-ai-id')) {
                node.setAttribute('data-ai-id', 'ai-element-' + index);
              }

              elements.push({
                id: node.getAttribute('data-ai-id'),
                tag: node.tagName.toLowerCase(),
                type: node.type || null,
                text: (node.textContent || '').trim().substring(0, 100),
                placeholder: node.placeholder || null,
                value: node.value || null,
                href: node.href || null,
                role: node.getAttribute('role') || null,
                ariaLabel: node.getAttribute('aria-label') || null,
                position: {
                  x: Math.round(rect.left),
                  y: Math.round(rect.top),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                }
              });
            }
          });

          return elements;
        })();
      `);

      logger.info(`[Browser Control] Found ${elements.length} interactive elements`);
      return { success: true, data: { elements } };
    } catch (error) {
      logger.error('[Browser Control] Failed to get interactive elements:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 페이지 텍스트 콘텐츠 추출
   */
  ipcMain.handle('browser-control:get-page-content', async () => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      const content = await activeBrowserView.webContents.executeJavaScript(`
        (function() {
          return {
            title: document.title,
            url: window.location.href,
            text: document.body.innerText,
            html: document.documentElement.outerHTML.substring(0, 50000) // 50KB limit
          };
        })();
      `);

      return { success: true, data: content };
    } catch (error) {
      logger.error('[Browser Control] Failed to get page content:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스크린샷 캡처
   */
  ipcMain.handle('browser-control:capture-screenshot', async () => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      const image = await activeBrowserView.webContents.capturePage();
      const dataUrl = image.toDataURL();

      return { success: true, data: { image: dataUrl } };
    } catch (error) {
      logger.error('[Browser Control] Failed to capture screenshot:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 요소 클릭
   */
  ipcMain.handle('browser-control:click-element', async (event, elementId: string) => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      const result = await activeBrowserView.webContents.executeJavaScript(`
        (function() {
          const element = document.querySelector('[data-ai-id="${elementId}"]');
          if (!element) {
            return { success: false, error: 'Element not found: ${elementId}' };
          }

          // Scroll into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Click
          element.click();

          return { success: true, element: {
            tag: element.tagName,
            text: element.textContent?.substring(0, 100)
          }};
        })();
      `);

      if (!result.success) {
        return result;
      }

      logger.info(`[Browser Control] Clicked element: ${elementId}`);
      return { success: true, data: result };
    } catch (error) {
      logger.error('[Browser Control] Failed to click element:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 텍스트 입력
   */
  ipcMain.handle('browser-control:type-text', async (event, elementId: string, text: string) => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      const result = await activeBrowserView.webContents.executeJavaScript(`
        (function() {
          const element = document.querySelector('[data-ai-id="${elementId}"]');
          if (!element) {
            return { success: false, error: 'Element not found: ${elementId}' };
          }

          // Focus and type
          element.focus();
          element.value = ${JSON.stringify(text)};

          // Trigger input event
          element.dispatchEvent(new Event('input', { bubbles: true }));
          element.dispatchEvent(new Event('change', { bubbles: true }));

          return { success: true };
        })();
      `);

      if (!result.success) {
        return result;
      }

      logger.info(`[Browser Control] Typed text into element: ${elementId}`);
      return { success: true };
    } catch (error) {
      logger.error('[Browser Control] Failed to type text:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스크롤
   */
  ipcMain.handle('browser-control:scroll', async (event, direction: 'up' | 'down', amount?: number) => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      const scrollAmount = amount || 500;
      const scrollY = direction === 'down' ? scrollAmount : -scrollAmount;

      await activeBrowserView.webContents.executeJavaScript(`
        window.scrollBy({ top: ${scrollY}, behavior: 'smooth' });
      `);

      logger.info(`[Browser Control] Scrolled ${direction} by ${scrollAmount}px`);
      return { success: true };
    } catch (error) {
      logger.error('[Browser Control] Failed to scroll:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 요소 대기 (특정 selector가 나타날 때까지)
   */
  ipcMain.handle('browser-control:wait-for-element', async (event, selector: string, timeout?: number) => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      const waitTimeout = timeout || 5000;

      const result = await activeBrowserView.webContents.executeJavaScript(`
        (function() {
          return new Promise((resolve) => {
            const startTime = Date.now();
            const checkElement = () => {
              const element = document.querySelector(${JSON.stringify(selector)});
              if (element) {
                resolve({ success: true, found: true });
              } else if (Date.now() - startTime > ${waitTimeout}) {
                resolve({ success: false, error: 'Timeout waiting for element' });
              } else {
                setTimeout(checkElement, 100);
              }
            };
            checkElement();
          });
        })();
      `);

      return result;
    } catch (error) {
      logger.error('[Browser Control] Failed to wait for element:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * JavaScript 실행
   */
  ipcMain.handle('browser-control:execute-script', async (event, script: string) => {
    try {
      if (!activeBrowserView) {
        return { success: false, error: 'No active browser view' };
      }

      const result = await activeBrowserView.webContents.executeJavaScript(script);

      logger.info('[Browser Control] Executed custom script');
      return { success: true, data: result };
    } catch (error) {
      logger.error('[Browser Control] Failed to execute script:', error);
      return { success: false, error: String(error) };
    }
  });
}
