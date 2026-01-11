import { BrowserWindow, screen, ipcMain, app } from 'electron';
import path from 'path';
import { logger } from './logger';

const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 400; // Increased height for rich content (images/html)
const PADDING = 16;
const AUTO_HIDE_DELAY = 5000;

export class NotificationWindowManager {
  private static instance: NotificationWindowManager;
  private window: BrowserWindow | null = null;
  private hideTimeout: NodeJS.Timeout | null = null;

  private constructor() {
    this.createWindow();
  }

  public static getInstance(): NotificationWindowManager {
    if (!NotificationWindowManager.instance) {
      NotificationWindowManager.instance = new NotificationWindowManager();
    }
    return NotificationWindowManager.instance;
  }

  private pendingNotification: any = null;
  private isLoaded = false;
  private mainWindowRef: BrowserWindow | null = null;

  public setMainWindow(window: BrowserWindow) {
    this.mainWindowRef = window;
  }

  private createWindow() {
    const isDev = !app.isPackaged;

    this.window = new BrowserWindow({
      width: WINDOW_WIDTH,
      height: WINDOW_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false, // Don't take focus when shown
      backgroundColor: '#00000000', // Ensure transparent background
      webPreferences: {
        preload: path.join(__dirname, '../preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    this.window.on('closed', () => {
      this.window = null;
      this.isLoaded = false;
    });

    // Handle initial load failures or readiness
    this.window.webContents.on('did-finish-load', () => {
      logger.info('[NotificationWindow] Window loaded');
      this.isLoaded = true;
      // We don't send here anymore, we wait for 'notification:ready' from React
      // But for safety/legacy (non-react?), we can leave the check or rely solely on handshake.
      // Let's rely on handshake for the initial load to ensure React is ready.
    });

    this.window.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logger.error(`[NotificationWindow] Failed to load: ${errorDescription} (${errorCode})`);
    });

    const url = isDev ? 'http://localhost:3000/notification' : 'app://./notification/index.html';
    logger.info(`[NotificationWindow] Loading URL: ${url}`);
    this.window.loadURL(url);
  }

  public resendContent() {
    if (this.window && this.window.webContents && this.pendingNotification) {
      logger.info('[NotificationWindowManager] Resending content on ready signal');
      this.window.webContents.send('notification:update-content', this.pendingNotification);
    }
  }

  public async show(options: {
    conversationId: string;
    title: string;
    body: string;
    html?: string;
    imageUrl?: string;
  }) {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
    }

    if (!this.window) return;

    // Clear existing timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Proxy Image if present (Bypass CSP/CORS)
    if (options.imageUrl && options.imageUrl.startsWith('http')) {
      try {
        logger.info(`[NotificationWindow] Proxying image: ${options.imageUrl}`);
        const response = await fetch(options.imageUrl);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const base64 = buffer.toString('base64');
          const mimeType = response.headers.get('content-type') || 'image/png';
          options.imageUrl = `data:${mimeType};base64,${base64}`;
          logger.info('[NotificationWindow] Image successfully proxied to Base64');
        } else {
          logger.warn(
            `[NotificationWindow] Failed to fetch image: ${response.status} ${response.statusText}`
          );
        }
      } catch (error) {
        logger.error('[NotificationWindow] Error proxying image:', error);
      }
    }

    // Position window
    this.updatePosition();

    // always update pending
    this.pendingNotification = options;

    // Send immediately if webContents is available (don't wait for isLoaded flag)
    // React handles duplicate updates gracefully, and this ensures hot-reload or
    // already-loaded windows get the update.
    if (this.window && this.window.webContents) {
      logger.info('[NotificationWindowManager] Sending content immediately (Aggressive)');
      try {
        this.window.webContents.send('notification:update-content', options);
      } catch (e) {
        logger.error('[NotificationWindowManager] Failed to send content:', e);
      }
    }

    this.window.showInactive();

    this.window.showInactive();

    // Flash the main window taskbar icon
    // Find the main window dynamically to ensure we have the live reference
    const windows = BrowserWindow.getAllWindows();
    // Main window is usually the one that is NOT this notification window and is visible/minimized
    const mainWin = windows.find(
      (w) => w !== this.window && w.getTitle() === 'SEPilot Desktop' && !w.isDestroyed()
    );

    if (mainWin) {
      logger.info(
        `[NotificationWindowManager] Found main window (ID: ${mainWin.id}), Attempting to flash`
      );
      try {
        mainWin.flashFrame(true);

        // Stop flashing when window gets focus
        // removeAllListeners prevents stacking listeners on multiple notifications
        mainWin.removeAllListeners('focus');
        mainWin.once('focus', () => {
          if (!mainWin.isDestroyed()) {
            mainWin.flashFrame(false);
          }
        });
      } catch (error) {
        logger.error('[NotificationWindowManager] Failed to flash frame:', error);
      }
    } else {
      logger.warn('[NotificationWindowManager] Could not find main window to flash');
    }

    // Auto hide
    this.hideTimeout = setTimeout(() => {
      this.hide();
    }, AUTO_HIDE_DELAY);
  }

  public hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
      this.window.webContents.send('notification:update-content', null);
    }
  }

  private updatePosition() {
    if (!this.window) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;

    const x = workArea.x + workArea.width - WINDOW_WIDTH - PADDING;
    const y = workArea.y + workArea.height - WINDOW_HEIGHT - PADDING;

    logger.info(`[NotificationWindow] Positioning at x:${x}, y:${y}`);
    this.window.setBounds({ x, y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
  }
}
