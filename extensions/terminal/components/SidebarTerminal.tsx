import React from 'react';
import { Terminal, Plus, Trash2, Cpu, Activity, Clock } from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { ko } from 'date-fns/locale';

export function SidebarTerminal() {
  const store = useChatStore() as any;
  const {
    sessions,
    activeSessionId,
    setActiveTerminalSession,
    removeTerminalSession,
    createTerminalSession,
    terminalAgentIsRunning,
    terminalBlocks,
  } = store;

  const handleCreateSession = async () => {
    if (window.electronAPI?.terminal) {
      try {
        // Create PTY session first
        const result = await window.electronAPI.terminal.createSession();
        if (result.success && result.data) {
          createTerminalSession({
            name: `Terminal ${sessions.length + 1}`,
            ptySessionId: result.data.sessionId,
            cwd: result.data.cwd,
            shell: result.data.shell,
          });
        }
      } catch (e) {
        console.error(e);
      }
    } else {
      // Web fallback
      createTerminalSession({
        name: `Terminal ${sessions.length + 1}`,
        ptySessionId: `mock-${Date.now()}`,
        cwd: '/mock/path',
        shell: 'bash',
      });
    }
  };

  // 현재 실행 중인 명령어 수
  const runningCommands = terminalBlocks.filter(
    (block: any) => block.exitCode === undefined
  ).length;

  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-sm font-semibold tracking-tight">터미널 세션</h2>
        <Button variant="ghost" size="icon" onClick={handleCreateSession} title="새 터미널">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {sessions?.map((session: any) => (
            <div
              key={session.id}
              className={cn(
                'group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors',
                session.id === activeSessionId ? 'bg-accent text-accent-foreground' : 'transparent'
              )}
              onClick={() => setActiveTerminalSession(session.id)}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 shrink-0" />
                  <span className="truncate font-medium">{session.name}</span>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {session.lastActiveAt
                      ? formatDistanceToNow(session.lastActiveAt, { addSuffix: true, locale: ko })
                      : '방금 전'}
                  </span>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  'h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity',
                  session.id === activeSessionId && 'opacity-100'
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  removeTerminalSession(session.id);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {sessions?.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>실행 중인 터미널이 없습니다</p>
              <Button variant="link" onClick={handleCreateSession} className="mt-2">
                새 터미널 만들기
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-sidebar/50">
        {/* Status Info */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  terminalAgentIsRunning ? 'bg-green-500 animate-pulse' : 'bg-slate-300'
                )}
              />
              <span className="font-medium text-muted-foreground">
                {terminalAgentIsRunning ? 'AI 작업 중...' : '준비됨'}
              </span>
            </div>
            {runningCommands > 0 && (
              <Badge variant="secondary" className="h-5 text-[10px] px-1.5">
                {runningCommands} 실행 중
              </Badge>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
