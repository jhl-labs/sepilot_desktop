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
          const MAX_ELEMENTS = 80;
          let elementIndex = 0;

          function isElementVisible(element) {
            if (!element) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return (
              style.display !== 'none' &&
              style.visibility !== 'hidden' &&
              style.opacity !== '0' &&
              rect.width > 0 &&
              rect.height > 0
            );
          }

          function getAccessibleLabel(element) {
            if (element.getAttribute('aria-label')) return element.getAttribute('aria-label');

            const labelledBy = element.getAttribute('aria-labelledby');
            if (labelledBy) {
              const labelElement = document.getElementById(labelledBy);
              if (labelElement) return labelElement.textContent.trim();
            }

            if (element.id) {
              const label = document.querySelector(\`label[for="\${element.id}"]\`);
              if (label) return label.textContent.trim();
            }

            const parentLabel = element.closest('label');
            if (parentLabel) return parentLabel.textContent.trim();

            if (element.placeholder) return element.placeholder;
            if (element.title) return element.title;
            if (element.alt) return element.alt;

            if (element.tagName === 'INPUT' &&
                (element.type === 'submit' || element.type === 'button') &&
                element.value) {
              return element.value;
            }

            const text = element.textContent?.trim();
            if (text && text.length < 120) return text;

            if (element.name) return element.name;

            return '';
          }

          function getRole(element) {
            if (element.getAttribute('role')) return element.getAttribute('role');
            const tag = element.tagName.toLowerCase();
            switch (tag) {
              case 'button': return 'button';
              case 'a': return element.href ? 'link' : 'generic';
              case 'input':
                const type = element.type?.toLowerCase() || 'text';
                if (['button', 'submit', 'reset'].includes(type)) return 'button';
                if (type === 'checkbox') return 'checkbox';
                if (type === 'radio') return 'radio';
                if (type === 'search') return 'searchbox';
                return 'textbox';
              case 'textarea': return 'textbox';
              case 'select': return 'combobox';
              default: return 'generic';
            }
          }

          function isInteractive(element) {
            const tag = element.tagName.toLowerCase();
            const interactiveTags = ['button', 'a', 'input', 'textarea', 'select'];
            if (interactiveTags.includes(tag)) return true;

            const role = getRole(element);
            const interactiveRoles = ['button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider', 'menuitem', 'tab'];
            if (interactiveRoles.includes(role)) return true;

            if (element.onclick || element.getAttribute('data-action')) return true;

            const style = window.getComputedStyle(element);
            return style.cursor === 'pointer';
          }

          function getContext(element) {
            const parts = [];
            const parent = element.parentElement;
            if (parent) {
              const parentRole = getRole(parent);
              const parentLabel = getAccessibleLabel(parent);
              if (parentRole !== 'generic' || parentLabel) {
                parts.push(\`Parent: \${parentRole} "\${parentLabel?.substring(0, 30) || ''}"\`);
              }
            }

            const siblings = Array.from(element.parentElement?.children || [])
              .filter(el => el !== element && isElementVisible(el))
              .slice(0, 3)
              .map(el => getAccessibleLabel(el).substring(0, 20))
              .filter(Boolean);

            if (siblings.length > 0) {
              parts.push(\`Siblings: \${siblings.join(', ')}\`);
            }

            return parts.join(' | ');
          }

          const elements = [];
          const nodes = document.querySelectorAll('*');

          for (const node of nodes) {
            if (!isElementVisible(node)) continue;
            const role = getRole(node);
            const interactive = isInteractive(node);
            const label = getAccessibleLabel(node);

            if (!interactive && role === 'generic' && !label) continue;

            if (!node.hasAttribute('data-ai-id')) {
              node.setAttribute('data-ai-id', 'ai-element-' + elementIndex++);
            }

            const rect = node.getBoundingClientRect();

            elements.push({
              id: node.getAttribute('data-ai-id'),
              tag: node.tagName.toLowerCase(),
              type: node.type || null,
              text: (node.textContent || '').trim().substring(0, 100),
              placeholder: node.placeholder || null,
              value: node.value || null,
              href: node.href || null,
              role,
              ariaLabel: node.getAttribute('aria-label') || null,
              label,
              context: getContext(node),
              isInteractive: interactive,
              position: {
                x: Math.round(rect.left),
                y: Math.round(rect.top),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            });

            if (elements.length >= MAX_ELEMENTS) break;
          }

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
          const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
            .slice(0, 20)
            .map(h => ({
              level: parseInt(h.tagName.charAt(1)),
              text: h.textContent.trim().substring(0, 120)
            }));

          const sections = Array.from(document.querySelectorAll('main, article, section, nav, aside'))
            .map(section => ({
              tag: section.tagName.toLowerCase(),
              role: section.getAttribute('role') || null,
            }));

          const mainArea = document.querySelector('main, article, [role="main"]') || document.body;
          const fullText = (document.body?.innerText || '').substring(0, 15000);
          const mainText = (mainArea?.innerText || '').substring(0, 5000);

          return {
            title: document.title,
            url: window.location.href,
            text: fullText,
            mainText,
            headings,
            sections,
            interactiveSummary: {
              buttons: document.querySelectorAll('button, [role="button"]').length,
              inputs: document.querySelectorAll('input, textarea').length,
              links: document.querySelectorAll('a[href]').length,
            },
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
          const element = document.querySelector('[data-ai-id=' + ${JSON.stringify(elementId)} + ']');
          if (!element) {
            return { success: false, error: 'Element not found: ' + ${JSON.stringify(elementId)} };
          }

          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          if (rect.width === 0 || rect.height === 0 || style.display === 'none' || style.visibility === 'hidden') {
            return { success: false, error: 'Element is not visible or has no size.' };
          }

          if (element.disabled) {
            return { success: false, error: 'Element is disabled.' };
          }

          try {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const performClick = () => {
              const event = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
              element.dispatchEvent(event);
            };

            setTimeout(performClick, 60);

            return { success: true, element: {
              tag: element.tagName.toLowerCase(),
              text: element.textContent?.trim().substring(0, 100) || element.value || '',
              href: element.href || null
            }};
          } catch (err) {
            return { success: false, error: err?.message || 'Click failed' };
          }
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
          const element = document.querySelector('[data-ai-id=' + ${JSON.stringify(elementId)} + ']');
          if (!element) {
            return { success: false, error: 'Element not found: ' + ${JSON.stringify(elementId)} };
          }

          const tag = element.tagName.toLowerCase();
          if (tag !== 'input' && tag !== 'textarea') {
            return { success: false, error: 'Element is not an input field.' };
          }

          if (element.disabled) {
            return { success: false, error: 'Input field is disabled.' };
          }

          if (element.readOnly) {
            return { success: false, error: 'Input field is read-only.' };
          }

          try {
            element.focus();
            element.value = '';
            element.value = ${JSON.stringify(text)};
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));

            return {
              success: true,
              element: {
                tag,
                label: element.placeholder || element.name || '',
                value: element.value.substring(0, 80)
              }
            };
          } catch (err) {
            return { success: false, error: err?.message || 'Type failed' };
          }
        })();
      `);

      if (!result.success) {
        return result;
      }

      logger.info(`[Browser Control] Typed text into element: ${elementId}`);
      return { success: true, data: result };
    } catch (error) {
      logger.error('[Browser Control] Failed to type text:', error);
      return { success: false, error: String(error) };
    }
  });

  /**
   * 스크롤
   */
  ipcMain.handle(
    'browser-control:scroll',
    async (event, direction: 'up' | 'down', amount?: number) => {
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
    }
  );

  /**
   * 요소 대기 (특정 selector가 나타날 때까지)
   */
  ipcMain.handle(
    'browser-control:wait-for-element',
    async (event, selector: string, timeout?: number) => {
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
    }
  );

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
