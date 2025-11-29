/**
 * Editor with Terminal Panel
 *
 * CodeEditor와 TerminalPanel을 조건부로 표시하는 컨테이너 컴포넌트
 */

'use client';

import dynamic from 'next/dynamic';
import { CodeEditor } from './Editor';
import { useChatStore } from '@/lib/store/chat-store';

// TerminalPanel은 xterm을 사용하므로 SSR 비활성화
const TerminalPanel = dynamic(() => import('./TerminalPanel').then(mod => ({ default: mod.TerminalPanel })), {
  ssr: false,
  loading: () => <div className="flex items-center justify-center h-full">Loading terminal...</div>,
});

export function EditorWithTerminal() {
  const { showTerminalPanel, workingDirectory } = useChatStore();

  return (
    <div className="flex h-full flex-col">
      {/* Editor (상단) */}
      <div className={showTerminalPanel ? "flex-1 min-h-0" : "h-full"}>
        <CodeEditor />
      </div>

      {/* Terminal Panel (하단) - 항상 마운트하고 display로 제어 */}
      <div
        className="h-80 border-t"
        style={{ display: showTerminalPanel ? 'block' : 'none' }}
      >
        <TerminalPanel workingDirectory={workingDirectory || undefined} />
      </div>
    </div>
  );
}
