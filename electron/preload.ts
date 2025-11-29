import { contextBridge, ipcRenderer } from 'electron';

// Fix global is not defined error
// Electron sandbox 환경에서 global 객체가 없으므로 globalThis로 매핑
if (typeof global === 'undefined') {
  (window as any).global = globalThis;
}

// Renderer 프로세스에 안전하게 노출할 API
const electronAPI = {
  // 플랫폼 정보
  platform: process.platform,

  // Chat operations
  chat: {
    saveConversation: (conversation: any) =>
      ipcRenderer.invoke('save-conversation', conversation),
    loadConversations: () => ipcRenderer.invoke('load-conversations'),
    deleteConversation: (id: string) =>
      ipcRenderer.invoke('delete-conversation', id),
    updateConversationTitle: (id: string, title: string) =>
      ipcRenderer.invoke('update-conversation-title', id, title),
    saveMessage: (message: any) => ipcRenderer.invoke('save-message', message),
    loadMessages: (conversationId: string) =>
      ipcRenderer.invoke('load-messages', conversationId),
    deleteMessage: (id: string) => ipcRenderer.invoke('delete-message', id),
  },

  // Activity operations (도구 실행 이력)
  activity: {
    saveActivity: (activity: any) => ipcRenderer.invoke('save-activity', activity),
    loadActivities: (conversationId: string) =>
      ipcRenderer.invoke('load-activities', conversationId),
    deleteActivity: (id: string) => ipcRenderer.invoke('delete-activity', id),
    deleteActivitiesByConversation: (conversationId: string) =>
      ipcRenderer.invoke('delete-activities-by-conversation', conversationId),
  },

  // Config operations
  config: {
    load: () => ipcRenderer.invoke('load-config'),
    save: (config: any) => ipcRenderer.invoke('save-config', config),
    updateSetting: (key: string, value: any) =>
      ipcRenderer.invoke('update-setting', key, value),
    getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
  },

  // MCP operations
  mcp: {
    addServer: (config: any) => ipcRenderer.invoke('mcp-add-server', config),
    removeServer: (name: string) => ipcRenderer.invoke('mcp-remove-server', name),
    listServers: () => ipcRenderer.invoke('mcp-list-servers'),
    getAllTools: () => ipcRenderer.invoke('mcp-get-all-tools'),
    callTool: (serverName: string, toolName: string, args: any) =>
      ipcRenderer.invoke('mcp-call-tool', serverName, toolName, args),
    toggleServer: (name: string) => ipcRenderer.invoke('mcp-toggle-server', name),
    getServerStatus: (name: string) => ipcRenderer.invoke('mcp-get-server-status', name),
  },

  // Auth operations
  auth: {
    initiateLogin: () => ipcRenderer.invoke('auth-initiate-login'),
    exchangeCode: (code: string, codeVerifier: string) =>
      ipcRenderer.invoke('auth-exchange-code', code, codeVerifier),
    getUserInfo: (token: string) => ipcRenderer.invoke('auth-get-user-info', token),
    getToken: () => ipcRenderer.invoke('auth-get-token'),
    logout: () => ipcRenderer.invoke('auth-logout'),
    syncFromGitHub: (token: string, masterPassword: string) =>
      ipcRenderer.invoke('auth-sync-from-github', token, masterPassword),
    syncToGitHub: (token: string, config: any, masterPassword: string) =>
      ipcRenderer.invoke('auth-sync-to-github', token, config, masterPassword),
    onAuthSuccess: (callback: () => void) => {
      const handler = () => callback();
      ipcRenderer.on('auth-success', handler);
      return handler;
    },
    removeAuthSuccessListener: (handler: () => void) => {
      ipcRenderer.removeListener('auth-success', handler);
    },
    onOAuthCallback: (callback: (url: string) => void) => {
      const handler = (_: any, url: string) => callback(url);
      ipcRenderer.on('oauth-callback', handler);
      return handler;
    },
    removeOAuthCallbackListener: (handler: (event: any, url: string) => void) => {
      ipcRenderer.removeListener('oauth-callback', handler);
    }
  },

  // LLM operations (CORS 문제 해결)
  llm: {
    streamChat: (messages: any[]) => ipcRenderer.invoke('llm-stream-chat', messages),
    chat: (messages: any[], options?: any) => ipcRenderer.invoke('llm-chat', messages, options),
    init: (config: any) => ipcRenderer.invoke('llm-init', config),
    validate: () => ipcRenderer.invoke('llm-validate'),
    generateTitle: (messages: any[]) => ipcRenderer.invoke('llm-generate-title', messages),
    fetchModels: (config: {
      provider: any;
      baseURL?: string;
      apiKey: string;
      customHeaders?: Record<string, string>;
      networkConfig?: any;
    }) => ipcRenderer.invoke('llm-fetch-models', config),
    onStreamChunk: (callback: (chunk: string) => void) => {
      const handler = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on('llm-stream-chunk', handler);
      return handler;
    },
    onStreamDone: (callback: () => void) => {
      const handler = (_: any) => callback();
      ipcRenderer.on('llm-stream-done', handler);
      return handler;
    },
    onStreamError: (callback: (error: string) => void) => {
      const handler = (_: any, error: string) => callback(error);
      ipcRenderer.on('llm-stream-error', handler);
      return handler;
    },
    removeStreamListener: (event: string, handler: any) => {
      ipcRenderer.removeListener(event, handler);
    },
    removeAllStreamListeners: () => {
      ipcRenderer.removeAllListeners('llm-stream-chunk');
      ipcRenderer.removeAllListeners('llm-stream-done');
      ipcRenderer.removeAllListeners('llm-stream-error');
    },
    editorAutocomplete: (context: {
      code: string;
      cursorPosition: number;
      language?: string;
    }) => ipcRenderer.invoke('llm-editor-autocomplete', context),
    editorAction: (params: {
      action: 'summarize' | 'translate' | 'complete' | 'explain' | 'fix' | 'improve';
      text: string;
      language?: string;
      targetLanguage?: string;
    }) => ipcRenderer.invoke('llm-editor-action', params),
  },

  // LangGraph operations (CORS 문제 해결)
  // conversationId를 통해 각 대화별로 스트리밍을 격리
  langgraph: {
    stream: (graphConfig: any, messages: any[], conversationId?: string, comfyUIConfig?: any, networkConfig?: any, workingDirectory?: string) =>
      ipcRenderer.invoke('langgraph-stream', graphConfig, messages, conversationId, comfyUIConfig, networkConfig, workingDirectory),
    onStreamEvent: (callback: (event: any) => void) => {
      const handler = (_: any, event: any) => callback(event);
      ipcRenderer.on('langgraph-stream-event', handler);
      return handler;
    },
    onStreamDone: (callback: (data?: { conversationId?: string }) => void) => {
      const handler = (_: any, data?: { conversationId?: string }) => callback(data);
      ipcRenderer.on('langgraph-stream-done', handler);
      return handler;
    },
    onStreamError: (callback: (data: { error: string; conversationId?: string }) => void) => {
      const handler = (_: any, data: { error: string; conversationId?: string }) => callback(data);
      ipcRenderer.on('langgraph-stream-error', handler);
      return handler;
    },
    // Tool Approval (Human-in-the-loop)
    onToolApprovalRequest: (callback: (data: {
      conversationId: string;
      messageId: string;
      toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('langgraph-tool-approval-request', handler);
      return handler;
    },
    respondToolApproval: (conversationId: string, approved: boolean) =>
      ipcRenderer.invoke('langgraph-tool-approval-response', conversationId, approved),
    abort: (conversationId: string) =>
      ipcRenderer.invoke('langgraph-abort', conversationId),
    stopBrowserAgent: (conversationId: string) =>
      ipcRenderer.invoke('langgraph-stop-browser-agent', conversationId),
    removeStreamListener: (event: string, handler: any) => {
      ipcRenderer.removeListener(event, handler);
    },
    removeAllStreamListeners: () => {
      ipcRenderer.removeAllListeners('langgraph-stream-event');
      ipcRenderer.removeAllListeners('langgraph-stream-done');
      ipcRenderer.removeAllListeners('langgraph-stream-error');
      ipcRenderer.removeAllListeners('langgraph-tool-approval-request');
    },
  },

  // VectorDB operations
  vectorDB: {
    initialize: (config: { indexName: string; dimension: number }) =>
      ipcRenderer.invoke('vectordb-initialize', config),
    createIndex: (name: string, dimension: number) =>
      ipcRenderer.invoke('vectordb-create-index', name, dimension),
    deleteIndex: (name: string) =>
      ipcRenderer.invoke('vectordb-delete-index', name),
    indexExists: (name: string) =>
      ipcRenderer.invoke('vectordb-index-exists', name),
    insert: (documents: any[]) =>
      ipcRenderer.invoke('vectordb-insert', documents),
    search: (queryEmbedding: number[], k: number) =>
      ipcRenderer.invoke('vectordb-search', queryEmbedding, k),
    delete: (ids: string[]) =>
      ipcRenderer.invoke('vectordb-delete', ids),
    count: () =>
      ipcRenderer.invoke('vectordb-count'),
    getAll: () =>
      ipcRenderer.invoke('vectordb-get-all'),
    indexDocuments: (documents: Array<{ id: string; content: string; metadata: Record<string, any> }>, options: { chunkSize: number; chunkOverlap: number; batchSize: number }) =>
      ipcRenderer.invoke('vectordb-index-documents', documents, options),
  },

  // File operations
  file: {
    selectImages: () => ipcRenderer.invoke('file:select-images'),
    loadImage: (filePath: string) => ipcRenderer.invoke('file:load-image', filePath),
    fetchUrl: (url: string) => ipcRenderer.invoke('file:fetch-url', url),
    selectDocument: () => ipcRenderer.invoke('file:select-document'),
    read: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
    selectDirectory: () => ipcRenderer.invoke('file:select-directory'),
  },

  // File System operations (Editor용)
  fs: {
    readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:read-directory', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:read-file', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:write-file', filePath, content),
    createFile: (filePath: string, content?: string) =>
      ipcRenderer.invoke('fs:create-file', filePath, content),
    createDirectory: (dirPath: string) => ipcRenderer.invoke('fs:create-directory', dirPath),
    delete: (targetPath: string) => ipcRenderer.invoke('fs:delete', targetPath),
    rename: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('fs:rename', oldPath, newPath),
    searchFiles: (query: string, dirPath: string, options?: any) =>
      ipcRenderer.invoke('fs:search-files', query, dirPath, options),
  },

  // GitHub operations
  github: {
    setPrivateKey: (privateKey: string) =>
      ipcRenderer.invoke('github-set-private-key', privateKey),
    hasPrivateKey: () =>
      ipcRenderer.invoke('github-has-private-key'),
    getRepositories: (baseUrl: string, appId: string, installationId: string, networkConfig: any) =>
      ipcRenderer.invoke('github-get-repositories', baseUrl, appId, installationId, networkConfig),
    syncFromGitHub: (baseUrl: string, installationId: string, repo: string, masterPassword: string, networkConfig: any) =>
      ipcRenderer.invoke('github-sync-from-github', baseUrl, installationId, repo, masterPassword, networkConfig),
    syncToGitHub: (baseUrl: string, installationId: string, repo: string, config: any, masterPassword: string, networkConfig: any) =>
      ipcRenderer.invoke('github-sync-to-github', baseUrl, installationId, repo, config, masterPassword, networkConfig),
  },

  // Shell operations
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell-open-external', url),
  },

  // Embeddings operations (CORS 문제 해결)
  embeddings: {
    generate: (text: string, config: {
      apiKey: string;
      model: string;
      baseURL: string;
      networkConfig?: any;
    }) => ipcRenderer.invoke('embeddings-generate', text, config),
    generateBatch: (texts: string[], config: {
      apiKey: string;
      model: string;
      baseURL: string;
      networkConfig?: any;
    }) => ipcRenderer.invoke('embeddings-generate-batch', texts, config),
    validate: (config: {
      apiKey: string;
      model: string;
      baseURL: string;
      networkConfig?: any;
    }) => ipcRenderer.invoke('embeddings-validate', config),
  },

  // ComfyUI operations (CORS 문제 해결)
  comfyui: {
    testConnection: (httpUrl: string, apiKey: string | undefined, networkConfig: any) =>
      ipcRenderer.invoke('comfyui-test-connection', httpUrl, apiKey, networkConfig),
    queuePrompt: (
      httpUrl: string,
      workflow: Record<string, any>,
      clientId: string,
      apiKey: string | undefined,
      networkConfig: any
    ) => ipcRenderer.invoke('comfyui-queue-prompt', httpUrl, workflow, clientId, apiKey, networkConfig),
    fetchImage: (
      httpUrl: string,
      filename: string,
      subfolder: string,
      type: string,
      apiKey: string | undefined,
      networkConfig: any
    ) => ipcRenderer.invoke('comfyui-fetch-image', httpUrl, filename, subfolder, type, apiKey, networkConfig),
  },

  // Update operations
  update: {
    check: () => ipcRenderer.invoke('update:check'),
    getVersion: () => ipcRenderer.invoke('update:get-version'),
  },

  // 이벤트 리스너
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = [
      'update-available',
      'download-progress',
      'create-new-chat-with-message',
    ];

    if (validChannels.includes(channel)) {
      // wrapper 함수 없이 직접 등록 (removeListener와 호환)
      const wrappedCallback = (_: unknown, ...args: unknown[]) => callback(...args);
      ipcRenderer.on(channel, wrappedCallback);
      // Store mapping for removeListener
      (callback as any).__ipcWrapper = wrappedCallback;
    }
  },

  // 이벤트 리스너 제거
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    // Use stored wrapper if available
    const wrappedCallback = (callback as any).__ipcWrapper || callback;
    ipcRenderer.removeListener(channel, wrappedCallback);
    delete (callback as any).__ipcWrapper;
  },

  // Quick Input operations
  quickInput: {
    submit: (message: string) => ipcRenderer.invoke('quick-input-submit', message),
    close: () => ipcRenderer.invoke('quick-input-close'),
    executeQuestion: (prompt: string) => ipcRenderer.invoke('quick-question-execute', prompt),
  },

  // BrowserView operations
  browserView: {
    // Tab management
    createTab: (url?: string) => ipcRenderer.invoke('browser-view:create-tab', url),
    switchTab: (tabId: string) => ipcRenderer.invoke('browser-view:switch-tab', tabId),
    closeTab: (tabId: string) => ipcRenderer.invoke('browser-view:close-tab', tabId),
    getTabs: () => ipcRenderer.invoke('browser-view:get-tabs'),
    // Navigation (operates on active tab)
    loadURL: (url: string) => ipcRenderer.invoke('browser-view:load-url', url),
    goBack: () => ipcRenderer.invoke('browser-view:go-back'),
    goForward: () => ipcRenderer.invoke('browser-view:go-forward'),
    reload: () => ipcRenderer.invoke('browser-view:reload'),
    setBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
      ipcRenderer.invoke('browser-view:set-bounds', bounds),
    getState: () => ipcRenderer.invoke('browser-view:get-state'),
    toggleDevTools: () => ipcRenderer.invoke('browser-view:toggle-devtools'),
    // Show/Hide
    hideAll: () => ipcRenderer.invoke('browser-view:hide-all'),
    showActive: () => ipcRenderer.invoke('browser-view:show-active'),
    // Snapshot operations
    capturePage: () => ipcRenderer.invoke('browser-view:capture-page'),
    getSnapshots: () => ipcRenderer.invoke('browser-view:get-snapshots'),
    deleteSnapshot: (snapshotId: string) => ipcRenderer.invoke('browser-view:delete-snapshot', snapshotId),
    openSnapshot: (snapshotId: string) => ipcRenderer.invoke('browser-view:open-snapshot', snapshotId),
    // Bookmark operations
    addBookmark: (options?: { url?: string; title?: string; folderId?: string }) =>
      ipcRenderer.invoke('browser-view:add-bookmark', options),
    getBookmarks: () => ipcRenderer.invoke('browser-view:get-bookmarks'),
    deleteBookmark: (bookmarkId: string) => ipcRenderer.invoke('browser-view:delete-bookmark', bookmarkId),
    openBookmark: (bookmarkId: string) => ipcRenderer.invoke('browser-view:open-bookmark', bookmarkId),
    addBookmarkFolder: (name: string) => ipcRenderer.invoke('browser-view:add-bookmark-folder', name),
    getBookmarkFolders: () => ipcRenderer.invoke('browser-view:get-bookmark-folders'),
    deleteBookmarkFolder: (folderId: string) => ipcRenderer.invoke('browser-view:delete-bookmark-folder', folderId),
    // Browser settings
    getBrowserSettings: () => ipcRenderer.invoke('browser-view:get-browser-settings'),
    // Event listeners
    onDidNavigate: (callback: (data: { tabId: string; url: string; canGoBack: boolean; canGoForward: boolean }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('browser-view:did-navigate', handler);
      return handler;
    },
    onLoadingState: (callback: (data: { tabId: string; isLoading: boolean; canGoBack?: boolean; canGoForward?: boolean }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('browser-view:loading-state', handler);
      return handler;
    },
    onTitleUpdated: (callback: (data: { tabId: string; title: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('browser-view:title-updated', handler);
      return handler;
    },
    onTabCreated: (callback: (data: { tabId: string; url: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('browser-view:tab-created', handler);
      return handler;
    },
    removeListener: (event: string, handler: any) => {
      ipcRenderer.removeListener(event, handler);
    },
  },

  // Browser Control operations (AI Agent 제어)
  browserControl: {
    getInteractiveElements: () => ipcRenderer.invoke('browser-control:get-interactive-elements'),
    getPageContent: () => ipcRenderer.invoke('browser-control:get-page-content'),
    captureScreenshot: () => ipcRenderer.invoke('browser-control:capture-screenshot'),
    clickElement: (elementId: string) => ipcRenderer.invoke('browser-control:click-element', elementId),
    typeText: (elementId: string, text: string) => ipcRenderer.invoke('browser-control:type-text', elementId, text),
    scroll: (direction: 'up' | 'down', amount?: number) => ipcRenderer.invoke('browser-control:scroll', direction, amount),
    waitForElement: (selector: string, timeout?: number) => ipcRenderer.invoke('browser-control:wait-for-element', selector, timeout),
    executeScript: (script: string) => ipcRenderer.invoke('browser-control:execute-script', script),
  },

  // Terminal operations
  terminal: {
    // Session management
    createSession: (cwd?: string, cols?: number, rows?: number) =>
      ipcRenderer.invoke('terminal:create-session', cwd, cols, rows),
    write: (sessionId: string, data: string) =>
      ipcRenderer.invoke('terminal:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number) =>
      ipcRenderer.invoke('terminal:resize', sessionId, cols, rows),
    killSession: (sessionId: string) =>
      ipcRenderer.invoke('terminal:kill-session', sessionId),
    getSessions: () => ipcRenderer.invoke('terminal:get-sessions'),
    // Event listeners
    onData: (callback: (data: { sessionId: string; data: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('terminal:data', handler);
      return handler;
    },
    onExit: (callback: (data: { sessionId: string; exitCode: number; signal?: number }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('terminal:exit', handler);
      return handler;
    },
    removeListener: (event: string, handler: any) => {
      ipcRenderer.removeListener(event, handler);
    },
  },
};

// Context Bridge를 통해 안전하게 노출
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 타입 정의를 위한 export (실제로는 사용되지 않음)
export type ElectronAPI = typeof electronAPI;
