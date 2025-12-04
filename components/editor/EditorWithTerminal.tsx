/**
 * Editor with Terminal Panel
 *
 * CodeEditor와 TerminalPanel을 조건부로 표시하는 컨테이너 컴포넌트
 * 드래그 가능한 리사이저로 Editor와 Terminal 크기 조절 지원
 */

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { CodeEditor } from './Editor';
import { useChatStore } from '@/lib/store/chat-store';
import { GripHorizontal } from 'lucide-react';

// TerminalPanel은 xterm을 사용하므로 SSR 비활성화
const TerminalPanel = dynamic(
  () => import('./TerminalPanel').then((mod) => ({ default: mod.TerminalPanel })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">Loading terminal...</div>
    ),
  }
);

const MIN_EDITOR_HEIGHT = 100; // 최소 에디터 높이 (px)
const MIN_TERMINAL_HEIGHT = 100; // 최소 터미널 높이 (px)
const DEFAULT_TERMINAL_HEIGHT = 320; // 기본 터미널 높이 (px)

export function EditorWithTerminal() {
  console.log('[EditorWithTerminal] Component rendering');
  const { showTerminalPanel, workingDirectory } = useChatStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [terminalHeight, setTerminalHeight] = useState(DEFAULT_TERMINAL_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  useEffect(() => {
    console.log('[EditorWithTerminal] Component mounted');
    return () => {
      console.log('[EditorWithTerminal] Component unmounting');
    };
  }, []);

  // 드래그 시작
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      dragStartY.current = e.clientY;
      dragStartHeight.current = terminalHeight;
    },
    [terminalHeight]
  );

  // 드래그 중
  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) {
        return;
      }

      const containerHeight = containerRef.current.clientHeight;
      const deltaY = dragStartY.current - e.clientY; // 위로 드래그하면 양수
      const newTerminalHeight = Math.max(
        MIN_TERMINAL_HEIGHT,
        Math.min(containerHeight - MIN_EDITOR_HEIGHT, dragStartHeight.current + deltaY)
      );

      setTerminalHeight(newTerminalHeight);
    },
    [isDragging]
  );

  // 드래그 종료
  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 마우스 이벤트 리스너 등록
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      // 드래그 중 텍스트 선택 방지
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';
    } else {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className="flex h-full flex-col">
      {/* Editor (상단) */}
      <div
        className={showTerminalPanel ? 'min-h-0' : 'h-full'}
        style={showTerminalPanel ? { height: `calc(100% - ${terminalHeight}px)` } : undefined}
      >
        <CodeEditor />
      </div>

      {/* Resizer - Terminal이 표시될 때만 보임 */}
      {showTerminalPanel && (
        <div
          className="group relative flex h-1 cursor-ns-resize items-center justify-center border-t bg-border hover:bg-accent transition-colors"
          onMouseDown={handleMouseDown}
        >
          {/* 드래그 핸들 아이콘 */}
          <div className="absolute flex items-center justify-center">
            <GripHorizontal className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
        </div>
      )}

      {/* Terminal Panel (하단) - 항상 마운트하고 display로 제어 */}
      <div
        className="border-t"
        style={{
          display: showTerminalPanel ? 'block' : 'none',
          height: showTerminalPanel ? `${terminalHeight}px` : 0,
        }}
      >
        <TerminalPanel workingDirectory={workingDirectory || undefined} />
      </div>
    </div>
  );
}
