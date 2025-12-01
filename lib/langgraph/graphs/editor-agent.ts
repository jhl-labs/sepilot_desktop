import { AgentState } from '../state';
import type { Message, ToolCall } from '@/types';
import type { ToolApprovalCallback } from '../types';
import { getLLMClient } from '@/lib/llm/client';

/**
 * Editor Agent Graph
 *
 * Editor 전용 Agent로 다음 기능 제공:
 * - Autocomplete: 코드/텍스트 자동완성 (RAG 항상 사용)
 * - Code Actions: Fix, Improve, Explain, Complete (RAG 항상 사용)
 * - Writing Tools: Continue, Make shorter/longer, Simplify, Fix grammar, Change tone
 *
 * Built-in Tools:
 * - get_file_context: 현재 파일의 imports, types, 주변 코드 분석
 * - search_similar_code: 프로젝트에서 유사한 코드 패턴 검색
 * - get_documentation: 함수/라이브러리 문서 검색
 *
 * RAG Integration:
 * - Autocomplete와 Code Action 시 벡터 DB에서 관련 문서 자동 검색
 * - 검색된 문서를 컨텍스트로 포함하여 더 정확한 코드 제안 제공
 */

export interface EditorAgentState extends AgentState {
  // Editor 전용 상태
  editorContext?: {
    filePath?: string;
    language?: string;
    cursorPosition?: number;
    selectedText?: string;
    action?: 'autocomplete' | 'code-action' | 'writing-tool';
    actionType?: string; // 'fix', 'improve', 'continue', etc.
  };
  // RAG 관련 상태
  ragDocuments?: Array<{
    id: string;
    content: string;
    metadata: Record<string, any>;
    score?: number;
  }>;
}

export class EditorAgentGraph {
  private maxIterations: number;

  constructor(maxIterations = 10) {
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

    console.log('[EditorAgent] Starting with action:', state.editorContext?.action);
    console.log('[EditorAgent] Action type:', state.editorContext?.actionType);

    // RAG: Autocomplete와 Code Action에서 항상 문서 검색 수행
    if (
      state.editorContext?.action === 'autocomplete' ||
      state.editorContext?.action === 'code-action'
    ) {
      console.log('[EditorAgent] RAG enabled - retrieving relevant documents');
      try {
        const ragDocuments = await this.retrieveDocuments(state);
        state = {
          ...state,
          ragDocuments,
        };
        console.log(`[EditorAgent] Retrieved ${ragDocuments.length} RAG documents`);

        // RAG 문서 검색 결과를 yield
        yield {
          type: 'rag_documents',
          documents: ragDocuments,
        };
      } catch (error: any) {
        console.error('[EditorAgent] RAG retrieval error:', error);
        // RAG 실패 시에도 계속 진행 (문서 없이)
        state = {
          ...state,
          ragDocuments: [],
        };
      }
    }

    let hasError = false;
    let errorMessage = '';

    while (iterations < this.maxIterations) {
      console.log(`[EditorAgent] ===== Iteration ${iterations + 1}/${this.maxIterations} =====`);

      // 1. Generate response with tools
      let generateResult;
      try {
        console.log('[EditorAgent] Calling generate node...');
        generateResult = await this.generateNode(state);
        console.log('[EditorAgent] Generate completed');
      } catch (error: any) {
        console.error('[EditorAgent] Generate error:', error);
        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break;
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];

        console.log('[EditorAgent] Generated message:', {
          content: newMessage.content?.substring(0, 100),
          hasToolCalls: !!newMessage.tool_calls,
          toolCallsCount: newMessage.tool_calls?.length,
        });

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
      console.log('[EditorAgent] Decision:', decision);

      if (decision === 'end') {
        console.log('[EditorAgent] No more tools to call, ending');
        break;
      }

      // 3. Tool approval (if callback provided)
      const lastMessage = state.messages[state.messages.length - 1];
      if (toolApprovalCallback && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        console.log('[EditorAgent] Requesting tool approval');

        yield {
          type: 'tool_approval_request',
          messageId: lastMessage.id,
          toolCalls: lastMessage.tool_calls,
        };

        try {
          const approved = await toolApprovalCallback(lastMessage.tool_calls);

          yield {
            type: 'tool_approval_result',
            approved,
          };

          if (!approved) {
            console.log('[EditorAgent] Tools rejected by user');
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

          console.log('[EditorAgent] Tools approved');
        } catch (approvalError: any) {
          console.error('[EditorAgent] Approval error:', approvalError);
          hasError = true;
          errorMessage = approvalError.message || 'Tool approval failed';
          break;
        }
      }

      // 4. Execute tools
      console.log('[EditorAgent] Executing tools');
      const toolsResult = await this.toolsNode(state);

      // Remove tool_calls to prevent re-execution
      const updatedMessages = [...state.messages];
      const lastMessageIndex = updatedMessages.length - 1;
      if (lastMessageIndex >= 0 && updatedMessages[lastMessageIndex].tool_calls) {
        updatedMessages[lastMessageIndex] = {
          ...updatedMessages[lastMessageIndex],
          tool_calls: undefined,
        };
      }

      state = {
        ...state,
        messages: updatedMessages,
        toolResults: toolsResult.toolResults || [],
      };

      console.log('[EditorAgent] Tool results:', toolsResult.toolResults);

      yield {
        type: 'tool_results',
        toolResults: toolsResult.toolResults,
      };

      iterations++;
    }

    console.log('[EditorAgent] Stream completed, iterations:', iterations);

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
   * Generate node: LLM 호출 with tools
   */
  private async generateNode(state: EditorAgentState): Promise<{ messages: Message[] }> {
    const client = getLLMClient();

    if (!client.isConfigured()) {
      throw new Error('LLM client not configured');
    }

    const provider = client.getProvider();

    // Get available tools based on editor context
    const tools = this.getEditorTools(state.editorContext);

    console.log(
      '[EditorAgent] Calling LLM with tools:',
      tools.map((t) => t.function.name)
    );

    // RAG 문서가 있으면 시스템 메시지에 컨텍스트 추가
    let messages = [...state.messages];
    if (state.ragDocuments && state.ragDocuments.length > 0) {
      const ragContext = state.ragDocuments
        .map((doc, i) => `[문서 ${i + 1}] (관련도: ${(doc.score || 0).toFixed(2)})\n${doc.content}`)
        .join('\n\n');

      const ragSystemMessage: Message = {
        id: 'rag-system',
        role: 'system',
        content: `다음은 코드베이스에서 검색된 관련 문서입니다. 이 정보를 활용하여 더 정확하고 일관된 코드를 제안하세요.

${ragContext}

위 문서의 패턴과 스타일을 참고하여 응답하되, 사용자의 요청에 집중하세요.`,
        created_at: Date.now(),
      };

      // 시스템 메시지를 맨 앞에 삽입
      messages = [ragSystemMessage, ...messages];

      console.log(
        `[EditorAgent] Added RAG context with ${state.ragDocuments.length} documents to system message`
      );
    }

    const response = await provider.chat(messages, {
      tools: tools.length > 0 ? tools : undefined,
    });

    // Convert LLM provider's ToolCall format to Message's ToolCall format
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
      console.log('[EditorAgent] Executing tool:', toolCall.name);

      try {
        const result = await this.executeTool(toolCall, state);
        results.push({
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          result,
        });
      } catch (error: any) {
        console.error('[EditorAgent] Tool execution error:', error);
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
   * Get Editor-specific tools based on context
   */
  private getEditorTools(context?: EditorAgentState['editorContext']): any[] {
    const tools: any[] = [];

    // For autocomplete: add context-aware tools
    if (context?.action === 'autocomplete') {
      tools.push({
        type: 'function',
        function: {
          name: 'get_file_context',
          description:
            'Get context about the current file including imports, types, and surrounding code',
          parameters: {
            type: 'object',
            properties: {
              includeImports: {
                type: 'boolean',
                description: 'Include import statements',
              },
              includeTypes: {
                type: 'boolean',
                description: 'Include type definitions',
              },
              linesBefore: {
                type: 'number',
                description: 'Number of lines before cursor to include',
              },
              linesAfter: {
                type: 'number',
                description: 'Number of lines after cursor to include',
              },
            },
            required: [],
          },
        },
      });

      tools.push({
        type: 'function',
        function: {
          name: 'search_similar_code',
          description: 'Search for similar code patterns in the project',
          parameters: {
            type: 'object',
            properties: {
              pattern: {
                type: 'string',
                description: 'Code pattern to search for',
              },
              language: {
                type: 'string',
                description: 'Programming language',
              },
            },
            required: ['pattern'],
          },
        },
      });
    }

    // For code actions: add documentation tool
    if (context?.action === 'code-action') {
      tools.push({
        type: 'function',
        function: {
          name: 'get_documentation',
          description: 'Get documentation for a function or library',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Function name or library to search documentation for',
              },
            },
            required: ['query'],
          },
        },
      });
    }

    return tools;
  }

  /**
   * Execute editor tool
   */
  private async executeTool(toolCall: ToolCall, state: EditorAgentState): Promise<any> {
    const { name, arguments: args } = toolCall;
    // args is already an object (Record<string, unknown>)
    const parsedArgs = args;

    console.log('[EditorAgent] Executing tool:', name, 'with args:', parsedArgs);

    switch (name) {
      case 'get_file_context':
        return this.getFileContext(parsedArgs, state);

      case 'search_similar_code':
        return this.searchSimilarCode(parsedArgs, state);

      case 'get_documentation':
        return this.getDocumentation(parsedArgs, state);

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  /**
   * Tool: Get file context
   */
  private async getFileContext(args: any, _state: EditorAgentState): Promise<string> {
    const { includeImports = true, includeTypes = true, linesBefore = 10, linesAfter = 5 } = args;
    const context = _state.editorContext;

    if (!context) {
      return 'No editor context available';
    }

    // This is a placeholder - actual implementation would read from file system
    return `File context for ${context.filePath || 'current file'}:
Language: ${context.language || 'unknown'}
Cursor position: ${context.cursorPosition || 0}

Note: Full file context extraction not yet implemented.
This would include:
- Imports: ${includeImports ? 'Yes' : 'No'}
- Types: ${includeTypes ? 'Yes' : 'No'}
- Lines before: ${linesBefore}
- Lines after: ${linesAfter}`;
  }

  /**
   * Tool: Search similar code
   */
  private async searchSimilarCode(args: any, _state: EditorAgentState): Promise<string> {
    const { pattern, language } = args;

    // Placeholder - would use ripgrep or similar
    return `Search results for pattern: "${pattern}" in ${language || 'all'} files:

Note: Code search not yet implemented.
This would use ripgrep to find similar patterns across the project.`;
  }

  /**
   * Tool: Get documentation
   */
  private async getDocumentation(args: any, _state: EditorAgentState): Promise<string> {
    const { query } = args;

    // Placeholder - would fetch from online docs or local cache
    return `Documentation for: "${query}"

Note: Documentation search not yet implemented.
This would fetch documentation from:
- MDN (for web APIs)
- DevDocs (for frameworks)
- Local type definitions
- Online API references`;
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
        console.error('[EditorAgent] retrieveDocuments should only run in Main Process');
        return [];
      }

      // 검색 쿼리 생성: 마지막 사용자 메시지 + 에디터 컨텍스트
      const lastMessage = state.messages[state.messages.length - 1];
      let query = lastMessage?.content || '';

      // 에디터 컨텍스트를 쿼리에 추가
      if (state.editorContext) {
        const { language, actionType, selectedText } = state.editorContext;
        const contextParts = [];

        if (language) {
          contextParts.push(`Language: ${language}`);
        }
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

      console.log('[EditorAgent] RAG query:', query);

      // Dynamic import
      const { vectorDBService } = await import('../../../electron/services/vectordb');
      const { databaseService } = await import('../../../electron/services/database');
      const { initializeEmbedding, getEmbeddingProvider } =
        await import('@/lib/vectordb/embeddings/client');

      // Embedding config 로드
      const configStr = databaseService.getSetting('app_config');
      if (!configStr) {
        console.warn('[EditorAgent] App config not found, RAG disabled');
        return [];
      }

      const appConfig = JSON.parse(configStr);
      if (!appConfig.embedding) {
        console.warn('[EditorAgent] Embedding config not found, RAG disabled');
        return [];
      }

      // Embedding 초기화
      initializeEmbedding(appConfig.embedding);

      // 쿼리 임베딩
      const embedder = getEmbeddingProvider();
      const queryEmbedding = await embedder.embed(query);

      // 벡터 검색 (상위 3개)
      const results = await vectorDBService.searchByVector(queryEmbedding, 3);

      console.log(`[EditorAgent] RAG retrieved ${results.length} documents`);

      return results.map((result) => ({
        id: result.id,
        content: result.content,
        metadata: result.metadata,
        score: result.score,
      }));
    } catch (error: any) {
      console.error('[EditorAgent] RAG retrieval error:', error);
      return [];
    }
  }
}

/**
 * Create Editor Agent instance
 */
export function createEditorAgentGraph(maxIterations = 10): EditorAgentGraph {
  return new EditorAgentGraph(maxIterations);
}

// Export Advanced Editor Agent for Chat mode
export { AdvancedEditorAgentGraph, createAdvancedEditorAgentGraph } from './editor-agent-advanced';
