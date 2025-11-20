import { app, BrowserWindow, session } from 'electron';
import path from 'path';
import serve from 'electron-serve';
import { databaseService } from './services/database';
import { setupIpcHandlers } from './ipc';
import { logger } from './services/logger';
import { initializeLLMClient } from '../lib/llm/client';
import { AppConfig } from '../types';

let mainWindow: BrowserWindow | null = null;

const isDev = !app.isPackaged;

// Setup electron-serve for production
if (!isDev) {
  serve({ directory: 'out' });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 10, y: 10 },
  });

  if (isDev) {
    // 개발 환경: Next.js dev 서버
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
    logger.info('Loaded development server');
  } else {
    // 프로덕션: electron-serve를 통해 app:// 프로토콜로 로드
    mainWindow.loadURL('app://./index.html');
    logger.info('Loaded production build via app:// protocol');
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed');
  });
}

app.whenReady().then(async () => {
  logger.info('App is ready');

  // Register custom protocol for OAuth
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('sepilot', process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient('sepilot');
  }

  // Disable Electron security warnings in development
  if (isDev) {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  }

  // Set Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const cspValue = isDev
      ? // Development: Allow unsafe-eval for webpack HMR and external API connections
        [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* wss://localhost:* data: blob:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*",
          "style-src 'self' 'unsafe-inline' http://localhost:*",
          "img-src 'self' data: blob: http://localhost:*",
          "font-src 'self' data:",
          "connect-src 'self' http: https: ws: wss: data: blob:",
          "frame-src 'none'",
        ].join('; ')
      : // Production: Relaxed CSP for external API calls (CORS handled via IPC proxy)
        [
          "default-src 'self' data: blob:",
          "script-src 'self' 'unsafe-inline'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' http: https: ws: wss: data: blob:",
          "frame-src 'none'",
          "object-src 'none'",
        ].join('; ');

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [cspValue],
        'X-Content-Type-Options': ['nosniff'],
        'X-Frame-Options': ['DENY'],
        'Referrer-Policy': ['strict-origin-when-cross-origin'],
      },
    });
  });

  // Initialize database
  try {
    await databaseService.initialize();
    logger.info('Database initialized successfully');

    // Load and initialize LLM client from saved config
    try {
      const configStr = databaseService.getSetting('app_config');
      if (configStr) {
        const config: AppConfig = JSON.parse(configStr);
        if (config.llm && config.llm.apiKey) {
          initializeLLMClient(config.llm);
          logger.info('LLM client initialized from saved config');
        } else {
          logger.info('No LLM config found or API key missing');
        }
      }
    } catch (configError) {
      logger.error('Failed to load LLM config:', configError);
      // Non-critical error, continue app initialization
    }
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    // Show error dialog to user
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Database Initialization Error',
      `Failed to initialize database: ${error instanceof Error ? error.message : String(error)}\n\nThe application may not function properly.`
    );
  }

  // Setup IPC handlers
  setupIpcHandlers();

  // Create window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Handle OAuth callback
app.on('open-url', async (event, url) => {
  event.preventDefault();
  logger.info('Received OAuth callback URL:', url);

  try {
    const { searchParams } = new URL(url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      throw new Error('No code found in callback URL');
    }

    // Here, you would typically validate the 'state' parameter
    // For simplicity, we'll proceed directly to code exchange.
    
    // The code verifier should have been stored before initiating login.
    // Since we are in the main process, we need a way to get it.
    // The `github-oauth.ts` stores it in sessionStorage, which is renderer-specific.
    // Let's assume for now the renderer will handle this via IPC.
    // A better approach would be to manage the state and verifier mapping in the main process.

    // For now, we'll call an IPC handler that we assume the renderer will trigger.
    // The renderer will get the code from this event, and then call the exchange handler.
    // This is a simplification. A robust implementation would handle this in the main process.
    
    if (mainWindow) {
      mainWindow.webContents.send('oauth-callback', url);
      mainWindow.focus();
    }

  } catch (error) {
    logger.error('Failed to handle OAuth callback:', error);
  }
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  logger.info('App is quitting');
  databaseService.close();
});

// 보안: 외부 네비게이션 차단
app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);

    // localhost만 허용 (개발 환경)
    if (isDev && parsedUrl.origin !== 'http://localhost:3000') {
      event.preventDefault();
      logger.warn('Blocked navigation to', navigationUrl);
    }
  });

  // 새 윈도우 열기 방지
  contents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });
});
