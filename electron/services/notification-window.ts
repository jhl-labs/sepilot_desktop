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

    const url = isDev ? 'http://localhost:3000/notification' : 'app://./notification/index.html';

    this.window.loadURL(url);

    this.window.on('closed', () => {
      this.window = null;
      this.isLoaded = false;
    });

    // Handle initial load failures or readiness
    this.window.webContents.on('did-finish-load', () => {
      logger.info('[NotificationWindow] Window loaded');
      this.isLoaded = true;
      if (this.pendingNotification) {
        this.window?.webContents.send('notification:update-content', this.pendingNotification);
        this.pendingNotification = null;
      }
    });

    this.window.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      logger.error(`[NotificationWindow] Failed to load: ${errorDescription} (${errorCode})`);
    });
  }

  public show(options: {
    conversationId: string;
    title: string;
    body: string;
    html?: string;
    imageUrl?: string;
  }) {
    if (!this.window || this.window.isDestroyed()) {
      this.createWindow();
      // Wait for load? Or just try to send later.
      // Simplest is to recreate and wait briefly or rely on ready-to-show.
      // For now, let's assume it's pre-warmed or we wait a bit.
    }

    if (!this.window) return;

    // Clear existing timeout
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }

    // Position window
    this.updatePosition();

    // Send content
    // We need to wait until webContents is ready if we just created it.
    // But since we initialize in main.ts, it should be ready.
    // Enable mouse events for interaction, but keep underlying window clickable when transparent areas are clicked?
    // Electron transparent windows are tricky. Often we want 'ignore-mouse-events' for transparent parts.
    // For now, let's assume the window rectangle captures clicks.

    if (this.isLoaded && this.window.webContents) {
      this.window.webContents.send('notification:update-content', options);
    } else {
      this.pendingNotification = options;
    }

    this.window.showInactive(); // Show without focusing

    // Auto hide
    this.hideTimeout = setTimeout(() => {
      this.hide();
    }, AUTO_HIDE_DELAY);
  }

  public hide() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.hide();
      // Also clear content to reset state?
      this.window.webContents.send('notification:update-content', null);
    }
  }

  private updatePosition() {
    if (!this.window) return;

    const dummy = screen.getPrimaryDisplay(); // Fallback
    const primaryDisplay = screen.getPrimaryDisplay();
    const { workArea } = primaryDisplay;

    const x = workArea.x + workArea.width - WINDOW_WIDTH - PADDING;
    const y = workArea.y + workArea.height - WINDOW_HEIGHT - PADDING;

    this.window.setBounds({ x, y, width: WINDOW_WIDTH, height: WINDOW_HEIGHT });
  }
}
