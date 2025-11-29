import { ipcMain, BrowserWindow, BrowserView } from 'electron';
import { logger } from '../../services/logger';

let browserView: BrowserView | null = null;

export function setupBrowserViewHandlers() {
  // BrowserView 생성
  ipcMain.handle('browser-view:create', async (event) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      // 기존 BrowserView가 있으면 제거
      if (browserView) {
        mainWindow.removeBrowserView(browserView);
        // @ts-ignore - BrowserView는 자동으로 정리됨
        browserView = null;
      }

      // 새 BrowserView 생성
      browserView = new BrowserView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false, // Disable sandbox to allow proper resource loading
          // Allow loading external resources (CSS, JS, images)
          webSecurity: false,
          // Allow running insecure content
          allowRunningInsecureContent: true,
          // Enable web APIs
          javascript: true,
          images: true,
          // Session partition for isolation
          partition: 'persist:browser',
        },
      });

      // Set User-Agent to standard Chrome to avoid detection
      browserView.webContents.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Handle new window/popup requests - load in the same BrowserView instead of opening new window
      browserView.webContents.setWindowOpenHandler(({ url }) => {
        logger.info('[BrowserView] Window open request:', url);
        // Load the URL in the current BrowserView instead of opening new window
        browserView?.webContents.loadURL(url);
        return { action: 'deny' }; // Deny opening new window
      });

      // Handle console messages for debugging
      browserView.webContents.on('console-message', (_, level, message) => {
        logger.info(`[BrowserView Console] ${message}`);
      });

      // Handle navigation errors
      browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        if (errorCode !== -3) { // -3 is ERR_ABORTED which is normal for user navigation
          logger.error(`[BrowserView] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
        }
      });

      mainWindow.addBrowserView(browserView);

      // BrowserView 이벤트 리스너
      browserView.webContents.on('did-navigate', (_, url) => {
        mainWindow.webContents.send('browser-view:did-navigate', {
          url,
          canGoBack: browserView?.webContents.canGoBack() || false,
          canGoForward: browserView?.webContents.canGoForward() || false,
        });
      });

      browserView.webContents.on('did-navigate-in-page', (_, url, isMainFrame) => {
        if (isMainFrame) {
          mainWindow.webContents.send('browser-view:did-navigate', {
            url,
            canGoBack: browserView?.webContents.canGoBack() || false,
            canGoForward: browserView?.webContents.canGoForward() || false,
          });
        }
      });

      browserView.webContents.on('did-start-loading', () => {
        mainWindow.webContents.send('browser-view:loading-state', { isLoading: true });
      });

      browserView.webContents.on('did-stop-loading', () => {
        mainWindow.webContents.send('browser-view:loading-state', {
          isLoading: false,
          canGoBack: browserView?.webContents.canGoBack() || false,
          canGoForward: browserView?.webContents.canGoForward() || false,
        });
      });

      browserView.webContents.on('page-title-updated', (_, title) => {
        mainWindow.webContents.send('browser-view:title-updated', { title });
      });

      logger.info('BrowserView created successfully');
      return { success: true };
    } catch (error) {
      logger.error('Failed to create BrowserView:', error);
      return { success: false, error: String(error) };
    }
  });

  // BrowserView 제거
  ipcMain.handle('browser-view:destroy', async (event) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow || !browserView) {
        return { success: true };
      }

      mainWindow.removeBrowserView(browserView);
      browserView = null;

      logger.info('BrowserView destroyed successfully');
      return { success: true };
    } catch (error) {
      logger.error('Failed to destroy BrowserView:', error);
      return { success: false, error: String(error) };
    }
  });

  // URL 로드
  ipcMain.handle('browser-view:load-url', async (event, url: string) => {
    try {
      if (!browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      // Ensure URL has protocol
      let validUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        validUrl = 'https://' + url;
      }

      await browserView.webContents.loadURL(validUrl);
      logger.info('BrowserView loaded URL:', validUrl);
      return { success: true };
    } catch (error) {
      logger.error('Failed to load URL:', error);
      return { success: false, error: String(error) };
    }
  });

  // 뒤로 가기
  ipcMain.handle('browser-view:go-back', async () => {
    try {
      if (!browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      if (browserView.webContents.canGoBack()) {
        browserView.webContents.goBack();
      }
      return { success: true };
    } catch (error) {
      logger.error('Failed to go back:', error);
      return { success: false, error: String(error) };
    }
  });

  // 앞으로 가기
  ipcMain.handle('browser-view:go-forward', async () => {
    try {
      if (!browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      if (browserView.webContents.canGoForward()) {
        browserView.webContents.goForward();
      }
      return { success: true };
    } catch (error) {
      logger.error('Failed to go forward:', error);
      return { success: false, error: String(error) };
    }
  });

  // 새로고침
  ipcMain.handle('browser-view:reload', async () => {
    try {
      if (!browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      browserView.webContents.reload();
      return { success: true };
    } catch (error) {
      logger.error('Failed to reload:', error);
      return { success: false, error: String(error) };
    }
  });

  // 위치 및 크기 설정
  ipcMain.handle('browser-view:set-bounds', async (event, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      if (!browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      browserView.setBounds(bounds);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set bounds:', error);
      return { success: false, error: String(error) };
    }
  });

  // 표시/숨김
  ipcMain.handle('browser-view:set-visible', async (event, visible: boolean) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow || !browserView) {
        return { success: false, error: 'Main window or BrowserView not found' };
      }

      if (visible) {
        mainWindow.addBrowserView(browserView);
      } else {
        mainWindow.removeBrowserView(browserView);
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to set visibility:', error);
      return { success: false, error: String(error) };
    }
  });

  // 현재 상태 가져오기
  ipcMain.handle('browser-view:get-state', async () => {
    try {
      if (!browserView) {
        return { success: false, error: 'BrowserView not created' };
      }

      return {
        success: true,
        data: {
          url: browserView.webContents.getURL(),
          title: browserView.webContents.getTitle(),
          canGoBack: browserView.webContents.canGoBack(),
          canGoForward: browserView.webContents.canGoForward(),
          isLoading: browserView.webContents.isLoading(),
        },
      };
    } catch (error) {
      logger.error('Failed to get state:', error);
      return { success: false, error: String(error) };
    }
  });
}

// Clean up on app quit
export function cleanupBrowserView() {
  if (browserView) {
    browserView = null;
  }
}
