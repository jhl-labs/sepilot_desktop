import { AgentState } from '@/lib/langgraph/state';
import type { Message, ToolCall } from '@/types';
import type { ToolApprovalCallback } from '@/lib/langgraph/types';
import { getLLMClient } from '@/lib/llm/client';
import { emitStreamingChunk, isAborted } from '@/lib/llm/streaming-callback';
import { editorToolsRegistry, registerAllEditorTools } from '../tools/index';

import { logger } from '@/lib/utils/logger';
import type { SupportedLanguage } from '@/lib/i18n';
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

// Import language utils from langgraph (제거된 중복 코드)
import { getUserLanguage } from '@/lib/langgraph/utils/language-utils';

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

export interface EditorAgentState extends AgentState {
  // Working directory for file operations
  workingDirectory?: string;
  // Editor 전용 상태
  editorContext?: {
    filePath?: string;
    language?: string;
    cursorPosition?: number;
    selectedText?: string;
    action?: 'autocomplete' | 'code-action' | 'writing-tool';
    actionType?: string; // 'fix', 'improve', 'continue', etc.
    useRag?: boolean; // RAG 문서 사용 여부
    useTools?: boolean; // MCP Tools 사용 여부
    enabledTools?: string[]; // 활성화된 도구 목록
    activeFileSelection?: {
      text: string;
      range: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
      } | null;
    } | null;
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
  private toolCallHistory: Map<string, number>; // 도구 호출 횟수 추적
  private lastToolCall: { name: string; args: string } | null; // 마지막 도구 호출

  constructor(maxIterations = 50) {
    this.maxIterations = maxIterations;
    this.toolCallHistory = new Map();
    this.lastToolCall = null;

    // Register all editor tools
    registerAllEditorTools();
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

    logger.info('[EditorAgent] Starting with action:', state.editorContext?.action);
    logger.info('[EditorAgent] Action type:', state.editorContext?.actionType);
    logger.info('[EditorAgent] Use RAG:', state.editorContext?.useRag);
    logger.info('[EditorAgent] Use Tools:', state.editorContext?.useTools);

    // RAG: useRag가 활성화된 경우에만 문서 검색 수행
    if (
      state.editorContext?.useRag &&
      (state.editorContext?.action === 'autocomplete' ||
        state.editorContext?.action === 'code-action')
    ) {
      logger.info('[EditorAgent] RAG enabled - retrieving relevant documents');
      try {
        const ragDocuments = await this.retrieveDocuments(state);
        state = {
          ...state,
          ragDocuments,
        };
        logger.info(`[EditorAgent] Retrieved ${ragDocuments.length} RAG documents`);

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
    } else if (state.editorContext?.useRag === false) {
      logger.info('[EditorAgent] RAG disabled by user');
    } else {
      logger.info('[EditorAgent] RAG not applicable for this action');
    }

    let hasError = false;
    let errorMessage = '';

    while (iterations < this.maxIterations) {
      logger.info(`[EditorAgent] ===== Iteration ${iterations + 1}/${this.maxIterations} =====`);

      // Check if streaming was aborted
      if (isAborted(state.conversationId)) {
        logger.info('[EditorAgent] Streaming aborted by user');
        const abortMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: '⏹️ 작업이 사용자에 의해 중단되었습니다.',
          created_at: Date.now(),
        };
        yield {
          type: 'message',
          message: abortMessage,
        };
        break;
      }

      // 1. Generate response with tools
      let generateResult;
      try {
        logger.info('[EditorAgent] Calling generate node...');
        generateResult = await this.generateNode(state);
        logger.info('[EditorAgent] Generate completed');
      } catch (error: any) {
        console.error('[EditorAgent] Generate error:', error);
        hasError = true;
        errorMessage = error.message || 'Failed to generate response';
        break;
      }

      if (generateResult.messages && generateResult.messages.length > 0) {
        const newMessage = generateResult.messages[0];

        logger.info('[EditorAgent] Generated message:', {
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
      logger.info('[EditorAgent] Decision:', decision);

      if (decision === 'end') {
        logger.info('[EditorAgent] No more tools to call, ending');
        break;
      }

      // 3. Tool approval (if callback provided)
      const lastMessage = state.messages[state.messages.length - 1];
      if (toolApprovalCallback && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
        logger.info('[EditorAgent] Requesting tool approval');

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
            logger.info('[EditorAgent] Tools rejected by user');
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

          logger.info('[EditorAgent] Tools approved');
        } catch (approvalError: any) {
          console.error('[EditorAgent] Approval error:', approvalError);
          hasError = true;
          errorMessage = approvalError.message || 'Tool approval failed';
          break;
        }
      }

      // 4. Execute tools
      logger.info('[EditorAgent] Executing tools');

      // Check abort before tool execution
      if (isAborted(state.conversationId)) {
        logger.info('[EditorAgent] Streaming aborted before tool execution');
        break;
      }

      // 무한 루프 감지: 같은 도구가 연속으로 호출되는지 확인
      const currentToolCalls = state.messages[state.messages.length - 1].tool_calls;
      if (currentToolCalls && currentToolCalls.length > 0) {
        const currentCall = currentToolCalls[0];
        const currentKey = `${currentCall.name}:${JSON.stringify(currentCall.arguments)}`;

        if (
          this.lastToolCall &&
          this.lastToolCall.name === currentCall.name &&
          this.lastToolCall.args === JSON.stringify(currentCall.arguments)
        ) {
          const count = (this.toolCallHistory.get(currentKey) || 0) + 1;
          this.toolCallHistory.set(currentKey, count);

          if (count >= 3) {
            logger.warn('[EditorAgent] Infinite loop detected - same tool called 3 times');
            const loopMessage: Message = {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: `⚠️ 무한 루프가 감지되었습니다. 도구 "${currentCall.name}"이(가) 같은 인자로 3번 연속 호출되었습니다.\n\n작업을 중단합니다. 다른 방법을 시도해주세요.`,
              created_at: Date.now(),
            };
            yield {
              type: 'message',
              message: loopMessage,
            };
            break;
          }
        } else {
          // 다른 도구가 호출되면 이력 초기화
          this.toolCallHistory.clear();
        }

        this.lastToolCall = {
          name: currentCall.name,
          args: JSON.stringify(currentCall.arguments),
        };
      }

      // Log tool execution start (Detailed)
      const toolCalls = state.messages[state.messages.length - 1].tool_calls;
      if (toolCalls && toolCalls.length > 0) {
        let logMessage = `\n\n---\n🔄 **Iteration ${iterations + 1}/${this.maxIterations}**\n`;

        for (const toolCall of toolCalls) {
          logMessage += `\n🛠️ **Call:** \`${toolCall.name}\`\n`;
          try {
            const args =
              typeof toolCall.arguments === 'string'
                ? toolCall.arguments
                : JSON.stringify(toolCall.arguments, null, 2);
            logMessage += `📂 **Args:**\n\`\`\`json\n${args}\n\`\`\`\n`;
          } catch {
            logMessage += `📂 **Args:** (parsing failed)\n`;
          }
        }
        emitStreamingChunk(logMessage, state.conversationId);
      }

      const toolsResult = await this.toolsNode(state);

      // Log tool execution end (Detailed)
      if (toolsResult.toolResults && toolsResult.toolResults.length > 0) {
        let logMessage = `\n<small>\n`;

        for (const result of toolsResult.toolResults) {
          const status = result.error ? '❌ Error' : '✅ Result';
          logMessage += `${status}: \`${result.toolName}\`\n\n`;

          let output = result.error || result.result || '(no output)';
          if (typeof output !== 'string') {
            output = JSON.stringify(output, null, 2);
          }

          // Shorten output for better UX (300 chars instead of 1000)
          if (output.length > 300) {
            output = `${output.substring(0, 300)}\n... (output truncated for readability)`;
          }

          // Use inline code instead of code block for shorter output
          if (output.length < 100 && !output.includes('\n')) {
            logMessage += `📄 Output: \`${output}\`\n\n`;
          } else {
            logMessage += `📄 Output:\n\`\`\`\n${output}\n\`\`\`\n\n`;
          }
        }
        logMessage += `</small>`;
        emitStreamingChunk(`${logMessage}---\n\n`, state.conversationId);
      }

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

      logger.info('[EditorAgent] Tool results:', toolsResult.toolResults);

      yield {
        type: 'tool_results',
        toolResults: toolsResult.toolResults,
      };

      iterations++;
    }

    logger.info('[EditorAgent] Stream completed, iterations:', iterations);

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

    logger.info(
      '[EditorAgent] Calling LLM with tools:',
      tools.map((t) => t.function.name)
    );

    // 사용자 언어 설정 가져오기
    const userLanguage = await getUserLanguage('EditorAgent');
    const languageInstruction = getLanguageInstruction(userLanguage);

    // 시스템 메시지 구성
    let messages = [...state.messages];
    const systemMessages: Message[] = [];

    // 1. 기본 Editor Agent 역할 시스템 메시지 (항상 추가)
    const baseSystemMessage: Message = {
      id: 'editor-agent-system',
      role: 'system',
      content: `You are an Editor Agent with powerful LOCAL file management and code assistance tools.

**Context:**
- Working Directory: ${state.workingDirectory || 'not specified'}
- Current File: ${state.editorContext?.filePath || 'none'}
- Language: ${state.editorContext?.language || 'unknown'}
- Action Type: ${state.editorContext?.action || 'general'}
- Selected Text: ${
        state.editorContext?.activeFileSelection?.text
          ? `\n\`\`\`\n${state.editorContext.activeFileSelection.text}\n\`\`\`\n(Line ${state.editorContext.activeFileSelection.range?.startLineNumber} - ${state.editorContext.activeFileSelection.range?.endLineNumber})`
          : 'None'
      }

**CRITICAL INSTRUCTION FOR SELECTION:**
If "Selected Text" is present above, the user likely wants to modify ONLY that specific part.
- Use 'replace_selection' tool to replace the currently selected text directly.
- Do NOT use write_file or edit_file unless you intend to modify parts outside the selection or the whole file.
- Prioritize handling the selection over global file changes.

**CRITICAL: Available Tools (LOCAL ONLY)**
You ONLY have access to LOCAL file system tools. You CANNOT access external APIs or remote repositories.

**Available Tools:**
- read_file: Read local file contents
- write_file: Create or overwrite local files with full content
- edit_file: Replace specific line ranges in existing local files
- list_files: Browse local directory structure
- search_files: Search for files in local directory
- delete_file: Delete local files
- run_command: Execute terminal commands in working directory
- git_status, git_diff, git_log, git_branch: Local git operations

**IMPORTANT:**
- DO NOT try to use external tools like create_or_update_file, get_file_contents, or any GitHub API tools
- ALL file operations must be on LOCAL file system only
- If you need to work with remote repositories, use git commands or ask the user

**Instructions:**
- Use LOCAL tools proactively to complete user requests
- For file creation: use write_file with complete content immediately
- For file editing: read_file first, then write_file with updated content
- Always confirm actions with clear, concise feedback
- Execute multi-step tasks systematically

${languageInstruction} and use LOCAL tools efficiently.`,
      created_at: Date.now(),
    };
    systemMessages.push(baseSystemMessage);

    // 2. RAG 문서가 있으면 RAG 컨텍스트 시스템 메시지 추가
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

      systemMessages.push(ragSystemMessage);

      logger.info(
        `[EditorAgent] Added RAG context with ${state.ragDocuments.length} documents to system message`
      );
    }

    // 시스템 메시지들을 맨 앞에 삽입
    messages = [...systemMessages, ...messages];

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
      logger.info('[EditorAgent] Executing tool:', toolCall.name);

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
   *
   * Note: EditorAgent only uses builtin tools (local file system tools).
   * MCP tools are NOT available in EditorAgent to keep it focused on local development.
   */
  private getEditorTools(context?: EditorAgentState['editorContext']): any[] {
    const tools: any[] = [];
    const enabledTools = context?.enabledTools;

    const isToolEnabled = (toolName: string) => {
      // If enabledTools is not provided or empty, all tools are enabled by default
      if (!enabledTools || enabledTools.length === 0) {
        return true;
      }
      return enabledTools.includes(toolName);
    };

    const filterTools = (toolNames: string[]) => {
      return toolNames.filter(isToolEnabled);
    };

    // Always include file management tools from registry
    const fileTools = editorToolsRegistry.toOpenAIFormat(
      filterTools([
        'read_file',
        'write_file',
        'edit_file',
        'list_files',
        'search_files',
        'delete_file',
      ])
    );
    tools.push(...fileTools);

    // Always include tab management tools from registry
    const tabTools = editorToolsRegistry.toOpenAIFormat(
      filterTools(['list_open_tabs', 'open_tab', 'close_tab', 'switch_tab', 'get_active_file'])
    );
    tools.push(...tabTools);

    // Always include terminal tools from registry
    const terminalTools = editorToolsRegistry.toOpenAIFormat(filterTools(['run_command']));
    tools.push(...terminalTools);

    // Always include git tools from registry
    const gitTools = editorToolsRegistry.toOpenAIFormat(
      filterTools(['git_status', 'git_diff', 'git_log', 'git_branch'])
    );
    tools.push(...gitTools);

    // Always include code analysis tools from registry
    const codeTools = editorToolsRegistry.toOpenAIFormat(
      filterTools([
        'get_file_context',
        'search_similar_code',
        'get_documentation',
        'find_definition',
      ])
    );
    tools.push(...codeTools);

    // Always include editor action tools from registry
    const editorActionTools = editorToolsRegistry.toOpenAIFormat(
      filterTools(['replace_selection'])
    );
    tools.push(...editorActionTools);

    return tools;
  }

  /**
   * Execute editor tool
   *
   * Note: EditorAgent only executes builtin tools from the registry.
   * MCP tools are NOT supported in EditorAgent.
   */
  private async executeTool(toolCall: ToolCall, state: EditorAgentState): Promise<any> {
    const { name, arguments: args } = toolCall;
    // args is already an object (Record<string, unknown>)
    const parsedArgs = args;

    logger.info('[EditorAgent] Executing tool:', name, 'with args:', parsedArgs);

    // Check Tool Registry (builtin tools only)
    const registryTool = editorToolsRegistry.get(name);
    if (registryTool) {
      return editorToolsRegistry.execute(name, parsedArgs, state);
    }

    // Unknown tool - EditorAgent does not support MCP tools
    throw new Error(`Unknown tool: ${name}. EditorAgent only supports builtin tools.`);
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

      logger.info('[EditorAgent] RAG query:', query);

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

      logger.info(`[EditorAgent] RAG retrieved ${results.length} documents`);

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
