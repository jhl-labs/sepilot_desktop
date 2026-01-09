/**
 * BookmarksPanel Component
 *
 * 북마크된 명령어 관리 UI
 */

'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Play, Trash2, Search, TrendingUp, Clock, FolderOpen, Tag } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';
import type { CommandBookmark } from '../types/bookmarks';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

interface BookmarksPanelProps {
  onExecute?: (command: string) => void;
}

export function BookmarksPanel({ onExecute }: BookmarksPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'popular' | 'recent'>('all');

  const {
    bookmarks = [],
    loadBookmarks,
    removeBookmark,
    executeBookmark,
    searchBookmarks,
    getPopularBookmarks,
    getRecentBookmarks,
  } = useChatStore() as any;

  // 컴포넌트 마운트 시 북마크 로드
  useEffect(() => {
    if (loadBookmarks) {
      loadBookmarks();
    }
  }, [loadBookmarks]);

  // 검색 및 필터링
  const displayedBookmarks = React.useMemo(() => {
    if (searchQuery) {
      return searchBookmarks ? searchBookmarks(searchQuery) : [];
    }

    switch (viewMode) {
      case 'popular':
        return getPopularBookmarks ? getPopularBookmarks(10) : [];
      case 'recent':
        return getRecentBookmarks ? getRecentBookmarks(10) : [];
      default:
        return bookmarks;
    }
  }, [searchQuery, viewMode, bookmarks, searchBookmarks, getPopularBookmarks, getRecentBookmarks]);

  // 북마크 실행
  const handleExecute = async (bookmark: CommandBookmark) => {
    if (executeBookmark) {
      const command = await executeBookmark(bookmark.id);
      if (command && onExecute) {
        onExecute(command);
      }
    }
  };

  // 북마크 삭제
  const handleDelete = (bookmarkId: string) => {
    if (removeBookmark) {
      removeBookmark(bookmarkId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 헤더 */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Star className="w-5 h-5 text-yellow-500" />
          북마크
        </h2>
        <Badge variant="secondary">{bookmarks.length}</Badge>
      </div>

      {/* 검색 */}
      <div className="p-4 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="북마크 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* 뷰 모드 전환 */}
      <div className="flex gap-2 p-4 border-b">
        <Button
          size="sm"
          variant={viewMode === 'all' ? 'default' : 'ghost'}
          onClick={() => setViewMode('all')}
          className="flex-1"
        >
          전체
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'popular' ? 'default' : 'ghost'}
          onClick={() => setViewMode('popular')}
          className="flex-1"
        >
          <TrendingUp className="w-3 h-3 mr-1" />
          인기
        </Button>
        <Button
          size="sm"
          variant={viewMode === 'recent' ? 'default' : 'ghost'}
          onClick={() => setViewMode('recent')}
          className="flex-1"
        >
          <Clock className="w-3 h-3 mr-1" />
          최근
        </Button>
      </div>

      {/* 북마크 목록 */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {displayedBookmarks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Star className="w-12 h-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchQuery ? '검색 결과가 없습니다' : '북마크된 명령어가 없습니다'}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                터미널 블록의 별 아이콘을 클릭하여 북마크를 추가하세요
              </p>
            </div>
          ) : (
            displayedBookmarks.map((bookmark: CommandBookmark) => (
              <div
                key={bookmark.id}
                className="group border rounded-lg p-3 hover:shadow-md transition-all"
              >
                {/* 헤더 */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Star className="w-4 h-4 text-yellow-500 shrink-0" />
                      <h3 className="font-medium text-sm truncate">{bookmark.name}</h3>
                    </div>
                    {bookmark.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {bookmark.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0"
                      onClick={() => handleExecute(bookmark)}
                      title="실행"
                    >
                      <Play className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive shrink-0"
                      onClick={() => handleDelete(bookmark.id)}
                      title="삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>

                {/* 명령어 */}
                <div className="mb-2 p-2 bg-muted/50 rounded text-xs font-mono break-all">
                  {bookmark.command}
                </div>

                {/* 메타데이터 */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  {/* 사용 횟수 */}
                  <div className="flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    <span>{bookmark.usageCount}회</span>
                  </div>

                  {/* 작업 디렉토리 */}
                  {bookmark.cwd && (
                    <div className="flex items-center gap-1">
                      <FolderOpen className="w-3 h-3" />
                      <span className="truncate max-w-[120px]" title={bookmark.cwd}>
                        {bookmark.cwd}
                      </span>
                    </div>
                  )}

                  {/* 생성 시각 */}
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {formatDistanceToNow(bookmark.createdAt, {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </span>
                  </div>
                </div>

                {/* 태그 */}
                {bookmark.tags && bookmark.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {bookmark.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        <Tag className="w-2.5 h-2.5 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
