import { BrowserWindow, screen, app } from 'electron';
import path from 'path';
import { logger } from './logger';

const WINDOW_WIDTH = 400;
const WINDOW_HEIGHT = 400; // Increased height for rich content (images/html)
const PADDING = 16;
const AUTO_HIDE_DELAY = 5000;
const IMAGE_FETCH_TIMEOUT_MS = 5000;
const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

interface NotificationContent {
  conversationId: string;
  title: string;
  body: string;
  html?: string;
  imageUrl?: string;
}

export class NotificationWindowManager {
  private static instance: NotificationWindowManager;
  private window: BrowserWindow | null = null;
  private hideTimeout: NodeJS.Timeout | null = null;
  private flashStopListener: (() => void) | null = null;
  private flashStopTarget: BrowserWindow | null = null;

  private constructor() {
    this.createWindow();
  }

  public static getInstance(): NotificationWindowManager {
    if (!NotificationWindowManager.instance) {
      NotificationWindowManager.instance = new NotificationWindowManager();
    }
    return NotificationWindowManager.instance;
  }

  private pendingNotification: NotificationContent | null = null;
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
      this.clearHideTimeout();
      this.detachFlashStopListener();
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

  private clearHideTimeout() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
  }

  private detachFlashStopListener() {
    if (this.flashStopListener && this.flashStopTarget && !this.flashStopTarget.isDestroyed()) {
      this.flashStopTarget.removeListener('focus', this.flashStopListener);
    }

    this.flashStopListener = null;
    this.flashStopTarget = null;
  }

  private getMainWindow(): BrowserWindow | null {
    if (this.mainWindowRef && !this.mainWindowRef.isDestroyed()) {
      return this.mainWindowRef;
    }

    return (
      BrowserWindow.getAllWindows().find(
        (window) => window !== this.window && window.getTitle() === 'SEPilot Desktop'
      ) ?? null
    );
  }

  public resendContent() {
    if (this.window && this.window.webContents && this.pendingNotification) {
      logger.info('[NotificationWindowManager] Resending content on ready signal');
      this.window.webContents.send('notification:update-content', this.pendingNotification);
    }
  }

  public async show(options: NotificationContent) {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
    }

    if (!this.window) {
      return;
    }

    // Clear existing timeout and stale focus listener from previous notification
    this.clearHideTimeout();
    this.detachFlashStopListener();

    // Proxy Image if present (Bypass CSP/CORS)
    if (options.imageUrl && options.imageUrl.startsWith('http')) {
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), IMAGE_FETCH_TIMEOUT_MS);

      try {
        logger.info(`[NotificationWindow] Proxying image: ${options.imageUrl}`);
        const response = await fetch(options.imageUrl, { signal: abortController.signal });

        if (response.ok) {
          const mimeType = response.headers.get('content-type') || 'image/png';
          if (!mimeType.startsWith('image/')) {
            logger.warn(`[NotificationWindow] Rejected non-image content type: ${mimeType}`);
          } else {
            const contentLength = response.headers.get('content-length');
            const parsedContentLength = contentLength ? Number(contentLength) : null;
            if (
              parsedContentLength !== null &&
              Number.isFinite(parsedContentLength) &&
              parsedContentLength > MAX_IMAGE_SIZE_BYTES
            ) {
              logger.warn(
                `[NotificationWindow] Rejected oversized image via content-length: ${contentLength}`
              );
            } else {
              const arrayBuffer = await response.arrayBuffer();
              if (arrayBuffer.byteLength > MAX_IMAGE_SIZE_BYTES) {
                logger.warn(
                  `[NotificationWindow] Rejected oversized image via payload size: ${arrayBuffer.byteLength}`
                );
              } else {
                const buffer = Buffer.from(arrayBuffer);
                const base64 = buffer.toString('base64');
                options.imageUrl = `data:${mimeType};base64,${base64}`;
                logger.info('[NotificationWindow] Image successfully proxied to Base64');
              }
            }
          }
        } else {
          logger.warn(
            `[NotificationWindow] Failed to fetch image: ${response.status} ${response.statusText}`
          );
        }
      } catch (error) {
        logger.error('[NotificationWindow] Error proxying image:', error);
      } finally {
        clearTimeout(timeout);
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

    // Flash the main window taskbar icon
    const mainWin = this.getMainWindow();

    if (mainWin) {
      logger.info(
        `[NotificationWindowManager] Found main window (ID: ${mainWin.id}), Attempting to flash`
      );
      try {
        mainWin.flashFrame(true);

        // Stop flashing when the user focuses the app.
        this.flashStopTarget = mainWin;
        this.flashStopListener = () => {
          if (!mainWin.isDestroyed()) {
            mainWin.flashFrame(false);
          }
          this.detachFlashStopListener();
        };
        mainWin.once('focus', this.flashStopListener);
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
    this.clearHideTimeout();
    this.detachFlashStopListener();

    const mainWin = this.getMainWindow();
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.flashFrame(false);
    }

    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
      this.window.webContents.send('notification:update-content', null);
    }

    this.pendingNotification = null;
  }

  private updatePosition() {
    if (!this.window) {
      return;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;

    const x = workArea.x + workArea.width - WINDOW_WIDTH - PADDING;
    const y = workArea.y + PADDING;

    logger.info(`[NotificationWindow] Positioning at x:${x}, y:${y}`);
    this.window.setBounds({ x, y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
  }
}
