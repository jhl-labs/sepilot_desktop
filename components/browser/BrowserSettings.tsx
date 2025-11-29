'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FolderOpen, ChevronLeft } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';

export function BrowserSettings() {
  const [snapshotsPath, setSnapshotsPath] = useState<string>('');
  const [bookmarksPath, setBookmarksPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { setBrowserViewMode } = useChatStore();

  // Load paths on mount
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {return;}

    const loadPaths = async () => {
      setIsLoading(true);
      try {
        const result = await window.electronAPI.browserView.getBrowserSettings();
        if (result.success && result.data) {
          setSnapshotsPath(result.data.snapshotsPath);
          setBookmarksPath(result.data.bookmarksPath);
        }
      } catch (error) {
        console.error('[BrowserSettings] Error loading settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPaths();
  }, []);

  const handleOpenSnapshotsFolder = async () => {
    if (!isElectron() || !window.electronAPI) {return;}

    try {
      await window.electronAPI.shell.openExternal(`file://${snapshotsPath}`);
    } catch (error) {
      console.error('[BrowserSettings] Error opening snapshots folder:', error);
    }
  };

  const handleOpenBookmarksFolder = async () => {
    if (!isElectron() || !window.electronAPI) {return;}

    try {
      await window.electronAPI.shell.openExternal(`file://${bookmarksPath}`);
    } catch (error) {
      console.error('[BrowserSettings] Error opening bookmarks folder:', error);
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
        <h2 className="text-sm font-semibold">Browser 설정</h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <p className="text-sm">로딩 중...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 스냅샷 저장 경로 */}
            <div className="space-y-2">
              <Label className="text-xs">스냅샷 저장 경로</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-2 py-1.5 text-xs break-all">
                  {snapshotsPath || '경로를 불러오는 중...'}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenSnapshotsFolder}
                  title="폴더 열기"
                  disabled={!snapshotsPath}
                  className="h-8 w-8 shrink-0"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                페이지 캡처로 저장된 스냅샷 파일이 저장되는 위치입니다.
              </p>
            </div>

            {/* 북마크 저장 경로 */}
            <div className="space-y-2">
              <Label className="text-xs">북마크 저장 경로</Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted px-2 py-1.5 text-xs break-all">
                  {bookmarksPath || '경로를 불러오는 중...'}
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleOpenBookmarksFolder}
                  title="폴더 열기"
                  disabled={!bookmarksPath}
                  className="h-8 w-8 shrink-0"
                >
                  <FolderOpen className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                북마크 데이터가 저장되는 위치입니다.
              </p>
            </div>

            {/* 향후 추가될 설정들을 위한 공간 */}
            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                추가 설정이 향후 지원될 예정입니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
