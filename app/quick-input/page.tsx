'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';

export default function QuickInputPage() {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 페이지 로드 시 입력창에 자동 포커스
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) {
      return;
    }

    try {
      // IPC를 통해 메인 프로세스에 메시지 전송
      if (typeof window === 'undefined') {
        setError('Window is undefined');
        return;
      }

      if (!window.electronAPI) {
        setError('Electron API not available');
        return;
      }

      if (!window.electronAPI.quickInput) {
        setError('Quick Input API not available');
        return;
      }

      const result = await window.electronAPI.quickInput.submit(input.trim());

      if (result.success) {
        setInput('');
        setError(null);
      } else {
        setError(result.error || 'Unknown error');
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // ESC 키로 창 닫기
    if (e.key === 'Escape') {
      if (window.electronAPI?.quickInput) {
        window.electronAPI.quickInput.close();
      }
    }
  };

  return (
    <div className="h-screen w-full flex items-center justify-center bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 p-4">
      <div className="w-full max-w-2xl">
        <form onSubmit={handleSubmit} className="w-full">
          <Input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="무엇을 도와드릴까요?"
            className="w-full text-base h-12 px-4 bg-background border-2 border-primary/20 focus:border-primary shadow-lg"
            autoComplete="off"
          />
        </form>
        {error && (
          <div className="mt-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
