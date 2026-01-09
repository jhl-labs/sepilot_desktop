// Load module aliases for path resolution (@/ -> dist/electron or app root in production)
// Must use require() to ensure it's executed before other imports
const moduleAlias = require('module-alias');
const pathModule = require('path');

// Configure module alias before any other imports
// In production (packaged), __dirname is in resources/app.asar/dist/electron/electron
// We need to point @ to resources/app.asar/dist/electron
moduleAlias.addAlias('@', pathModule.join(__dirname, '..'));

// 환경 변수에서 프록시 설정을 완전히 제거
// NetworkSettingsTab.tsx의 설정만 사용하도록 강제
function clearProxyEnvironmentVariables() {
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;
  delete process.env.ALL_PROXY;
  delete process.env.all_proxy;
  delete process.env.NO_PROXY;
  delete process.env.no_proxy;

  console.log('[Main] Proxy environment variables cleared. Only NetworkConfig will be used.');
}

// 앱 시작 시 즉시 환경 변수 제거
clearProxyEnvironmentVariables();

import {
  app,
  BrowserWindow,
  session,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  protocol,
} from 'electron';
import path from 'path';
import serve from 'electron-serve';
import { databaseService } from './services/database';
import { setupIpcHandlers, initializeSkills } from './ipc';
import { logger } from './services/logger';
import { initializeLLMClient } from '../lib/llm/client';
import { vectorDBService } from './services/vectordb';
import { AppConfig } from '../types';
import { initializeBuiltinTools } from '../lib/mcp/tools/executor';
import { getPTYManager } from './services/pty-manager';
import { isLLMConfigV2, convertV2ToV1 } from '../lib/config/llm-config-migration';
import { NotificationWindowManager } from './services/notification-window';

let mainWindow: BrowserWindow | null = null;
let quickInputWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let registeredShortcuts: string[] = []; // Track registered shortcuts
let isMenuVisible = false; // Track menu visibility state

const isDev = !app.isPackaged;

// Setup electron-serve for production
const loadURL = isDev
  ? null
  : serve({
      directory: path.join(app.getAppPath(), 'out'),
      scheme: 'app',
    });

// Toggle menu visibility
function toggleMenuVisibility() {
  if (!mainWindow) return;

  isMenuVisible = !isMenuVisible;
  logger.info(`[Main] Menu visibility toggled: ${isMenuVisible}`);

  if (isMenuVisible) {
    logger.info('[Main] Setting application menu...');
    // Show default menu
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'File',
          submenu: [{ role: 'quit' }],
        },
        {
          label: 'Edit',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'forceReload' },
            { role: 'toggleDevTools' },
            { type: 'separator' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
          ],
        },
        {
          label: 'Window',
          submenu: [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'close' },
          ],
        },
        {
          label: 'Help',
          submenu: [
            {
              label: 'About SEPilot',
              click: async () => {
                const { shell } = require('electron');
                await shell.openExternal('https://github.com/yourusername/sepilot_desktop');
              },
            },
          ],
        },
      ])
    );
    logger.info('Menu bar shown');
  } else {
    // Hide menu
    Menu.setApplicationMenu(null);
    logger.info('Menu bar hidden');
  }
}

async function createWindow() {
  // Set window icon based on platform and environment
  let iconPath: string;
  const isWindows = process.platform === 'win32';

  if (isDev) {
    // Development: use icon from assets directory
    iconPath = isWindows
      ? path.join(app.getAppPath(), 'assets', 'icon.ico')
      : path.join(app.getAppPath(), 'assets', 'icon.png');
  } else {
    // Production: use packaged icon
    iconPath = isWindows
      ? path.join(process.resourcesPath, 'assets', 'icon.ico')
      : path.join(process.resourcesPath, 'assets', 'icon.png');
  }

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'SEPilot Desktop',
    icon: iconPath,
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

  // Hide menu by default
  Menu.setApplicationMenu(null);
  isMenuVisible = false;

  // Register F10 key to toggle menu
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F10') {
      logger.info('[Main] F10 key pressed, toggling menu');
      event.preventDefault();
      toggleMenuVisibility();
    }
  });

  if (isDev) {
    // 개발 환경: Next.js dev 서버
    mainWindow.loadURL('http://localhost:3000');
    // DevTools는 필요시 F12 또는 메뉴에서 수동으로 열 수 있습니다
    // mainWindow.webContents.openDevTools();
    logger.info('Loaded development server');
  } else {
    // 프로덕션: electron-serve를 통해 app:// 프로토콜로 로드
    // electron-serve가 app:// 프로토콜을 등록하므로 직접 사용
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

  // Window focus/blur 이벤트 리스너 (백그라운드 알림용)
  mainWindow.on('focus', () => {
    mainWindow?.webContents.send('window:focus-changed', { focused: true });
    logger.info('Main window focused');
  });

  mainWindow.on('blur', () => {
    mainWindow?.webContents.send('window:focus-changed', { focused: false });
    logger.info('Main window blurred');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    logger.info('Main window closed');
  });
}

// Quick Input 창 생성
async function createQuickInputWindow() {
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
    // electron-serve를 사용하면 app:// 프로토콜이 자동 등록됨
    quickInputWindow.loadURL('app://./quick-input/index.html');
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
async function showQuickInputWindow() {
  if (!quickInputWindow) {
    await createQuickInputWindow();
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
    const configStr = databaseService.getSetting('app_config');
    const config: AppConfig | null = configStr ? JSON.parse(configStr) : null;
    const quickInputConfig = config?.quickInput;

    // Register Quick Input shortcut
    const quickInputShortcut =
      quickInputConfig?.quickInputShortcut || 'CommandOrControl+Shift+Space';
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

        // Ensure main window exists
        if (!mainWindow || mainWindow.isDestroyed()) {
          logger.info('[Shortcuts] Main window not found, creating new window');
          createWindow();
        }

        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          logger.info('[Shortcuts] Main window shown and focused');

          // Read clipboard and combine with prompt into single user message
          const { clipboard } = require('electron');
          const clipboardContent = clipboard.readText();
          logger.info(`[Shortcuts] Clipboard content length: ${clipboardContent.length}`);

          // Combine prompt and clipboard content into single user message
          // Format: [Prompt]\n\n[Clipboard Content]
          const userMessage = clipboardContent.trim()
            ? `${question.prompt}\n\n${clipboardContent}`
            : `${question.prompt}\n\n(클립보드가 비어있습니다)`;

          logger.info(
            `[Shortcuts] Sending combined user message: ${userMessage.substring(0, 100)}...`
          );
          mainWindow.webContents.send('create-new-chat-with-message', userMessage);
          logger.info('[Shortcuts] Message sent successfully');
        } else {
          logger.error('[Shortcuts] Failed to create/access main window');
        }
      });

      if (registered) {
        registeredShortcuts.push(question.shortcut);
        logger.info(
          `[Shortcuts] Registered Quick Question: ${question.name} (${question.shortcut})`
        );
      } else {
        logger.error(
          `[Shortcuts] Failed to register Quick Question: ${question.name} (${question.shortcut})`
        );
      }
    }

    logger.info(`[Shortcuts] Total registered: ${registeredShortcuts.length}`);
  } catch (error) {
    logger.error('[Shortcuts] Failed to register shortcuts:', error);
  }
}

// Export for use in IPC handlers
export { registerShortcuts };

// Get main window
export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

// System Tray 생성
function createTray() {
  // Prevent duplicate tray creation
  if (tray !== null) {
    logger.info('[Tray] Tray already exists, skipping creation');
    return;
  }

  // Set tray icon based on platform and environment
  let trayIconPath: string;
  const isWindows = process.platform === 'win32';

  if (isDev) {
    // Development: use small icon from assets directory
    trayIconPath = path.join(app.getAppPath(), 'assets', 'icons', 'icon_16x16.png');
  } else {
    // Production: use packaged icon
    trayIconPath = isWindows
      ? path.join(process.resourcesPath, 'assets', 'icons', 'icon_16.png')
      : path.join(process.resourcesPath, 'assets', 'icons', 'icon_16x16.png');
  }

  const icon = nativeImage.createFromPath(trayIconPath);
  tray = new Tray(icon);
  logger.info('[Tray] Tray created successfully');

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

// Configure DNS settings before app is ready
// Disable built-in DNS client to use system DNS resolver
app.commandLine.appendSwitch('disable-features', 'AsyncDns');

// Single instance lock: Prevent multiple instances from running
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  logger.info('[Main] Another instance is already running, quitting...');
  app.quit();
} else {
  // This is the first instance, listen for second-instance events
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    logger.info('[Main] Second instance detected, focusing main window');
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

app.whenReady().then(async () => {
  logger.info('App is ready');

  // Register custom file protocol for local file access
  protocol.registerFileProtocol('sepilot-file', (request, callback) => {
    const url = request.url.replace('sepilot-file://', '');
    try {
      return callback(decodeURIComponent(url));
    } catch (error) {
      logger.error('Failed to register file protocol:', error);
      return callback({ error: -2 });
    }
  });

  // Register custom protocol for OAuth
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('sepilot', process.execPath, [path.resolve(process.argv[1])]);
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
          "img-src 'self' data: blob: http://localhost:* sepilot-file:",
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
          "img-src 'self' data: blob: sepilot-file:",
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

        if (config.llm) {
          // Convert V2 config to V1 if needed
          let llmConfig = config.llm;
          if (isLLMConfigV2(llmConfig)) {
            logger.info('Converting LLM config V2 to V1 for initialization');
            try {
              llmConfig = convertV2ToV1(llmConfig);
            } catch (error) {
              logger.error('Failed to convert LLM config V2 to V1:', error);
              logger.info('No LLM config initialized - conversion failed');
              throw error;
            }
          }

          // Check if we have a valid API key
          if (llmConfig.apiKey) {
            initializeLLMClient(llmConfig);
            logger.info('LLM client initialized from saved config');
          } else {
            logger.info('No LLM config found or API key missing');
          }
        } else {
          logger.info('No LLM config found in app_config');
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

  // Initialize Skills system
  try {
    await initializeSkills();
    logger.info('Skills system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Skills system:', error);
    // Non-critical error, continue app initialization
  }

  // Setup IPC handlers (terminal handlers will be set up after window creation)
  setupIpcHandlers(
    () => mainWindow,
    async () => {
      // Wrap in async to match Promise<void> signature if needed, though registerShortcuts is already async
      await registerShortcuts();
    }
  );

  // Initialize builtin tools (file_read, file_write, file_edit, file_list)
  initializeBuiltinTools();
  logger.info('Builtin tools initialized');

  // Initialize Notification Window Manager
  NotificationWindowManager.getInstance();
  logger.info('NotificationWindowManager initialized');

  // Create tray
  createTray();
  logger.info('Tray created');

  // Register global shortcuts from config
  await registerShortcuts();

  // Create window
  createWindow();

  // Setup terminal handlers with mainWindow after window is created
  if (mainWindow) {
    const { setupTerminalHandlers } = require('./ipc/handlers/terminal');
    setupTerminalHandlers(mainWindow);
    logger.info('Terminal handlers registered with mainWindow');
  }

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

  // Destroy tray icon
  if (tray !== null) {
    tray.destroy();
    tray = null;
    logger.info('[Tray] Tray destroyed');
  }

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
