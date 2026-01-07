/**
 * AI Command Input Component
 *
 * 자연어 입력 및 직접 명령어 입력을 지원하는 입력 창
 * Autocomplete 기능 추가
 */

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Terminal, Send, Loader2, ArrowRightLeft, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface AICommandInputProps {
  onSubmit: (input: string, mode: 'natural' | 'direct') => void;
  isLoading?: boolean;
  placeholder?: string;
  currentCwd: string;
}

type Suggestion = {
  label: string;
  value: string;
  type: 'file' | 'folder' | 'command';
};

export function AICommandInput({
  onSubmit,
  isLoading = false,
  placeholder,
  currentCwd,
}: AICommandInputProps) {
  const [input, setInput] = useState('');
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualMode, setManualMode] = useState<'natural' | 'direct'>('natural');

  // Autocomplete State
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);

  // 감지된 모드 계산
  const detectedMode: 'natural' | 'direct' = React.useMemo(() => {
    if (isManualMode) return manualMode;

    const trimmed = input.trim();
    if (!trimmed) return 'natural';

    // 1. 강제 트리거 확인
    if (trimmed.startsWith('?')) return 'natural';
    if (trimmed.startsWith('>')) return 'direct';

    // 2. 한글 포함 여부 확인 (한글이 있으면 100% 자연어)
    if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(trimmed)) return 'natural';

    // 3. 일반적인 명령어 패턴 확인
    const commonCommands = [
      'ls',
      'cd',
      'git',
      'npm',
      'pnpm',
      'yarn',
      'docker',
      'dir',
      'mkdir',
      'rm',
      'cp',
      'mv',
      'echo',
      'cat',
      'grep',
      'code',
    ];
    const firstWord = trimmed.split(' ')[0].toLowerCase();
    if (commonCommands.includes(firstWord)) return 'direct';

    // 4. 경로 패턴 확인 (./, /)
    if (trimmed.startsWith('./') || trimmed.startsWith('/')) return 'direct';

    // 5. 기본값: 영문 문장은 자연어로, 그 외는 직접 명령으로
    // 공백이 3개 이상이면 자연어일 확률이 높음 (문장)
    if (trimmed.split(' ').length >= 4) return 'natural';

    return 'direct';
  }, [input, isManualMode, manualMode]);

  // Autocomplete Logic
  useEffect(() => {
    // Only autocomplete in direct mode and when there is input
    if (detectedMode !== 'direct' || !input.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      // Check if API is available
      if (typeof window !== 'undefined' && window.electronAPI?.terminal?.autocomplete) {
        try {
          // Type assertion for now since we haven't updated window.electronAPI type defs yet
          const result = await (window.electronAPI.terminal.autocomplete as any)(currentCwd, input);
          if (result.success) {
            setSuggestions(result.data || []);
            setSelectedSuggestionIndex(0);
          }
        } catch (error) {
          console.error('Autocomplete error:', error);
        }
      }
    }, 150); // Debounce 150ms

    return () => clearTimeout(timer);
  }, [input, detectedMode, currentCwd]);

  const handleSubmit = () => {
    if (!input.trim() || isLoading) return;

    let finalInput = input.trim();

    // 강제 트리거 문자 제거
    if (!isManualMode) {
      if (detectedMode === 'natural' && finalInput.startsWith('?')) {
        finalInput = finalInput.substring(1).trim();
      } else if (detectedMode === 'direct' && finalInput.startsWith('>')) {
        finalInput = finalInput.substring(1).trim();
      }
    }

    onSubmit(finalInput, detectedMode);
    setInput('');
    setSuggestions([]);
    setIsManualMode(false); // 전송 후 자동 모드로 복귀
  };

  const acceptSuggestion = (suggestion: Suggestion) => {
    // 간단한 토큰 치환 로직: 마지막 공백 이후를 제안된 텍스트로 교체
    const tokens = input.split(' ');
    tokens.pop(); // Remove partial

    // Suggestion Value already contains the full path relative or adjusted by backend logic
    // for the last token specifically.
    tokens.push(suggestion.value);

    setInput(tokens.join(' '));
    setSuggestions([]);
    // Focus logic handles itself since input is controlled
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Autocomplete Navigation
    if (suggestions.length > 0) {
      if (e.key === 'Tab') {
        e.preventDefault();
        acceptSuggestion(suggestions[selectedSuggestionIndex]);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedSuggestionIndex((prev) => Math.min(suggestions.length - 1, prev + 1));
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const toggleMode = () => {
    setIsManualMode(true);
    setManualMode(detectedMode === 'natural' ? 'direct' : 'natural');
  };

  return (
    <div className="border-t bg-background p-4 space-y-3 relative">
      {/* Autocomplete List */}
      {suggestions.length > 0 && (
        <div className="absolute bottom-[calc(100%-10px)] left-4 right-4 bg-popover border rounded-md shadow-md overflow-hidden z-20 max-h-48 overflow-y-auto mb-2">
          <div className="p-1">
            {suggestions.map((item, index) => (
              <div
                key={index}
                className={cn(
                  'px-2 py-1.5 text-sm cursor-pointer rounded-sm flex items-center gap-2',
                  index === selectedSuggestionIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
                onClick={() => acceptSuggestion(item)}
                onMouseEnter={() => setSelectedSuggestionIndex(index)}
              >
                {item.type === 'folder' ? (
                  <Folder className="w-3.5 h-3.5 opacity-70 text-blue-400" />
                ) : item.type === 'file' ? (
                  <File className="w-3.5 h-3.5 opacity-70" />
                ) : (
                  <Terminal className="w-3.5 h-3.5 opacity-50" />
                )}
                <span className="flex-1 truncate">{item.label}</span>
                {item.type === 'command' && <span className="text-[10px] opacity-40">Command</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 입력 창 */}
      <div className="relative flex gap-2">
        <div className="absolute left-3 top-2.5 z-10">
          <Badge
            variant={detectedMode === 'natural' ? 'secondary' : 'outline'}
            className={cn(
              'cursor-pointer hover:opacity-80 transition-opacity select-none flex items-center gap-1 h-5 text-[10px]',
              detectedMode === 'natural'
                ? 'bg-primary/20 text-primary hover:bg-primary/30'
                : 'bg-muted text-muted-foreground'
            )}
            onClick={toggleMode}
          >
            {detectedMode === 'natural' ? (
              <>
                <Sparkles className="w-3 h-3" />
                AI
              </>
            ) : (
              <>
                <Terminal className="w-3 h-3" />
                CMD
              </>
            )}
          </Badge>
        </div>

        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            placeholder ||
            (detectedMode === 'natural'
              ? 'AI에게 작업을 요청하세요... (?로 강제 AI 모드)'
              : '명령어를 입력하세요... (>로 강제 명령 모드)')
          }
          className={cn(
            'flex-1 font-mono pl-20 transition-colors', // Badge 공간 확보
            detectedMode === 'natural' && 'bg-primary/5'
          )}
          disabled={isLoading}
          autoFocus
          autoComplete="off"
        />
        <Button onClick={handleSubmit} disabled={!input.trim() || isLoading} className="shrink-0">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>

      {/* 팁 */}
      <div className="flex justify-between items-center px-1">
        <div className="text-[10px] text-muted-foreground flex gap-3">
          <span>
            <span className="font-bold text-primary">?</span> 질문
          </span>
          <span>
            <span className="font-bold text-primary">&gt;</span> 명령
          </span>
          {suggestions.length > 0 && (
            <span>
              <span className="font-bold text-primary">Tab</span> 자동완성
            </span>
          )}
          {isManualMode && (
            <button
              onClick={() => setIsManualMode(false)}
              className="hover:underline flex items-center gap-1 text-primary"
            >
              <ArrowRightLeft className="w-3 h-3" />
              자동 감지 켜기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
