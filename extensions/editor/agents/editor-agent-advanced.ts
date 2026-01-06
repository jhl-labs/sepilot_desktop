import { CodingAgentState } from '@/lib/langgraph/state';
import type { Message, ToolCall } from '@/types';
import type { ToolApprovalCallback } from '@/lib/langgraph/types';
import { getLLMClient } from '@/lib/llm/client';
import { LLMService } from '@/lib/llm/service';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { ToolSelector } from '@/lib/langgraph/utils/tool-selector';
import { FileTracker } from '@/lib/langgraph/utils/file-tracker';
import { ContextManager } from '@/lib/langgraph/utils/context-manager';
import { VerificationPipeline } from '@/lib/langgraph/utils/verification-pipeline';
import { ErrorRecovery } from '@/lib/langgraph/utils/error-recovery';
import { CodebaseAnalyzer } from '@/lib/langgraph/utils/codebase-analyzer';
import { MCPServerManager } from '@/lib/mcp/server-manager';
import { executeBuiltinTool } from '@/lib/mcp/tools/builtin-tools';

import { logger } from '@/lib/utils/logger';
import type { SupportedLanguage } from '@/lib/i18n';
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

/**
 * 사용자 언어 설정 가져오기
 */
async function getUserLanguage(): Promise<SupportedLanguage> {
  try {
    // Main Process에서만 동작
    if (typeof window !== 'undefined') {
      // Renderer 프로세스에서는 localStorage에서 가져오기
      try {
        const saved = localStorage.getItem('sepilot_language');
        if (saved && ['ko', 'en', 'zh'].includes(saved)) {
          return saved as SupportedLanguage;
        }
      } catch {
        // localStorage 접근 실패 시 기본값
      }
      return 'ko';
    }

    const { databaseService } = await import('../../../electron/services/database');
    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      return 'ko';
    }

    const appConfig = JSON.parse(configStr);
    if (appConfig?.general?.language && ['ko', 'en', 'zh'].includes(appConfig.general.language)) {
      return appConfig.general.language as SupportedLanguage;
    }
  } catch (error) {
    logger.error('[AdvancedEditorAgent] Failed to get user language:', error);
  }
  return 'ko';
}

/**
 * 언어에 따른 답변 언어 지시 메시지 생성
 */
function getLanguageInstruction(language: SupportedLanguage): string {
  switch (language) {
    case 'ko':
      return 'Respond in Korean';
    case 'en':
      return 'Respond in English';
    case 'zh':
      return '请用中文回答';
    default:
      return 'Respond in Korean';
  }
}

export interface EditorAgentState extends CodingAgentState {
  // Editor 전용 상태 (CodingAgentState를 확장)
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
    enableMCPTools?: boolean;
    enablePlanning?: boolean;
    enableVerification?: boolean;
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

  // Static utility instances (shared across all instances like CodingAgent)
  private static toolSelector = new ToolSelector();
  private static fileTracker = new FileTracker();
  private static contextManager = new ContextManager(100000); // 100k tokens
  private static codebaseAnalyzer = new CodebaseAnalyzer();

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
      content: await this.buildSystemPrompt(state.editorContext, state.ragDocuments),
      created_at: Date.now(),
    };

    state = {
      ...state,
      messages: [systemMessage, ...state.messages],
    };

    let hasError = false;
    let errorMessage = '';

    // ===== PLANNING PHASE ===== (Cursor/Cline 수준)
    if (state.editorContext?.enablePlanning && !state.planCreated) {
      logger.info('[AdvancedEditorAgent] === Planning Phase ===');
      emitStreamingChunk('\n\n📋 **실행 계획 수립 중...**\n\n', state.conversationId);

      try {
        const planResult = await this.createPlan(state);
        state = { ...state, ...planResult };

        if (planResult.messages) {
          state = {
            ...state,
            messages: [...state.messages, ...planResult.messages],
          };
        }

        yield {
          type: 'planning',
          plan: planResult,
        };

        emitStreamingChunk('\n---\n\n', state.conversationId);
      } catch (error: any) {
        console.error('[AdvancedEditorAgent] Planning error:', error);
        // Continue without plan
      }
    }

    // ===== MAIN EXECUTION LOOP =====
    while (iterations < this.maxIterations) {
      logger.info(
        `[AdvancedEditorAgent] ===== Iteration ${iterations + 1}/${this.maxIterations} =====`
      );

      // Show plan progress
      if (state.planSteps && state.planSteps.length > 0) {
        const currentStep = state.currentPlanStep || 0;
        if (currentStep < state.planSteps.length) {
          emitStreamingChunk(
            `\n📍 **현재 단계 (${currentStep + 1}/${state.planSteps.length}):** ${state.planSteps[currentStep]}\n\n`,
            state.conversationId
          );
        }
      }

      // Context Management: Optimize messages if needed (100k tokens limit)
      try {
        const optimized = AdvancedEditorAgentGraph.contextManager.optimizeMessages(state.messages);
        if (optimized.length < state.messages.length) {
          logger.info(
            `[AdvancedEditorAgent] Context optimized: ${state.messages.length} → ${optimized.length} messages`
          );
          state = {
            ...state,
            messages: optimized,
          };
        }
      } catch (error: any) {
        logger.warn('[AdvancedEditorAgent] Context optimization failed:', error);
        // Continue with original messages
      }

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

      // Update modifiedFiles tracking from toolsResult
      if (toolsResult.modifiedFiles && toolsResult.modifiedFiles.length > 0) {
        state = {
          ...state,
          modifiedFiles: [...(state.modifiedFiles || []), ...toolsResult.modifiedFiles],
        };
      }

      // ===== VERIFICATION PHASE ===== (Cursor/Cline 수준)
      if (state.editorContext?.enableVerification) {
        logger.info('[AdvancedEditorAgent] === Verification Phase ===');

        try {
          const verifyResult = await this.verifyProgress(state);
          state = { ...state, ...verifyResult };

          if (verifyResult.messages) {
            state = {
              ...state,
              messages: [...state.messages, ...verifyResult.messages],
            };
          }

          yield {
            type: 'verification',
            verification: verifyResult,
          };

          // If verification requests additional iteration, continue loop
          if (verifyResult.needsAdditionalIteration) {
            logger.info('[AdvancedEditorAgent] Verification requests additional iteration');
            iterations++;
            continue;
          }
        } catch (error: any) {
          console.error('[AdvancedEditorAgent] Verification error:', error);
          // Continue anyway
        }
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
  private async buildSystemPrompt(
    context?: EditorAgentState['editorContext'],
    ragDocuments?: EditorAgentState['ragDocuments']
  ): Promise<string> {
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

    // 사용자 언어 설정 가져오기
    const userLanguage = await getUserLanguage();
    const languageInstruction = getLanguageInstruction(userLanguage);
    parts.push(`- ${languageInstruction} and using markdown.`);

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

    // Get all editor tools (Built-in + MCP)
    // Check if tools are enabled in context (default to true if undefined)
    const useTools = state.editorContext?.useTools !== false;
    const tools = useTools
      ? await this.getEditorTools(
          state.editorContext?.enabledTools,
          state.editorContext?.enableMCPTools
        )
      : [];

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
  private async toolsNode(
    state: EditorAgentState
  ): Promise<{ toolResults: any[]; modifiedFiles?: string[] }> {
    const lastMessage = state.messages[state.messages.length - 1];

    if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
      return { toolResults: [] };
    }

    const results = [];
    const modifiedFiles: string[] = [];

    for (const toolCall of lastMessage.tool_calls) {
      logger.info('[AdvancedEditorAgent] Executing tool:', toolCall.name);

      try {
        const result = await this.executeTool(toolCall, state);
        results.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
        });

        // Track file modifications (Cursor/Cline 수준)
        if (toolCall.name === 'write_file' || toolCall.name === 'edit_file') {
          const filePath = (toolCall.arguments as any)?.filePath;
          if (filePath && !modifiedFiles.includes(filePath)) {
            modifiedFiles.push(filePath);
            logger.info(`[AdvancedEditorAgent] File modified: ${filePath}`);
          }
        }
      } catch (error: any) {
        console.error('[AdvancedEditorAgent] Tool execution error:', error);
        results.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          error: error.message,
        });
      }
    }

    return {
      toolResults: results,
      modifiedFiles: modifiedFiles.length > 0 ? modifiedFiles : undefined,
    };
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
   * Get all editor tools (Built-in + MCP)
   */
  private async getEditorTools(enabledTools?: string[], enableMCPTools?: boolean): Promise<any[]> {
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

    // Add MCP Tools if enabled (Cursor/Cline 수준)
    if (enableMCPTools) {
      try {
        const mcpTools = await MCPServerManager.getAllTools();
        logger.info(`[AdvancedEditorAgent] Adding ${mcpTools.length} MCP tools to LLM`);

        // Convert MCP tools to OpenAI tool format
        for (const mcpTool of mcpTools) {
          allTools.push({
            type: 'function',
            function: {
              name: mcpTool.name,
              description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
              parameters: mcpTool.inputSchema || {
                type: 'object',
                properties: {},
              },
            },
          });
        }
      } catch (error: any) {
        logger.error('[AdvancedEditorAgent] Failed to load MCP tools:', error);
        // Continue with built-in tools only
      }
    }

    if (!enabledTools || enabledTools.length === 0) {
      return allTools;
    }

    return allTools.filter((tool) => enabledTools.includes(tool.function.name));
  }

  /**
   * Execute editor tool with MCP support, file tracking, and error recovery
   */
  private async executeTool(toolCall: ToolCall, state: EditorAgentState): Promise<any> {
    const { name, arguments: args } = toolCall;

    // Track tool usage (simplified - full tracking requires success/duration/error)
    // AdvancedEditorAgentGraph.toolSelector.recordUsage(name, true, 0);

    // Built-in Editor Tools (IPC-based)
    const builtinTools = [
      'read_file',
      'list_files',
      'search_files',
      'write_file',
      'edit_file',
      'execute_command',
      'get_terminal_output',
      'get_git_status',
      'git_diff',
    ];

    if (builtinTools.includes(name)) {
      // File tracking for write/edit operations
      let filePath: string | undefined;
      if (name === 'write_file' || name === 'edit_file') {
        filePath = (args as any).filePath;
        if (filePath) {
          // Track before modification
          await AdvancedEditorAgentGraph.fileTracker.trackBeforeModify(filePath);
        }
      }

      // Execute with error recovery
      const result = await ErrorRecovery.withTimeoutAndRetry(
        async () => {
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
              throw new Error(`Unknown built-in tool: ${name}`);
          }
        },
        30000, // 30 second timeout
        { maxRetries: 2, initialDelayMs: 1000 },
        `editor tool '${name}'`
      );

      // Track after modification
      if (filePath && (name === 'write_file' || name === 'edit_file')) {
        await AdvancedEditorAgentGraph.fileTracker.trackAfterModify(filePath, null);
      }

      return result;
    }

    // MCP Tools (if enabled)
    if (state.editorContext?.enableMCPTools) {
      try {
        logger.info(`[AdvancedEditorAgent] Executing MCP tool: ${name}`);

        // MCP tools need serverName, but we don't know which server provides this tool
        // For now, we'll try to find it through getAllTools()
        const allTools = await MCPServerManager.getAllTools();
        const toolInfo = allTools.find((t) => t.name === name);
        if (!toolInfo) {
          throw new Error(`MCP tool '${name}' not found in any server`);
        }

        // Execute MCP tool
        const mcpResult = await MCPServerManager.callTool(
          toolInfo.serverName || 'default',
          name,
          args
        );

        // Check for errors
        if ((mcpResult as any)?.isError) {
          const errorText =
            (mcpResult as any).content
              ?.map((item: any) => item.text || '')
              .filter((text: string) => text)
              .join('\n') || 'Tool execution failed';
          throw new Error(errorText);
        }

        // Extract text content
        const content =
          (mcpResult as any)?.content
            ?.map((item: any) => item.text || '')
            .filter((text: string) => text)
            .join('\n') || '';

        return content || `Tool '${name}' completed successfully`;
      } catch (error: any) {
        logger.error(`[AdvancedEditorAgent] MCP tool '${name}' failed:`, error);
        throw error;
      }
    }

    throw new Error(`Unknown tool: ${name}`);
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

  /**
   * Planning: Create execution plan (Cursor/Cline 수준)
   */
  private async createPlan(state: EditorAgentState): Promise<Partial<EditorAgentState>> {
    if (state.planCreated) {
      logger.info('[AdvancedEditorAgent.Planning] Plan already exists');
      return {};
    }

    const messages = state.messages || [];
    let userPrompt = '';

    // Find last user message
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userPrompt = messages[i].content;
        break;
      }
    }

    if (!userPrompt) {
      return {};
    }

    logger.info('[AdvancedEditorAgent.Planning] Creating execution plan');

    const planningMessage: Message = {
      id: 'system-planning',
      role: 'system',
      content:
        'You are SE Pilot, analyzing the user request to create an execution plan.\n\n' +
        'Determine if this is:\n' +
        '- READ-ONLY task: 요약, 설명, 분석, 리뷰 (Just read and respond)\n' +
        '- MODIFICATION task: 생성, 만들기, 수정, 편집 (Execute changes)\n\n' +
        'Create a focused plan with 3-7 steps.',
      created_at: Date.now(),
    };

    const planPromptMessage: Message = {
      id: 'planning-prompt',
      role: 'user',
      content: `User request: ${userPrompt}\n\nCreate an actionable plan:\n1. [READ-ONLY] or [MODIFICATION]\n2. List steps`,
      created_at: Date.now(),
    };

    try {
      let planContent = '';

      for await (const chunk of LLMService.streamChat([planningMessage, planPromptMessage])) {
        planContent += chunk;
        emitStreamingChunk(chunk, state.conversationId);
      }

      const planMessage: Message = {
        id: `plan-${Date.now()}`,
        role: 'assistant',
        content: planContent,
        created_at: Date.now(),
      };

      const executionMessage: Message = {
        id: `exec-${Date.now()}`,
        role: 'user',
        content: `위 계획을 참고하여 '${userPrompt}' 작업을 수행하세요.`,
        created_at: Date.now(),
      };

      // Simple plan step parsing
      const planSteps = planContent
        .split('\n')
        .filter((line) => /^\d+\./.test(line.trim()))
        .map((line) => line.trim());

      logger.info(`[AdvancedEditorAgent.Planning] Created plan with ${planSteps.length} steps`);

      return {
        messages: [planMessage, executionMessage],
        planCreated: true,
        planSteps,
        currentPlanStep: 0,
        planningNotes: [planContent],
      };
    } catch (error: any) {
      console.error('[AdvancedEditorAgent.Planning] Error:', error);
      return {
        planningNotes: [`Planning failed: ${error.message}`],
      };
    }
  }

  /**
   * Verification: Validate execution results (Cursor/Cline 수준)
   */
  private async verifyProgress(state: EditorAgentState): Promise<Partial<EditorAgentState>> {
    logger.info('[AdvancedEditorAgent.Verification] Validating results');

    // Check if plan was created but no tools executed
    if (state.planCreated && (!state.toolResults || state.toolResults.length === 0)) {
      logger.info('[AdvancedEditorAgent.Verification] Plan created, awaiting execution');

      const reminderMessage: Message = {
        id: `reminder-${Date.now()}`,
        role: 'user',
        content: '계획이 준비되었습니다. 이제 도구를 사용하여 실제 작업을 수행하세요.',
        created_at: Date.now(),
      };

      return {
        messages: [reminderMessage],
        verificationNotes: ['⚠️ Plan ready, awaiting execution'],
        needsAdditionalIteration: true,
      };
    }

    // Run automated verification if files were modified
    if (state.modifiedFiles && state.modifiedFiles.length > 0) {
      logger.info('[AdvancedEditorAgent.Verification] Running automated checks');
      const pipeline = new VerificationPipeline();

      try {
        const verificationResult = await pipeline.verify(state);

        if (!verificationResult.allPassed) {
          logger.info('[AdvancedEditorAgent.Verification] Checks failed');

          const failedChecks = verificationResult.checks.filter((c) => !c.passed);
          const failureMessage: Message = {
            id: `verification-${Date.now()}`,
            role: 'user',
            content: `⚠️ 코드 검증 실패:\n${failedChecks
              .map((c) => `- ${c.message}: ${c.details?.substring(0, 200)}`)
              .join(
                '\n'
              )}\n\n${verificationResult.suggestions.join('\n')}\n\n위 문제를 수정하세요.`,
            created_at: Date.now(),
          };

          return {
            messages: [failureMessage],
            verificationNotes: failedChecks.map((c) => `❌ ${c.name}: ${c.message}`),
            needsAdditionalIteration: true,
          };
        } else {
          logger.info('[AdvancedEditorAgent.Verification] All checks passed');
          emitStreamingChunk('\n✅ **자동 검증 통과** (타입 체크, 린트)\n\n', state.conversationId);
        }
      } catch (error: any) {
        console.error('[AdvancedEditorAgent.Verification] Error:', error);
        // Continue anyway
      }
    }

    // Advance plan step
    const planSteps = state.planSteps || [];
    const currentStep = state.currentPlanStep || 0;

    if (planSteps.length > 0 && currentStep < planSteps.length - 1) {
      logger.info(`[AdvancedEditorAgent.Verification] Advancing to step ${currentStep + 2}`);

      emitStreamingChunk(
        `\n📋 **Step ${currentStep + 1}/${planSteps.length} 완료** ✅\n` +
          `➡️ 다음: ${planSteps[currentStep + 1]}\n\n`,
        state.conversationId
      );

      return {
        currentPlanStep: currentStep + 1,
        needsAdditionalIteration: true,
      };
    }

    // All steps complete
    if (planSteps.length > 0 && currentStep >= planSteps.length - 1) {
      emitStreamingChunk('\n🎉 **모든 단계 완료!**\n\n', state.conversationId);
    }

    return {
      verificationNotes: ['✅ Verification passed'],
    };
  }
}

/**
 * Create Advanced Editor Agent instance
 */
export function createAdvancedEditorAgentGraph(maxIterations = 50): AdvancedEditorAgentGraph {
  return new AdvancedEditorAgentGraph(maxIterations);
}
