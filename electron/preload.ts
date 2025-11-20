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
    fetchModels: (config: {
      provider: any;
      baseURL?: string;
      apiKey: string;
      networkConfig?: any;
    }) => ipcRenderer.invoke('llm-fetch-models', config),
    onStreamChunk: (callback: (chunk: string) => void) => {
      const handler = (_: any, chunk: string) => callback(chunk);
      ipcRenderer.on('llm-stream-chunk', handler);
      return handler;
    },
    onStreamDone: (callback: () => void) => {
      const handler = () => callback();
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
  },

  // File operations
  file: {
    selectImages: () => ipcRenderer.invoke('file:select-images'),
    loadImage: (filePath: string) => ipcRenderer.invoke('file:load-image', filePath),
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

  // 이벤트 리스너
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const validChannels = ['update-available', 'download-progress'];

    if (validChannels.includes(channel)) {
      ipcRenderer.on(channel, (_, ...args) => callback(...args));
    }
  },

  // 이벤트 리스너 제거
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.removeListener(channel, callback);
  },
};

// Context Bridge를 통해 안전하게 노출
contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// 타입 정의를 위한 export (실제로는 사용되지 않음)
export type ElectronAPI = typeof electronAPI;
