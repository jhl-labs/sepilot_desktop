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

  if (!showTerminalPanel) {
    // 터미널 숨김 - Editor만 표시
    return <CodeEditor />;
  }

  // 터미널 표시 - Editor와 Terminal을 수평 분할
  return (
    <div className="flex h-full flex-col">
      {/* Editor (상단) */}
      <div className="flex-1 min-h-0">
        <CodeEditor />
      </div>

      {/* Terminal Panel (하단) */}
      <div className="h-80 border-t">
        <TerminalPanel workingDirectory={workingDirectory || undefined} />
      </div>
    </div>
  );
}
