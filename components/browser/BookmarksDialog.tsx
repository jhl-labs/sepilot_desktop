'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash, Folder, Globe, Edit } from 'lucide-react';

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
  // TODO: 실제 북마크 데이터 로드
  const [bookmarks] = useState<Bookmark[]>([]);
  const [folders] = useState<BookmarkFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const handleAddFolder = () => {
    if (!newFolderName.trim()) return;

    // TODO: 폴더 추가 구현
    console.log('[BookmarksDialog] Add folder:', newFolderName);
    setNewFolderName('');
    setIsAddingFolder(false);
  };

  const handleDeleteFolder = (id: string) => {
    if (confirm('이 폴더와 포함된 북마크를 모두 삭제하시겠습니까?')) {
      // TODO: 폴더 삭제 구현
      console.log('[BookmarksDialog] Delete folder:', id);
    }
  };

  const handleDeleteBookmark = (id: string) => {
    if (confirm('이 북마크를 삭제하시겠습니까?')) {
      // TODO: 북마크 삭제 구현
      console.log('[BookmarksDialog] Delete bookmark:', id);
    }
  };

  const handleOpenBookmark = (bookmark: Bookmark) => {
    // TODO: 북마크 열기 구현 (BrowserPanel에서 로드)
    console.log('[BookmarksDialog] Open bookmark:', bookmark);
    onOpenChange(false);
  };

  const handleAddCurrentPage = () => {
    // TODO: 현재 페이지를 북마크에 추가
    console.log('[BookmarksDialog] Add current page');
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

            {filteredBookmarks.length === 0 ? (
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
