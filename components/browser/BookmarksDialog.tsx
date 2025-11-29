'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash, Folder, Globe } from 'lucide-react';
import { isElectron } from '@/lib/platform';

interface Bookmark {
  id: string;
  url: string;
  title: string;
  folderId?: string;
  createdAt: number;
}

interface BookmarkFolder {
  id: string;
  name: string;
  createdAt: number;
}

interface BookmarksDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BookmarksDialog({ open, onOpenChange }: BookmarksDialogProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Load bookmarks and folders when dialog opens
  useEffect(() => {
    if (!open || !isElectron() || !window.electronAPI) return;

    const loadData = async () => {
      setIsLoading(true);
      try {
        const [bookmarksResult, foldersResult] = await Promise.all([
          window.electronAPI.browserView.getBookmarks(),
          window.electronAPI.browserView.getBookmarkFolders(),
        ]);

        if (bookmarksResult.success && bookmarksResult.data) {
          setBookmarks(bookmarksResult.data);
        }

        if (foldersResult.success && foldersResult.data) {
          setFolders(foldersResult.data);
        }
      } catch (error) {
        console.error('[BookmarksDialog] Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [open]);

  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !isElectron() || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.browserView.addBookmarkFolder(newFolderName);
      if (result.success && result.data) {
        const newFolder = result.data;
        setFolders((prev) => [...prev, newFolder]);
        setNewFolderName('');
        setIsAddingFolder(false);
      } else {
        console.error('[BookmarksDialog] Failed to add folder:', result.error);
        alert(`폴더 추가 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[BookmarksDialog] Error adding folder:', error);
      alert('폴더 추가 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!confirm('이 폴더와 포함된 북마크를 모두 삭제하시겠습니까?')) return;
    if (!isElectron() || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.browserView.deleteBookmarkFolder(id);
      if (result.success) {
        setFolders((prev) => prev.filter((f) => f.id !== id));
        setBookmarks((prev) => prev.filter((b) => b.folderId !== id));
        if (selectedFolderId === id) {
          setSelectedFolderId(null);
        }
      } else {
        console.error('[BookmarksDialog] Failed to delete folder:', result.error);
        alert(`폴더 삭제 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[BookmarksDialog] Error deleting folder:', error);
      alert('폴더 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    if (!confirm('이 북마크를 삭제하시겠습니까?')) return;
    if (!isElectron() || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.browserView.deleteBookmark(id);
      if (result.success) {
        setBookmarks((prev) => prev.filter((b) => b.id !== id));
      } else {
        console.error('[BookmarksDialog] Failed to delete bookmark:', result.error);
        alert(`북마크 삭제 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[BookmarksDialog] Error deleting bookmark:', error);
      alert('북마크 삭제 중 오류가 발생했습니다.');
    }
  };

  const handleOpenBookmark = async (bookmark: Bookmark) => {
    if (!isElectron() || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.browserView.openBookmark(bookmark.id);
      if (result.success) {
        console.log('[BookmarksDialog] Bookmark opened:', bookmark.id);
        onOpenChange(false);
      } else {
        console.error('[BookmarksDialog] Failed to open bookmark:', result.error);
        alert(`북마크 열기 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[BookmarksDialog] Error opening bookmark:', error);
      alert('북마크 열기 중 오류가 발생했습니다.');
    }
  };

  const handleAddCurrentPage = async () => {
    if (!isElectron() || !window.electronAPI) return;

    try {
      const result = await window.electronAPI.browserView.addBookmark({
        folderId: selectedFolderId || undefined,
      });

      if (result.success && result.data) {
        const newBookmark = result.data;
        setBookmarks((prev) => [...prev, newBookmark]);
        alert('현재 페이지가 북마크에 추가되었습니다.');
      } else {
        console.error('[BookmarksDialog] Failed to add bookmark:', result.error);
        alert(`북마크 추가 실패: ${result.error}`);
      }
    } catch (error) {
      console.error('[BookmarksDialog] Error adding bookmark:', error);
      alert('북마크 추가 중 오류가 발생했습니다.');
    }
  };

  const filteredBookmarks = selectedFolderId
    ? bookmarks.filter((b) => b.folderId === selectedFolderId)
    : bookmarks.filter((b) => !b.folderId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>북마크 관리</DialogTitle>
        </DialogHeader>

        <div className="flex gap-4">
          {/* 폴더 목록 (왼쪽) */}
          <div className="w-48 border-r pr-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium">폴더</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsAddingFolder(true)}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {/* 전체 북마크 */}
            <div
              className={`mb-1 cursor-pointer rounded px-2 py-1.5 text-sm transition-colors ${
                selectedFolderId === null ? 'bg-accent' : 'hover:bg-accent/50'
              }`}
              onClick={() => setSelectedFolderId(null)}
            >
              <Globe className="mr-2 inline h-4 w-4" />
              전체
            </div>

            {/* 폴더 목록 */}
            {folders.map((folder) => (
              <div
                key={folder.id}
                className={`group mb-1 flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors ${
                  selectedFolderId === folder.id ? 'bg-accent' : 'hover:bg-accent/50'
                }`}
              >
                <div
                  className="flex flex-1 cursor-pointer items-center"
                  onClick={() => setSelectedFolderId(folder.id)}
                >
                  <Folder className="mr-2 h-4 w-4" />
                  <span className="truncate">{folder.name}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFolder(folder.id);
                  }}
                >
                  <Trash className="h-3 w-3" />
                </Button>
              </div>
            ))}

            {/* 폴더 추가 입력 */}
            {isAddingFolder && (
              <div className="mt-2 flex gap-1">
                <Input
                  placeholder="폴더 이름"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddFolder();
                    if (e.key === 'Escape') setIsAddingFolder(false);
                  }}
                  className="h-8 text-sm"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* 북마크 목록 (오른쪽) */}
          <div className="flex-1">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {selectedFolderId
                  ? folders.find((f) => f.id === selectedFolderId)?.name
                  : '전체 북마크'}
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAddCurrentPage}
              >
                <Plus className="mr-2 h-4 w-4" />
                현재 페이지 추가
              </Button>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">로딩 중...</p>
              </div>
            ) : filteredBookmarks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <p className="text-sm">북마크가 없습니다</p>
                <p className="mt-2 text-xs">현재 페이지를 북마크에 추가하세요</p>
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 200px)' }}>
                {filteredBookmarks.map((bookmark) => (
                  <div
                    key={bookmark.id}
                    className="group flex items-center justify-between rounded border p-3 transition-colors hover:bg-accent cursor-pointer"
                    onClick={() => handleOpenBookmark(bookmark)}
                  >
                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <h4 className="truncate text-sm font-medium">{bookmark.title}</h4>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{bookmark.url}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBookmark(bookmark.id);
                      }}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
