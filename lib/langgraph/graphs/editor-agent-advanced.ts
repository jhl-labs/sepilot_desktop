import { AgentState } from '../state';
import type { Message, ToolCall } from '@/types';
import type { ToolApprovalCallback } from '../types';
import { getLLMClient } from '@/lib/llm/client';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';

import { logger } from '@/lib/utils/logger';
/**
 * Advanced Editor Agent Graph
 *
 * Cursor/Claude Code 스타일의 고도화된 Editor Agent
 * - 현재 열린 파일들 컨텍스트 이해
 * - 터미널 명령 실행 및 출력 읽기
 * - 파일 읽기/쓰기/수정 (Human-in-the-loop)
 * - 프로젝트 전체 검색
 * - Git 상태 확인
 * - 다중 파일 편집 지원
 */

export interface EditorAgentState extends AgentState {
  // Editor 전용 상태
  editorContext?: {
    openFiles?: Array<{
      path: string;
      filename: string;
      language: string;
      content: string;
      isDirty: boolean;
    }>;
    activeFilePath?: string;
    workingDirectory?: string;
    terminalSessions?: Array<{
      id: string;
      title: string;
    }>;
    useRag?: boolean;
    useTools?: boolean;
    action?: 'autocomplete' | 'code-action' | 'writing-tool';
    actionType?: string;
    selectedText?: string;
    enabledTools?: string[];
  };
  // RAG 관련 상태
  ragDocuments?: Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
    score?: number;
  }>;
}

export class AdvancedEditorAgentGraph {
  private maxIterations: number;

  constructor(maxIterations = 100) {
    this.maxIterations = maxIterations;
  }

  /**
   * Editor Agent 스트리밍 실행
   */
  async *stream(
    initialState: EditorAgentState,
    toolApprovalCallback?: ToolApprovalCallback
  ): AsyncGenerator<any> {
    let state = { ...initialState };
    let iterations = 0;

    logger.info('[AdvancedEditorAgent] Starting with context:', {
      openFiles: state.editorContext?.openFiles?.length,
      activeFile: state.editorContext?.activeFilePath,
      workingDir: state.editorContext?.workingDirectory,
      useRag: state.editorContext?.useRag,
      useTools: state.editorContext?.useTools,
    });

    // RAG: useRag가 활성화된 경우 문서 검색 수행
    if (state.editorContext?.useRag) {
      logger.info('[AdvancedEditorAgent] RAG enabled - retrieving relevant documents');
      try {
        const ragDocuments = await this.retrieveDocuments(state);
        state = {
          ...state,
          ragDocuments,
        };
        logger.info(`[AdvancedEditorAgent] Retrieved ${ragDocuments.length} RAG documents`);

        // RAG 문서 검색 결과를 yield
        yield {
          type: 'rag_documents',
          documents: ragDocuments,
        };
      } catch (error: any) {
        console.error('[AdvancedEditorAgent] RAG retrieval error:', error);
        // RAG 실패 시에도 계속 진행 (문서 없이)
        state = {
          ...state,
          ragDocuments: [],
        };
      }
    } else {
      logger.info('[AdvancedEditorAgent] RAG disabled or not requested');
    }

    // Add system message with editor context
    const systemMessage: Message = {
      id: `system-${Date.now()}`,
      role: 'system',
      content: this.buildSystemPrompt(state.editorContext, state.ragDocuments),
      created_at: Date.now(),
    };

    state = {
      ...state,
      messages: [systemMessage, ...state.messages],
    };

    let hasError = false;
    let errorMessage = '';

    while (iterations < this.maxIterations) {
      logger.info(
        `[AdvancedEditorAgent] ===== Iteration ${iterations + 1}/${this.maxIterations} =====`
      );

      // 1. Generate response with tools
      let generateResult;
      try {
        generateResult = await this.generateNode(state);
      } catch (error: any) {
        console.error('[AdvancedEditorAgent] Generate error:', error);
        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break;
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];

        state = {
          ...state,
          messages: [...state.messages, newMessage],
        };

        // Yield message
        yield {
          type: 'message',
          message: newMessage,
        };
      }

      // 2. Check if tools should be used
      const decision = this.shouldUseTool(state);

      if (decision === 'end') {
        logger.info('[AdvancedEditorAgent] No more tools to call, ending');
        break;
      }

      // 3. Tool approval (if callback provided)
      const lastMessage = state.messages[state.messages.length - 1];
      if (toolApprovalCallback && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        // Filter out read-only tools that don't need approval
        const readOnlyTools = [
          'read_file',
          'list_files',
          'search_files',
          'get_terminal_output',
          'get_git_status',
          'read_directory',
        ];

        const toolsNeedingApproval = lastMessage.tool_calls.filter(
          (tc) => !readOnlyTools.includes(tc.name)
        );

        if (toolsNeedingApproval.length > 0) {
          yield {
            type: 'tool_approval_request',
            messageId: lastMessage.id,
            toolCalls: toolsNeedingApproval,
          };

          const approved = await toolApprovalCallback(toolsNeedingApproval);

          yield {
            type: 'tool_approval_result',
            approved,
          };

          if (!approved) {
            logger.info('[AdvancedEditorAgent] Tools rejected by user');
            const rejectionMessage: Message = {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: 'Tool execution was rejected by user.',
              created_at: Date.now(),
            };
            state = {
              ...state,
              messages: [...state.messages, rejectionMessage],
            };
            yield {
              type: 'message',
              message: rejectionMessage,
            };
            break;
          }
        }
      }

      // 4. Execute tools
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
        const toolNames = lastMsg.tool_calls.map((t) => t.name).join(', ');
        emitStreamingChunk(`\n\n🛠️ **도구 실행 중:** ${toolNames}...\n`, state.conversationId);
      }

      const toolsResult = await this.toolsNode(state);

      if (toolsResult.toolResults && toolsResult.toolResults.length > 0) {
        emitStreamingChunk(`✅ **실행 완료**\n\n`, state.conversationId);
      }

      // Add tool results as messages
      if (toolsResult.toolResults && toolsResult.toolResults.length > 0) {
        const toolResultMessages: Message[] = toolsResult.toolResults.map((result: any) => ({
          id: `tool-result-${result.toolCallId}`,
          role: 'tool' as const,
          content: JSON.stringify(result.result || result.error),
          tool_call_id: result.toolCallId,
          name: result.toolName,
          created_at: Date.now(),
        }));

        state = {
          ...state,
          messages: [...state.messages, ...toolResultMessages],
          toolResults: toolsResult.toolResults || [],
        };

        yield {
          type: 'tool_results',
          toolResults: toolsResult.toolResults,
        };
      }

      iterations++;
    }

    // Final report if error or max iterations
    if (hasError) {
      const errorMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `❌ Error: ${errorMessage}`,
        created_at: Date.now(),
      };
      yield {
        type: 'message',
        message: errorMsg,
      };
    } else if (iterations >= this.maxIterations) {
      const maxIterMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: `⚠️ Reached max iterations (${this.maxIterations}). Task may be incomplete.`,
        created_at: Date.now(),
      };
      yield {
        type: 'message',
        message: maxIterMsg,
      };
    }
  }

  /**
   * Build system prompt with editor context
   */
  private buildSystemPrompt(
    context?: EditorAgentState['editorContext'],
    ragDocuments?: EditorAgentState['ragDocuments']
  ): string {
    const parts = [
      'You are an advanced AI coding assistant integrated into the editor.',
      'You can read, write, and modify files, execute terminal commands, and help with coding tasks.',
      '',
      '# Current Editor State:',
    ];

    if (context?.workingDirectory) {
      parts.push(`Working Directory: ${context.workingDirectory}`);
    }

    if (context?.openFiles && context.openFiles.length > 0) {
      parts.push('');
      parts.push('## Open Files:');
      context.openFiles.forEach((file, index) => {
        const marker = file.path === context.activeFilePath ? '* (active)' : '';
        parts.push(`${index + 1}. ${file.filename} ${marker}`);
        parts.push(`   Path: ${file.path}`);
        parts.push(`   Language: ${file.language}`);
        if (file.isDirty) {
          parts.push(`   Status: Modified (unsaved)`);
        }
      });
    }

    if (context?.terminalSessions && context.terminalSessions.length > 0) {
      parts.push('');
      parts.push('## Terminal Sessions:');
      context.terminalSessions.forEach((session, index) => {
        parts.push(`${index + 1}. ${session.title} (ID: ${session.id})`);
      });
    }

    if (context?.useTools !== false) {
      parts.push('');
      parts.push('# Available Tools:');
      parts.push('');
      parts.push('## File Operations (READ - no approval needed):');
      parts.push('- read_file: Read file contents');
      parts.push('- list_files: List files in directory');
      parts.push('- search_files: Search for text in files (ripgrep)');
      parts.push('- read_directory: Get directory structure');
      parts.push('');
      parts.push('## File Operations (WRITE - requires approval):');
      parts.push('- write_file: Create or overwrite entire file');
      parts.push('- edit_file: Apply precise edits to file (search & replace)');
      parts.push('- create_directory: Create new directory');
      parts.push('- delete_file: Delete file or directory');
      parts.push('');
      parts.push('## Terminal Operations:');
      parts.push('- execute_command: Run shell command (requires approval)');
      parts.push('- get_terminal_output: Read terminal output (no approval)');
      parts.push('');
      parts.push('## Git Operations:');
      parts.push('- get_git_status: Check git status (no approval)');
      parts.push('- git_diff: View git diff (no approval)');
      parts.push('');
      parts.push('# Guidelines:');
      parts.push('- Always read files before modifying them');
      parts.push('- Use edit_file for small changes, write_file for complete rewrites');
      parts.push('- Test changes with terminal commands when appropriate');
      parts.push("- Explain what you're doing before making changes");
      parts.push('- Be careful with file operations - they require user approval');
    }

    parts.push('- Respond in Korean and using markdown.');

    // RAG Documents Context
    if (ragDocuments && ragDocuments.length > 0) {
      parts.push('');
      parts.push('# Relevant Documents (RAG):');
      parts.push(
        'The following documents were retrieved from the project knowledge base to help you contextually:'
      );
      parts.push('');

      ragDocuments.forEach((doc, i) => {
        parts.push(`## Document ${i + 1} (Score: ${(doc.score || 0).toFixed(2)})`);
        if (doc.metadata?.title) {
          parts.push(`Title: ${doc.metadata.title}`);
        }
        if (doc.metadata?.folderPath) {
          parts.push(`Path: ${doc.metadata.folderPath}`);
        }
        parts.push('Content:');
        parts.push('```');
        parts.push(doc.content.substring(0, 2000)); // Limit content length per doc
        parts.push('```');
        parts.push('');
      });

      parts.push(
        'Use these documents to understand the project context, conventions, and implementation details.'
      );
    }

    return parts.join('\n');
  }

  /**
   * RAG: 벡터 DB에서 관련 문서 검색
   */
  private async retrieveDocuments(
    state: EditorAgentState
  ): Promise<
    Array<{ id: string; content: string; metadata: Record<string, any>; score?: number }>
  > {
    try {
      // Main Process 환경 확인
      if (typeof window !== 'undefined') {
        console.error('[AdvancedEditorAgent] retrieveDocuments should only run in Main Process');
        return [];
      }

      // 검색 쿼리 생성: 마지막 사용자 메시지 + 에디터 컨텍스트
      // 사용자의 마지막 메시지 찾기
      const userMessages = state.messages.filter((m) => m.role === 'user');
      const lastUserMessage =
        userMessages.length > 0 ? userMessages[userMessages.length - 1] : null;
      let query = lastUserMessage?.content || '';

      // 에디터 컨텍스트를 쿼리에 추가
      if (state.editorContext) {
        const { selectedText, actionType } = state.editorContext;
        const contextParts = [];

        if (actionType) {
          contextParts.push(`Action: ${actionType}`);
        }
        if (selectedText && selectedText.length < 200) {
          contextParts.push(`Code: ${selectedText}`);
        }

        if (contextParts.length > 0) {
          query = `${contextParts.join(' | ')} | ${query}`;
        }
      }

      logger.info('[AdvancedEditorAgent] RAG query:', query);

      // Dynamic import services
      const { vectorDBService } = await import('../../../electron/services/vectordb');
      const { databaseService } = await import('../../../electron/services/database');
      const { initializeEmbedding, getEmbeddingProvider } =
        await import('@/lib/vectordb/embeddings/client');

      // Embedding config 로드
      const configStr = databaseService.getSetting('app_config');
      if (!configStr) {
        console.warn('[AdvancedEditorAgent] App config not found, RAG disabled');
        return [];
      }

      const appConfig = JSON.parse(configStr);
      if (!appConfig.embedding) {
        console.warn('[AdvancedEditorAgent] Embedding config not found, RAG disabled');
        return [];
      }

      // Embedding 초기화
      initializeEmbedding(appConfig.embedding);

      // 쿼리 임베딩
      const embedder = getEmbeddingProvider();
      const queryEmbedding = await embedder.embed(query);

      // 벡터 검색 (상위 3개)
      const results = await vectorDBService.searchByVector(queryEmbedding, 3);

      logger.info(`[AdvancedEditorAgent] RAG retrieved ${results.length} documents`);

      return results.map((result) => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        score: result.score,
      }));
    } catch (error: any) {
      console.error('[AdvancedEditorAgent] RAG retrieval error:', error);
      return [];
    }
  }

  /**
   * Generate node: LLM 호출 with tools
   */
  private async generateNode(state: EditorAgentState): Promise<{ messages: Message[] }> {
    const client = getLLMClient();

    if (!client.isConfigured()) {
      throw new Error('LLM client not configured');
    }

    const provider = client.getProvider();

    // Get all editor tools
    // Check if tools are enabled in context (default to true if undefined)
    const useTools = state.editorContext?.useTools !== false;
    const tools = useTools ? this.getEditorTools(state.editorContext?.enabledTools) : [];

    const response = await provider.chat(state.messages, {
      tools: tools.length > 0 ? tools : undefined,
    });

    const toolCalls = response.toolCalls?.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments:
        typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments,
    }));

    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: response.content || '',
      tool_calls: toolCalls,
      created_at: Date.now(),
    };

    return {
      messages: [newMessage],
    };
  }

  /**
   * Tools node: Execute tool calls
   */
  private async toolsNode(state: EditorAgentState): Promise<{ toolResults: any[] }> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return { toolResults: [] };
    }

    const results = [];

    for (const toolCall of lastMessage.tool_calls) {
      logger.info('[AdvancedEditorAgent] Executing tool:', toolCall.name);

      try {
        const result = await this.executeTool(toolCall, state);
        results.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
        });
      } catch (error: any) {
        console.error('[AdvancedEditorAgent] Tool execution error:', error);
        results.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          error: error.message,
        });
      }
    }

    return { toolResults: results };
  }

  /**
   * Decision: Should use tool?
   */
  private shouldUseTool(state: EditorAgentState): 'tools' | 'end' {
    const lastMessage = state.messages[state.messages.length - 1];

    if (
      lastMessage?.role === 'assistant' &&
      lastMessage.tool_calls &&
      lastMessage.tool_calls.length > 0
    ) {
      return 'tools';
    }

    return 'end';
  }

  /**
   * Get all editor tools
   */
  private getEditorTools(enabledTools?: string[]): any[] {
    const allTools = [
      // File Reading (no approval needed)
      {
        type: 'function',
        function: {
          name: 'read_file',
          description:
            'Read the complete contents of a file. Use this to understand existing code before making changes.',
          parameters: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Absolute path to the file to read',
              },
            },
            required: ['filePath'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'list_files',
          description: 'List all files in a directory. Useful for discovering project structure.',
          parameters: {
            type: 'object',
            properties: {
              dirPath: {
                type: 'string',
                description: 'Directory path to list files from',
              },
              recursive: {
                type: 'boolean',
                description: 'Whether to list files recursively',
              },
            },
            required: ['dirPath'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'search_files',
          description:
            'Search for text pattern in files using ripgrep. Great for finding usage examples or definitions.',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Text or regex pattern to search for',
              },
              path: {
                type: 'string',
                description: 'Directory or file to search in',
              },
              caseInsensitive: {
                type: 'boolean',
                description: 'Whether to ignore case',
              },
              fileType: {
                type: 'string',
                description: 'File type filter (e.g., "ts", "py")',
              },
            },
            required: ['pattern'],
          },
        },
      },
      // File Writing (requires approval)
      {
        type: 'function',
        function: {
          name: 'write_file',
          description:
            'Create a new file or completely replace existing file contents. Use for new files or complete rewrites.',
          parameters: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Absolute path where file should be written',
              },
              content: {
                type: 'string',
                description: 'Complete file content to write',
              },
            },
            required: ['filePath', 'content'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'edit_file',
          description:
            'Apply precise edits to a file using search and replace. Better than write_file for small changes. Can make multiple edits in one call.',
          parameters: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Path to file to edit',
              },
              edits: {
                type: 'array',
                description: 'Array of edit operations to apply',
                items: {
                  type: 'object',
                  properties: {
                    oldText: {
                      type: 'string',
                      description: 'Exact text to find and replace (must be unique)',
                    },
                    newText: {
                      type: 'string',
                      description: 'New text to replace with',
                    },
                  },
                  required: ['oldText', 'newText'],
                },
              },
            },
            required: ['filePath', 'edits'],
          },
        },
      },
      // Terminal
      {
        type: 'function',
        function: {
          name: 'execute_command',
          description:
            'Execute a shell command in the terminal. Great for running tests, builds, git commands, etc.',
          parameters: {
            type: 'object',
            properties: {
              command: {
                type: 'string',
                description: 'Shell command to execute',
              },
              cwd: {
                type: 'string',
                description: 'Working directory for command execution',
              },
            },
            required: ['command'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'get_terminal_output',
          description: 'Read recent output from terminal. Use this to check command results.',
          parameters: {
            type: 'object',
            properties: {
              lines: {
                type: 'number',
                description: 'Number of recent lines to retrieve (default: 50)',
              },
            },
            required: [],
          },
        },
      },
      // Git
      {
        type: 'function',
        function: {
          name: 'get_git_status',
          description: 'Get current git status (modified files, branch, etc.)',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'git_diff',
          description: 'View git diff for staged or unstaged changes',
          parameters: {
            type: 'object',
            properties: {
              filePath: {
                type: 'string',
                description: 'Optional: specific file to diff',
              },
              staged: {
                type: 'boolean',
                description: 'Show staged changes (default: false)',
              },
            },
            required: [],
          },
        },
      },
    ];

    if (!enabledTools || enabledTools.length === 0) {
      return allTools;
    }

    return allTools.filter((tool) => enabledTools.includes(tool.function.name));
  }

  /**
   * Execute editor tool
   */
  private async executeTool(toolCall: ToolCall, state: EditorAgentState): Promise<any> {
    const { name, arguments: args } = toolCall;

    // Tools will be implemented via IPC calls to Electron
    // For now, return placeholders
    switch (name) {
      case 'read_file':
        return this.readFile(args as any, state);
      case 'list_files':
        return this.listFiles(args as any, state);
      case 'search_files':
        return this.searchFiles(args as any, state);
      case 'write_file':
        return this.writeFile(args as any, state);
      case 'edit_file':
        return this.editFile(args as any, state);
      case 'execute_command':
        return this.executeCommand(args as any, state);
      case 'get_terminal_output':
        return this.getTerminalOutput(args as any, state);
      case 'get_git_status':
        return this.getGitStatus(args as any, state);
      case 'git_diff':
        return this.gitDiff(args as any, state);
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  // Tool implementations
  private async readFile(args: { filePath: string }, _state: EditorAgentState): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.fs.readFile(args.filePath);
      if (result.success && result.data) {
        return result.data;
      }
      throw new Error(result.error || 'Failed to read file');
    }
    throw new Error('File operations not available in browser mode');
  }

  private async listFiles(
    args: { dirPath: string; recursive?: boolean },
    _state: EditorAgentState
  ): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.fs.readDirectory(args.dirPath);
      if (result.success && result.data) {
        const items = result.data.map(
          (item: any) => `${item.isDirectory ? '[DIR]' : '[FILE]'} ${item.name}`
        );
        return items.join('\n');
      }
      throw new Error(result.error || 'Failed to list files');
    }
    throw new Error('File operations not available in browser mode');
  }

  private async searchFiles(
    args: { pattern: string; path?: string; caseInsensitive?: boolean; fileType?: string },
    _state: EditorAgentState
  ): Promise<string> {
    // Use ripgrep via existing grep_search
    const workingDir = args.path || _state.editorContext?.workingDirectory || process.cwd();

    if (typeof window !== 'undefined' && window.electronAPI) {
      // This would need a new IPC handler for ripgrep search
      return `Search for "${args.pattern}" in ${workingDir}\n(Search implementation pending)`;
    }
    throw new Error('Search not available in browser mode');
  }

  private async writeFile(
    args: { filePath: string; content: string },
    _state: EditorAgentState
  ): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      const result = await window.electronAPI.fs.writeFile(args.filePath, args.content);
      if (result.success) {
        return `Successfully wrote file: ${args.filePath}`;
      }
      throw new Error(result.error || 'Failed to write file');
    }
    throw new Error('File operations not available in browser mode');
  }

  private async editFile(
    args: { filePath: string; edits: Array<{ oldText: string; newText: string }> },
    _state: EditorAgentState
  ): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Read file first
      const readResult = await window.electronAPI.fs.readFile(args.filePath);
      if (!readResult.success || !readResult.data) {
        throw new Error(readResult.error || 'Failed to read file');
      }

      let content = readResult.data;
      const results: string[] = [];

      // Apply edits
      for (const edit of args.edits) {
        if (!content.includes(edit.oldText)) {
          results.push(`❌ Could not find text to replace: "${edit.oldText.substring(0, 50)}..."`);
          continue;
        }

        const occurrences = (
          content.match(new RegExp(edit.oldText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []
        ).length;
        if (occurrences > 1) {
          results.push(`⚠️  Warning: Found ${occurrences} occurrences of text. Replacing all.`);
        }

        content = content.replace(edit.oldText, edit.newText);
        results.push(`✅ Replaced text successfully`);
      }

      // Write back
      const writeResult = await window.electronAPI.fs.writeFile(args.filePath, content);
      if (!writeResult.success) {
        throw new Error(writeResult.error || 'Failed to write file');
      }

      results.push(`\n✅ File saved: ${args.filePath}`);
      return results.join('\n');
    }
    throw new Error('File operations not available in browser mode');
  }

  private async executeCommand(
    args: { command: string; cwd?: string },
    _state: EditorAgentState
  ): Promise<string> {
    // This would execute via terminal IPC
    return `Executed: ${args.command}\n(Terminal integration pending)`;
  }

  private async getTerminalOutput(
    args: { lines?: number },
    _state: EditorAgentState
  ): Promise<string> {
    // This would read from terminal buffer
    return `Last ${args.lines || 50} lines of terminal output\n(Terminal integration pending)`;
  }

  private async getGitStatus(_args: any, _state: EditorAgentState): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Would execute git status via command
      return `Git status:\n(Git integration pending)`;
    }
    throw new Error('Git operations not available in browser mode');
  }

  private async gitDiff(
    args: { filePath?: string; staged?: boolean },
    _state: EditorAgentState
  ): Promise<string> {
    if (typeof window !== 'undefined' && window.electronAPI) {
      // Would execute git diff via command
      return `Git diff${args.filePath ? ` for ${args.filePath}` : ''}\n(Git integration pending)`;
    }
    throw new Error('Git operations not available in browser mode');
  }
}

/**
 * Create Advanced Editor Agent instance
 */
export function createAdvancedEditorAgentGraph(maxIterations = 50): AdvancedEditorAgentGraph {
  return new AdvancedEditorAgentGraph(maxIterations);
}
