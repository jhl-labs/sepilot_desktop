import { contextBridge, ipcRenderer } from 'electron';
import type { ExecutionHistoryQuery } from '../types/scheduler';

// Fix global is not defined error
// Electron sandbox 환경에서 global 객체가 없으므로 globalThis로 매핑
if (typeof global === 'undefined') {
  (window as any).global = globalThis;
}

type IpcResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

function unwrapIpcData<T>(result: IpcResult<T>, channel: string): T {
  if (!result || typeof result !== 'object') {
    throw new Error(`[IPC] Invalid response from ${channel}`);
  }
  if (!result.success) {
    throw new Error(result.error || `[IPC] ${channel} failed`);
  }
  return result.data as T;
}

// Renderer 프로세스에 안전하게 노출할 API
const electronAPI = {
  // 플랫폼 정보
  platform: process.platform,

  // Chat operations
  chat: {
    saveConversation: (conversation: any) => ipcRenderer.invoke('save-conversation', conversation),
    saveConversationsBulk: (conversations: any[]) =>
      ipcRenderer.invoke('save-conversations-bulk', conversations),
    loadConversations: () => ipcRenderer.invoke('load-conversations'),
    searchConversations: (query: string) => ipcRenderer.invoke('search-conversations', query),
    deleteConversation: (id: string) => ipcRenderer.invoke('delete-conversation', id),
    updateConversationTitle: (id: string, title: string) =>
      ipcRenderer.invoke('update-conversation-title', id, title),
    saveMessage: (message: any) => ipcRenderer.invoke('save-message', message),
    saveMessagesBulk: (messages: any[]) => ipcRenderer.invoke('save-messages-bulk', messages),
    loadMessages: (conversationId: string) => ipcRenderer.invoke('load-messages', conversationId),
    deleteMessage: (id: string) => ipcRenderer.invoke('delete-message', id),
    deleteConversationMessages: (conversationId: string) =>
      ipcRenderer.invoke('delete-conversation-messages', conversationId),
    replaceConversationMessages: (conversationId: string, newMessages: any[]) =>
      ipcRenderer.invoke('replace-conversation-messages', conversationId, newMessages),
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

  // Persona operations
  persona: {
    loadAll: () => ipcRenderer.invoke('persona-load-all'),
    save: (persona: any) => ipcRenderer.invoke('persona-save', persona),
    update: (persona: any) => ipcRenderer.invoke('persona-update', persona),
    delete: (id: string) => ipcRenderer.invoke('persona-delete', id),
  },

  // Config operations
  config: {
    load: () => ipcRenderer.invoke('load-config'),
    save: (config: any) => ipcRenderer.invoke('save-config', config),
    updateSetting: (key: string, value: any) => ipcRenderer.invoke('update-setting', key, value),
    getSetting: (key: string) => ipcRenderer.invoke('get-setting', key),
    getNetworkEnvVars: () => ipcRenderer.invoke('get-network-env-vars'),
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
    listPrompts: (serverName: string) => ipcRenderer.invoke('mcp-list-prompts', serverName),
    getPrompt: (serverName: string, promptName: string, args?: Record<string, string>) =>
      ipcRenderer.invoke('mcp-get-prompt', serverName, promptName, args),
    toggleTool: (serverName: string, toolName: string, enabled: boolean) =>
      ipcRenderer.invoke('mcp-toggle-tool', serverName, toolName, enabled),
    setDisabledTools: (serverName: string, disabledTools: string[]) =>
      ipcRenderer.invoke('mcp-set-disabled-tools', serverName, disabledTools),
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
    },
  },

  // LLM operations (CORS 문제 해결)
  llm: {
    streamChat: (messages: any[]) => ipcRenderer.invoke('llm-stream-chat', messages),
    chat: (messages: any[], options?: any) => ipcRenderer.invoke('llm-chat', messages, options),
    init: (config: any) => ipcRenderer.invoke('llm-init', config),
    validate: () => ipcRenderer.invoke('llm-validate'),
    generateTitle: (messages: any[], language?: string) =>
      ipcRenderer.invoke('llm-generate-title', { messages, language }),
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
      useRag?: boolean;
      useTools?: boolean;
      metadata?: {
        currentLine: string;
        previousLine: string;
        nextLine: string;
        lineNumber: number;
        hasContextBefore: boolean;
        hasContextAfter: boolean;
        wordWrapColumn?: number;
      };
    }) => ipcRenderer.invoke('llm-editor-autocomplete', context),
    editorAction: (params: {
      action: // 코드용 AI 액션
        | 'explain'
        | 'fix'
        | 'improve'
        | 'complete'
        | 'add-comments'
        | 'generate-tests'
        // 문서용 AI 액션
        | 'continue'
        | 'make-shorter'
        | 'make-longer'
        | 'simplify'
        | 'fix-grammar'
        | 'summarize'
        | 'translate'
        | 'custom';
      text: string;
      language?: string;
      targetLanguage?: string;
      context?: {
        before: string;
        after: string;
        fullCode?: string;
        filePath?: string;
        lineStart: number;
        lineEnd: number;
        useRag?: boolean;
        useTools?: boolean;
        wordWrapColumn?: number;
      };
    }) => ipcRenderer.invoke('llm-editor-action', params),
  },

  // LangGraph operations (CORS 문제 해결)
  // conversationId를 통해 각 대화별로 스트리밍을 격리
  langgraph: {
    stream: (
      graphConfig: any,
      messages: any[],
      conversationId?: string,
      imageGenConfig?: any,
      networkConfig?: any,
      workingDirectory?: string
    ) =>
      ipcRenderer.invoke(
        'langgraph-stream',
        graphConfig,
        messages,
        conversationId,
        imageGenConfig,
        networkConfig,
        workingDirectory
      ),
    onStreamEvent: (callback: (event: any) => void) => {
      const handler = (_: any, event: any) => callback(event);
      ipcRenderer.on('langgraph-stream-event', handler);
      // Return cleanup function instead of handler
      return () => ipcRenderer.removeListener('langgraph-stream-event', handler);
    },
    onStreamDone: (callback: (data?: { conversationId?: string }) => void) => {
      const handler = (_: any, data?: { conversationId?: string }) => callback(data);
      ipcRenderer.on('langgraph-stream-done', handler);
      // Return cleanup function instead of handler
      return () => ipcRenderer.removeListener('langgraph-stream-done', handler);
    },
    onStreamError: (callback: (data: { error: string; conversationId?: string }) => void) => {
      const handler = (_: any, data: { error: string; conversationId?: string }) => callback(data);
      ipcRenderer.on('langgraph-stream-error', handler);
      // Return cleanup function instead of handler
      return () => ipcRenderer.removeListener('langgraph-stream-error', handler);
    },
    // Tool Approval (Human-in-the-loop)
    onToolApprovalRequest: (
      callback: (data: {
        conversationId: string;
        messageId: string;
        toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
      }) => void
    ) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('langgraph-tool-approval-request', handler);
      // Return cleanup function instead of handler
      return () => ipcRenderer.removeListener('langgraph-tool-approval-request', handler);
    },
    respondToolApproval: (conversationId: string, approved: boolean) =>
      ipcRenderer.invoke('langgraph-tool-approval-response', conversationId, approved),
    submitDiscussInput: (conversationId: string, userInput: string) =>
      ipcRenderer.invoke('langgraph-discuss-input-response', conversationId, userInput),
    abort: (conversationId: string) => ipcRenderer.invoke('langgraph-abort', conversationId),
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
    deleteIndex: (name: string) => ipcRenderer.invoke('vectordb-delete-index', name),
    indexExists: (name: string) => ipcRenderer.invoke('vectordb-index-exists', name),
    insert: (documents: any[]) => ipcRenderer.invoke('vectordb-insert', documents),
    search: (queryEmbedding: number[], k: number, options?: any, queryText?: string) =>
      ipcRenderer.invoke('vectordb-search', queryEmbedding, k, options, queryText),
    delete: (ids: string[]) => ipcRenderer.invoke('vectordb-delete', ids),
    updateMetadata: (id: string, metadata: Record<string, any>) =>
      ipcRenderer.invoke('vectordb-update-metadata', id, metadata),
    count: () => ipcRenderer.invoke('vectordb-count'),
    getAll: () => ipcRenderer.invoke('vectordb-get-all'),
    indexDocuments: (
      documents: Array<{ id: string; content: string; metadata: Record<string, any> }>,
      options: { chunkSize: number; chunkOverlap: number; batchSize: number }
    ) => ipcRenderer.invoke('vectordb-index-documents', documents, options),
    export: () => ipcRenderer.invoke('vectordb-export'),
    import: (exportData: any, options?: { overwrite?: boolean }) =>
      ipcRenderer.invoke('vectordb-import', exportData, options),
    createEmptyFolder: (folderPath: string) =>
      ipcRenderer.invoke('vectordb-create-empty-folder', folderPath),
    deleteEmptyFolder: (folderPath: string) =>
      ipcRenderer.invoke('vectordb-delete-empty-folder', folderPath),
    getAllEmptyFolders: () => ipcRenderer.invoke('vectordb-get-all-empty-folders'),
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
    rename: (oldPath: string, newPath: string) => ipcRenderer.invoke('fs:rename', oldPath, newPath),
    copy: (sourcePath: string, destPath: string) =>
      ipcRenderer.invoke('fs:copy', sourcePath, destPath),
    move: (sourcePath: string, destPath: string) =>
      ipcRenderer.invoke('fs:move', sourcePath, destPath),
    getAbsolutePath: (filePath: string) => ipcRenderer.invoke('fs:get-absolute-path', filePath),
    getRelativePath: (from: string, to: string) =>
      ipcRenderer.invoke('fs:get-relative-path', from, to),
    resolvePath: (basePath: string, relativePath: string) =>
      ipcRenderer.invoke('fs:resolve-path', basePath, relativePath),
    basename: (filePath: string, ext?: string) => ipcRenderer.invoke('fs:basename', filePath, ext),
    dirname: (filePath: string) => ipcRenderer.invoke('fs:dirname', filePath),
    extname: (filePath: string) => ipcRenderer.invoke('fs:extname', filePath),
    showInFolder: (itemPath: string) => ipcRenderer.invoke('fs:show-in-folder', itemPath),
    openWithDefaultApp: (itemPath: string) =>
      ipcRenderer.invoke('fs:open-with-default-app', itemPath),
    duplicate: (sourcePath: string) => ipcRenderer.invoke('fs:duplicate', sourcePath),
    searchFiles: (query: string, dirPath: string, options?: any) =>
      ipcRenderer.invoke('fs:search-files', query, dirPath, options),
    findFiles: (rootPath: string, pattern: string) =>
      ipcRenderer.invoke('fs:find-files', rootPath, pattern),
    readWikiConfig: (dirPath: string) => ipcRenderer.invoke('fs:read-wiki-config', dirPath),
    writeWikiConfig: (dirPath: string, config: any) =>
      ipcRenderer.invoke('fs:write-wiki-config', dirPath, config),
    saveClipboardImage: (destDir: string) => ipcRenderer.invoke('fs:save-clipboard-image', destDir),
    readImageAsBase64: (filePath: string) =>
      ipcRenderer.invoke('fs:read-image-as-base64', filePath),
    getFileStat: (filePath: string) => ipcRenderer.invoke('fs:get-file-stat', filePath),
  },

  // GitHub operations
  github: {
    setPrivateKey: (privateKey: string) => ipcRenderer.invoke('github-set-private-key', privateKey),
    hasPrivateKey: () => ipcRenderer.invoke('github-has-private-key'),
    getRepositories: (baseUrl: string, appId: string, installationId: string, networkConfig: any) =>
      ipcRenderer.invoke('github-get-repositories', baseUrl, appId, installationId, networkConfig),
    syncFromGitHub: (
      baseUrl: string,
      installationId: string,
      repo: string,
      masterPassword: string,
      networkConfig: any
    ) =>
      ipcRenderer.invoke(
        'github-sync-from-github',
        baseUrl,
        installationId,
        repo,
        masterPassword,
        networkConfig
      ),
    syncToGitHub: (
      baseUrl: string,
      installationId: string,
      repo: string,
      config: any,
      masterPassword: string,
      networkConfig: any
    ) =>
      ipcRenderer.invoke(
        'github-sync-to-github',
        baseUrl,
        installationId,
        repo,
        config,
        masterPassword,
        networkConfig
      ),
  },

  // GitHub Sync operations (Token 기반)
  githubSync: {
    getMasterKey: () => ipcRenderer.invoke('github-sync-get-master-key'),
    testConnection: (config: any) => ipcRenderer.invoke('github-sync-test-connection', config),
    syncSettings: (config: any) => ipcRenderer.invoke('github-sync-settings', config),
    pullSettings: (config: any) => ipcRenderer.invoke('github-sync-pull-settings', config),
    syncDocuments: (config: any) => ipcRenderer.invoke('github-sync-documents', config),
    syncImages: (config: any) => ipcRenderer.invoke('github-sync-images', config),
    syncConversations: (config: any) => ipcRenderer.invoke('github-sync-conversations', config),
    syncPersonas: (config: any) => ipcRenderer.invoke('github-sync-personas', config),
    syncAll: (config: any) => ipcRenderer.invoke('github-sync-all', config),
    pullDocuments: (config: any) => ipcRenderer.invoke('github-sync-pull-documents', config),
  },

  // Team Docs operations (여러 GitHub Repo 동기화)
  teamDocs: {
    testConnection: (config: any) => ipcRenderer.invoke('team-docs-test-connection', config),
    syncDocuments: (config: any) => ipcRenderer.invoke('team-docs-sync-documents', config),
    pushDocuments: (config: any) => ipcRenderer.invoke('team-docs-push-documents', config),
    syncAll: () => ipcRenderer.invoke('team-docs-sync-all'),
    pushDocument: (params: {
      teamDocsId: string;
      documentId?: string;
      githubPath: string;
      oldGithubPath?: string;
      title: string;
      content: string;
      metadata?: Record<string, any>;
      sha?: string;
      commitMessage?: string;
    }) => ipcRenderer.invoke('team-docs-push-document', params),
  },

  // Error Reporting operations
  errorReporting: {
    send: (errorData: any) => ipcRenderer.invoke('error-reporting-send', errorData),
    isEnabled: () => ipcRenderer.invoke('error-reporting-is-enabled'),
    getContext: () => ipcRenderer.invoke('error-reporting-get-context'),
    sendConversation: (data: {
      issue: string;
      messages: any[];
      conversationId?: string;
      additionalInfo?: string;
    }) => ipcRenderer.invoke('error-reporting-send-conversation', data),
  },

  // Shell operations
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell-open-external', url),
  },

  // Embeddings operations (CORS 문제 해결)
  embeddings: {
    generate: (
      text: string,
      config: {
        apiKey: string;
        model: string;
        baseURL: string;
        networkConfig?: any;
      }
    ) => ipcRenderer.invoke('embeddings-generate', text, config),
    generateBatch: (
      texts: string[],
      config: {
        apiKey: string;
        model: string;
        baseURL: string;
        networkConfig?: any;
      }
    ) => ipcRenderer.invoke('embeddings-generate-batch', texts, config),
    validate: (config: { apiKey: string; model: string; baseURL: string; networkConfig?: any }) =>
      ipcRenderer.invoke('embeddings-validate', config),
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
    ) =>
      ipcRenderer.invoke(
        'comfyui-queue-prompt',
        httpUrl,
        workflow,
        clientId,
        apiKey,
        networkConfig
      ),
    fetchImage: (
      httpUrl: string,
      filename: string,
      subfolder: string,
      type: string,
      apiKey: string | undefined,
      networkConfig: any
    ) =>
      ipcRenderer.invoke(
        'comfyui-fetch-image',
        httpUrl,
        filename,
        subfolder,
        type,
        apiKey,
        networkConfig
      ),
  },

  // NanoBanana operations (CORS 문제 해결)
  nanobanana: {
    testConnection: (config: any, networkConfig: any) =>
      ipcRenderer.invoke('nanobanana-test-connection', config, networkConfig),
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
      'window:focus-changed',
      'notification:update-content',
      'extensions:main-ready',
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
    reloadShortcuts: () => ipcRenderer.invoke('quick-input:reload-shortcuts'),
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
    deleteSnapshot: (snapshotId: string) =>
      ipcRenderer.invoke('browser-view:delete-snapshot', snapshotId),
    openSnapshot: (snapshotId: string) =>
      ipcRenderer.invoke('browser-view:open-snapshot', snapshotId),
    // Bookmark operations
    addBookmark: (options?: { url?: string; title?: string; folderId?: string }) =>
      ipcRenderer.invoke('browser-view:add-bookmark', options),
    getBookmarks: () => ipcRenderer.invoke('browser-view:get-bookmarks'),
    deleteBookmark: (bookmarkId: string) =>
      ipcRenderer.invoke('browser-view:delete-bookmark', bookmarkId),
    openBookmark: (bookmarkId: string) =>
      ipcRenderer.invoke('browser-view:open-bookmark', bookmarkId),
    addBookmarkFolder: (name: string) =>
      ipcRenderer.invoke('browser-view:add-bookmark-folder', name),
    getBookmarkFolders: () => ipcRenderer.invoke('browser-view:get-bookmark-folders'),
    deleteBookmarkFolder: (folderId: string) =>
      ipcRenderer.invoke('browser-view:delete-bookmark-folder', folderId),
    // Browser settings
    getBrowserSettings: () => ipcRenderer.invoke('browser-view:get-browser-settings'),
    // Event listeners
    onDidNavigate: (
      callback: (data: {
        tabId: string;
        url: string;
        canGoBack: boolean;
        canGoForward: boolean;
      }) => void
    ) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('browser-view:did-navigate', handler);
      return handler;
    },
    onLoadingState: (
      callback: (data: {
        tabId: string;
        isLoading: boolean;
        canGoBack?: boolean;
        canGoForward?: boolean;
      }) => void
    ) => {
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
    clickElement: (elementId: string) =>
      ipcRenderer.invoke('browser-control:click-element', elementId),
    typeText: (elementId: string, text: string) =>
      ipcRenderer.invoke('browser-control:type-text', elementId, text),
    scroll: (direction: 'up' | 'down', amount?: number) =>
      ipcRenderer.invoke('browser-control:scroll', direction, amount),
    waitForElement: (selector: string, timeout?: number) =>
      ipcRenderer.invoke('browser-control:wait-for-element', selector, timeout),
    executeScript: (script: string) => ipcRenderer.invoke('browser-control:execute-script', script),
  },

  // Editor operations
  editor: {
    onReplaceSelection: (callback: (event: any, text: string) => void) => {
      const handler = (_: any, text: string) => callback(_, text);
      ipcRenderer.on('editor:replace-selection', handler);
      return () => ipcRenderer.removeListener('editor:replace-selection', handler);
    },
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
    killSession: (sessionId: string) => ipcRenderer.invoke('terminal:kill-session', sessionId),
    cancelCommand: (sessionId: string) => ipcRenderer.invoke('terminal:cancel-command', sessionId),
    getSessions: () => ipcRenderer.invoke('terminal:get-sessions'),
    // Command execution
    executeCommand: (command: string, cwd?: string, timeout?: number) =>
      ipcRenderer.invoke('terminal:execute-command', { command, cwd, timeout }),
    aiCommand: (
      naturalInput: string,
      currentCwd?: string,
      recentBlocks?: any[],
      clientRequestId?: string
    ) =>
      ipcRenderer.invoke('terminal:ai-command', {
        naturalInput,
        currentCwd,
        recentBlocks,
        clientRequestId,
      }),
    autocomplete: (cwd: string, input: string) =>
      ipcRenderer.invoke('terminal:autocomplete', { cwd, input }),
    // Event listeners
    onData: (callback: (data: { sessionId: string; data: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('terminal:data', handler);
      return handler;
    },
    onExit: (
      callback: (data: { sessionId: string; exitCode: number; signal?: number }) => void
    ) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('terminal:exit', handler);
      return handler;
    },
    onAIStream: (callback: (data: { chunk: string; conversationId: string }) => void) => {
      const handler = (_: any, data: any) => callback(data);
      ipcRenderer.on('terminal:ai-stream', handler);
      return handler;
    },
    removeListener: (event: string, handler: any) => {
      ipcRenderer.removeListener(event, handler);
    },
  },

  // Presentation exports
  presentation: {
    exportSlides: (slides: any, format: 'pptx' | 'pdf' | 'html') =>
      ipcRenderer.invoke('presentation:export', { slides, format }),
  },

  // Notification operations
  notification: {
    show: (options: {
      conversationId: string;
      title: string;
      body: string;
      html?: string;
      imageUrl?: string;
      type?: 'os' | 'application';
    }) => ipcRenderer.invoke('notification:show', options),

    onClick: (callback: (conversationId: string) => void) => {
      const handler = (_: any, conversationId: string) => callback(conversationId);
      ipcRenderer.on('notification:click', handler);
      return () => ipcRenderer.removeListener('notification:click', handler);
    },

    emitClick: (conversationId: string) => ipcRenderer.invoke('notification:click', conversationId),
    close: () => ipcRenderer.invoke('notification:close'),
    ready: () => ipcRenderer.invoke('notification:ready'),
  },

  // Message Subscription operations
  messageSubscription: {
    // 구독 관리
    start: async () => {
      const result = await ipcRenderer.invoke('message-subscription:start');
      return unwrapIpcData(result, 'message-subscription:start');
    },
    stop: async () => {
      const result = await ipcRenderer.invoke('message-subscription:stop');
      return unwrapIpcData(result, 'message-subscription:stop');
    },
    refresh: async () => {
      const result = await ipcRenderer.invoke('message-subscription:refresh');
      return unwrapIpcData<{ success: boolean; count: number; error?: string }>(
        result,
        'message-subscription:refresh'
      );
    },
    getStatus: async () => {
      const result = await ipcRenderer.invoke('message-subscription:get-status');
      return unwrapIpcData(result, 'message-subscription:get-status');
    },

    // 설정 관리
    getConfig: async () => {
      const result = await ipcRenderer.invoke('message-subscription:get-config');
      return unwrapIpcData(result, 'message-subscription:get-config');
    },
    saveConfig: async (config: any) => {
      const result = await ipcRenderer.invoke('message-subscription:save-config', config);
      return unwrapIpcData(result, 'message-subscription:save-config');
    },

    // 큐 관리
    getQueueStatus: async () => {
      const result = await ipcRenderer.invoke('message-subscription:get-queue-status');
      return unwrapIpcData(result, 'message-subscription:get-queue-status');
    },
    getFailedMessages: async () => {
      const result = await ipcRenderer.invoke('message-subscription:get-failed-messages');
      return unwrapIpcData<any[]>(result, 'message-subscription:get-failed-messages') || [];
    },
    getPendingMessages: async () => {
      const result = await ipcRenderer.invoke('message-subscription:get-pending-messages');
      return unwrapIpcData<any[]>(result, 'message-subscription:get-pending-messages') || [];
    },
    getCompletedMessages: async () => {
      const result = await ipcRenderer.invoke('message-subscription:get-completed-messages');
      return unwrapIpcData<any[]>(result, 'message-subscription:get-completed-messages') || [];
    },
    reprocessMessage: async (hash: string) => {
      const result = await ipcRenderer.invoke('message-subscription:reprocess-message', hash);
      return unwrapIpcData(result, 'message-subscription:reprocess-message');
    },
    deleteMessage: async (hash: string) => {
      const result = await ipcRenderer.invoke('message-subscription:delete-message', hash);
      return unwrapIpcData(result, 'message-subscription:delete-message');
    },
    cleanupQueue: async () => {
      const result = await ipcRenderer.invoke('message-subscription:cleanup-queue');
      return unwrapIpcData(result, 'message-subscription:cleanup-queue');
    },
  },

  // Scheduler operations
  scheduler: {
    createTask: (task: any) => ipcRenderer.invoke('scheduler-create-task', task),
    updateTask: (taskId: string, updates: any) =>
      ipcRenderer.invoke('scheduler-update-task', taskId, updates),
    deleteTask: (taskId: string) => ipcRenderer.invoke('scheduler-delete-task', taskId),
    loadTasks: () => ipcRenderer.invoke('scheduler-load-tasks'),
    runNow: (taskId: string) => ipcRenderer.invoke('scheduler-run-now', taskId),
    getHistory: (taskId?: string, filters?: ExecutionHistoryQuery) =>
      ipcRenderer.invoke('scheduler-get-history', {
        taskId,
        filters,
      }),
    onConversationCreated: (callback: (_event: any, data: any) => void) => {
      ipcRenderer.on('scheduler:conversation-created', callback);
      return () => {
        ipcRenderer.removeListener('scheduler:conversation-created', callback);
      };
    },
  },

  // Extension operations
  extension: {
    discover: () => ipcRenderer.invoke('extension:discover'),
    install: (packageName: string) => ipcRenderer.invoke('extension:install', { packageName }),
    uninstall: (packageName: string) => ipcRenderer.invoke('extension:uninstall', { packageName }),
    checkUpdates: () => ipcRenderer.invoke('extension:check-updates'),
    scanLocal: () => ipcRenderer.invoke('extension:scan-local'),
    installFromFile: (filePath: string) =>
      ipcRenderer.invoke('extension:install-from-file', { filePath }),
    uninstallLocal: (extensionId: string, version: string) =>
      ipcRenderer.invoke('extension:uninstall-local', { extensionId, version }),
    // Extension 로딩 진단 정보 조회 (Portable 빌드 디버깅용)
    diagnostics: () => ipcRenderer.invoke('extension:diagnostics'),
    // Renderer 환경에서 Extension 진단 실행 (런타임 체크 포함)
    diagnoseRenderer: async (extensionId: string) => {
      try {
        // Extension Registry에서 직접 Extension 가져오기
        const { extensionRegistry } = await import('../lib/extensions/registry');
        const extension = extensionRegistry.get(extensionId);

        if (!extension) {
          return {
            success: false,
            error: `Extension not found: ${extensionId}`,
          };
        }

        if (!extension.diagnostics) {
          return {
            success: false,
            error: `Extension '${extensionId}' does not provide a diagnostics function`,
          };
        }

        // Renderer 환경에서 diagnostics 함수 실행
        const result = await Promise.resolve(extension.diagnostics());

        return {
          success: true,
          data: result,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  },

  // Skills operations
  skills: {
    // 설치된 스킬 목록 조회
    getInstalled: () => ipcRenderer.invoke('skills:get-installed'),
    // 활성화된 스킬만 조회
    getEnabled: () => ipcRenderer.invoke('skills:get-enabled'),
    // 특정 스킬 조회
    getSkill: (skillId: string) => ipcRenderer.invoke('skills:get-skill', skillId),
    // 스킬 설치
    install: (skillPackage: any, source: any) =>
      ipcRenderer.invoke('skills:install', skillPackage, source),
    // 로컬 ZIP에서 스킬 설치
    installFromLocal: (zipPath: string) => ipcRenderer.invoke('skills:install-from-local', zipPath),
    // Backward compatibility for older callers
    installFromLocalFolder: (zipPath: string) =>
      ipcRenderer.invoke('skills:install-from-local', zipPath),
    // 스킬 제거
    remove: (skillId: string) => ipcRenderer.invoke('skills:remove', skillId),
    // 스킬 활성화/비활성화
    toggle: (skillId: string, enabled: boolean) =>
      ipcRenderer.invoke('skills:toggle', skillId, enabled),
    // 스킬 로드 (Lazy loading)
    loadSkill: (skillId: string) => ipcRenderer.invoke('skills:load-skill', skillId),
    // 스킬 사용 이력 업데이트
    updateUsage: (skillId: string) => ipcRenderer.invoke('skills:update-usage', skillId),
    // 스킬 통계 조회
    getStatistics: (skillId: string) => ipcRenderer.invoke('skills:get-statistics', skillId),
    // 스킬 사용 이력 조회
    getUsageHistory: (skillId: string, limit?: number) =>
      ipcRenderer.invoke('skills:get-usage-history', skillId, limit),
    // 스킬 패키지 검증
    validate: (skillPackage: any) => ipcRenderer.invoke('skills:validate', skillPackage),
    // 마켓플레이스에서 스킬 검색
    fetchMarketplace: () => ipcRenderer.invoke('skills:fetch-marketplace'),
    // 스킬 검색
    searchSkills: (query: string, filters?: any) =>
      ipcRenderer.invoke('skills:search-skills', query, filters),
    // 마켓플레이스에서 스킬 다운로드
    downloadFromMarketplace: (skillPath: string) =>
      ipcRenderer.invoke('skills:download-from-marketplace', skillPath),
    // 업데이트 확인
    checkUpdates: () => ipcRenderer.invoke('skills:check-updates'),
    // 스킬 업데이트
    updateSkill: (skillId: string) => ipcRenderer.invoke('skills:update-skill', skillId),
    // 사용자 스킬 폴더 설정
    setUserSkillsFolder: (folderPath: string) =>
      ipcRenderer.invoke('skills:set-user-skills-folder', folderPath),
    // 사용자 스킬 폴더 조회
    getUserSkillsFolder: () => ipcRenderer.invoke('skills:get-user-skills-folder'),
    // 사용자 스킬 폴더 스캔 및 로드
    scanUserSkillsFolder: (options?: {
      dedupeStrategy?: 'version_then_mtime' | 'mtime_only' | 'first_seen';
      includeHiddenDirs?: boolean;
    }) => ipcRenderer.invoke('skills:scan-user-skills-folder', options),
    // 폴더 선택 다이얼로그
    selectSkillsFolder: () => ipcRenderer.invoke('skills:select-folder'),
  },

  // Generic IPC invoke for extensions
  // Extension store slices에서 사용되는 generic IPC 호출
  invoke: <T = any>(channel: string, ...args: any[]): Promise<T> => {
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * 타입 안전한 IPC invoke
   *
   * 채널 이름에 따라 자동으로 Request/Response 타입이 추론됩니다.
   *
   * @example
   * ```typescript
   * // 타입이 자동으로 추론됨
   * const result = await window.electronAPI.typedInvoke('llm-chat', messages, options);
   * // result: { content: string; usage?: any }
   *
   * const files = await window.electronAPI.typedInvoke('file:list', '/home/user');
   * // files: { files: string[] }
   * ```
   */
  typedInvoke: (channel: string, ...args: any[]): Promise<any> => {
    return ipcRenderer.invoke(channel, ...args);
  },
};

// Context Bridge를 통해 안전하게 노출
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 타입 정의를 위한 export (실제로는 사용되지 않음)
export type ElectronAPI = typeof electronAPI;
