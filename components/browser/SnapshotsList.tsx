'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash, ChevronLeft, ExternalLink } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';

import { logger } from '@/lib/utils/logger';
interface Snapshot {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  createdAt: number;
  screenshotPath: string;
  mhtmlPath: string;
}

export function SnapshotsList() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const { setBrowserViewMode } = useChatStore();

  // Load snapshots on mount
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    const loadSnapshots = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.browserView.getSnapshots();
        if (result.success && result.data) {
          setSnapshots(result.data);
        } else {
          console.error('[SnapshotsList] Failed to load snapshots:', result.error);
        }
      } catch (error) {
        console.error('[SnapshotsList] Error loading snapshots:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSnapshots();
  }, []);

  const handleDelete = async (id: string) => {
    if (!window.confirm('이 스냅샷을 삭제하시겠습니까?')) {
      return;
    }

    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.browserView.deleteSnapshot(id);
      if (result.success) {
        // Remove from local state
        setSnapshots((prev) => prev.filter((s) => s.id !== id));
      } else {
        console.error('[SnapshotsList] Failed to delete snapshot:', result.error);
        window.alert(`스냅샷 삭제 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[SnapshotsList] Error deleting snapshot:', error);
      window.alert('스냅샷 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleOpen = async (snapshot: Snapshot) => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.browserView.openSnapshot(snapshot.id);
      if (result.success) {
        logger.debug('[SnapshotsList] Snapshot opened:', snapshot.id);
        setBrowserViewMode('chat');
      } else {
        console.error('[SnapshotsList] Failed to open snapshot:', result.error);
        window.alert(`스냅샷 열기 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[SnapshotsList] Error opening snapshot:', error);
      window.alert('스냅샷 열기 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-3 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setBrowserViewMode('chat')}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="text-sm font-semibold">스냅샷 관리</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">로딩 중...</p>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">저장된 스냅샷이 없습니다</p>
            <p className="mt-2 text-xs text-center">
              페이지 캡처 버튼을 눌러
              <br />
              현재 페이지를 저장하세요
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {snapshots.map((snapshot) => (
              <ContextMenu key={snapshot.id}>
                <ContextMenuTrigger asChild>
                  <div
                    className="group relative cursor-pointer rounded-lg border bg-card p-2 transition-colors hover:bg-accent"
                    onClick={() => handleOpen(snapshot)}
                  >
                    <div className="mb-2 aspect-video overflow-hidden rounded bg-muted">
                      <img
                        src={snapshot.thumbnail}
                        alt={snapshot.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <h3 className="text-xs font-medium truncate">{snapshot.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground truncate">{snapshot.url}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(snapshot.createdAt).toLocaleString('ko-KR')}
                    </p>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(snapshot.id);
                      }}
                    >
                      <Trash className="h-3 w-3" />
                    </Button>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                  <ContextMenuItem onClick={() => handleOpen(snapshot)}>
                    <ExternalLink className="mr-2 h-4 w-4" />
                    <span>스냅샷 열기</span>
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => handleDelete(snapshot.id)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    <span>삭제</span>
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
