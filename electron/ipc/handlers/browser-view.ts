import { ipcMain, BrowserWindow, BrowserView } from 'electron';
import { logger } from '../../services/logger';
import { randomUUID } from 'crypto';

interface BrowserTab {
  id: string;
  view: BrowserView;
  url: string;
  title: string;
}

const tabs = new Map<string, BrowserTab>();
let activeTabId: string | null = null;
let mainWindowRef: BrowserWindow | null = null;

function createBrowserView(mainWindow: BrowserWindow, tabId: string): BrowserView {
  const view = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      javascript: true,
      images: true,
      partition: 'persist:browser',
    },
  });

  // Set User-Agent to standard Chrome
  view.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Handle new window/popup requests
  view.webContents.setWindowOpenHandler(({ url }) => {
    logger.info('[BrowserView] Window open request:', url);
    view.webContents.loadURL(url);
    return { action: 'deny' };
  });

  // Handle console messages for debugging
  view.webContents.on('console-message', (_, level, message) => {
    logger.info(`[BrowserView Console] ${message}`);
  });

  // Handle navigation errors
  view.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    if (errorCode !== -3) {
      logger.error(`[BrowserView] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    }
  });

  // Navigation events
  view.webContents.on('did-navigate', (_, url) => {
    const tab = tabs.get(tabId);
    if (tab) {
      tab.url = url;
      mainWindow.webContents.send('browser-view:did-navigate', {
        tabId,
        url,
        canGoBack: view.webContents.canGoBack(),
        canGoForward: view.webContents.canGoForward(),
      });
    }
  });

  view.webContents.on('did-navigate-in-page', (_, url, isMainFrame) => {
    if (isMainFrame) {
      const tab = tabs.get(tabId);
      if (tab) {
        tab.url = url;
        mainWindow.webContents.send('browser-view:did-navigate', {
          tabId,
          url,
          canGoBack: view.webContents.canGoBack(),
          canGoForward: view.webContents.canGoForward(),
        });
      }
    }
  });

  view.webContents.on('did-start-loading', () => {
    mainWindow.webContents.send('browser-view:loading-state', {
      tabId,
      isLoading: true,
    });
  });

  view.webContents.on('did-stop-loading', () => {
    mainWindow.webContents.send('browser-view:loading-state', {
      tabId,
      isLoading: false,
      canGoBack: view.webContents.canGoBack(),
      canGoForward: view.webContents.canGoForward(),
    });
  });

  view.webContents.on('page-title-updated', (_, title) => {
    const tab = tabs.get(tabId);
    if (tab) {
      tab.title = title;
      mainWindow.webContents.send('browser-view:title-updated', {
        tabId,
        title,
      });
    }
  });

  return view;
}

export function setupBrowserViewHandlers() {
  // Create new tab
  ipcMain.handle('browser-view:create-tab', async (event, url?: string) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      mainWindowRef = mainWindow;
      const tabId = randomUUID();
      const defaultUrl = url || 'https://www.google.com';

      const view = createBrowserView(mainWindow, tabId);

      const tab: BrowserTab = {
        id: tabId,
        view,
        url: defaultUrl,
        title: 'New Tab',
      };

      tabs.set(tabId, tab);

      // If this is the first tab, make it active
      if (!activeTabId) {
        activeTabId = tabId;
        mainWindow.addBrowserView(view);
      }

      // Load URL
      await view.webContents.loadURL(defaultUrl);

      logger.info(`Tab created: ${tabId}`);
      return {
        success: true,
        data: {
          tabId,
          url: defaultUrl,
        },
      };
    } catch (error) {
      logger.error('Failed to create tab:', error);
      return { success: false, error: String(error) };
    }
  });

  // Switch to tab
  ipcMain.handle('browser-view:switch-tab', async (event, tabId: string) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      const tab = tabs.get(tabId);
      if (!tab) {
        return { success: false, error: 'Tab not found' };
      }

      // Remove current active view
      if (activeTabId) {
        const currentTab = tabs.get(activeTabId);
        if (currentTab) {
          mainWindow.removeBrowserView(currentTab.view);
        }
      }

      // Add new active view
      mainWindow.addBrowserView(tab.view);
      activeTabId = tabId;

      logger.info(`Switched to tab: ${tabId}`);
      return {
        success: true,
        data: {
          tabId,
          url: tab.url,
          title: tab.title,
          canGoBack: tab.view.webContents.canGoBack(),
          canGoForward: tab.view.webContents.canGoForward(),
        },
      };
    } catch (error) {
      logger.error('Failed to switch tab:', error);
      return { success: false, error: String(error) };
    }
  });

  // Close tab
  ipcMain.handle('browser-view:close-tab', async (event, tabId: string) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      const tab = tabs.get(tabId);
      if (!tab) {
        return { success: false, error: 'Tab not found' };
      }

      // Remove from window if it's active
      if (activeTabId === tabId) {
        mainWindow.removeBrowserView(tab.view);
        activeTabId = null;

        // Switch to another tab if available
        const remainingTabs = Array.from(tabs.values()).filter((t) => t.id !== tabId);
        if (remainingTabs.length > 0) {
          const nextTab = remainingTabs[0];
          mainWindow.addBrowserView(nextTab.view);
          activeTabId = nextTab.id;
        }
      }

      // Clean up
      tabs.delete(tabId);

      logger.info(`Tab closed: ${tabId}`);
      return {
        success: true,
        data: {
          activeTabId,
        },
      };
    } catch (error) {
      logger.error('Failed to close tab:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get all tabs
  ipcMain.handle('browser-view:get-tabs', async () => {
    try {
      const tabList = Array.from(tabs.values()).map((tab) => ({
        id: tab.id,
        url: tab.url,
        title: tab.title,
        isActive: tab.id === activeTabId,
      }));

      return {
        success: true,
        data: {
          tabs: tabList,
          activeTabId,
        },
      };
    } catch (error) {
      logger.error('Failed to get tabs:', error);
      return { success: false, error: String(error) };
    }
  });

  // Navigation - operates on active tab
  ipcMain.handle('browser-view:load-url', async (event, url: string) => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      let validUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        validUrl = 'https://' + url;
      }

      await tab.view.webContents.loadURL(validUrl);
      logger.info('BrowserView loaded URL:', validUrl);
      return { success: true };
    } catch (error) {
      logger.error('Failed to load URL:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('browser-view:go-back', async () => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      if (tab.view.webContents.canGoBack()) {
        tab.view.webContents.goBack();
      }
      return { success: true };
    } catch (error) {
      logger.error('Failed to go back:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('browser-view:go-forward', async () => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      if (tab.view.webContents.canGoForward()) {
        tab.view.webContents.goForward();
      }
      return { success: true };
    } catch (error) {
      logger.error('Failed to go forward:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('browser-view:reload', async () => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      tab.view.webContents.reload();
      return { success: true };
    } catch (error) {
      logger.error('Failed to reload:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('browser-view:set-bounds', async (event, bounds: { x: number; y: number; width: number; height: number }) => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      tab.view.setBounds(bounds);
      return { success: true };
    } catch (error) {
      logger.error('Failed to set bounds:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('browser-view:get-state', async () => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      return {
        success: true,
        data: {
          url: tab.view.webContents.getURL(),
          title: tab.view.webContents.getTitle(),
          canGoBack: tab.view.webContents.canGoBack(),
          canGoForward: tab.view.webContents.canGoForward(),
          isLoading: tab.view.webContents.isLoading(),
        },
      };
    } catch (error) {
      logger.error('Failed to get state:', error);
      return { success: false, error: String(error) };
    }
  });

  ipcMain.handle('browser-view:toggle-devtools', async () => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      if (tab.view.webContents.isDevToolsOpened()) {
        tab.view.webContents.closeDevTools();
      } else {
        tab.view.webContents.openDevTools();
      }
      return { success: true };
    } catch (error) {
      logger.error('Failed to toggle DevTools:', error);
      return { success: false, error: String(error) };
    }
  });
}

// Clean up on app quit
export function cleanupBrowserView() {
  if (mainWindowRef) {
    tabs.forEach((tab) => {
      mainWindowRef!.removeBrowserView(tab.view);
    });
  }
  tabs.clear();
  activeTabId = null;
  mainWindowRef = null;
}
