'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash, Globe, ChevronLeft, FolderPlus, X } from 'lucide-react';
import { isElectron } from '@/lib/platform';
import { useChatStore } from '@/lib/store/chat-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/utils/logger';
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

export function BookmarksList() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [folders, setFolders] = useState<BookmarkFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [isAddingFolder, setIsAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { setBrowserViewMode } = useChatStore();
  const { t } = useTranslation();

  // Load bookmarks and folders on mount
  useEffect(() => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

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
        console.error('[BookmarksList] Error loading data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleAddFolder = async () => {
    if (!newFolderName.trim() || !isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.browserView.addBookmarkFolder(newFolderName);
      if (result.success && result.data) {
        const newFolder = result.data;
        setFolders((prev) => [...prev, newFolder]);
        setNewFolderName('');
        setIsAddingFolder(false);
      } else {
        console.error('[BookmarksList] Failed to add folder:', result.error);
        window.alert(t('browser.bookmarks.addFolderFailed', { error: result.error }));
      }
    } catch (error) {
      console.error('[BookmarksList] Error adding folder:', error);
      window.alert(t('browser.bookmarks.addFolderError'));
    }
  };

  const handleDeleteFolder = async (id: string) => {
    if (!window.confirm(t('browser.bookmarks.deleteFolderConfirm'))) {
      return;
    }
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.browserView.deleteBookmarkFolder(id);
      if (result.success) {
        setFolders((prev) => prev.filter((f) => f.id !== id));
        setBookmarks((prev) => prev.filter((b) => b.folderId !== id));
        if (selectedFolderId === id) {
          setSelectedFolderId(null);
        }
      } else {
        console.error('[BookmarksList] Failed to delete folder:', result.error);
        window.alert(t('browser.bookmarks.deleteFolderFailed', { error: result.error }));
      }
    } catch (error) {
      console.error('[BookmarksList] Error deleting folder:', error);
      window.alert(t('browser.bookmarks.deleteFolderError'));
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    if (!window.confirm(t('browser.bookmarks.deleteBookmarkConfirm'))) {
      return;
    }
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.browserView.deleteBookmark(id);
      if (result.success) {
        setBookmarks((prev) => prev.filter((b) => b.id !== id));
      } else {
        console.error('[BookmarksList] Failed to delete bookmark:', result.error);
        window.alert(t('browser.bookmarks.deleteBookmarkFailed', { error: result.error }));
      }
    } catch (error) {
      console.error('[BookmarksList] Error deleting bookmark:', error);
      window.alert(t('browser.bookmarks.deleteBookmarkError'));
    }
  };

  const handleOpenBookmark = async (bookmark: Bookmark) => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.browserView.openBookmark(bookmark.id);
      if (result.success) {
        logger.debug('[BookmarksList] Bookmark opened:', bookmark.id);
        setBrowserViewMode('chat');
      } else {
        console.error('[BookmarksList] Failed to open bookmark:', result.error);
        window.alert(t('browser.bookmarks.openFailed', { error: result.error }));
      }
    } catch (error) {
      console.error('[BookmarksList] Error opening bookmark:', error);
      window.alert(t('browser.bookmarks.openError'));
    }
  };

  const handleAddCurrentPage = async () => {
    if (!isElectron() || !window.electronAPI) {
      return;
    }

    try {
      const result = await window.electronAPI.browserView.addBookmark({
        folderId: selectedFolderId || undefined,
      });

      if (result.success && result.data) {
        const newBookmark = result.data;
        setBookmarks((prev) => [...prev, newBookmark]);
        window.alert(t('browser.bookmarks.addSuccess'));
      } else {
        console.error('[BookmarksList] Failed to add bookmark:', result.error);
        window.alert(t('browser.bookmarks.addFailed', { error: result.error }));
      }
    } catch (error) {
      console.error('[BookmarksList] Error adding bookmark:', error);
      window.alert(t('browser.bookmarks.addError'));
    }
  };

  const filteredBookmarks = selectedFolderId
    ? bookmarks.filter((b) => b.folderId === selectedFolderId)
    : bookmarks.filter((b) => !b.folderId);

  const selectedFolderName = selectedFolderId
    ? folders.find((f) => f.id === selectedFolderId)?.name
    : t('browser.bookmarks.all');

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
        <h2 className="text-sm font-semibold">{t('browser.bookmarks.title')}</h2>
      </div>

      {/* Folder Selector & Actions */}
      <div className="border-b p-3 space-y-2">
        <div className="flex gap-1">
          {/* Folder Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex-1 justify-start">
                <Globe className="mr-2 h-4 w-4" />
                <span className="truncate">{selectedFolderName}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem onClick={() => setSelectedFolderId(null)}>
                <Globe className="mr-2 h-4 w-4" />
                {t('browser.bookmarks.all')}
              </DropdownMenuItem>
              {folders.map((folder) => (
                <DropdownMenuItem key={folder.id} onClick={() => setSelectedFolderId(folder.id)}>
                  <Globe className="mr-2 h-4 w-4" />
                  <span className="flex-1 truncate">{folder.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 ml-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteFolder(folder.id);
                    }}
                  >
                    <Trash className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add Folder Button */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsAddingFolder(!isAddingFolder)}
            className="shrink-0"
          >
            {isAddingFolder ? <X className="h-4 w-4" /> : <FolderPlus className="h-4 w-4" />}
          </Button>

          {/* Add Bookmark Button */}
          <Button variant="outline" size="icon" onClick={handleAddCurrentPage} className="shrink-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Folder Input */}
        {isAddingFolder && (
          <Input
            placeholder={t('browser.bookmarks.folderNamePlaceholder')}
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleAddFolder();
              }
              if (e.key === 'Escape') {
                setIsAddingFolder(false);
              }
            }}
            className="h-8 text-sm"
            autoFocus
          />
        )}
      </div>

      {/* Bookmarks List */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">{t('browser.bookmarks.loading')}</p>
          </div>
        ) : filteredBookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">{t('browser.bookmarks.noBookmarks')}</p>
            <p className="mt-2 text-xs text-center">{t('browser.bookmarks.noBookmarksHint')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredBookmarks.map((bookmark) => (
              <div
                key={bookmark.id}
                className="group flex items-start gap-2 rounded border p-2 transition-colors hover:bg-accent cursor-pointer"
                onClick={() => handleOpenBookmark(bookmark)}
              >
                <Globe className="h-4 w-4 shrink-0 text-muted-foreground mt-0.5" />
                <div className="flex-1 overflow-hidden min-w-0">
                  <h4 className="truncate text-xs font-medium">{bookmark.title}</h4>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{bookmark.url}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteBookmark(bookmark.id);
                  }}
                >
                  <Trash className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
