'use client';

import { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';

export default function QuickInputPage() {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 페이지 로드 시 입력창에 자동 포커스
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim()) {
      return;
    }

    try {
      // IPC를 통해 메인 프로세스에 메시지 전송
      if (window.electronAPI?.quickInput) {
        await window.electronAPI.quickInput.submit(input.trim());
        setInput('');
      }
    } catch (error) {
      console.error('Failed to submit quick input:', error);
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
    </div>
  );
}
