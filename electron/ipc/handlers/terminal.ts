/**
 * Terminal IPC Handlers
 *
 * Handles IPC communication between renderer and PTY manager.
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
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
  ipcMain.removeHandler('terminal:autocomplete');

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
          currentShell: process.env.SHELL || (process.platform === 'win32' ? 'powershell' : 'bash'),
          platform: process.platform,
        };

        // Agent 실행 (첫 번째 명령어만 추출)
        let generatedCommand: string | null = null;
        let lastAssistantContent: string | null = null;

        for await (const agentEvent of agent.stream(initialState)) {
          // DEBUG LOC
          logger.info('[Terminal IPC] Agent Event:', {
            type: agentEvent.type,
            keys: Object.keys(agentEvent),
          });

          if (agentEvent.type === 'message') {
            const message = agentEvent.message;
            logger.info('[Terminal IPC] Agent Message:', {
              content: message?.content,
              tool_calls: message?.tool_calls,
            });

            // 마지막 assistant 메시지 내용 저장 (tool 호출 없을 경우 사용)
            if (message.content) {
              lastAssistantContent = message.content;

              // 명령어 추출 시도 (Markdown Block - PowerShell도 포함)
              const commandMatch = message.content.match(
                /```(?:bash|sh|shell|powershell|ps1|cmd)?\n([\s\S]+?)\n```/
              );
              if (commandMatch) {
                generatedCommand = commandMatch[1].trim();
              }
            }

            // Tool Logic: Capture command from arguments before execution
            if (message.tool_calls && message.tool_calls.length > 0) {
              for (const toolCall of message.tool_calls) {
                logger.info('[Terminal IPC] Tool Call:', toolCall);

                // Check both OpenAI format (function.name) and LangChain format (name)
                const toolName = toolCall.function?.name || toolCall.name;

                if (toolName === 'run_command') {
                  // Check args casing and location (OpenAI format vs LangChain format)
                  let args = toolCall.function?.arguments || toolCall.args;

                  logger.info('[Terminal IPC] run_command args:', args);

                  if (typeof args === 'string') {
                    try {
                      // Attempt to parse if it's a JSON string (OpenAI format)
                      const parsed = JSON.parse(args);
                      if (parsed.CommandLine) generatedCommand = parsed.CommandLine;
                      if (parsed.command) generatedCommand = parsed.command;
                      if (parsed.code) generatedCommand = parsed.code;
                    } catch (e) {
                      logger.error('[Terminal IPC] Failed to parse tool args:', e);
                      // Fallback: if parse fails, maybe the string *is* the command? (unlikely for run_command but possible for others)
                    }
                  } else if (typeof args === 'object' && args !== null) {
                    const cmd = args.CommandLine || args.command || args.code;
                    if (cmd) {
                      generatedCommand = cmd;
                    }
                  }
                }
              }
            }
          }

          if (agentEvent.type === 'tool_results' && agentEvent.results?.[0]) {
            // run_command 결과가 있으면 사용
            const toolResult = agentEvent.results[0];
            logger.info('[Terminal IPC] Tool Result:', {
              toolName: toolResult.toolName,
              resultKeys: Object.keys(toolResult),
            });

            if (toolResult.toolName === 'run_command') {
              // Note: If the agent executed the command via tool, we might not want to re-execute it in frontend.
              // But currently frontend logic ignores the 'output' here and just re-runs 'command'.
              // We MUST NOT fallback to `args.naturalInput` as it causes natural language to be executed as shell commands.

              if (!generatedCommand) {
                // If we didn't capture the command text but the tool ran, we can't safely replay it.
                // It's better to fail than to execute arbitrary text.
                return {
                  success: false,
                  error: 'Agent executed a command but the command text could not be captured.',
                };
              }

              return {
                success: true,
                data: {
                  command: generatedCommand, // Never use args.naturalInput here
                  output: toolResult.result?.stdout || '',
                  stderr: toolResult.result?.stderr || '',
                  exitCode: toolResult.result?.exitCode ?? 0,
                },
              };
            }
          }
        }

        // 명령어가 생성된 경우
        if (generatedCommand) {
          return {
            success: true,
            data: {
              command: generatedCommand,
            },
          };
        }

        // Agent가 명령어를 생성하지 않고 텍스트 응답만 제공한 경우
        // 텍스트 응답을 반환하여 프론트엔드에서 표시할 수 있도록 함
        if (lastAssistantContent) {
          return {
            success: true,
            data: {
              textResponse: lastAssistantContent,
              command: null, // 명령어 없음을 명시
            },
          };
        }

        // Agent가 아무 응답도 생성하지 못한 경우
        return {
          success: false,
          error: 'Failed to generate response from natural language input',
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

  /**
   * 터미널 자동완성
   */
  ipcMain.handle('terminal:autocomplete', async (_event, args: { cwd: string; input: string }) => {
    try {
      const { cwd, input } = args;
      if (!input) return { success: true, data: [] };

      // Basic tokenization - split by space
      // TODO: Handle quotes properly in the future
      const tokens = input.split(' ');
      const lastToken = tokens[tokens.length - 1];

      // Define the suggestion type
      type Suggestion = { label: string; value: string; type: 'file' | 'folder' | 'command' };
      let suggestions: Suggestion[] = [];

      // 1. Common Commands (only for first word)
      if (tokens.length === 1 && !lastToken.includes('/') && !lastToken.includes('\\')) {
        const commonCommands = [
          'cd',
          'ls',
          'dir',
          'git',
          'npm',
          'pnpm',
          'yarn',
          'node',
          'docker',
          'python',
          'code',
          'exit',
          'clear',
          'mkdir',
          'rm',
          'cp',
          'mv',
        ];
        const cmdMatches = commonCommands
          .filter((cmd) => cmd.startsWith(lastToken.toLowerCase()))
          .map((cmd) => ({
            label: cmd,
            value: cmd + ' ', // Add space for commands
            type: 'command' as const,
          }));
        suggestions.push(...cmdMatches);
      }

      // 2. File System Path Completion
      try {
        let dirToRead = cwd;
        let filePrefix = lastToken;
        let pathPrefix = ''; // The part of the path before the file/folder name (e.g. "src/" in "src/main")

        // Handle absolute paths or relative paths with separators
        if (lastToken.includes('/') || lastToken.includes('\\')) {
          const dirname = path.dirname(lastToken);
          const basename = path.basename(lastToken);

          if (path.isAbsolute(lastToken)) {
            dirToRead = dirname;
            pathPrefix = dirname;
            // Ensure pathPrefix ends with separator if it's not root (win32 root can be tricky)
            if (!pathPrefix.endsWith(path.sep) && !pathPrefix.endsWith('/')) {
              pathPrefix += path.sep;
            }
          } else {
            dirToRead = path.resolve(cwd, dirname);
            pathPrefix = dirname + path.sep; // Keep relative prefix structure
          }

          // Special case: "folder/" -> dirname is "folder", basename is ""
          if (lastToken.endsWith('/') || lastToken.endsWith('\\')) {
            dirToRead = path.resolve(cwd, lastToken);
            pathPrefix = lastToken;
            filePrefix = '';
          } else {
            // "folder/fi" -> dirname "folder", basename "fi"
            filePrefix = basename;
          }
        }

        // Tilde expansion for reading directory (not for the value returned)
        if (dirToRead.startsWith('~')) {
          dirToRead = dirToRead.replace('~', os.homedir());
        }

        const entries = await fs.readdir(dirToRead, { withFileTypes: true });

        const fileMatches = entries
          .filter((entry) => entry.name.toLowerCase().startsWith(filePrefix.toLowerCase()))
          .map((entry) => {
            const isDir = entry.isDirectory();
            const name = entry.name;
            // If we have a path prefix (e.g. "src/"), the value should be "src/filename"
            // If it's a directory, add a trailing slash
            const suffix = isDir ? path.sep : '';

            // Construct the full relative path to replace the token with
            let value = pathPrefix ? path.join(pathPrefix, name) : name;

            // path.join removes trailing separators, add it back for directories
            if (isDir && !value.endsWith(path.sep)) {
              value += path.sep;
            }

            // Fix windows backslashes if frontend expects forward slashes or just ensure consistency
            // But usually terminal on windows works fine with backslash or forward slash.
            // Let's stick to system default but maybe normalize if needed.

            return {
              label: name + (isDir ? '/' : ''),
              value: value,
              type: (isDir ? 'folder' : 'file') as 'folder' | 'file',
            };
          });

        suggestions.push(...fileMatches);
      } catch (e) {
        // Directory not found or other error - ignore file completion
      }

      return {
        success: true,
        data: suggestions.slice(0, 50), // Limit results
      };
    } catch (error: any) {
      logger.error('[Terminal IPC] Error in autocomplete:', error);
      return { success: false, error: error.message };
    }
  });

  logger.info('[Terminal IPC] Terminal handlers registered');
}
