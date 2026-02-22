'use client';

import { Sidebar } from './Sidebar';
import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import { useKeyboardShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { useChatStore } from '@/lib/store/chat-store';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { DocumentsPage } from '@/components/rag/DocumentsPage';
import { GalleryView } from '@/components/gallery/GalleryView';
import { initializeVectorDB } from '@/lib/domains/rag/client';
import { initializeEmbedding } from '@/lib/domains/rag/embeddings/client';
import { isElectron } from '@/lib/platform';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useShallow } from 'zustand/react/shallow';

import { logger } from '@/lib/utils/logger';
interface MainLayoutProps {
  children: ReactNode;
}

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 1200; // 브라우저 사이드바를 넓게 볼 수 있도록 제한 완화
const DEFAULT_SIDEBAR_WIDTH = 260;

type ViewMode = 'chat' | 'documents' | 'gallery';

// Load sidebar width from localStorage (dynamic for any mode)
function loadSidebarWidth(mode: string): number {
  if (typeof window === 'undefined') {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  const key = `sepilot_sidebar_width_${mode}`;
  const saved = localStorage.getItem(key);

  if (saved) {
    const width = parseInt(saved, 10);
    if (!isNaN(width) && width >= MIN_SIDEBAR_WIDTH && width <= MAX_SIDEBAR_WIDTH) {
      return width;
    }
  }

  return DEFAULT_SIDEBAR_WIDTH;
}

// Save sidebar width to localStorage (dynamic for any mode)
function saveSidebarWidth(mode: string, width: number) {
  if (typeof window === 'undefined') {
    return;
  }

  const key = `sepilot_sidebar_width_${mode}`;
  localStorage.setItem(key, width.toString());
}

export function MainLayout({ children }: MainLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    import('@/components/settings/SettingsSidebar').SettingSection | undefined
  >();
  const [isResizing, setIsResizing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const {
    createConversation,
    activeConversationId,
    streamingConversations,
    loadConversations,
    setAppMode,
    appMode,
    activeEditorTab,
    browserViewMode,
  } = useChatStore(
    useShallow((state) => ({
      createConversation: state.createConversation,
      activeConversationId: state.activeConversationId,
      streamingConversations: state.streamingConversations,
      loadConversations: state.loadConversations,
      setAppMode: state.setAppMode,
      appMode: state.appMode,
      activeEditorTab: state.activeEditorTab,
      browserViewMode: state.browserViewMode,
    }))
  );

  // Dynamic sidebar width per mode (Map for any mode including extensions)
  const [sidebarWidths, setSidebarWidths] = useState<Map<string, number>>(new Map());

  // Load saved widths on client side only
  useEffect(() => {
    const widths = new Map<string, number>();
    widths.set('chat', loadSidebarWidth('chat'));
    widths.set('editor', loadSidebarWidth('editor'));
    widths.set('browser', loadSidebarWidth('browser'));
    widths.set('presentation', loadSidebarWidth('presentation'));
    setSidebarWidths(widths);
  }, []);

  // Get current sidebar width based on app mode
  const sidebarWidth = sidebarWidths.get(appMode) || DEFAULT_SIDEBAR_WIDTH;

  // Set sidebar width for current app mode
  const setSidebarWidth = (width: number) => {
    setSidebarWidths((prev) => {
      const newWidths = new Map(prev);
      newWidths.set(appMode, width);
      return newWidths;
    });
    saveSidebarWidth(appMode, width);
  };

  // Determine if current conversation is streaming
  const isStreaming = activeConversationId
    ? streamingConversations.has(activeConversationId)
    : false;
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
        logger.info('[MainLayout] Settings shortcut (Cmd+,) pressed - hiding BrowserView');
        // Settings 열기 전에 BrowserView 숨김
        if (isElectron() && window.electronAPI) {
          window.electronAPI.browserView
            .hideAll()
            .then(() => {
              logger.info('[MainLayout] BrowserView hidden before opening Settings (shortcut)');
            })
            .catch((err) => {
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
        const currentMessages = useChatStore.getState().messages;
        const lastAssistantMessage = [...currentMessages]
          .reverse()
          .find((m: any) => m.role === 'assistant');

        if (lastAssistantMessage) {
          await copyToClipboard(lastAssistantMessage.content);
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

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsResizing(true);
      startXRef.current = e.clientX;
      startWidthRef.current = sidebarWidth;
    },
    [sidebarWidth]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) {
        return;
      }

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
  const initializeFromConfig = useCallback(
    async (
      vectorDBConfig?: import('@/lib/domains/rag/types').VectorDBConfig,
      embeddingConfig?: import('@/lib/domains/rag/types').EmbeddingConfig
    ) => {
      if (typeof window === 'undefined') {
        return;
      }

      try {
        // VectorDB 초기화
        if (vectorDBConfig) {
          logger.debug('[MainLayout] Initializing VectorDB:', vectorDBConfig.type);

          // SQLite-vec는 브라우저에서 건너뛰기
          if (vectorDBConfig.type === 'sqlite-vec' && !isElectron()) {
            logger.debug('⊘ Skipping SQLite-vec in browser environment');
          } else {
            try {
              await initializeVectorDB(vectorDBConfig);
              logger.debug('✓ VectorDB initialized:', vectorDBConfig.type);
            } catch (error) {
              console.error('✗ Failed to initialize VectorDB:', error);
            }
          }
        }

        // Embedding 초기화
        if (embeddingConfig) {
          try {
            initializeEmbedding(embeddingConfig);
            logger.debug('✓ Embedding initialized:', embeddingConfig.provider);
          } catch (error) {
            console.error('✗ Failed to initialize Embedding:', error);
          }
        }
      } catch (error) {
        console.error('Initialization error:', error);
      }
    },
    []
  );

  // Auto-initialize VectorDB and Embedding on app start
  useEffect(() => {
    const autoInitialize = async () => {
      if (typeof window === 'undefined') {
        return;
      }

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
            logger.info('[MainLayout] Loaded config from SQLite');
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

        // VectorDB & Embedding 초기화 (중복 방지를 위해 initializeFromConfig만 호출)
        if (vectorDBConfig || embeddingConfig) {
          logger.info('[MainLayout] Auto-initializing from config...', {
            vectorDB: vectorDBConfig?.type,
            embedding: embeddingConfig?.provider,
          });
          await initializeFromConfig(vectorDBConfig, embeddingConfig);
        } else {
          logger.info('[MainLayout] No VectorDB or Embedding config found');
        }
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

  // 스케줄러가 새 대화를 생성하면 대화 목록 갱신
  useEffect(() => {
    if (!isElectron() || !window.electronAPI?.scheduler?.onConversationCreated) {
      return;
    }
    const cleanup = window.electronAPI.scheduler.onConversationCreated(() => {
      loadConversations();
    });
    return cleanup;
  }, [loadConversations]);

  // Listen for config updates from SettingsDialog
  useEffect(() => {
    const handleConfigUpdate = async (e: Event) => {
      const customEvent = e as CustomEvent;
      const { vectorDB, embedding } = customEvent.detail || {};

      if (vectorDB || embedding) {
        logger.info('[MainLayout] Config update received:', {
          vectorDB: !!vectorDB,
          embedding: !!embedding,
        });
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
      logger.info(
        '[MainLayout] Hiding BrowserView for overlay (settingsOpen:',
        settingsOpen,
        'viewMode:',
        viewMode,
        ')'
      );
      window.electronAPI.browserView
        .hideAll()
        .then(() => {
          logger.info('[MainLayout] BrowserView hidden successfully');
        })
        .catch((err) => {
          console.error('[MainLayout] Failed to hide BrowserView for overlay:', err);
        });
      return;
    }

    // Editor 모드이고 Browser 탭이 활성화되어 있으면 표시
    if (appMode === 'editor' && activeEditorTab === 'browser') {
      logger.info(
        '[MainLayout] Showing BrowserView (appMode:',
        appMode,
        'activeEditorTab:',
        activeEditorTab,
        ')'
      );
      window.electronAPI.browserView
        .showActive()
        .then(() => {
          logger.info('[MainLayout] BrowserView shown successfully');
        })
        .catch((err) => {
          console.error('[MainLayout] Failed to show BrowserView:', err);
        });
    }
    // Browser 모드에서는 항상 BrowserView 표시
    // Sidebar의 browserViewMode (chat, snapshots, bookmarks, settings, tools, logs)와 무관하게 표시
    else if (appMode === 'browser' && viewMode === 'chat') {
      logger.info(
        '[MainLayout] Showing BrowserView (appMode:',
        appMode,
        'viewMode:',
        viewMode,
        'browserViewMode:',
        browserViewMode,
        ')'
      );
      window.electronAPI.browserView
        .showActive()
        .then(() => {
          logger.info('[MainLayout] BrowserView shown successfully');
        })
        .catch((err) => {
          console.error('[MainLayout] Failed to show BrowserView:', err);
        });
    }
    // 그 외의 경우 숨김
    else {
      logger.info(
        '[MainLayout] Hiding BrowserView (appMode:',
        appMode,
        'activeEditorTab:',
        activeEditorTab,
        ')'
      );
      window.electronAPI.browserView.hideAll().catch((err) => {
        console.error('[MainLayout] Failed to hide BrowserView:', err);
      });
    }
  }, [settingsOpen, viewMode, appMode, activeEditorTab, browserViewMode]);

  // Dispatch settings visibility change event for extensions
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('sepilot:settings-visibility-change', {
        detail: { open: settingsOpen },
      })
    );
  }, [settingsOpen]);

  // Listen for open-settings event from other components (e.g. Sidebar, Extensions)
  useEffect(() => {
    const handleOpenSettings = (event: Event) => {
      const customEvent = event as CustomEvent<{
        section?: import('@/components/settings/SettingsSidebar').SettingSection;
      }>;
      logger.info('[MainLayout] Received sepilot:open-settings event');
      setSettingsInitialSection(customEvent.detail?.section);
      setSettingsOpen(true);
    };

    const handleOpenSettingsMessage = (
      event: MessageEvent<{
        source?: string;
        type?: string;
        detail?: {
          section?: import('@/components/settings/SettingsSidebar').SettingSection;
        };
      }>
    ) => {
      if (
        event.data?.source !== 'sepilot-extension' ||
        event.data?.type !== 'sepilot:open-settings'
      ) {
        return;
      }
      setSettingsInitialSection(event.data.detail?.section);
      setSettingsOpen(true);
    };

    window.addEventListener('sepilot:open-settings', handleOpenSettings);
    window.addEventListener('message', handleOpenSettingsMessage);

    return () => {
      window.removeEventListener('sepilot:open-settings', handleOpenSettings);
      window.removeEventListener('message', handleOpenSettingsMessage);
    };
  }, []);

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
        {viewMode === 'chat' && (
          <ErrorBoundary
            fallback={
              <div className="flex h-full items-center justify-center p-8">
                <div className="max-w-md space-y-2 text-center">
                  <p className="text-sm font-medium text-destructive">메인 콘텐츠 오류</p>
                  <p className="text-xs text-muted-foreground">
                    페이지를 표시하는 중 오류가 발생했습니다.
                  </p>
                  <button
                    onClick={() => window.location.reload()}
                    className="mt-4 px-4 py-2 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  >
                    앱 새로고침
                  </button>
                </div>
              </div>
            }
          >
            {children}
          </ErrorBoundary>
        )}
        {viewMode === 'documents' && (
          <ErrorBoundary>
            <DocumentsPage onBack={() => setViewMode('chat')} />
          </ErrorBoundary>
        )}
        {viewMode === 'gallery' && (
          <ErrorBoundary>
            <GalleryView onClose={() => setViewMode('chat')} />
          </ErrorBoundary>
        )}
      </div>

      {/* Settings Dialog */}
      <ErrorBoundary
        fallback={
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="max-w-md space-y-2 rounded-lg border border-destructive bg-background p-6 text-center shadow-lg">
              <p className="text-sm font-medium text-destructive">설정 다이얼로그 오류</p>
              <p className="text-xs text-muted-foreground">
                설정을 표시하는 중 오류가 발생했습니다.
              </p>
              <button
                onClick={() => {
                  setSettingsOpen(false);
                  window.location.reload();
                }}
                className="mt-4 rounded bg-primary px-4 py-2 text-xs text-primary-foreground hover:bg-primary/90"
              >
                닫기 및 앱 새로고침
              </button>
            </div>
          </div>
        }
      >
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialSection={settingsInitialSection}
        />
      </ErrorBoundary>
    </div>
  );
}
