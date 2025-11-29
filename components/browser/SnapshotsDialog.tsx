'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash } from 'lucide-react';
import { isElectron } from '@/lib/platform';

interface Snapshot {
  id: string;
  url: string;
  title: string;
  thumbnail: string;
  createdAt: number;
  screenshotPath: string;
}

interface SnapshotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SnapshotsDialog({ open, onOpenChange }: SnapshotsDialogProps) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Load snapshots when dialog opens
  useEffect(() => {
    if (!open || !isElectron() || !window.electronAPI) {return;}

    const loadSnapshots = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.browserView.getSnapshots();
        if (result.success && result.data) {
          setSnapshots(result.data);
        } else {
          console.error('[SnapshotsDialog] Failed to load snapshots:', result.error);
        }
      } catch (error) {
        console.error('[SnapshotsDialog] Error loading snapshots:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSnapshots();
  }, [open]);

  const handleDelete = async (id: string) => {
    if (!confirm('이 스냅샷을 삭제하시겠습니까?')) {return;}

    if (!isElectron() || !window.electronAPI) {return;}

    try {
      const result = await window.electronAPI.browserView.deleteSnapshot(id);
      if (result.success) {
        // Remove from local state
        setSnapshots((prev) => prev.filter((s) => s.id !== id));
      } else {
        console.error('[SnapshotsDialog] Failed to delete snapshot:', result.error);
        alert(`스냅샷 삭제 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[SnapshotsDialog] Error deleting snapshot:', error);
      alert('스냅샷 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleOpen = async (snapshot: Snapshot) => {
    if (!isElectron() || !window.electronAPI) {return;}

    try {
      const result = await window.electronAPI.browserView.openSnapshot(snapshot.id);
      if (result.success) {
        console.log('[SnapshotsDialog] Snapshot opened:', snapshot.id);
        onOpenChange(false);
      } else {
        console.error('[SnapshotsDialog] Failed to open snapshot:', result.error);
        alert(`스냅샷 열기 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[SnapshotsDialog] Error opening snapshot:', error);
      alert('스냅샷 열기 중 오류가 발생했습니다.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>스냅샷 관리</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">로딩 중...</p>
          </div>
        ) : snapshots.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">저장된 스냅샷이 없습니다</p>
            <p className="mt-2 text-xs">페이지 캡처 버튼을 눌러 현재 페이지를 저장하세요</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {snapshots.map((snapshot) => (
              <div
                key={snapshot.id}
                className="group relative cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
                onClick={() => handleOpen(snapshot)}
              >
                <div className="mb-2 aspect-video overflow-hidden rounded bg-muted">
                  <img
                    src={snapshot.thumbnail}
                    alt={snapshot.title}
                    className="h-full w-full object-cover"
                  />
                </div>
                <h3 className="text-sm font-medium truncate">{snapshot.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground truncate">{snapshot.url}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(snapshot.createdAt).toLocaleString('ko-KR')}
                </p>

                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(snapshot.id);
                  }}
                >
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
