import { ipcMain, BrowserWindow, BrowserView, app, nativeImage } from 'electron';
import { logger } from '../../services/logger';
import { randomUUID } from 'crypto';
import { setActiveBrowserView } from './browser-control';
import * as fs from 'fs/promises';
import * as path from 'path';

interface BrowserTab {
  id: string;
  view: BrowserView;
  url: string;
  title: string;
}

interface Snapshot {
  id: string;
  url: string;
  title: string;
  thumbnail: string; // path to thumbnail image
  createdAt: number;
  screenshotPath: string; // path to full screenshot
  mhtmlPath: string; // path to MHTML file
}

interface Bookmark {
  id: string;
  url: string;
  title: string;
  folderId?: string;
  createdAt: number;
}

interface BookmarkFolder {
  id: string;
  name: string;
  createdAt: number;
}

const tabs = new Map<string, BrowserTab>();
let activeTabId: string | null = null;
let mainWindowRef: BrowserWindow | null = null;

// Snapshots directory
function getSnapshotsDir() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'snapshots');
}

function getSnapshotsMetaPath() {
  return path.join(getSnapshotsDir(), 'snapshots.json');
}

// Bookmarks directory
function getBookmarksDir() {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'bookmarks');
}

function getBookmarksMetaPath() {
  return path.join(getBookmarksDir(), 'bookmarks.json');
}

function getFoldersMetaPath() {
  return path.join(getBookmarksDir(), 'folders.json');
}

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
      // Enable more permissive settings for better compatibility
      experimentalFeatures: true,
      navigateOnDragDrop: false,
    },
  });

  // Set User-Agent to standard Chrome
  view.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  // Handle new window/popup requests - open in new tab
  view.webContents.setWindowOpenHandler(({ url, frameName, features }) => {
    logger.info('[BrowserView] ===== WINDOW OPEN HANDLER CALLED =====');
    logger.info('[BrowserView] URL:', url);
    logger.info('[BrowserView] Frame name:', frameName);
    logger.info('[BrowserView] Features:', features);

    // Create new tab for popup
    const newTabId = randomUUID();
    const newView = createBrowserView(mainWindow, newTabId);

    const newTab: BrowserTab = {
      id: newTabId,
      view: newView,
      url,
      title: 'Loading...',
    };

    tabs.set(newTabId, newTab);

    // Switch to new tab
    if (activeTabId) {
      const currentTab = tabs.get(activeTabId);
      if (currentTab) {
        mainWindow.removeBrowserView(currentTab.view);
      }
    }

    mainWindow.addBrowserView(newView);
    activeTabId = newTabId;
    setActiveBrowserView(newView); // For browser control

    // Load popup URL in new tab
    newView.webContents.loadURL(url).catch((error) => {
      logger.error('[BrowserView] Failed to load popup URL:', error);
    });

    // Notify renderer about new tab
    mainWindow.webContents.send('browser-view:tab-created', {
      tabId: newTabId,
      url,
    });

    return { action: 'deny' };
  });

  // Debug: Track navigation attempts
  view.webContents.on('will-navigate', (event, url) => {
    logger.info('[BrowserView] will-navigate:', url);
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
        setActiveBrowserView(view); // For browser control
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
      setActiveBrowserView(tab.view); // For browser control

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
          setActiveBrowserView(nextTab.view); // For browser control
        } else {
          setActiveBrowserView(null); // No tabs left
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

  // Hide all BrowserViews (when switching away from Browser mode)
  ipcMain.handle('browser-view:hide-all', async (event) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      logger.info(`[BrowserView] Hiding all BrowserViews (total: ${tabs.size})`);

      // 1. Move all BrowserViews off-screen first (for extra safety)
      tabs.forEach((tab) => {
        try {
          tab.view.setBounds({ x: -10000, y: -10000, width: 0, height: 0 });
        } catch (err) {
          logger.error('[BrowserView] Failed to move view off-screen:', err);
        }
      });

      // 2. Remove all BrowserViews from window
      tabs.forEach((tab) => {
        try {
          mainWindow.removeBrowserView(tab.view);
          logger.info('[BrowserView] Removed BrowserView:', tab.id);
        } catch (err) {
          logger.error('[BrowserView] Failed to remove view:', err);
        }
      });

      logger.info('[BrowserView] All BrowserViews hidden successfully');
      return { success: true };
    } catch (error) {
      logger.error('[BrowserView] Failed to hide BrowserViews:', error);
      return { success: false, error: String(error) };
    }
  });

  // Show active BrowserView (when switching back to Browser mode)
  ipcMain.handle('browser-view:show-active', async (event) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      if (!activeTabId) {
        logger.warn('[BrowserView] No active tab to show');
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        logger.error('[BrowserView] Active tab not found:', activeTabId);
        return { success: false, error: 'Active tab not found' };
      }

      logger.info('[BrowserView] Showing active BrowserView:', activeTabId);

      // Add active BrowserView back to window
      mainWindow.addBrowserView(tab.view);
      setActiveBrowserView(tab.view);

      logger.info('[BrowserView] Active BrowserView shown successfully:', activeTabId);
      return { success: true };
    } catch (error) {
      logger.error('[BrowserView] Failed to show active BrowserView:', error);
      return { success: false, error: String(error) };
    }
  });

  // Capture current page as snapshot
  ipcMain.handle('browser-view:capture-page', async () => {
    try {
      if (!activeTabId) {
        return { success: false, error: 'No active tab' };
      }

      const tab = tabs.get(activeTabId);
      if (!tab) {
        return { success: false, error: 'Active tab not found' };
      }

      // Ensure snapshots directory exists
      const snapshotsDir = getSnapshotsDir();
      await fs.mkdir(snapshotsDir, { recursive: true });

      // Generate snapshot ID
      const snapshotId = randomUUID();
      const timestamp = Date.now();

      // Capture screenshot
      const image = await tab.view.webContents.capturePage();
      const screenshotBuffer = image.toPNG();
      const screenshotPath = path.join(snapshotsDir, `${snapshotId}.png`);
      await fs.writeFile(screenshotPath, screenshotBuffer);

      // Create thumbnail (resize to 400x300)
      const thumbnail = image.resize({ width: 400, height: 300 });
      const thumbnailBuffer = thumbnail.toPNG();
      const thumbnailPath = path.join(snapshotsDir, `${snapshotId}_thumb.png`);
      await fs.writeFile(thumbnailPath, thumbnailBuffer);

      // Save page as MHTML
      const mhtmlPath = path.join(snapshotsDir, `${snapshotId}.mhtml`);
      await tab.view.webContents.savePage(mhtmlPath, 'MHTML');

      // Get page info
      const url = tab.view.webContents.getURL();
      const title = tab.view.webContents.getTitle() || 'Untitled';

      // Create snapshot metadata
      const snapshot: Snapshot = {
        id: snapshotId,
        url,
        title,
        thumbnail: thumbnailPath,
        createdAt: timestamp,
        screenshotPath,
        mhtmlPath,
      };

      // Load existing snapshots
      let snapshots: Snapshot[] = [];
      try {
        const metaPath = getSnapshotsMetaPath();
        const data = await fs.readFile(metaPath, 'utf-8');
        snapshots = JSON.parse(data);
      } catch (error) {
        // File doesn't exist yet, start with empty array
        logger.info('[Snapshot] Creating new snapshots metadata file');
      }

      // Add new snapshot
      snapshots.unshift(snapshot); // Add to beginning

      // Save updated metadata
      await fs.writeFile(getSnapshotsMetaPath(), JSON.stringify(snapshots, null, 2));

      logger.info(`Snapshot created: ${snapshotId}`);
      return {
        success: true,
        data: snapshot,
      };
    } catch (error) {
      logger.error('Failed to capture page:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get all snapshots
  ipcMain.handle('browser-view:get-snapshots', async () => {
    try {
      const metaPath = getSnapshotsMetaPath();

      try {
        const data = await fs.readFile(metaPath, 'utf-8');
        const snapshots: Snapshot[] = JSON.parse(data);

        // Convert file paths to sepilot-file:// protocol URLs
        // Windows paths need to be converted: C:\path -> C:/path
        // Protocol format: sepilot-file:///C:/path or sepilot-file:///home/path
        const snapshotsWithProtocol = snapshots.map((snapshot) => ({
          ...snapshot,
          thumbnail: `sepilot-file:///${snapshot.thumbnail.replace(/\\/g, '/')}`,
          screenshotPath: `sepilot-file:///${snapshot.screenshotPath.replace(/\\/g, '/')}`,
          mhtmlPath: snapshot.mhtmlPath ? `sepilot-file:///${snapshot.mhtmlPath.replace(/\\/g, '/')}` : '',
        }));

        return {
          success: true,
          data: snapshotsWithProtocol,
        };
      } catch (error) {
        // File doesn't exist, return empty array
        return {
          success: true,
          data: [],
        };
      }
    } catch (error) {
      logger.error('Failed to get snapshots:', error);
      return { success: false, error: String(error) };
    }
  });

  // Delete snapshot
  ipcMain.handle('browser-view:delete-snapshot', async (event, snapshotId: string) => {
    try {
      const metaPath = getSnapshotsMetaPath();

      // Load snapshots
      const data = await fs.readFile(metaPath, 'utf-8');
      let snapshots: Snapshot[] = JSON.parse(data);

      // Find snapshot to delete
      const snapshot = snapshots.find((s) => s.id === snapshotId);
      if (!snapshot) {
        return { success: false, error: 'Snapshot not found' };
      }

      // Delete files
      try {
        await fs.unlink(snapshot.screenshotPath);
      } catch (error) {
        logger.warn('Failed to delete screenshot:', error);
      }

      try {
        await fs.unlink(snapshot.thumbnail);
      } catch (error) {
        logger.warn('Failed to delete thumbnail:', error);
      }

      if (snapshot.mhtmlPath) {
        try {
          await fs.unlink(snapshot.mhtmlPath);
        } catch (error) {
          logger.warn('Failed to delete MHTML:', error);
        }
      }

      // Remove from metadata
      snapshots = snapshots.filter((s) => s.id !== snapshotId);
      await fs.writeFile(metaPath, JSON.stringify(snapshots, null, 2));

      logger.info(`Snapshot deleted: ${snapshotId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete snapshot:', error);
      return { success: false, error: String(error) };
    }
  });

  // Open snapshot in new tab
  ipcMain.handle('browser-view:open-snapshot', async (event, snapshotId: string) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      const metaPath = getSnapshotsMetaPath();
      const data = await fs.readFile(metaPath, 'utf-8');
      const snapshots: Snapshot[] = JSON.parse(data);

      const snapshot = snapshots.find((s) => s.id === snapshotId);
      if (!snapshot) {
        return { success: false, error: 'Snapshot not found' };
      }

      // Check if MHTML file exists
      if (!snapshot.mhtmlPath) {
        return { success: false, error: 'MHTML file not found in snapshot metadata' };
      }

      try {
        await fs.access(snapshot.mhtmlPath);
      } catch (error) {
        logger.error(`MHTML file not found: ${snapshot.mhtmlPath}`);
        return { success: false, error: 'MHTML file not found on disk' };
      }

      // Always create a new tab for snapshots
      const tabId = randomUUID();
      const view = createBrowserView(mainWindow, tabId);

      const tab: BrowserTab = {
        id: tabId,
        view,
        url: `snapshot://${snapshotId}`,
        title: `${snapshot.title} - Snapshot`,
      };

      tabs.set(tabId, tab);
      activeTabId = tabId;
      mainWindow.addBrowserView(view);
      setActiveBrowserView(view);

      // Load MHTML file
      await view.webContents.loadFile(snapshot.mhtmlPath);

      // Notify renderer to update tabs
      mainWindow.webContents.send('browser-view:tab-created', {
        id: tabId,
        url: tab.url,
        title: tab.title,
      });

      logger.info(`Snapshot opened: ${snapshotId} (MHTML: ${snapshot.mhtmlPath})`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to open snapshot:', error);
      return { success: false, error: String(error) };
    }
  });

  // ===== Bookmarks Management =====

  // Add bookmark (current page or specific URL)
  ipcMain.handle('browser-view:add-bookmark', async (event, options?: { url?: string; title?: string; folderId?: string }) => {
    try {
      // Ensure bookmarks directory exists
      const bookmarksDir = getBookmarksDir();
      await fs.mkdir(bookmarksDir, { recursive: true });

      // Get current page info if not provided
      let url = options?.url;
      let title = options?.title;

      if (!url && activeTabId) {
        const tab = tabs.get(activeTabId);
        if (tab) {
          url = tab.view.webContents.getURL();
          title = title || tab.view.webContents.getTitle() || 'Untitled';
        }
      }

      if (!url) {
        return { success: false, error: 'No URL provided and no active tab' };
      }

      // Create bookmark
      const bookmark: Bookmark = {
        id: randomUUID(),
        url,
        title: title || 'Untitled',
        folderId: options?.folderId,
        createdAt: Date.now(),
      };

      // Load existing bookmarks
      let bookmarks: Bookmark[] = [];
      try {
        const data = await fs.readFile(getBookmarksMetaPath(), 'utf-8');
        bookmarks = JSON.parse(data);
      } catch (error) {
        logger.info('[Bookmark] Creating new bookmarks file');
      }

      // Add new bookmark
      bookmarks.push(bookmark);

      // Save updated bookmarks
      await fs.writeFile(getBookmarksMetaPath(), JSON.stringify(bookmarks, null, 2));

      logger.info(`Bookmark added: ${bookmark.id}`);
      return {
        success: true,
        data: bookmark,
      };
    } catch (error) {
      logger.error('Failed to add bookmark:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get all bookmarks
  ipcMain.handle('browser-view:get-bookmarks', async () => {
    try {
      const metaPath = getBookmarksMetaPath();

      try {
        const data = await fs.readFile(metaPath, 'utf-8');
        const bookmarks: Bookmark[] = JSON.parse(data);
        return {
          success: true,
          data: bookmarks,
        };
      } catch (error) {
        return {
          success: true,
          data: [],
        };
      }
    } catch (error) {
      logger.error('Failed to get bookmarks:', error);
      return { success: false, error: String(error) };
    }
  });

  // Delete bookmark
  ipcMain.handle('browser-view:delete-bookmark', async (event, bookmarkId: string) => {
    try {
      const metaPath = getBookmarksMetaPath();
      const data = await fs.readFile(metaPath, 'utf-8');
      let bookmarks: Bookmark[] = JSON.parse(data);

      bookmarks = bookmarks.filter((b) => b.id !== bookmarkId);
      await fs.writeFile(metaPath, JSON.stringify(bookmarks, null, 2));

      logger.info(`Bookmark deleted: ${bookmarkId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete bookmark:', error);
      return { success: false, error: String(error) };
    }
  });

  // Add bookmark folder
  ipcMain.handle('browser-view:add-bookmark-folder', async (event, name: string) => {
    try {
      const bookmarksDir = getBookmarksDir();
      await fs.mkdir(bookmarksDir, { recursive: true });

      const folder: BookmarkFolder = {
        id: randomUUID(),
        name,
        createdAt: Date.now(),
      };

      // Load existing folders
      let folders: BookmarkFolder[] = [];
      try {
        const data = await fs.readFile(getFoldersMetaPath(), 'utf-8');
        folders = JSON.parse(data);
      } catch (error) {
        logger.info('[Bookmark] Creating new folders file');
      }

      // Add new folder
      folders.push(folder);

      // Save updated folders
      await fs.writeFile(getFoldersMetaPath(), JSON.stringify(folders, null, 2));

      logger.info(`Bookmark folder added: ${folder.id}`);
      return {
        success: true,
        data: folder,
      };
    } catch (error) {
      logger.error('Failed to add bookmark folder:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get all bookmark folders
  ipcMain.handle('browser-view:get-bookmark-folders', async () => {
    try {
      const metaPath = getFoldersMetaPath();

      try {
        const data = await fs.readFile(metaPath, 'utf-8');
        const folders: BookmarkFolder[] = JSON.parse(data);
        return {
          success: true,
          data: folders,
        };
      } catch (error) {
        return {
          success: true,
          data: [],
        };
      }
    } catch (error) {
      logger.error('Failed to get bookmark folders:', error);
      return { success: false, error: String(error) };
    }
  });

  // Delete bookmark folder and all bookmarks in it
  ipcMain.handle('browser-view:delete-bookmark-folder', async (event, folderId: string) => {
    try {
      // Delete folder
      const foldersPath = getFoldersMetaPath();
      const foldersData = await fs.readFile(foldersPath, 'utf-8');
      let folders: BookmarkFolder[] = JSON.parse(foldersData);
      folders = folders.filter((f) => f.id !== folderId);
      await fs.writeFile(foldersPath, JSON.stringify(folders, null, 2));

      // Delete bookmarks in folder
      const bookmarksPath = getBookmarksMetaPath();
      const bookmarksData = await fs.readFile(bookmarksPath, 'utf-8');
      let bookmarks: Bookmark[] = JSON.parse(bookmarksData);
      bookmarks = bookmarks.filter((b) => b.folderId !== folderId);
      await fs.writeFile(bookmarksPath, JSON.stringify(bookmarks, null, 2));

      logger.info(`Bookmark folder deleted: ${folderId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to delete bookmark folder:', error);
      return { success: false, error: String(error) };
    }
  });

  // Open bookmark
  ipcMain.handle('browser-view:open-bookmark', async (event, bookmarkId: string) => {
    try {
      const mainWindow = BrowserWindow.fromWebContents(event.sender);
      if (!mainWindow) {
        return { success: false, error: 'Main window not found' };
      }

      const metaPath = getBookmarksMetaPath();
      const data = await fs.readFile(metaPath, 'utf-8');
      const bookmarks: Bookmark[] = JSON.parse(data);

      const bookmark = bookmarks.find((b) => b.id === bookmarkId);
      if (!bookmark) {
        return { success: false, error: 'Bookmark not found' };
      }

      // Load the URL in active tab or create new tab
      if (!activeTabId) {
        const tabId = randomUUID();
        const view = createBrowserView(mainWindow, tabId);

        const tab: BrowserTab = {
          id: tabId,
          view,
          url: bookmark.url,
          title: bookmark.title,
        };

        tabs.set(tabId, tab);
        activeTabId = tabId;
        mainWindow.addBrowserView(view);
        setActiveBrowserView(view);

        await view.webContents.loadURL(bookmark.url);
      } else {
        const tab = tabs.get(activeTabId);
        if (tab) {
          await tab.view.webContents.loadURL(bookmark.url);
        }
      }

      logger.info(`Bookmark opened: ${bookmarkId}`);
      return { success: true };
    } catch (error) {
      logger.error('Failed to open bookmark:', error);
      return { success: false, error: String(error) };
    }
  });

  // Get browser settings (paths)
  ipcMain.handle('browser-view:get-browser-settings', async () => {
    try {
      const snapshotsPath = getSnapshotsDir();
      const bookmarksPath = getBookmarksDir();

      return {
        success: true,
        data: {
          snapshotsPath,
          bookmarksPath,
        },
      };
    } catch (error) {
      logger.error('Failed to get browser settings:', error);
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

/**
 * Export functions for direct access from built-in tools
 */
export async function browserCreateTab(url?: string) {
  if (!mainWindowRef) {
    return { success: false, error: 'No active window' };
  }

  try {
    const tabId = randomUUID();
    const defaultUrl = url || 'https://www.google.com';

    const view = createBrowserView(mainWindowRef, tabId);

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
      mainWindowRef.addBrowserView(view);
      setActiveBrowserView(view); // For browser control
    }

    // Load URL
    await view.webContents.loadURL(defaultUrl);

    logger.info(`Tab created via built-in tool: ${tabId}`);
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
}

export async function browserSwitchTab(tabId: string) {
  if (!mainWindowRef) {
    return { success: false, error: 'No active window' };
  }

  try {
    const tab = tabs.get(tabId);
    if (!tab) {
      return { success: false, error: 'Tab not found' };
    }

    // Hide current tab
    if (activeTabId) {
      const currentTab = tabs.get(activeTabId);
      if (currentTab) {
        mainWindowRef.removeBrowserView(currentTab.view);
      }
    }

    // Show new tab
    mainWindowRef.addBrowserView(tab.view);
    setActiveBrowserView(tab.view); // For browser control
    activeTabId = tabId;

    logger.info(`Switched to tab via built-in tool: ${tabId}`);
    return {
      success: true,
      data: {
        tabId,
        url: tab.url,
        canGoBack: tab.view.webContents.canGoBack(),
        canGoForward: tab.view.webContents.canGoForward(),
      },
    };
  } catch (error) {
    logger.error('Failed to switch tab:', error);
    return { success: false, error: String(error) };
  }
}

export async function browserCloseTab(tabId: string) {
  if (!mainWindowRef) {
    return { success: false, error: 'No active window' };
  }

  try {
    const tab = tabs.get(tabId);
    if (!tab) {
      return { success: false, error: 'Tab not found' };
    }

    // Don't close if it's the only tab
    if (tabs.size === 1) {
      return { success: false, error: 'Cannot close the last tab' };
    }

    // If closing active tab, switch to another tab
    if (activeTabId === tabId) {
      const otherTabId = Array.from(tabs.keys()).find((id) => id !== tabId);
      if (otherTabId) {
        await browserSwitchTab(otherTabId);
      }
    }

    // Remove and destroy
    mainWindowRef.removeBrowserView(tab.view);
    // Destroy webContents (cast to any as destroy is not in types)
    if (tab.view.webContents && !tab.view.webContents.isDestroyed()) {
      (tab.view.webContents as any).destroy();
    }
    tabs.delete(tabId);

    logger.info(`Tab closed via built-in tool: ${tabId}`);
    return { success: true };
  } catch (error) {
    logger.error('Failed to close tab:', error);
    return { success: false, error: String(error) };
  }
}

export function browserGetTabs() {
  try {
    const tabsArray = Array.from(tabs.entries()).map(([id, tab]) => ({
      id,
      url: tab.url,
      title: tab.title,
      isActive: id === activeTabId,
    }));

    return {
      success: true,
      data: {
        tabs: tabsArray,
        activeTabId,
      },
    };
  } catch (error) {
    logger.error('Failed to get tabs:', error);
    return { success: false, error: String(error) };
  }
}
