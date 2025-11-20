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
  const { createConversation, messages, isStreaming } = useChatStore();
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

  // Auto-initialize VectorDB and Embedding on app start
  useEffect(() => {
    const autoInitialize = async () => {
      if (typeof window === 'undefined') return;

      try {
        // VectorDB 설정 로드 및 초기화
        const savedVectorDBConfig = localStorage.getItem('sepilot_vectordb_config');
        if (savedVectorDBConfig) {
          const parsedVectorDBConfig = JSON.parse(savedVectorDBConfig);

          console.log('[DEBUG] VectorDB type:', parsedVectorDBConfig.type);
          console.log('[DEBUG] isElectron():', isElectron());

          // SQLite-vec는 브라우저에서 건너뛰기
          if (parsedVectorDBConfig.type === 'sqlite-vec' && !isElectron()) {
            console.log('⊘ Skipping SQLite-vec in browser environment');
          } else {
            // VectorDB 자동 초기화
            try {
              await initializeVectorDB(parsedVectorDBConfig);
              console.log('✓ VectorDB auto-initialized:', parsedVectorDBConfig.type);
            } catch (error) {
              console.error('✗ Failed to auto-initialize VectorDB:', error);
            }
          }
        } else {
          console.log('[DEBUG] No VectorDB config in localStorage');
        }

        // Embedding 설정 로드 및 초기화
        const savedEmbeddingConfig = localStorage.getItem('sepilot_embedding_config');
        if (savedEmbeddingConfig) {
          const parsedEmbeddingConfig = JSON.parse(savedEmbeddingConfig);

          // Embedding 자동 초기화
          try {
            initializeEmbedding(parsedEmbeddingConfig);
            console.log('✓ Embedding auto-initialized:', parsedEmbeddingConfig.provider);
          } catch (error) {
            console.error('✗ Failed to auto-initialize Embedding:', error);
          }
        }
      } catch (error) {
        console.error('Auto-initialization error:', error);
      }
    };

    autoInitialize();
  }, []);

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
