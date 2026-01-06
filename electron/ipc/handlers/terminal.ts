/**
 * Terminal IPC Handlers
 *
 * Handles IPC communication between renderer and PTY manager.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { getPTYManager } from '../../services/pty-manager';
import { logger } from '../../services/logger';

let mainWindowRef: BrowserWindow | null = null;

export function setupTerminalHandlers(mainWindow?: BrowserWindow) {
  if (mainWindow) {
    mainWindowRef = mainWindow;
  }

  const ptyManager = getPTYManager(mainWindowRef || undefined);

  // 기존 핸들러 제거 (중복 등록 방지)
  ipcMain.removeHandler('terminal:create-session');
  ipcMain.removeHandler('terminal:write');
  ipcMain.removeHandler('terminal:resize');
  ipcMain.removeHandler('terminal:kill-session');
  ipcMain.removeHandler('terminal:get-sessions');
  ipcMain.removeHandler('terminal:execute-command');
  ipcMain.removeHandler('terminal:ai-command');

  /**
   * 터미널 세션 생성
   */
  ipcMain.handle(
    'terminal:create-session',
    async (_event, cwd?: string, cols?: number, rows?: number) => {
      try {
        logger.info('[Terminal IPC] Creating session:', { cwd, cols, rows });

        const result = ptyManager.createSession({ cwd, cols, rows });

        return {
          success: true,
          data: result,
        };
      } catch (error: any) {
        logger.error('[Terminal IPC] Error creating session:', error);
        return {
          success: false,
          error: error.message || 'Failed to create terminal session',
        };
      }
    }
  );

  /**
   * 터미널에 데이터 쓰기
   */
  ipcMain.handle('terminal:write', async (_event, sessionId: string, data: string) => {
    try {
      const success = ptyManager.writeData(sessionId, data);

      return {
        success,
        error: success ? undefined : 'Failed to write data',
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error writing data:', error);
      return {
        success: false,
        error: error.message || 'Failed to write data',
      };
    }
  });

  /**
   * 터미널 리사이즈
   */
  ipcMain.handle(
    'terminal:resize',
    async (_event, sessionId: string, cols: number, rows: number) => {
      try {
        const success = ptyManager.resize(sessionId, cols, rows);

        return {
          success,
          error: success ? undefined : 'Failed to resize terminal',
        };
      } catch (error: any) {
        logger.error('[Terminal IPC] Error resizing terminal:', error);
        return {
          success: false,
          error: error.message || 'Failed to resize terminal',
        };
      }
    }
  );

  /**
   * 터미널 세션 종료
   */
  ipcMain.handle('terminal:kill-session', async (_event, sessionId: string) => {
    try {
      logger.info('[Terminal IPC] Killing session:', sessionId);

      const success = ptyManager.killSession(sessionId);

      return {
        success,
        error: success ? undefined : 'Failed to kill session',
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error killing session:', error);
      return {
        success: false,
        error: error.message || 'Failed to kill session',
      };
    }
  });

  /**
   * 활성 세션 목록 조회
   */
  ipcMain.handle('terminal:get-sessions', async () => {
    try {
      const sessions = ptyManager.getSessions();

      return {
        success: true,
        data: sessions,
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error getting sessions:', error);
      return {
        success: false,
        error: error.message || 'Failed to get sessions',
      };
    }
  });

  /**
   * 명령어 직접 실행 (Terminal Extension용)
   */
  ipcMain.handle(
    'terminal:execute-command',
    async (_event, args: { command: string; cwd?: string; timeout?: number }) => {
      try {
        logger.info('[Terminal IPC] Executing command:', args.command);

        // run_command tool 동적 import (Main Process용)
        const { executeRunCommand } =
          await import('../../../extensions/terminal/tools/run_command');

        const result = await executeRunCommand({
          command: args.command,
          cwd: args.cwd,
          timeout: args.timeout || 30000,
        });

        return {
          success: result.success,
          data: result.success
            ? {
                stdout: result.stdout || '',
                stderr: result.stderr || '',
                exitCode: result.exitCode ?? 0,
                duration: result.duration || 0,
              }
            : undefined,
          error: result.error,
        };
      } catch (error: any) {
        logger.error('[Terminal IPC] Error executing command:', error);
        return {
          success: false,
          error: error.message || 'Failed to execute command',
        };
      }
    }
  );

  /**
   * AI 명령어 생성 및 실행 (Terminal Extension용)
   */
  ipcMain.handle(
    'terminal:ai-command',
    async (
      event,
      args: {
        naturalInput: string;
        currentCwd?: string;
        recentBlocks?: any[];
      }
    ) => {
      const streamId = `terminal-${Date.now()}`;

      try {
        logger.info('[Terminal IPC] AI command request:', args.naturalInput);

        // Terminal Agent 동적 import (Main Process용)
        const { createTerminalAgentGraph } =
          await import('../../../extensions/terminal/agents/terminal-agent');
        const { setStreamingCallback, setCurrentConversationId } =
          await import('../../../lib/llm/streaming-callback');

        const agent = createTerminalAgentGraph(10);

        // 스트리밍 콜백 설정 (LangGraph와 동일한 방식)
        setCurrentConversationId(streamId);
        setStreamingCallback((chunk: string) => {
          event.sender.send('terminal:ai-stream', {
            chunk,
            conversationId: streamId,
          });
        }, streamId);

        // Agent 초기 상태 구성
        const initialState = {
          messages: [
            {
              id: `msg-${Date.now()}`,
              role: 'user' as const,
              content: args.naturalInput,
              created_at: Date.now(),
            },
          ],
          conversationId: streamId,
          recentBlocks: args.recentBlocks || [],
          currentCwd: args.currentCwd || process.cwd(),
          currentShell: process.env.SHELL || 'bash',
          platform: process.platform,
        };

        // Agent 실행 (첫 번째 명령어만 추출)
        let generatedCommand: string | null = null;

        for await (const agentEvent of agent.stream(initialState)) {
          if (agentEvent.type === 'message' && agentEvent.message?.content) {
            // 명령어 추출 시도
            const content = agentEvent.message.content;
            const commandMatch = content.match(/```(?:bash|sh|shell)?\n([\s\S]+?)\n```/);
            if (commandMatch) {
              generatedCommand = commandMatch[1].trim();
              break;
            }
          }

          if (agentEvent.type === 'tool_results' && agentEvent.results?.[0]) {
            // run_command 결과가 있으면 사용
            const toolResult = agentEvent.results[0];
            if (toolResult.toolName === 'run_command') {
              return {
                success: true,
                data: {
                  command: generatedCommand || args.naturalInput,
                  output: toolResult.result?.stdout || '',
                  stderr: toolResult.result?.stderr || '',
                  exitCode: toolResult.result?.exitCode ?? 0,
                },
              };
            }
          }
        }

        // 명령어만 생성된 경우
        if (generatedCommand) {
          return {
            success: true,
            data: {
              command: generatedCommand,
            },
          };
        }

        // Agent가 명령어를 생성하지 못한 경우
        return {
          success: false,
          error: 'Failed to generate command from natural language input',
        };
      } catch (error: any) {
        logger.error('[Terminal IPC] Error in AI command:', error);
        return {
          success: false,
          error: error.message || 'Failed to process AI command',
        };
      }
    }
  );

  logger.info('[Terminal IPC] Terminal handlers registered');
}
