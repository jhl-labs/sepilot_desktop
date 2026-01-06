/**
 * AI Command Input Component
 *
 * 자연어 입력 및 직접 명령어 입력을 지원하는 입력 창
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Terminal, Send, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AICommandInputProps {
  onSubmit: (input: string, mode: 'natural' | 'direct') => void;
  isLoading?: boolean;
  placeholder?: string;
}

export function AICommandInput({ onSubmit, isLoading = false, placeholder }: AICommandInputProps) {
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<'natural' | 'direct'>('natural');

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;

    onSubmit(input.trim(), mode);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t bg-background p-4 space-y-3">
      {/* 모드 전환 버튼 */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant={mode === 'natural' ? 'default' : 'outline'}
          className="h-8"
          onClick={() => setMode('natural')}
        >
          <Sparkles className="w-3.5 h-3.5 mr-1.5" />
          자연어
        </Button>
        <Button
          size="sm"
          variant={mode === 'direct' ? 'default' : 'outline'}
          className="h-8"
          onClick={() => setMode('direct')}
        >
          <Terminal className="w-3.5 h-3.5 mr-1.5" />
          직접 명령
        </Button>
      </div>

      {/* 입력 창 */}
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ||
            (mode === 'natural'
              ? '하고 싶은 작업을 자연어로 입력하세요... (예: 최근 수정된 파일 5개 보여줘)'
              : '실행할 명령어를 입력하세요... (예: ls -la)')
          }
          className={cn('flex-1 font-mono', mode === 'natural' && 'bg-primary/5')}
          disabled={isLoading}
          autoFocus
        />
        <Button onClick={handleSubmit} disabled={!input.trim() || isLoading} className="shrink-0">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* 도움말 */}
      <div className="text-xs text-muted-foreground">
        {mode === 'natural' ? (
          <span>💡 자연어로 원하는 작업을 설명하면 AI가 적절한 명령어를 제안합니다</span>
        ) : (
          <span>💡 명령어를 직접 입력하여 실행합니다 (Enter로 실행)</span>
        )}
      </div>
    </div>
  );
}
