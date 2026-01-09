/**
 * Mock ElectronAPI for tests
 * 공통 mock 정의 - setup.ts와 setup.backend.ts에서 재사용
 */

export const mockElectronAPI = {
  platform: 'darwin',
  chat: {
    saveConversation: jest.fn(),
    loadConversations: jest.fn(),
    deleteConversation: jest.fn(),
    updateConversationTitle: jest.fn(),
    saveMessage: jest.fn(),
    loadMessages: jest.fn(),
    deleteMessage: jest.fn(),
  },
  config: {
    load: jest.fn(),
    save: jest.fn(),
    updateSetting: jest.fn(),
    getSetting: jest.fn(),
  },
  mcp: {
    addServer: jest.fn(),
    removeServer: jest.fn(),
    listServers: jest.fn(),
    getAllTools: jest.fn(),
    callTool: jest.fn(),
    toggleServer: jest.fn(),
  },
  auth: {
    initiateLogin: jest.fn(),
    githubLogin: jest.fn(),
    exchangeCode: jest.fn(),
    saveToken: jest.fn(),
    getUserInfo: jest.fn(),
    getToken: jest.fn(),
    logout: jest.fn(),
    syncFromGitHub: jest.fn(),
    syncToGitHub: jest.fn(),
    onAuthSuccess: jest.fn(),
    removeAuthSuccessListener: jest.fn(),
    onOAuthCallback: jest.fn(),
    removeOAuthCallbackListener: jest.fn(),
  },
  llm: {
    streamChat: jest.fn(),
    chat: jest.fn(),
    init: jest.fn(),
    validate: jest.fn(),
    fetchModels: jest.fn(),
    generateTitle: jest.fn(),
    onStreamChunk: jest.fn(),
    onStreamDone: jest.fn(),
    onStreamError: jest.fn(),
    removeStreamListener: jest.fn(),
  },
  vectorDB: {
    initialize: jest.fn(),
    createIndex: jest.fn(),
    deleteIndex: jest.fn(),
    indexExists: jest.fn(),
    insert: jest.fn(),
    search: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
    getAll: jest.fn(),
  },
  file: {
    selectImages: jest.fn(),
    loadImage: jest.fn(),
    selectDirectory: jest.fn(),
    read: jest.fn(),
  },
  fs: {
    readDirectory: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    createFile: jest.fn(),
    createDirectory: jest.fn(),
    delete: jest.fn(),
    rename: jest.fn(),
    fileExists: jest.fn(),
    resolvePath: jest.fn((parentPath: string, child: string) => {
      const separator = parentPath.endsWith('/') ? '' : '/';
      return Promise.resolve({
        success: true,
        data: `${parentPath}${separator}${child}`,
      });
    }),
  },
  github: {
    getRepositories: jest.fn(),
    setPrivateKey: jest.fn(),
    hasPrivateKey: jest.fn(),
    syncFromGitHub: jest.fn(),
    syncToGitHub: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
  embeddings: {
    generate: jest.fn(),
    generateBatch: jest.fn(),
    validate: jest.fn(),
  },
  comfyui: {
    testConnection: jest.fn(),
    queuePrompt: jest.fn(),
    fetchImage: jest.fn(),
  },
  browserView: {
    create: jest.fn(() => Promise.resolve()),
    loadURL: jest.fn(),
    goBack: jest.fn(),
    goForward: jest.fn(),
    reload: jest.fn(),
    setBounds: jest.fn(),
    setVisible: jest.fn(),
    destroy: jest.fn(),
    hideAll: jest.fn(() => Promise.resolve()),
    showActive: jest.fn(() => Promise.resolve()),
    onDidNavigate: jest.fn(() => jest.fn()),
    onLoadingState: jest.fn(() => jest.fn()),
    removeListener: jest.fn(),
    getBookmarks: jest.fn(),
    getBookmarkFolders: jest.fn(),
    addBookmarkFolder: jest.fn(),
    deleteBookmarkFolder: jest.fn(),
    deleteBookmark: jest.fn(),
    addBookmark: jest.fn(),
    openBookmark: jest.fn(),
    capturePage: jest.fn(),
    getSnapshots: jest.fn(),
    deleteSnapshot: jest.fn(),
    openSnapshot: jest.fn(),
    getBrowserSettings: jest.fn(),
  },
  activity: {
    loadActivities: jest.fn(),
    saveActivity: jest.fn(),
  },
  invoke: jest.fn(),
  on: jest.fn(),
  removeListener: jest.fn(),
};

/**
 * Mock window object with electronAPI
 */
export const mockWindow = {
  electronAPI: mockElectronAPI,
};

/**
 * Setup mock electronAPI on global window
 */
export function setupMockElectronAPI() {
  Object.defineProperty(global, 'window', {
    writable: true,
    value: mockWindow,
  });
}

/**
 * Clear all mock function calls
 */
export function clearMockElectronAPI() {
  Object.values(mockElectronAPI).forEach((api: any) => {
    if (typeof api === 'object') {
      Object.values(api).forEach((fn: any) => {
        if (typeof fn?.mockClear === 'function') {
          fn.mockClear();
        }
      });
    }
  });
}
