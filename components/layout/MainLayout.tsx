'use client';

import { Sidebar } from './Sidebar';
import { ReactNode, useState, useRef, useCallback, useEffect } from 'react';
import { useKeyboardShortcuts } from '@/lib/hooks/use-keyboard-shortcuts';
import { useChatStore } from '@/lib/store/chat-store';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { DocumentsPage } from '@/components/pages/DocumentsPage';
import { initializeVectorDB } from '@/lib/vectordb/client';
import { initializeEmbedding } from '@/lib/vectordb/embeddings/client';
import { isElectron } from '@/lib/platform';

interface MainLayoutProps {
  children: ReactNode;
}

const MIN_SIDEBAR_WIDTH = 200;
const MAX_SIDEBAR_WIDTH = 500;
const DEFAULT_SIDEBAR_WIDTH = 260;

type ViewMode = 'chat' | 'documents';

export function MainLayout({ children }: MainLayoutProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('chat');
  const { createConversation, messages, activeConversationId, streamingConversations } = useChatStore();

  // Determine if current conversation is streaming
  const isStreaming = activeConversationId ? streamingConversations.has(activeConversationId) : false;
  const startXRef = useRef(0);
  const startWidthRef = useRef(DEFAULT_SIDEBAR_WIDTH);

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
      if (!isResizing) return;

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
    if (typeof window === 'undefined') return;

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
      if (typeof window === 'undefined') return;

      const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
      const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');

      const vectorDBConfig = savedVectorDBConfig ? JSON.parse(savedVectorDBConfig) : null;
      const embeddingConfig = savedEmbeddingConfig ? JSON.parse(savedEmbeddingConfig) : null;

      if (!vectorDBConfig) {
        console.log('[MainLayout] No VectorDB config in localStorage');
      }

      await initializeFromConfig(vectorDBConfig, embeddingConfig);
    };

    autoInitialize();
  }, [initializeFromConfig]);

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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <div style={{ width: sidebarWidth }} className="relative flex-shrink-0">
        <Sidebar onDocumentsClick={() => setViewMode('documents')} />

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
        {viewMode === 'chat' ? (
          children
        ) : (
          <DocumentsPage onBack={() => setViewMode('chat')} />
        )}
      </div>

      {/* Settings Dialog */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  );
}
