/**
 * Frontend-specific test setup
 * This file contains mocks that are only needed for frontend tests (React components, etc.)
 */

// Mock i18n provider context (frontend only)
jest.mock('@/components/providers/i18n-provider', () => ({
  I18nProvider: ({ children }: any) => children,
  useI18nContext: () => ({
    language: 'ko' as const,
    setLanguage: jest.fn(),
    isLoading: false,
    supportedLanguages: ['ko', 'en', 'ja', 'zh-CN'] as const,
  }),
  useLanguage: () => ({
    language: 'ko' as const,
    setLanguage: jest.fn(),
    supportedLanguages: ['ko', 'en', 'ja', 'zh-CN'] as const,
  }),
}));

// Mock @sepilot/extension-sdk/store for extension component tests
jest.mock('@sepilot/extension-sdk/store', () => ({
  useExtensionStore: jest.fn(() => ({})),
  getExtensionStoreState: jest.fn(() => ({})),
  registerStoreAccessor: jest.fn(),
  setExtensionStoreState: jest.fn(),
  subscribeExtensionStore: jest.fn(),
  isStoreRegistered: jest.fn(() => true),
}));

// Mock @sepilot/extension-sdk/utils for extension component tests
jest.mock('@sepilot/extension-sdk/utils', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
  isElectron: jest.fn(() => false),
  isWeb: jest.fn(() => true),
  isMac: jest.fn(() => false),
  isWindows: jest.fn(() => false),
  isLinux: jest.fn(() => true),
  getEnvironment: jest.fn(() => 'web'),
  getElectronAPI: jest.fn(),
  safeElectronAPI: jest.fn(),
  platform: { isElectron: false, isWeb: true },
  generateId: jest.fn(() => 'mock-id'),
  generateUUID: jest.fn(() => 'mock-uuid'),
  generateShortId: jest.fn(() => 'mock-short-id'),
  validateManifest: jest.fn(),
  validateExtensionManifest: jest.fn(),
  validateAgentManifest: jest.fn(),
  validateExtensionManifestSafe: jest.fn(),
  isValidPermission: jest.fn(),
  getPermissionCategory: jest.fn(),
  isValidExtensionId: jest.fn(),
  isValidSemver: jest.fn(),
  copyToClipboard: jest.fn(),
  readFromClipboard: jest.fn(),
  getLanguageFromFilename: jest.fn(),
  getLanguageFromExtension: jest.fn(),
  isCodeFile: jest.fn(),
  getFileExtension: jest.fn(),
}));

// Mock @sepilot/extension-sdk/ui - create simple pass-through React components
jest.mock('@sepilot/extension-sdk/ui', () => {
  const React = require('react');
  const createComponent = (name: string) =>
    React.forwardRef(({ children, className, ...props }: any, ref: any) =>
      React.createElement('div', { ...props, className, ref, 'data-testid': name }, children)
    );
  const createInputComponent = (name: string, element: string = 'input') =>
    React.forwardRef((props: any, ref: any) =>
      React.createElement(element, { ...props, ref, 'data-testid': name })
    );

  return {
    Button: React.forwardRef(({ children, className, variant, size, ...props }: any, ref: any) =>
      React.createElement('button', { ...props, className, ref }, children)
    ),
    Input: createInputComponent('input'),
    Textarea: React.forwardRef((props: any, ref: any) =>
      React.createElement('textarea', { ...props, ref })
    ),
    Label: createComponent('label'),
    Badge: ({ children, className, variant, ...props }: any) =>
      React.createElement('span', { ...props, className }, children),
    Card: createComponent('card'),
    CardContent: createComponent('card-content'),
    CardDescription: createComponent('card-description'),
    CardHeader: createComponent('card-header'),
    CardTitle: createComponent('card-title'),
    Select: ({ children, value, onValueChange, ...props }: any) =>
      React.createElement('div', props, children),
    SelectContent: createComponent('select-content'),
    SelectItem: createComponent('select-item'),
    SelectTrigger: createComponent('select-trigger'),
    SelectValue: createComponent('select-value'),
    ContextMenu: ({ children }: any) => React.createElement(React.Fragment, null, children),
    ContextMenuContent: createComponent('context-menu-content'),
    ContextMenuItem: createComponent('context-menu-item'),
    ContextMenuTrigger: ({ children, asChild }: any) =>
      asChild ? children : React.createElement('div', null, children),
    DropdownMenu: ({ children }: any) => React.createElement('div', null, children),
    DropdownMenuContent: ({ children, ...props }: any) =>
      React.createElement('div', props, children),
    DropdownMenuItem: ({ children, onClick, ...props }: any) =>
      React.createElement('div', { ...props, onClick, role: 'menuitem' }, children),
    DropdownMenuTrigger: ({ children, asChild }: any) =>
      asChild ? children : React.createElement('div', null, children),
  };
});

// Mock @sepilot/extension-sdk (main entry) for useLangGraphStream etc.
jest.mock('@sepilot/extension-sdk', () => ({
  useLangGraphStream: jest.fn(() => ({
    startStream: jest.fn(),
    stopStream: jest.fn(),
  })),
  useResizeObserver: jest.fn(),
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  isElectron: jest.fn(() => false),
  useExtensionAPIContext: jest.fn(() => ({
    chat: {
      messages: [],
      addMessage: jest.fn(),
      updateMessage: jest.fn(),
      abort: jest.fn(),
    },
    workspace: {
      workingDirectory: null,
    },
    files: {
      openFile: jest.fn(),
      openFiles: [],
    },
    ipc: {
      invoke: jest.fn(),
      on: jest.fn(),
      send: jest.fn(),
    },
  })),
}));
