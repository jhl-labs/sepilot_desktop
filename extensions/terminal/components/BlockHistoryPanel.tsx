/**
 * Block History Panel Component
 *
 * 명령어 히스토리 검색 및 탐색
 */

'use client';

import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Search, X, ChevronRight, AlertCircle } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/utils/logger';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

export function BlockHistoryPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const { terminalBlocks, toggleHistory } = useChatStore();

  // 검색 필터링
  const filteredBlocks = terminalBlocks.filter((block) => {
    if (!searchQuery) return true;

    const lowerQuery = searchQuery.toLowerCase();
    return (
      block.command.toLowerCase().includes(lowerQuery) ||
      block.naturalInput?.toLowerCase().includes(lowerQuery) ||
      block.output.toLowerCase().includes(lowerQuery)
    );
  });

  const handleBlockClick = (blockId: string) => {
    // TODO: 블록 선택 시 해당 블록으로 스크롤
    logger.info('[BlockHistoryPanel] Block clicked:', blockId);
  };

  return (
    <div className="flex h-full w-80 flex-col border-l bg-background">
      {/* 헤더 */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h3 className="text-sm font-semibold">히스토리</h3>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={toggleHistory}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* 검색 */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="명령어 검색..."
            className="pl-8"
          />
        </div>
      </div>

      {/* 히스토리 목록 */}
      <ScrollArea className="flex-1">
        {filteredBlocks.length === 0 ? (
          <div className="flex h-full items-center justify-center p-4 text-center">
            <p className="text-sm text-muted-foreground">
              {searchQuery ? '검색 결과가 없습니다' : '명령어 히스토리가 없습니다'}
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filteredBlocks.map((block) => (
              <div
                key={block.id}
                onClick={() => handleBlockClick(block.id)}
                className={cn(
                  'group p-3 rounded-lg cursor-pointer transition-colors',
                  'hover:bg-muted/50',
                  block.exitCode !== 0 && 'border-l-2 border-l-destructive'
                )}
              >
                {/* 명령어 */}
                <div className="flex items-start gap-2 mb-1">
                  <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <code className="flex-1 text-xs font-mono break-all line-clamp-2">
                    {block.command}
                  </code>
                  {block.exitCode !== 0 && (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 text-destructive" />
                  )}
                </div>

                {/* 메타데이터 */}
                <div className="text-xs text-muted-foreground pl-5">
                  <span className="font-mono">{block.cwd}</span>
                  <span className="mx-1">•</span>
                  <span>
                    {formatDistanceToNow(block.timestamp, { addSuffix: true, locale: ko })}
                  </span>
                </div>

                {/* 자연어 입력 */}
                {block.naturalInput && (
                  <div className="text-xs text-muted-foreground italic pl-5 mt-1 line-clamp-1">
                    💬 {block.naturalInput}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* 통계 */}
      <div className="border-t p-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <div>총 {terminalBlocks.length}개 명령어</div>
          <div>
            성공: {terminalBlocks.filter((b) => b.exitCode === 0).length} / 실패:{' '}
            {terminalBlocks.filter((b) => b.exitCode && b.exitCode !== 0).length}
          </div>
        </div>
      </div>
    </div>
  );
}
