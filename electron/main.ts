// 경로 별칭 런타임 해석을 위한 module-alias 등록
// esbuild 번들링 시에는 @/ 경로가 빌드 시점에 해석되므로 불필요
if (!process.env.ESBUILD_BUNDLED) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const moduleAlias = require('module-alias') as {
    addAlias: (alias: string, path: string) => void;
  };
  const distElectronPath = require('path').resolve(__dirname, '..');
  moduleAlias.addAlias('@', distElectronPath);
}

// 환경 변수에서 프록시 설정을 완전히 제거
// NetworkSettingsTab.tsx의 설정만 사용하도록 강제
function clearProxyEnvironmentVariables() {
  delete process.env.HTTP_PROXY;
  delete process.env.HTTPS_PROXY;
  delete process.env.http_proxy;
  delete process.env.https_proxy;
  delete process.env.ALL_PROXY;
  delete process.env.all_proxy;

  // localhost와 127.0.0.1은 항상 프록시 우회
  process.env.NO_PROXY = 'localhost,127.0.0.1,::1';
  process.env.no_proxy = 'localhost,127.0.0.1,::1';

  console.log('[Main] Proxy environment variables cleared. Only NetworkConfig will be used.');
}

// 앱 시작 시 즉시 환경 변수 제거
clearProxyEnvironmentVariables();

// CLI 모드 간단 감지 (import 전에 수행하여 headless 플래그 설정)
// main/cli 간 불일치 방지를 위해 공통 유틸을 사용한다.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { detectCLIModeFromArgv } = require('./cli/mode');
const isCliMode = detectCLIModeFromArgv(process.argv);

// CLI 모드일 때 Electron headless 플래그 추가 (GUI 불필요)
if (isCliMode) {
  const { app: electronApp } = require('electron');
  electronApp.disableHardwareAcceleration();
  electronApp.commandLine.appendSwitch('disable-gpu');
  electronApp.commandLine.appendSwitch('disable-software-rasterizer');
  electronApp.commandLine.appendSwitch('disable-dev-shm-usage');
}

// CDP (Chrome DevTools Protocol) remote debugging 활성화
// 개발 환경에서는 항상 켜짐
if (process.env.NODE_ENV !== 'production') {
  const { app: electronApp } = require('electron');
  electronApp.commandLine.appendSwitch('remote-debugging-port', '9222');
  console.log('[Main] CDP remote debugging enabled on port 9222 (development mode)');
}

import {
  app,
  BrowserWindow,
  session,
  Tray,
  Menu,
  globalShortcut,
  nativeImage,
  protocol,
  ipcMain,
} from 'electron';
import path from 'path';
import serve from 'electron-serve';
import { databaseService } from './services/database';
import { setupIpcHandlers, initializeSkills } from './ipc';
import { logger } from './services/logger';
import { initializeLLMClient } from '../lib/domains/llm/client';
import { vectorDBService } from './services/vectordb';
import { AppConfig } from '../types';
import { initializeBuiltinTools } from '../lib/domains/mcp/tools/executor';
import { getPTYManager } from './services/pty-manager';
import { isLLMConfigV2, convertV2ToV1 } from '../lib/domains/config/llm-config-migration';
import { NotificationWindowManager } from './services/notification-window';
import { SchedulerService } from './services/scheduler';
import { MessageSubscriptionService } from './services/message-subscription';
import { MessageProcessorService } from './services/message-processor';
import { resolveExtensionFilePath, isValidExtensionId } from './utils/extension-paths';
import { net } from 'electron';
import { pathToFileURL } from 'url';
import { registerExtensionHandlers } from './ipc/handlers/extension/extension-handlers';
import { extensionRegistry } from '../lib/extensions/registry';
import { initFileLogger, closeFileLogger, fileLogger } from '../lib/utils/file-logger';
import { initializeExtensionLogger, extensionLogger } from '../lib/utils/extension-logger';
import { initializeFileLogger } from '../lib/utils/logger';
import { setupRendererLogCapture, cleanupOldLogs } from './services/renderer-logger';
import { isCLIMode, runCLI } from './cli';

let mainWindow: BrowserWindow | null = null;
let quickInputWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let registeredShortcuts: string[] = []; // Track registered shortcuts
let isMenuVisible = false; // Track menu visibility state
let extensionsReady = false; // Extension 로딩 완료 플래그 (윈도우 생성 전 블로킹 로드)

const isDev = !app.isPackaged;

// Setup electron-serve for production
const loadURL = isDev
  ? null
  : serve({
      directory: path.join(app.getAppPath(), 'out'),
      scheme: 'app',
    });

// Register 'app' and 'sepilot-ext' schemes as privileged
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true, // Recommended for file streaming
    },
  },
  {
    scheme: 'sepilot-ext',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

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
    // electron-serve가 app:// 프로토콜을 등록하므로 loadURL을 호출해야 함
    if (loadURL) {
      await loadURL(mainWindow);
      logger.info('Loaded production build via app:// protocol and registered handler');
    } else {
      // Fallback (should not happen if configured correctly)
      mainWindow.loadURL('app://./index.html');
      logger.warn('loadURL function missing, manually loading app:// protocol');
    }
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
      sandbox: false,
      webSecurity: true,
    },
  });

  if (isDev) {
    quickInputWindow.loadURL('http://localhost:3000/quick-input');
  } else {
    // electron-serve를 사용하면 app:// 프로토콜이 자동 등록됨 (main.ts의 loadURL 호출 이후)
    // quick-input 폴더의 index.html을 로드
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

// Single instance lock: GUI 모드에서만 적용
// CLI는 병렬 실행/자동화 시나리오가 많으므로 lock을 적용하지 않는다.
if (!isCliMode) {
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
}

app.whenReady().then(async () => {
  // CLI 모드 체크
  if (isCLIMode(process.argv)) {
    // CLI 모드: Single Instance Lock 건너뜀
    logger.info('[CLI] Running in CLI mode');
    try {
      const exitCode = await runCLI(process.argv);
      process.exit(exitCode);
    } catch (error) {
      logger.error('[CLI] Fatal error:', error);
      process.exit(1);
    }
    return; // CLI 모드에서는 이후 GUI 로직 실행 안함
  }

  // GUI 모드 계속 실행
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

  // Register custom protocol for Extension files (sepilot-ext://)
  protocol.handle('sepilot-ext', async (request) => {
    try {
      const url = new URL(request.url);
      const extensionId = url.hostname;
      const filePath = url.pathname;

      // Extension ID 검증 (보안: path traversal 방지)
      if (!isValidExtensionId(extensionId)) {
        logger.error(`[Protocol] Invalid extension ID: ${extensionId}`);
        return new Response('Invalid extension ID', {
          status: 403,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // Extension 파일 경로 resolve
      const resolvedPath = resolveExtensionFilePath(extensionId, filePath);
      if (!resolvedPath) {
        logger.warn(`[Protocol] Extension file not found: ${extensionId}${filePath}`);
        return new Response('Not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }

      // 파일 서빙 (Windows 경로 대응: pathToFileURL로 안전한 URL 변환)
      const fileUrl = pathToFileURL(resolvedPath).href;
      logger.debug(`[Protocol] Serving extension file: ${fileUrl}`);
      return net.fetch(fileUrl);
    } catch (error) {
      logger.error('[Protocol] Failed to handle sepilot-ext request:', error);
      return new Response('Internal server error', {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
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
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:* https://cdn.jsdelivr.net sepilot-ext:",
          "style-src 'self' 'unsafe-inline' http://localhost:* https://cdn.jsdelivr.net",
          "img-src 'self' data: blob: http://localhost:* sepilot-file: https:",
          "font-src 'self' data: https://cdn.jsdelivr.net",
          "connect-src 'self' http: https: ws: wss: data: blob: sepilot-ext:",
          "frame-src 'none'",
          "worker-src 'self' blob: https://cdn.jsdelivr.net",
        ].join('; ')
      : // Production: Relaxed CSP for external API calls (CORS handled via IPC proxy)
        [
          "default-src 'self' data: blob:",
          "script-src 'self' 'unsafe-inline' sepilot-ext:",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob: sepilot-file: https:",
          "font-src 'self' data:",
          "connect-src 'self' http: https: ws: wss: data: blob: sepilot-ext:",
          "frame-src 'none'",
          "worker-src 'self' blob:",
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

  // Initialize lib/utils/logger.ts file logging (app.log)
  const logsDir = path.join(app.getPath('userData'), 'logs');
  initializeFileLogger(logsDir, 'app.log');
  logger.info('[Main] lib/utils/logger file logging initialized');

  // Cleanup old log files (7 days retention)
  cleanupOldLogs(7);

  // Initialize file logger (always enabled for debugging)
  initFileLogger();
  fileLogger.info('Main', 'File logger initialized', { isDev, isPackaged: app.isPackaged });

  // Initialize extension logger (always enabled for debugging)
  initializeExtensionLogger(logsDir);
  extensionLogger.loadingStarted('Main');

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

  // Initialize Main Process SDK EARLY (before IPC handlers)
  // This ensures HostServices are registered before any IPC handler triggers GraphFactory.initialize()
  try {
    const { initializeMainProcessSDK } = require('../lib/extensions/sdk-initializer-main');
    initializeMainProcessSDK();
    logger.info('[Main] Main Process SDK initialized (early)');
  } catch (sdkError) {
    logger.error('[Main] Failed to initialize Main Process SDK early', { error: sdkError });
  }

  // Setup IPC handlers first (before window creation, so renderer can communicate immediately)
  setupIpcHandlers(
    () => mainWindow,
    async () => {
      await registerShortcuts();
    }
  );

  // Extension 관리 IPC 핸들러를 Extension 로딩 전에 등록 (레이스 컨디션 방지)
  try {
    registerExtensionHandlers();
    logger.info('[Main] Extension management IPC handlers registered');
  } catch (error) {
    logger.error('[Main] Failed to register extension management IPC handlers', { error });
  }

  // Extension 진단 IPC 핸들러 (extension-diagnostics 모듈이 없으면 스킵)
  try {
    const {
      registerExtensionDiagnosticsHandlers,
    } = require('./ipc/handlers/extension-diagnostics');
    registerExtensionDiagnosticsHandlers();
    logger.info('[Main] Extension diagnostics IPC handlers registered');
  } catch {
    // extension-diagnostics 모듈이 아직 생성되지 않은 경우 무시
  }

  // Initialize builtin tools (file_read, file_write, file_edit, file_list)
  initializeBuiltinTools();
  logger.info('Builtin tools initialized');

  // Create tray FIRST for fast startup
  createTray();
  logger.info('Tray created');

  // Create window and ensure protocol is registered (await it)
  const windowStart = Date.now();
  await createWindow();
  logger.info(`[Main] Window created in ${Date.now() - windowStart}ms`);

  // Setup Renderer console log capture (→ renderer-YYYY-MM-DD.log)
  if (mainWindow) {
    setupRendererLogCapture(mainWindow);
    logger.info('[Main] Renderer console log capture enabled');
  }

  // ✅ Extension 로딩 (윈도우 생성 후)
  // 윈도우를 먼저 띄워서 사용자에게 피드백을 주고, 백그라운드에서 Extension을 로드함
  // 단, Renderer가 Extension Registry를 필요로 하므로, 로딩 완료 이벤트를 Renderer로 보낼 필요가 있음
  logger.info('[Extensions] Loading extensions AFTER window creation...');
  const loadStart = Date.now();

  // 비동기로 로드할 수도 있지만, UI 렌더링에 필수적인 경우 블로킹이 나을 수도 있음.
  // 하지만 "30초 지연"을 해결하려면 일단 윈도우를 보여주는 것이 급선무.
  // Renderer는 'extension-ready' 이벤트를 수신할 때까지 로딩 화면을 보여주도록 처리해야 함.
  loadExtensionsBlocking()
    .then(() => {
      logger.info(`[Extensions] ✅ Extensions loaded successfully in ${Date.now() - loadStart}ms`);
      if (mainWindow) {
        mainWindow.webContents.send('extensions-ready');
      }
    })
    .catch((err) => {
      logger.error('[Extensions] Failed to load extensions:', {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    });

  // Initialize Notification Window Manager
  const notificationManager = NotificationWindowManager.getInstance();
  if (mainWindow) {
    notificationManager.setMainWindow(mainWindow);
  }
  logger.info('NotificationWindowManager initialized');

  // Register global shortcuts from config
  await registerShortcuts();

  // Setup terminal handlers with mainWindow after window is created
  if (mainWindow) {
    const { setupTerminalHandlers } = require('./ipc/handlers/terminal');
    setupTerminalHandlers(mainWindow);
    logger.info('Terminal handlers registered with mainWindow');
  }

  // Skills init은 비차단으로
  initializeSkills().catch((err) => logger.error('Skills init failed:', err));

  // Initialize Scheduler Service
  try {
    const schedulerService = SchedulerService.getInstance();
    await schedulerService.initialize();
    logger.info('Scheduler service initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Scheduler service:', error);
    // Non-critical error, continue app initialization
  }

  // Initialize Message Subscription Service
  try {
    const subscriptionService = MessageSubscriptionService.getInstance();
    const processorService = MessageProcessorService.getInstance();

    // MessageProcessorService에 mainWindow 설정
    if (mainWindow) {
      processorService.setMainWindow(mainWindow);
    }

    // 저장된 설정 로드
    const config = databaseService.getMessageSubscriptionConfig();
    if (config && config.enabled) {
      await subscriptionService.start(config);
      await processorService.start(config);
      logger.info('Message subscription service started successfully');
    } else {
      logger.info('Message subscription service is disabled');
    }
  } catch (error) {
    logger.error('Failed to initialize Message subscription service:', error);
    // Non-critical error, continue app initialization
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

/**
 * Extension 블로킹 로딩 (윈도우 생성 전)
 *
 * 윈도우 생성 전에 Extension을 로드하고 순차적으로 활성화합니다.
 * 완료 후 extensionsReady 플래그를 true로 설정합니다.
 */
async function loadExtensionsBlocking() {
  const startTime = Date.now();
  extensionLogger.loadingStarted('Main');
  fileLogger.info('Main', 'Extension loading started');

  // Main Process SDK is already initialized early in app.whenReady() (before IPC handlers)
  // This prevents race conditions where GraphFactory.initialize() is triggered by IPC before SDK is ready
  logger.info('[Extensions] Main Process SDK already initialized (early init)');
  fileLogger.info('Main', 'Main Process SDK already initialized (early init)');

  const { loadAllExtensions } = require('../lib/extensions/loader-runtime');
  const { createMainExtensionContext } = require('../lib/extensions/main-context-factory');
  const resourcesPath = path.join(app.getAppPath(), 'resources');
  const userDataPath = app.getPath('userData');

  /* REMOVED: Duplicate registration of extension IPC handlers */

  const pathsInfo = {
    resourcesPath,
    userDataPath,
    portableDir: process.env.PORTABLE_EXECUTABLE_DIR || '(not portable)',
    exeDir: path.dirname(app.getPath('exe')),
    appPath: app.getAppPath(),
    isPackaged: app.isPackaged,
  };

  logger.info('[Extensions] Loading extensions from .sepx files...', pathsInfo);
  fileLogger.info('Main', 'Loading extensions from .sepx files', pathsInfo);

  const extensions = await loadAllExtensions(resourcesPath, userDataPath);
  logger.info(`[Extensions] Loaded ${extensions.length} extension(s)`);
  fileLogger.info('Main', `Loaded ${extensions.length} extension(s)`, {
    extensionIds: extensions.map((e: any) => e.manifest.id),
  });

  // Log extensions found
  extensionLogger.filesFound(
    'Main',
    extensions.length,
    extensions.map((e: any) => `${e.manifest.id}@${e.manifest.version}`)
  );

  // Extension Registry에 등록 (Store slice 등록 완료까지 대기)
  fileLogger.info('Main', 'Registering extensions in registry...');
  for (const ext of extensions) {
    try {
      extensionLogger.registering('Main', ext.manifest.id);
      await extensionRegistry.register(ext.definition);
      logger.info(`[Extensions] ✅ Registered in registry: ${ext.manifest.id}`);
      fileLogger.info('Main', `✅ Registered in registry: ${ext.manifest.id}`);
      extensionLogger.registrationSuccess('Main', ext.manifest.id);
    } catch (regError) {
      logger.error(`[Extensions] ❌ Failed to register ${ext.manifest.id} in registry:`, regError);
      fileLogger.error('Main', `❌ Failed to register ${ext.manifest.id} in registry`, regError);
    }
  }

  // ✅ 병렬 활성화 (성능 최적화, 개별 타임아웃)
  const extensionsToActivate = extensions.filter((ext: any) => ext.definition?.activate);

  const activationPromises = extensionsToActivate.map(async (ext) => {
    const activationTimeout = 5000; // 5초 타임아웃
    const activationStart = Date.now();
    try {
      extensionLogger.activating('Main', ext.manifest.id);
      const context = createMainExtensionContext(ext.manifest.id, ext.path, ext.manifest);

      // 타임아웃과 함께 activate 실행
      await Promise.race([
        ext.definition.activate!(context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Activation timeout')), activationTimeout)
        ),
      ]);

      const activationDuration = Date.now() - activationStart;
      logger.info(`[Extensions] ✅ Activated extension: ${ext.manifest.id}`);
      extensionLogger.activationSuccess('Main', ext.manifest.id, activationDuration);
      return { id: ext.manifest.id, success: true };
    } catch (error) {
      logger.error(`[Extensions] ❌ Failed to activate extension ${ext.manifest.id}:`, error);
      extensionLogger.activationFailed('Main', ext.manifest.id, error);
      return { id: ext.manifest.id, success: false, error };
    }
  });

  // 모든 활성화 완료 대기 (실패해도 계속 진행)
  const results = await Promise.allSettled(activationPromises);
  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length;
  logger.info(
    `[Extensions] Activation complete: ${successCount}/${extensionsToActivate.length} succeeded`
  );
  fileLogger.info(
    'Main',
    `Activation complete: ${successCount}/${extensionsToActivate.length} succeeded`
  );
  extensionLogger.loadingComplete('Main', extensionsToActivate.length, successCount);

  // ✅ Ready 플래그 설정 (이벤트 시스템 대신 동기 플래그 사용)
  extensionsReady = true;
  const totalTime = Date.now() - startTime;
  logger.info('[Extensions] ✅ All extensions loaded and activated, extensionsReady = true');
  fileLogger.info(
    'Main',
    `✅ Extensions loaded successfully in ${totalTime}ms, extensionsReady = true`
  );
  extensionLogger.readyFlagSet('Main', true);
}

/**
 * extension:is-ready IPC 핸들러
 *
 * Renderer에서 Extension 로딩 완료 상태를 동기적으로 확인할 수 있도록 합니다.
 */
ipcMain.handle('extension:is-ready', async () => {
  return extensionsReady;
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
  fileLogger.info('Main', 'App is quitting');

  // Shutdown Scheduler Service
  try {
    const schedulerService = SchedulerService.getInstance();
    schedulerService.shutdown();
    logger.info('Scheduler service shut down successfully');
  } catch (error) {
    logger.error('Failed to shut down Scheduler service:', error);
  }

  // Close file logger
  closeFileLogger();

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
