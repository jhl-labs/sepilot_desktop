/**
 * Session Tab Bar Component
 *
 * 다중 터미널 세션을 탭으로 표시하고 전환 가능
 */

'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/lib/store/chat-store';

export function SessionTabBar() {
  const store = useChatStore();
  const {
    sessions,
    activeSessionId,
    setActiveTerminalSession,
    createTerminalSession,
    removeTerminalSession,
  } = store as any; // Type assertion for extension store

  const handleCreateSession = async () => {
    // PTY 세션 생성은 IPC 통해 Main Process에서 처리
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        const result = await window.electronAPI.invoke('terminal:create-session');

        if (result.success && result.data) {
          createTerminalSession({
            name: `Terminal ${sessions.length + 1}`,
            ptySessionId: result.data.sessionId,
            cwd: result.data.cwd,
            shell: result.data.shell,
          });
        }
      } catch (error) {
        console.error('[SessionTabBar] Failed to create session:', error);
      }
    }
  };

  const handleCloseSession = async (sessionId: string) => {
    const session = sessions.find((s: any) => s.id === sessionId);
    if (!session) return;

    // PTY 세션 종료
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        await window.electronAPI.invoke('terminal:kill-session', session.ptySessionId);
      } catch (error) {
        console.error('[SessionTabBar] Failed to kill PTY session:', error);
      }
    }

    // Store에서 세션 제거
    removeTerminalSession(sessionId);
  };

  return (
    <div className="flex items-center gap-1 border-b border-border bg-background px-2 py-1">
      {/* 세션 탭들 */}
      {sessions.map((session: any) => (
        <div
          key={session.id}
          className={cn(
            'group flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
            activeSessionId === session.id
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:bg-accent/50'
          )}
        >
          <button onClick={() => setActiveTerminalSession(session.id)} className="flex-1">
            {session.name}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCloseSession(session.id);
            }}
            className="opacity-0 transition-opacity group-hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {/* 새 세션 버튼 */}
      <Button variant="ghost" size="sm" onClick={handleCreateSession} className="h-7 w-7 p-0">
        <Plus className="h-4 w-4" />
      </Button>
    </div>
  );
}
