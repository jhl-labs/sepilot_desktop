'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash } from 'lucide-react';

interface Snapshot {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  createdAt: number;
}

interface SnapshotsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SnapshotsDialog({ open, onOpenChange }: SnapshotsDialogProps) {
  // TODO: 실제 스냅샷 데이터 로드
  const snapshots: Snapshot[] = [];

  const handleDelete = (id: string) => {
    if (confirm('이 스냅샷을 삭제하시겠습니까?')) {
      // TODO: 스냅샷 삭제 구현
      console.log('[SnapshotsDialog] Delete snapshot:', id);
    }
  };

  const handleOpen = (snapshot: Snapshot) => {
    // TODO: 스냅샷 열기 구현
    console.log('[SnapshotsDialog] Open snapshot:', snapshot);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>스냅샷 관리</DialogTitle>
        </DialogHeader>

        {snapshots.length === 0 ? (
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
                {snapshot.thumbnail && (
                  <div className="mb-2 aspect-video overflow-hidden rounded bg-muted">
                    <img
                      src={snapshot.thumbnail}
                      alt={snapshot.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                )}
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
