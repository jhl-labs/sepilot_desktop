'use client';

import { Sidebar } from './Sidebar';
import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import { useKeyboardShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { useChatStore } from '@/lib/store/chat-store';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { DocumentsPage } from '@/components/pages/DocumentsPage';
import { GalleryView } from '@/components/gallery/GalleryView';
import { initializeVectorDB } from '@/lib/vectordb/client';
import { initializeEmbedding } from '@/lib/vectordb/embeddings/client';
import { isElectron } from '@/lib/platform';

interface MainLayoutProps {
  children: ReactNode;
}

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 260;

type ViewMode = 'chat' | 'documents' | 'gallery';

// localStorage keys for sidebar widths
const SIDEBAR_WIDTH_KEYS = {
  chat: 'sepilot_sidebar_width_chat',
  editor: 'sepilot_sidebar_width_editor',
  browser: 'sepilot_sidebar_width_browser',
};

// Load sidebar width from localStorage
function loadSidebarWidth(mode: 'chat' | 'editor' | 'browser'): number {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_WIDTH;

  const key = SIDEBAR_WIDTH_KEYS[mode];
  const saved = localStorage.getItem(key);

  if (saved) {
    const width = parseInt(saved, 10);
    if (!isNaN(width) && width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
      return width;
    }
  }

  return DEFAULT_SIDEBAR_WIDTH;
}

// Save sidebar width to localStorage
function saveSidebarWidth(mode: 'chat' | 'editor' | 'browser', width: number) {
  if (typeof window === 'undefined') return;

  const key = SIDEBAR_WIDTH_KEYS[mode];
  localStorage.setItem(key, width.toString());
}

export function MainLayout({ children }: MainLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const { createConversation, messages, activeConversationId, streamingConversations, loadConversations, setAppMode, appMode, activeEditorTab, browserViewMode } = useChatStore();

  // Mode-specific sidebar widths - always start with default to avoid hydration mismatch
  const [chatSidebarWidth, setChatSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [editorSidebarWidth, setEditorSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [browserSidebarWidth, setBrowserSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);

  // Load saved widths on client side only
  useEffect(() => {
    setChatSidebarWidth(loadSidebarWidth('chat'));
    setEditorSidebarWidth(loadSidebarWidth('editor'));
    setBrowserSidebarWidth(loadSidebarWidth('browser'));
  }, []);

  // Get current sidebar width based on app mode
  const sidebarWidth = appMode === 'chat' ? chatSidebarWidth : appMode === 'editor' ? editorSidebarWidth : browserSidebarWidth;

  // Set sidebar width based on app mode
  const setSidebarWidth = (width: number) => {
    if (appMode === 'chat') {
      setChatSidebarWidth(width);
      saveSidebarWidth('chat', width);
    } else if (appMode === 'editor') {
      setEditorSidebarWidth(width);
      saveSidebarWidth('editor', width);
    } else {
      setBrowserSidebarWidth(width);
      saveSidebarWidth('browser', width);
    }
  };

  // Determine if current conversation is streaming
  const isStreaming = activeConversationId ? streamingConversations.has(activeConversationId) : false;
  const startXRef = useRef(0);
  const startWidthRef = useRef(sidebarWidth);

  // Setup global keyboard shortcuts
  useKeyboardShortcuts([
    // Cmd/Ctrl+N: New conversation
    {
      key: 'n',
      meta: true,
      handler: () => {
        createConversation();
      },
      description: 'New conversation',
    },
    // Cmd/Ctrl+,: Open settings
    {
      key: ',',
      meta: true,
      handler: () => {
        console.log('[MainLayout] Settings shortcut (Cmd+,) pressed - hiding BrowserView');
        // Settings 열기 전에 BrowserView 숨김
        if (isElectron() && window.electronAPI) {
          window.electronAPI.browserView.hideAll().then(() => {
            console.log('[MainLayout] BrowserView hidden before opening Settings (shortcut)');
          }).catch((err) => {
            console.error('[MainLayout] Failed to hide BrowserView:', err);
          });
        }
        setSettingsOpen(true);
      },
      description: 'Open settings',
    },
    // Cmd/Ctrl+Shift+C: Copy last response
    {
      key: 'c',
      meta: true,
      shift: true,
      handler: async () => {
        const lastAssistantMessage = [...messages]
          .reverse()
          .find((m) => m.role === 'assistant');

        if (lastAssistantMessage) {
          await navigator.clipboard.writeText(lastAssistantMessage.content);
          // Successfully copied to clipboard
        }
      },
      description: 'Copy last response',
    },
    // Esc: Stop streaming (handled in InputBox, but we can add visual feedback here)
    {
      key: 'Escape',
      handler: () => {
        if (isStreaming) {
          // The actual stop logic is in InputBox
          // Could add visual feedback here in future
        }
      },
      description: 'Stop streaming',
    },
  ]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) {return;}

      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(
        Math.max(startWidthRef.current + delta, MIN_SIDEBAR_WIDTH),
        MAX_SIDEBAR_WIDTH
      );
      setSidebarWidth(newWidth);
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  // Add global mouse event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  // Initialize VectorDB and Embedding from config
  const initializeFromConfig = useCallback(async (vectorDBConfig?: any, embeddingConfig?: any) => {
    if (typeof window === 'undefined') {return;}

    try {
      // VectorDB 초기화
      if (vectorDBConfig) {
        console.log('[MainLayout] Initializing VectorDB:', vectorDBConfig.type);

        // SQLite-vec는 브라우저에서 건너뛰기
        if (vectorDBConfig.type === 'sqlite-vec' && !isElectron()) {
          console.log('⊘ Skipping SQLite-vec in browser environment');
        } else {
          try {
            await initializeVectorDB(vectorDBConfig);
            console.log('✓ VectorDB initialized:', vectorDBConfig.type);
          } catch (error) {
            console.error('✗ Failed to initialize VectorDB:', error);
          }
        }
      }

      // Embedding 초기화
      if (embeddingConfig) {
        try {
          initializeEmbedding(embeddingConfig);
          console.log('✓ Embedding initialized:', embeddingConfig.provider);
        } catch (error) {
          console.error('✗ Failed to initialize Embedding:', error);
        }
      }
    } catch (error) {
      console.error('Initialization error:', error);
    }
  }, []);

  // Auto-initialize VectorDB and Embedding on app start
  useEffect(() => {
    const autoInitialize = async () => {
      if (typeof window === 'undefined') {return;}

      try {
        let vectorDBConfig = null;
        let embeddingConfig = null;

        // Electron 환경에서는 SQLite에서, 웹에서는 localStorage에서 설정 로드
        if (isElectron() && window.electronAPI) {
          // Electron: SQLite에서 로드
          const result = await window.electronAPI.config.load();
          if (result.success && result.data) {
            vectorDBConfig = result.data.vectorDB;
            embeddingConfig = result.data.embedding;
            console.log('[MainLayout] Loaded config from SQLite');
          }
        } else {
          // Web: localStorage에서 로드
          const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
          if (savedVectorDBConfig) {
            vectorDBConfig = JSON.parse(savedVectorDBConfig);
          }

          const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');
          if (savedEmbeddingConfig) {
            embeddingConfig = JSON.parse(savedEmbeddingConfig);
          }
        }

        // VectorDB 초기화
        if (vectorDBConfig) {
          console.log('[MainLayout] VectorDB type:', vectorDBConfig.type);

          // SQLite-vec는 브라우저에서 건너뛰기
          if (vectorDBConfig.type === 'sqlite-vec' && !isElectron()) {
            console.log('⊘ Skipping SQLite-vec in browser environment');
          } else {
            try {
              await initializeVectorDB(vectorDBConfig);
              console.log('✓ VectorDB auto-initialized:', vectorDBConfig.type);
            } catch (error) {
              console.error('✗ Failed to auto-initialize VectorDB:', error);
            }
          }
        } else {
          console.log('[MainLayout] No VectorDB config found');
        }

        // Embedding 초기화
        if (embeddingConfig) {
          try {
            initializeEmbedding(embeddingConfig);
            console.log('✓ Embedding auto-initialized:', embeddingConfig.provider);
          } catch (error) {
            console.error('✗ Failed to auto-initialize Embedding:', error);
          }
        } else {
          console.log('[MainLayout] No Embedding config found');
        }

        await initializeFromConfig(vectorDBConfig, embeddingConfig);
      } catch (error) {
        console.error('Auto-initialization error:', error);
      }
    };

    autoInitialize();
  }, [initializeFromConfig]);

  // Load conversations on app start
  useEffect(() => {
    // Zustand store 함수를 직접 호출 (의존성 없음)
    loadConversations();
  }, []); // Empty deps - only run once on mount

  // Listen for config updates from SettingsDialog
  useEffect(() => {
    const handleConfigUpdate = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { vectorDB, embedding } = customEvent.detail || {};

      if (vectorDB || embedding) {
        console.log('[MainLayout] Config update received:', { vectorDB: !!vectorDB, embedding: !!embedding });
        await initializeFromConfig(vectorDB, embedding);
      }
    };

    window.addEventListener('sepilot:config-updated', handleConfigUpdate);

    return () => {
      window.removeEventListener('sepilot:config-updated', handleConfigUpdate);
    };
  }, [initializeFromConfig]);

  // Handle BrowserView visibility
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    // Settings/Documents/Gallery가 열려있으면 항상 숨김
    if (settingsOpen || viewMode === 'documents' || viewMode === 'gallery') {
      console.log('[MainLayout] Hiding BrowserView for overlay (settingsOpen:', settingsOpen, 'viewMode:', viewMode, ')');
      window.electronAPI.browserView.hideAll().then(() => {
        console.log('[MainLayout] BrowserView hidden successfully');
      }).catch((err) => {
        console.error('[MainLayout] Failed to hide BrowserView for overlay:', err);
      });
      return;
    }

    // Browser 모드에서 browserViewMode가 'chat'이 아니면 숨김
    // 단, 'settings'는 Sidebar 내부에서만 표시되므로 BrowserView를 숨기지 않음
    // 'logs'와 'tools'도 Sidebar 내부에서만 표시되므로 숨기지 않음
    if (appMode === 'browser' && browserViewMode !== 'chat' &&
        browserViewMode !== 'settings' && browserViewMode !== 'logs' && browserViewMode !== 'tools') {
      console.log('[MainLayout] Hiding BrowserView for browser overlay (browserViewMode:', browserViewMode, ')');
      window.electronAPI.browserView.hideAll().then(() => {
        console.log('[MainLayout] BrowserView hidden successfully');
      }).catch((err) => {
        console.error('[MainLayout] Failed to hide BrowserView for browser overlay:', err);
      });
      return;
    }

    // Editor 모드이고 Browser 탭이 활성화되어 있으면 표시
    if (appMode === 'editor' && activeEditorTab === 'browser') {
      console.log('[MainLayout] Showing BrowserView (appMode:', appMode, 'activeEditorTab:', activeEditorTab, ')');
      window.electronAPI.browserView.showActive().then(() => {
        console.log('[MainLayout] BrowserView shown successfully');
      }).catch((err) => {
        console.error('[MainLayout] Failed to show BrowserView:', err);
      });
    }
    // Browser 모드 (standalone)일 때도 표시
    else if (appMode === 'browser' && viewMode === 'chat' && browserViewMode === 'chat') {
      console.log('[MainLayout] Showing BrowserView (appMode:', appMode, 'viewMode:', viewMode, 'browserViewMode:', browserViewMode, ')');
      window.electronAPI.browserView.showActive().then(() => {
        console.log('[MainLayout] BrowserView shown successfully');
      }).catch((err) => {
        console.error('[MainLayout] Failed to show BrowserView:', err);
      });
    }
    // 그 외의 경우 숨김
    else {
      console.log('[MainLayout] Hiding BrowserView (appMode:', appMode, 'activeEditorTab:', activeEditorTab, ')');
      window.electronAPI.browserView.hideAll().catch((err) => {
        console.error('[MainLayout] Failed to hide BrowserView:', err);
      });
    }
  }, [settingsOpen, viewMode, appMode, activeEditorTab, browserViewMode]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div style={{ width: sidebarWidth }} className="relative flex-shrink-0">
        <Sidebar
          onDocumentsClick={() => setViewMode('documents')}
          onGalleryClick={() => setViewMode('gallery')}
          onConversationClick={() => {
            setViewMode('chat');
            setAppMode('chat');
          }}
        />

        {/* Resize Handle */}
        <div
          className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/20 transition-colors group"
          onMouseDown={handleMouseDown}
        >
          <div className="absolute right-0 top-0 bottom-0 w-1 group-hover:bg-primary/50 transition-colors" />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {viewMode === 'chat' && children}
        {viewMode === 'documents' && (
          <DocumentsPage onBack={() => setViewMode('chat')} />
        )}
        {viewMode === 'gallery' && (
          <GalleryView onClose={() => setViewMode('chat')} />
        )}
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
