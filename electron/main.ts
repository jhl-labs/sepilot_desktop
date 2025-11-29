// Load module aliases for path resolution (@/ -> dist/electron or app root in production)
// Must use require() to ensure it's executed before other imports
const moduleAlias = require('module-alias');
const pathModule = require('path');

// Configure module alias before any other imports
// In production (packaged), __dirname is in resources/app.asar/dist/electron/electron
// We need to point @ to resources/app.asar/dist/electron
moduleAlias.addAlias('@', pathModule.join(__dirname, '..'));

import { app, BrowserWindow, session, Tray, Menu, globalShortcut, nativeImage } from 'electron';
import path from 'path';
import serve from 'electron-serve';
import { databaseService } from './services/database';
import { setupIpcHandlers } from './ipc';
import { logger } from './services/logger';
import { initializeLLMClient } from '../lib/llm/client';
import { vectorDBService } from './services/vectordb';
import { AppConfig } from '../types';
import { initializeBuiltinTools } from '../lib/mcp/tools/executor';
import { getPTYManager } from './services/pty-manager';

let mainWindow: BrowserWindow | null = null;
let quickInputWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let registeredShortcuts: string[] = []; // Track registered shortcuts

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

  // 창 닫기 동작을 숨기기로 변경 (tray로 최소화)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
      logger.info('Main window hidden to tray');
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed');
  });
}

// Quick Input 창 생성
function createQuickInputWindow() {
  quickInputWindow = new BrowserWindow({
    width: 600,
    height: 80,
    minWidth: 400,
    minHeight: 60,
    maxHeight: 100,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  if (isDev) {
    quickInputWindow.loadURL('http://localhost:3000/quick-input');
  } else {
    quickInputWindow.loadURL('app://./quick-input.html');
  }

  // 포커스를 잃으면 창 숨기기 (개발 모드에서는 비활성화)
  quickInputWindow.on('blur', () => {
    if (!isDev) {
      quickInputWindow?.hide();
    }
  });

  quickInputWindow.on('closed', () => {
    quickInputWindow = null;
    logger.info('Quick input window closed');
  });

  // 초기에는 숨김 상태
  quickInputWindow.hide();
}

// Quick Input 창 표시
function showQuickInputWindow() {
  if (!quickInputWindow) {
    createQuickInputWindow();
  }

  // 화면 중앙에 위치
  const { screen } = require('electron');
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const windowBounds = quickInputWindow!.getBounds();

  quickInputWindow!.setBounds({
    x: Math.floor((width - windowBounds.width) / 2),
    y: Math.floor(height / 3),
    width: windowBounds.width,
    height: windowBounds.height,
  });

  quickInputWindow!.show();
  quickInputWindow!.focus();
}

// Unregister all shortcuts
function unregisterAllShortcuts() {
  registeredShortcuts.forEach((shortcut) => {
    globalShortcut.unregister(shortcut);
    logger.info(`[Shortcuts] Unregistered: ${shortcut}`);
  });
  registeredShortcuts = [];
}

// Register shortcuts from config
async function registerShortcuts() {
  try {
    // Unregister existing shortcuts first
    unregisterAllShortcuts();

    // Load config from database
    const result = await databaseService.getConfig();
    const config = result as AppConfig | null;
    const quickInputConfig = config?.quickInput;

    // Register Quick Input shortcut
    const quickInputShortcut = quickInputConfig?.quickInputShortcut || 'CommandOrControl+Shift+Space';
    const quickInputRegistered = globalShortcut.register(quickInputShortcut, () => {
      logger.info(`[Shortcuts] Quick Input triggered: ${quickInputShortcut}`);
      showQuickInputWindow();
    });

    if (quickInputRegistered) {
      registeredShortcuts.push(quickInputShortcut);
      logger.info(`[Shortcuts] Registered Quick Input: ${quickInputShortcut}`);
    } else {
      logger.error(`[Shortcuts] Failed to register Quick Input: ${quickInputShortcut}`);
    }

    // Register Quick Questions
    const quickQuestions = quickInputConfig?.quickQuestions || [];
    for (const question of quickQuestions) {
      if (!question.enabled || !question.shortcut) {
        continue;
      }

      const registered = globalShortcut.register(question.shortcut, () => {
        logger.info(`[Shortcuts] Quick Question triggered: ${question.name}`);
        // Find main window and execute question
        const allWindows = BrowserWindow.getAllWindows();
        const mainWin = allWindows.find((win) => !win.isDestroyed() && win.webContents.getURL().includes('localhost'));

        if (mainWin) {
          mainWin.show();
          mainWin.focus();

          // Read clipboard and replace {{clipboard}} in prompt
          const { clipboard } = require('electron');
          const clipboardContent = clipboard.readText();
          const finalMessage = question.prompt.replace(/\{\{clipboard\}\}/g, clipboardContent);

          mainWin.webContents.send('create-new-chat-with-message', finalMessage);
        }
      });

      if (registered) {
        registeredShortcuts.push(question.shortcut);
        logger.info(`[Shortcuts] Registered Quick Question: ${question.name} (${question.shortcut})`);
      } else {
        logger.error(`[Shortcuts] Failed to register Quick Question: ${question.name} (${question.shortcut})`);
      }
    }

    logger.info(`[Shortcuts] Total registered: ${registeredShortcuts.length}`);
  } catch (error) {
    logger.error('[Shortcuts] Failed to register shortcuts:', error);
  }
}

// Export for use in IPC handlers
export { registerShortcuts };

// System Tray 생성
function createTray() {
  // 간단한 16x16 아이콘 생성 (임시)
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '열기',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Quick Input (Ctrl+Shift+Space)',
      click: () => {
        showQuickInputWindow();
      },
    },
    { type: 'separator' },
    {
      label: '종료',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('SEPilot Desktop');

  // 트레이 아이콘 클릭 시 메인 창 표시
  tray.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow?.show();
      mainWindow?.focus();
    }
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
      ? // Development: Allow unsafe-eval for webpack HMR, Monaco CDN, and external API connections
        [
          "default-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* ws://localhost:* wss://localhost:* data: blob:",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://cdn.jsdelivr.net",
          "style-src 'self' 'unsafe-inline' http://localhost:* https://cdn.jsdelivr.net",
          "img-src 'self' data: blob: http://localhost:*",
          "font-src 'self' data: https://cdn.jsdelivr.net",
          "connect-src 'self' http: https: ws: wss: data: blob:",
          "frame-src 'none'",
          "worker-src 'self' blob: https://cdn.jsdelivr.net",
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

        // Initialize VectorDB from saved config
        if (config.vectorDB) {
          try {
            await vectorDBService.initialize({
              indexName: config.vectorDB.indexName,
              dimension: config.vectorDB.dimension,
            });
            logger.info('VectorDB initialized from saved config');
          } catch (vectorDBError) {
            logger.error('Failed to initialize VectorDB:', vectorDBError);
            // Non-critical error, continue app initialization
          }
        }
      }
    } catch (configError) {
      logger.error('Failed to load config:', configError);
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

  // Initialize builtin tools (file_read, file_write, file_edit, file_list)
  initializeBuiltinTools();
  logger.info('Builtin tools initialized');

  // Create tray
  createTray();
  logger.info('Tray created');

  // Register global shortcuts from config
  await registerShortcuts();

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
  isQuitting = true;
  logger.info('App is quitting');

  // Unregister all global shortcuts
  globalShortcut.unregisterAll();

  // Cleanup PTY sessions
  try {
    const ptyManager = getPTYManager();
    ptyManager.cleanup();
  } catch (error) {
    logger.error('Error cleaning up PTY sessions:', error);
  }

  // Close database
  databaseService.close();
});

// 보안: 외부 네비게이션 차단 (메인 윈도우만)
app.on('web-contents-created', (_, contents) => {
  // BrowserView의 webContents는 허용 (자유로운 브라우징을 위해)
  // BrowserView는 별도의 보안 정책을 가짐
  const isBrowserView = contents.getType() === 'browserView';

  if (!isBrowserView) {
    // 메인 윈도우에만 네비게이션 제한 적용
    contents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);

      // localhost만 허용 (개발 환경)
      if (isDev && parsedUrl.origin !== 'http://localhost:3000') {
        event.preventDefault();
        logger.warn('Blocked navigation to', navigationUrl);
      }
    });

    // 메인 윈도우에서만 새 윈도우 열기 방지
    contents.setWindowOpenHandler(() => {
      return { action: 'deny' };
    });
  }
});
