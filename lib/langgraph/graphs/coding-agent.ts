import { StateGraph, END } from '@langchain/langgraph';
import { CodingAgentStateAnnotation, CodingAgentState } from '../state';
import { shouldUseTool } from '../nodes/tools';
import { LLMService } from '@/lib/llm/service';
import { Message, Activity } from '@/types';
import { emitStreamingChunk, getCurrentGraphConfig } from '@/lib/llm/streaming-callback';
import { executeBuiltinTool, getBuiltinTools } from '@/lib/mcp/tools/builtin-tools';
import { MCPServerManager } from '@/lib/mcp/server-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Coding Agent Graph
 *
 * ReAct Agent with comprehensive planning, verification, and file tracking
 *
 * Pipeline:
 * triage → direct_response (simple) OR planner → iteration_guard → agent → approval → tools → verifier → reporter
 *
 * Features:
 * - Triage: Classify requests as simple (direct response) or complex (full pipeline)
 * - Planning: Generate execution plans with step-by-step breakdown
 * - Iteration Guard: Control iteration count and prevent infinite loops
 * - Agent: LLM with tool calling
 * - Approval: Human-in-the-loop for sensitive tools
 * - Tools: Execute tools with file change tracking
 * - Verification: Validate execution results
 * - Reporter: Generate final summary
 */

// ===========================
// Helper Functions
// ===========================

interface FileInfo {
  size: number;
  mtime: number;
}

interface FileChanges {
  added: string[];
  modified: string[];
  deleted: string[];
}

/**
 * Get workspace file snapshot for change tracking
 */
async function getWorkspaceFiles(workspacePath: string = '.'): Promise<Record<string, FileInfo>> {
  const filesInfo: Record<string, FileInfo> = {};

  try {
    const files = await getAllFiles(workspacePath);

    for (const file of files) {
      try {
        const stats = await fs.stat(file);
        const relativePath = path.relative(workspacePath, file);
        filesInfo[relativePath] = {
          size: stats.size,
          mtime: stats.mtimeMs,
        };
      } catch {
        // Skip files that can't be accessed
      }
    }
  } catch {
    // Return empty if workspace can't be read
  }

  return filesInfo;
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common directories to ignore
      if (entry.isDirectory()) {
        if (['.git', 'node_modules', '.next', 'dist', 'build'].includes(entry.name)) {
          continue;
        }
        const subFiles = await getAllFiles(fullPath);
        results.push(...subFiles);
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // Return empty array if can't read directory
  }

  return results;
}

/**
 * Detect file changes between two snapshots
 */
function detectFileChanges(
  before: Record<string, FileInfo>,
  after: Record<string, FileInfo>
): FileChanges {
  const changes: FileChanges = {
    added: [],
    modified: [],
    deleted: [],
  };

  // Added files
  for (const filePath in after) {
    if (!(filePath in before)) {
      changes.added.push(filePath);
    }
  }

  // Modified files
  for (const filePath in after) {
    if (filePath in before) {
      if (after[filePath].mtime > before[filePath].mtime) {
        changes.modified.push(filePath);
      }
    }
  }

  // Deleted files
  for (const filePath in before) {
    if (!(filePath in after)) {
      changes.deleted.push(filePath);
    }
  }

  return changes;
}

/**
 * Parse plan steps from plan text
 */
function parsePlanSteps(planText: string): string[] {
  const steps: string[] = [];
  const lines = planText.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    // Match lines starting with number followed by . or ) or :
    if (/^\d+[.):]/.test(trimmed)) {
      steps.push(trimmed);
    }
  }

  return steps;
}

/**
 * Extract required files from user prompt
 */
function extractRequiredFiles(prompt: string): string[] {
  if (!prompt) {
    return [];
  }

  const matches = new Set<string>();

  // Pattern 1: Files with path separators
  const pathPattern =
    /[@`"']?([A-Za-z0-9_-]+\/[A-Za-z0-9_/.-]+\.(?:py|md|txt|json|yaml|yml|ini|cfg|sh|js|ts|tsx|jsx|java|go|rs|c|cpp|h|hpp))[@`"']?/gi;
  const pathMatches = prompt.match(pathPattern);
  if (pathMatches) {
    for (const match of pathMatches) {
      const cleaned = match.replace(/[@`"'\s]/g, '');
      if (cleaned && cleaned.includes('/')) {
        matches.add(cleaned);
      }
    }
  }

  // Pattern 2: Files in quotes or backticks
  const quotedPattern =
    /[`"']([A-Za-z0-9_/.-]+\.(?:py|md|txt|json|yaml|yml|ini|cfg|sh|js|ts|tsx|jsx|java|go|rs|c|cpp|h|hpp))[`"']/gi;
  const quotedMatches = prompt.match(quotedPattern);
  if (quotedMatches) {
    for (const match of quotedMatches) {
      const cleaned = match.replace(/[`"']/g, '');
      if (cleaned) {
        matches.add(cleaned);
      }
    }
  }

  // Pattern 3: Special files
  if (
    prompt.includes('README') &&
    !Array.from(matches).some((m) => m.toLowerCase().includes('readme'))
  ) {
    matches.add('README.md');
  }

  return Array.from(matches).sort();
}

/**
 * Check if a changed path matches a requirement
 */
function pathMatchesRequirement(changedPath: string, requirement: string): boolean {
  if (!changedPath || !requirement) {
    return false;
  }

  const changedName = path.basename(changedPath).toLowerCase();
  const reqName = path.basename(requirement).toLowerCase();

  return (
    changedPath.endsWith(requirement) || changedName === reqName || changedName.includes(reqName)
  );
}

/**
 * RAG 검색 헬퍼 함수
 */
async function retrieveContextIfEnabled(query: string): Promise<string> {
  const config = getCurrentGraphConfig();
  if (!config?.enableRAG) {
    return '';
  }

  try {
    // Main Process 전용 로직
    if (typeof window !== 'undefined') {
      return '';
    }

    console.log('[CodingAgent] RAG enabled, retrieving documents...');
    const { vectorDBService } = await import('../../../electron/services/vectordb');
    const { databaseService } = await import('../../../electron/services/database');
    const { initializeEmbedding, getEmbeddingProvider } =
      await import('@/lib/vectordb/embeddings/client');

    const configStr = databaseService.getSetting('app_config');
    if (!configStr) {
      return '';
    }
    const appConfig = JSON.parse(configStr);
    if (!appConfig.embedding) {
      return '';
    }

    initializeEmbedding(appConfig.embedding);
    const embedder = getEmbeddingProvider();
    const queryEmbedding = await embedder.embed(query);
    const results = await vectorDBService.searchByVector(queryEmbedding, 5);

    if (results.length > 0) {
      console.log(`[CodingAgent] Found ${results.length} documents`);
      return results.map((doc, i) => `[참고 문서 ${i + 1}]\n${doc.content}`).join('\n\n');
    }
  } catch (error) {
    console.error('[CodingAgent] RAG retrieval failed:', error);
  }
  return '';
}

// ===========================
// Node Functions
// ===========================

/**
 * Triage Node: Decide whether to answer directly or run full pipeline
 */
async function triageNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  const messages = state.messages || [];
  let userPrompt = '';

  // Find last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userPrompt = messages[i].content;
      break;
    }
  }

  // Simple heuristic: if prompt is short and looks like a question, respond directly
  const isSimpleQuestion =
    userPrompt.length < 200 &&
    (userPrompt.includes('?') || userPrompt.includes('what') || userPrompt.includes('how'));

  const decision = isSimpleQuestion ? 'direct_response' : 'graph';
  const reason = isSimpleQuestion ? 'Simple question detected' : 'Complex task requiring tools';

  console.log(`[Triage] Decision: ${decision}, Reason: ${reason}`);

  return {
    triageDecision: decision,
    triageReason: reason,
  };
}

/**
 * Direct Response Node: Answer without tools
 */
async function directResponseNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  console.log('[DirectResponse] Generating direct response');

  const messages = state.messages || [];
  if (messages.length === 0) {
    return {};
  }

  const systemMessage: Message = {
    id: 'system-direct',
    role: 'system',
    content:
      '💬 You are a DIRECT RESPONSE SPECIALIST.\n\n' +
      'Provide immediate answers without using tools.\n' +
      'Answer questions using your knowledge base.\n' +
      'Keep responses concise and relevant.',
    created_at: Date.now(),
  };

  const messagesWithContext = [systemMessage, ...messages];
  let accumulatedContent = '';
  const messageId = `msg-${Date.now()}`;

  try {
    for await (const chunk of LLMService.streamChat(messagesWithContext)) {
      accumulatedContent += chunk;
      // Send chunk to renderer (conversationId로 격리)
      emitStreamingChunk(chunk, state.conversationId);
    }

    const assistantMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: accumulatedContent,
      created_at: Date.now(),
    };

    return {
      messages: [assistantMessage],
    };
  } catch (error: any) {
    console.error('[DirectResponse] Error:', error);

    const errorMessage: Message = {
      id: messageId,
      role: 'assistant',
      content: `Error: ${error.message || 'Failed to generate response'}`,
      created_at: Date.now(),
    };

    return {
      messages: [errorMessage],
    };
  }
}

/**
 * Planning Node: Generate execution plan
 */
async function planningNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  // Skip if plan already exists
  if (state.planCreated) {
    console.log('[Planning] Plan already exists, skipping');
    return {};
  }

  const messages = state.messages || [];
  let userPrompt = '';

  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userPrompt = messages[i].content;
      break;
    }
  }

  if (!userPrompt) {
    return {};
  }

  console.log('[Planning] Creating execution plan');

  const planningSystemMessage: Message = {
    id: 'system-plan',
    role: 'system',
    content:
      "You are SE Pilot, analyzing the user's request to create an execution plan.\n\n" +
      'CRITICAL: Determine the task type first:\n\n' +
      'READ-ONLY tasks (정보 요청):\n' +
      '- Keywords: 요약, 설명, 분석, 리뷰, 검토, 확인, 보기\n' +
      '- Action: Plan to READ files and RESPOND with analysis\n\n' +
      'MODIFICATION tasks (작업 요청):\n' +
      '- Keywords: 생성, 만들기, 작성, 수정, 편집, 변경, 실행\n' +
      '- Action: Plan to EXECUTE changes using tools\n\n' +
      'Create a focused execution plan (3-7 steps).',
    created_at: Date.now(),
  };

  const planningPromptMessage: Message = {
    id: 'planning-prompt',
    role: 'user',
    content:
      `User request:\n${userPrompt}\n\n` +
      'Create an actionable execution plan:\n\n' +
      '1. First line: [READ-ONLY] or [MODIFICATION]\n' +
      '2. List 3-7 specific steps',
    created_at: Date.now(),
  };

  let planContent = '';

  try {
    for await (const chunk of LLMService.streamChat([
      planningSystemMessage,
      planningPromptMessage,
    ])) {
      planContent += chunk;
      // Send planning output to renderer
      emitStreamingChunk(chunk, state.conversationId);
    }

    const planResponse: Message = {
      id: `plan-${Date.now()}`,
      role: 'assistant',
      content: planContent,
      created_at: Date.now(),
    };

    const executionInstruction: Message = {
      id: `exec-${Date.now()}`,
      role: 'user',
      content: `위 계획을 참고하여 '${userPrompt}' 작업을 수행하세요.`,
      created_at: Date.now(),
    };

    // Parse plan steps
    const planSteps = parsePlanSteps(planContent);
    const requiredFiles = extractRequiredFiles(userPrompt);

    console.log(`[Planning] Plan created with ${planSteps.length} steps`);

    return {
      messages: [planResponse, executionInstruction],
      planningNotes: [planContent],
      planCreated: true,
      planSteps,
      currentPlanStep: 0,
      requiredFiles: requiredFiles.length > 0 ? requiredFiles : undefined,
    };
  } catch (error: any) {
    console.error('[Planning] Error:', error);
    return {
      planningNotes: [`Planning failed: ${error.message}`],
    };
  }
}

/**
 * Iteration Guard Node: Control iteration count and enforce limits
 */
async function iterationGuardNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  const iteration = state.iterationCount || 0;
  const maxIter = state.maxIterations || 10;

  console.log(`[IterationGuard] Iteration ${iteration + 1}/${maxIter}`);

  // Check if limit reached
  if (iteration >= maxIter) {
    console.log('[IterationGuard] Max iterations reached, forcing termination');
    return {
      forceTermination: true,
      verificationNotes: [`Iteration limit reached (${iteration}/${maxIter})`],
    };
  }

  // Increment iteration count
  return {
    iterationCount: 1, // Will be added by reducer
    needsAdditionalIteration: false, // Reset flag
  };
}

/**
 * Agent Node: Call LLM with Built-in tools (file operations)
 */
async function agentNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  console.log('[CodingAgent.Agent] Calling LLM with Tools');

  const messages = state.messages || [];

  // RAG 검색
  let ragContext = '';
  try {
    // 마지막 사용자 메시지를 쿼리로 사용
    const lastUserMessage = messages
      .slice()
      .reverse()
      .find((m) => m.role === 'user');
    if (lastUserMessage && lastUserMessage.content) {
      ragContext = await retrieveContextIfEnabled(lastUserMessage.content);
      if (ragContext) {
        emitStreamingChunk(
          `\n📚 **관련 문서 ${ragContext.split('[참고 문서').length - 1}개를 참조합니다.**\n\n`,
          state.conversationId
        );
      }
    }
  } catch (e) {
    console.error('[CodingAgent.Agent] RAG error:', e);
  }

  // Debug: Log message count and sizes
  console.log('[CodingAgent.Agent] Message summary:', {
    totalMessages: messages.length,
    roles: messages.map((m) => m.role),
    contentLengths: messages.map((m) => m.content?.length || 0),
    hasToolCalls: messages.map((m) => !!m.tool_calls),
  });

  // Filter out messages with empty content (except tool messages which can have empty content)
  // OpenAI API may reject assistant messages with empty content
  const filteredMessages = messages.filter((m) => {
    // Keep tool messages (they can have empty content if they're just function results)
    if (m.role === 'tool') {
      return true;
    }
    // Keep messages with tool_calls (even if content is empty)
    if (m.tool_calls && m.tool_calls.length > 0) {
      return true;
    }
    // Filter out messages with empty or whitespace-only content
    return m.content && m.content.trim().length > 0;
  });

  console.log('[CodingAgent.Agent] Filtered messages:', {
    original: messages.length,
    filtered: filteredMessages.length,
    removed: messages.length - filteredMessages.length,
  });

  // Limit context length to prevent 500 errors from server
  // Keep only the most recent messages to avoid context overflow
  const MAX_CONTEXT_MESSAGES = 20;
  const limitedMessages =
    filteredMessages.length > MAX_CONTEXT_MESSAGES
      ? filteredMessages.slice(-MAX_CONTEXT_MESSAGES)
      : filteredMessages;

  if (filteredMessages.length > MAX_CONTEXT_MESSAGES) {
    console.log('[CodingAgent.Agent] Context limited:', {
      original: filteredMessages.length,
      limited: limitedMessages.length,
      dropped: filteredMessages.length - limitedMessages.length,
    });
  }

  // Get Built-in tools
  const builtinTools = getBuiltinTools();
  // Get MCP tools
  const mcpTools = MCPServerManager.getAllToolsInMainProcess();

  const allTools = [...builtinTools, ...mcpTools];

  const toolsForLLM = allTools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || `Tool: ${tool.name}`,
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {},
      },
    },
  }));

  console.log(
    `[CodingAgent.Agent] Available tools: ${builtinTools.length} builtin + ${mcpTools.length} MCP`
  );
  console.log(
    '[CodingAgent.Agent] Tool details:',
    allTools.map((t) => t.name)
  );

  // Add system prompts
  const codingSystemMsg: Message = {
    id: 'system-coding',
    role: 'system',
    content: `You are an expert coding assistant with FULL file system access and command execution capabilities.

# CRITICAL RULES

1. **You HAVE REAL ACCESS** - This is NOT a simulation. You have actual file system access and can execute commands.
2. **ALWAYS USE TOOLS** - Never say you cannot access files. Use tools immediately for ALL file operations.
3. **ACTION OVER EXPLANATION** - Don't just explain what needs to be done. DO IT using tools.
4. **READ BEFORE WRITE** - Always read files before editing to understand context and avoid mistakes.
5. **VERIFY YOUR WORK** - After making changes, use file_read or command_execute to verify results.

# AVAILABLE TOOLS

## File Operations
- **file_read**: Read file contents from disk
- **file_write**: Create or completely overwrite files
- **file_edit**: Modify existing files with precise string replacement
- **file_list**: List directory contents (supports recursive listing)

## Search & Discovery
- **grep_search**: Fast code search using ripgrep (supports regex, file type filtering, case sensitivity)
  - Use this to find patterns, function definitions, imports, or any code across the codebase
  - Example: grep_search with pattern "function.*handleSubmit" to find all handleSubmit functions

## Command Execution
- **command_execute**: Execute shell commands (npm, git, build tools, etc.)
  - npm install/run, git status/diff/add/commit, build commands, test runners
  - Returns both stdout and stderr
  - Example: command_execute with "npm install lodash" or "git status"

# WORKFLOW BEST PRACTICES

## 1. Understand First
- Use file_list to explore directory structure
- Use grep_search to find relevant code patterns
- Use file_read to understand existing code before modifying

## 2. Make Changes Carefully
- For small changes: Use file_edit (safer, preserves file structure)
- For new files or complete rewrites: Use file_write
- Always include proper context in file_edit (enough surrounding code to make replacement unique)

## 3. Execute & Verify
- After code changes, run relevant commands:
  - command_execute "npm run lint" or "npm run type-check"
  - command_execute "npm test" for tests
  - command_execute "git diff" to see changes
- Verify file changes with file_read

## 4. Handle Dependencies
- When adding new imports/packages: command_execute "npm install <package>"
- Check package.json: file_read "package.json"
- Run build/type check: command_execute "npm run build"

# COMMON PATTERNS

❌ WRONG: "I cannot access your files..."
✅ CORRECT: Immediately use file_read or file_list

❌ WRONG: "Here's the code you should add: \`\`\`typescript..."
✅ CORRECT: Use file_write or file_edit to add it now

❌ WRONG: "You need to run npm install"
✅ CORRECT: Use command_execute "npm install" right now

❌ WRONG: "Let me search for..." then not using grep_search
✅ CORRECT: Use grep_search immediately to find code

❌ WRONG: Editing files without reading them first
✅ CORRECT: file_read → understand → file_edit

# ERROR HANDLING

- If a tool fails, read the error message and try alternative approaches
- If file_edit fails due to non-unique string, include more context or use file_write
- If command_execute fails, check stderr output and fix the underlying issue
- If grep_search finds no results, try different patterns or broader search

# COMMUNICATION

- Explain WHAT you're doing as you use each tool
- After tool execution, explain the RESULT and next steps
- Keep the user informed of progress through complex multi-step tasks
- If you discover issues or need clarification, ask before proceeding with destructive changes

Remember: You are a capable autonomous agent. Use your tools to complete tasks fully, not just describe how they could be done.`,
    created_at: Date.now(),
  };

  const executionSpecialistMsg: Message = {
    id: 'system-exec',
    role: 'system',
    content: `You are an EXECUTION SPECIALIST in a ReAct (Reasoning + Acting) loop.

WORKFLOW:
1. Think: Reason about what needs to be done next
2. Act: Use tools to make progress toward the goal
3. Observe: Analyze tool results
4. Repeat: Continue until task is complete

PRIORITIES:
- Focus on IMPLEMENTATION, not planning
- Use tools IMMEDIATELY when they can help
- Make CONCRETE PROGRESS in each iteration
- Don't overthink - take action and adjust based on results

ITERATION BUDGET:
- You have up to 50 iterations to complete complex tasks
- Use them wisely: batch related operations, verify as you go
- If stuck after several iterations, try a different approach or ask for guidance`,
    created_at: Date.now(),
  };

  const messagesWithContext = [codingSystemMsg, executionSpecialistMsg];

  if (ragContext) {
    messagesWithContext.push({
      id: 'system-rag',
      role: 'system',
      content: `참고 문서:\n${ragContext}\n\n위 참고 문서를 작업에 활용하세요.`,
      created_at: Date.now(),
    });
  }

  messagesWithContext.push(...limitedMessages);

  try {
    // Call LLM with tools (streaming)
    let accumulatedContent = '';
    let finalToolCalls: any[] | undefined = undefined;

    console.log('[CodingAgent.Agent] Starting streaming with tools...');

    for await (const chunk of LLMService.streamChatWithChunks(messagesWithContext, {
      tools: toolsForLLM,
    })) {
      // Accumulate content and emit to renderer
      if (!chunk.done && chunk.content) {
        accumulatedContent += chunk.content;
        emitStreamingChunk(chunk.content, state.conversationId);
      }

      // Last chunk contains tool calls (if any)
      if (chunk.done && chunk.toolCalls) {
        finalToolCalls = chunk.toolCalls;
        console.log('[CodingAgent.Agent] Received tool calls:', finalToolCalls);
      }
    }

    console.log(
      '[CodingAgent.Agent] Streaming complete. Content length:',
      accumulatedContent.length
    );

    // Parse tool calls
    const toolCalls = finalToolCalls?.map((tc: any, index: number) => {
      const toolCallId = tc.id || `call_${Date.now()}_${index}`;

      console.log('[CodingAgent.Agent] Tool call:', {
        id: toolCallId,
        name: tc.function.name,
        arguments: tc.function.arguments,
      });

      return {
        id: toolCallId,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      };
    });

    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: accumulatedContent || '',
      created_at: Date.now(),
      tool_calls: toolCalls,
    };

    console.log('[CodingAgent.Agent] Assistant message created:', {
      hasContent: !!assistantMessage.content,
      hasToolCalls: !!assistantMessage.tool_calls,
      toolCallsCount: assistantMessage.tool_calls?.length,
    });

    return {
      messages: [assistantMessage],
    };
  } catch (error: any) {
    console.error('[CodingAgent.Agent] Error:', error);

    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `❌ LLM 호출 오류: ${error.message}\n\n서버에서 500 Internal Server Error를 반환했습니다. LLM 서버 상태를 확인해주세요.`,
      created_at: Date.now(),
    };

    return {
      messages: [errorMessage],
      agentError: error.message, // Add error flag for stream() to detect
    };
  }
}

/**
 * Approval Node: Request user approval for sensitive tools
 * (Currently auto-approves - implement interrupt() for manual approval)
 */
async function approvalNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = lastMessage?.tool_calls || [];

  if (toolCalls.length === 0) {
    return {
      lastApprovalStatus: 'approved',
    };
  }

  // For now, auto-approve all tools
  // TODO: Implement interrupt() for manual approval of sensitive tools
  console.log(`[Approval] Auto-approving ${toolCalls.length} tool(s)`);

  return {
    lastApprovalStatus: 'approved',
  };
}

/**
 * Enhanced Tools Node: Execute tools with file change tracking
 * Handles Built-in tools (file operations) directly, delegates MCP tools to toolsNode
 */
async function enhancedToolsNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  console.log('[CodingAgent.Tools] Executing tools with file tracking');

  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return {};
  }

  // Get file snapshot before tool execution
  const workspacePath = process.cwd();
  const filesBefore = await getWorkspaceFiles(workspacePath);

  // Get Built-in tools
  const builtinTools = getBuiltinTools();
  const builtinToolNames = new Set(builtinTools.map((t) => t.name));

  console.log(
    '[CodingAgent.Tools] Tool calls:',
    lastMessage.tool_calls.map((c) => c.name)
  );
  console.log('[CodingAgent.Tools] Built-in tools available:', Array.from(builtinToolNames));

  // Execute tools
  type ToolExecutionResult = {
    toolCallId: string;
    toolName: string;
    result: string | null;
    error?: string;
  };

  const results: ToolExecutionResult[] = await Promise.all(
    lastMessage.tool_calls.map(async (call): Promise<ToolExecutionResult> => {
      const startTime = Date.now();

      try {
        // Check if it's a built-in tool
        if (builtinToolNames.has(call.name)) {
          console.log(`[CodingAgent.Tools] Executing builtin tool: ${call.name}`);
          const result = await executeBuiltinTool(call.name, call.arguments);
          const duration = Date.now() - startTime;

          // Save activity to database (non-blocking)
          if (
            state.conversationId &&
            typeof window !== 'undefined' &&
            window.electronAPI?.activity
          ) {
            const activity: Activity = {
              id: uuidv4(),
              conversation_id: state.conversationId,
              tool_name: call.name,
              tool_args: call.arguments as Record<string, unknown>,
              result: result,
              status: 'success',
              created_at: Date.now(),
              duration_ms: duration,
            };

            window.electronAPI.activity.saveActivity(activity).catch((error) => {
              console.error('[CodingAgent.Tools] Failed to save activity:', error);
            });
          }

          return {
            toolCallId: call.id,
            toolName: call.name,
            result: result,
          };
        } else {
          // Try to execute as MCP tool
          console.log(`[CodingAgent.Tools] Checking MCP tools for: ${call.name}`);

          const mcpTools = MCPServerManager.getAllToolsInMainProcess();
          const targetTool = mcpTools.find((t) => t.name === call.name);

          if (targetTool) {
            console.log(
              `[CodingAgent.Tools] Executing MCP tool: ${call.name} on server ${targetTool.serverName}`
            );

            const mcpResult = await MCPServerManager.callToolInMainProcess(
              targetTool.serverName,
              call.name,
              call.arguments
            );

            // Extract text result
            let resultText = '';
            if (!mcpResult) {
              resultText = 'Tool returned no result';
            } else if (mcpResult.content && Array.isArray(mcpResult.content)) {
              resultText = mcpResult.content
                .map((item: any) => item.text || '')
                .filter((t: string) => t)
                .join('\n');
            } else if (typeof mcpResult === 'string') {
              resultText = mcpResult;
            } else {
              resultText = JSON.stringify(mcpResult);
            }

            const duration = Date.now() - startTime;

            // Save activity
            if (
              state.conversationId &&
              typeof window !== 'undefined' &&
              window.electronAPI?.activity
            ) {
              const activity: Activity = {
                id: uuidv4(),
                conversation_id: state.conversationId,
                tool_name: call.name,
                tool_args: call.arguments as Record<string, unknown>,
                result: resultText,
                status: 'success',
                created_at: Date.now(),
                duration_ms: duration,
              };

              window.electronAPI.activity.saveActivity(activity).catch((error) => {
                console.error('[CodingAgent.Tools] Failed to save activity:', error);
              });
            }

            return {
              toolCallId: call.id,
              toolName: call.name,
              result: resultText,
            };
          }

          // Not a built-in tool AND not an MCP tool
          console.warn(`[CodingAgent.Tools] Unknown tool called: ${call.name}`);

          const errorMsg = `Tool '${call.name}' not found (neither built-in nor MCP)`;
          const duration = Date.now() - startTime;

          // Save error activity
          if (
            state.conversationId &&
            typeof window !== 'undefined' &&
            window.electronAPI?.activity
          ) {
            const activity: Activity = {
              id: uuidv4(),
              conversation_id: state.conversationId,
              tool_name: call.name,
              tool_args: call.arguments as Record<string, unknown>,
              result: errorMsg,
              status: 'error',
              created_at: Date.now(),
              duration_ms: duration,
            };

            window.electronAPI.activity.saveActivity(activity).catch((error) => {
              console.error('[CodingAgent.Tools] Failed to save activity:', error);
            });
          }

          return {
            toolCallId: call.id,
            toolName: call.name,
            result: null,
            error: errorMsg,
          };
        }
      } catch (error: any) {
        console.error(`[CodingAgent.Tools] Error executing ${call.name}:`, error);
        const duration = Date.now() - startTime;
        const errorMsg = error.message || 'Tool execution failed';

        // Save error activity
        if (state.conversationId && typeof window !== 'undefined' && window.electronAPI?.activity) {
          const activity: Activity = {
            id: uuidv4(),
            conversation_id: state.conversationId,
            tool_name: call.name,
            tool_args: call.arguments as Record<string, unknown>,
            result: errorMsg,
            status: 'error',
            created_at: Date.now(),
            duration_ms: duration,
          };

          window.electronAPI.activity.saveActivity(activity).catch((error) => {
            console.error('[CodingAgent.Tools] Failed to save activity:', error);
          });
        }

        return {
          toolCallId: call.id,
          toolName: call.name,
          result: null,
          error: errorMsg,
        };
      }
    })
  );

  // Get file snapshot after tool execution
  const filesAfter = await getWorkspaceFiles(workspacePath);
  const fileChanges = detectFileChanges(filesBefore, filesAfter);

  // Convert tool results to messages (OpenAI compatible format)
  const toolMessages: Message[] = results.map((result) => {
    let content = '';

    if (result.error) {
      content = `Error: ${result.error}`;
    } else if (result.result !== null && result.result !== undefined) {
      content = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    } else {
      content = 'No result';
    }

    console.log('[CodingAgent.Tools] Creating tool result message:', {
      toolCallId: result.toolCallId,
      toolName: result.toolName,
      hasError: !!result.error,
      contentLength: content.length,
    });

    return {
      id: `tool-${result.toolCallId}`,
      role: 'tool' as const,
      content,
      created_at: Date.now(),
      tool_call_id: result.toolCallId,
      name: result.toolName,
    };
  });

  const updates: Partial<CodingAgentState> = {
    toolResults: results,
    messages: toolMessages, // Add tool result messages
  };

  // Track file changes if any
  if (fileChanges.added.length > 0 || fileChanges.modified.length > 0) {
    const totalChanges = fileChanges.added.length + fileChanges.modified.length;
    updates.fileChangesCount = totalChanges;
    updates.modifiedFiles = [...fileChanges.added, ...fileChanges.modified];

    console.log(`[CodingAgent.Tools] File changes detected: ${totalChanges} files`);
  }

  return updates;
}

/**
 * Verification Node: Validate execution results
 */
async function verificationNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  console.log('[Verification] Validating execution results');

  const planSteps = state.planSteps || [];
  const currentStep = state.currentPlanStep || 0;
  const toolResults = state.toolResults || [];

  // Check if plan was created but not executed
  if (state.planCreated && toolResults.length === 0) {
    console.log('[Verification] Plan created but no tools executed yet');

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

  // Check required files (for MODIFICATION tasks)
  const requiredFiles = state.requiredFiles || [];
  const modifiedFiles = state.modifiedFiles || [];

  if (requiredFiles.length > 0 && modifiedFiles.length > 0) {
    const missingFiles = requiredFiles.filter(
      (req) => !modifiedFiles.some((mod) => pathMatchesRequirement(mod, req))
    );

    if (missingFiles.length > 0 && (state.iterationCount || 0) < 3) {
      console.log(`[Verification] Missing required files: ${missingFiles.join(', ')}`);

      const reminderMessage: Message = {
        id: `reminder-${Date.now()}`,
        role: 'user',
        content: `다음 파일들이 아직 수정되지 않았습니다: ${missingFiles.join(', ')}`,
        created_at: Date.now(),
      };

      return {
        messages: [reminderMessage],
        verificationNotes: ['⚠️ Required files not modified'],
        needsAdditionalIteration: true,
      };
    }
  }

  // Advance plan step if we have a plan
  if (planSteps.length > 0 && currentStep < planSteps.length - 1) {
    console.log(
      `[Verification] Advancing to next plan step (${currentStep + 1}/${planSteps.length})`
    );
    return {
      currentPlanStep: currentStep + 1,
      verificationNotes: ['✅ Step completed, moving to next'],
      needsAdditionalIteration: true,
    };
  }

  // All checks passed
  console.log('[Verification] Execution validated');
  return {
    verificationNotes: ['✅ Execution complete'],
    needsAdditionalIteration: false,
  };
}

/**
 * Reporter Node: Generate final summary (only for errors or max iterations)
 */
async function reporterNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  console.log('[Reporter] Checking if final report is needed');

  const hasToolError = state.toolResults?.some((r) => r.error);
  const hasAgentError = state.agentError && state.agentError.length > 0;
  const maxIterations = state.maxIterations || 10;
  const iterationCount = state.iterationCount || 0;

  // Only generate a report message for errors or max iterations reached
  if (hasAgentError) {
    // Agent error already has user-friendly message, no need for additional report
    console.log('[Reporter] Agent error already reported in messages');
    return {};
  } else if (hasToolError) {
    const errorMessage: Message = {
      id: `report-${Date.now()}`,
      role: 'assistant',
      content: '❌ 작업 중 오류가 발생했습니다. 위의 툴 실행 결과를 확인해주세요.',
      created_at: Date.now(),
    };

    console.log('[Reporter] Tool error detected, generating error report');
    return {
      messages: [errorMessage],
    };
  } else if (iterationCount >= maxIterations) {
    const maxIterMessage: Message = {
      id: `report-${Date.now()}`,
      role: 'assistant',
      content: `⚠️ 최대 반복 횟수(${maxIterations})에 도달했습니다. 작업이 복잡하여 완료하지 못했을 수 있습니다.`,
      created_at: Date.now(),
    };

    console.log('[Reporter] Max iterations reached, generating warning');
    return {
      messages: [maxIterMessage],
    };
  }

  // Normal completion - no additional message needed
  console.log('[Reporter] Normal completion, no report message generated');
  return {};
}

// ===========================
// Routing Functions
// ===========================

function triageNextStep(state: CodingAgentState): 'direct' | 'graph' {
  const decision = state.triageDecision || 'graph';
  return decision === 'direct_response' ? 'direct' : 'graph';
}

function guardDecision(state: CodingAgentState): 'continue' | 'stop' {
  if (state.forceTermination || (state.iterationCount || 0) >= (state.maxIterations || 10)) {
    return 'stop';
  }
  return 'continue';
}

function approvalNextStep(state: CodingAgentState): 'run_tools' | 'retry' {
  const status = (state.lastApprovalStatus || 'approved').toLowerCase();
  if (status === 'denied' || status === 'feedback') {
    return 'retry';
  }
  return 'run_tools';
}

function verificationNextStep(state: CodingAgentState): 'continue' | 'report' {
  if (state.needsAdditionalIteration) {
    return 'continue';
  }
  return 'report';
}

// ===========================
// Graph Builder
// ===========================

/**
 * Create Coding Agent Graph
 */
export function createCodingAgentGraph() {
  const workflow = new StateGraph(CodingAgentStateAnnotation)
    // Add nodes
    .addNode('triage', triageNode)
    .addNode('direct_response', directResponseNode)
    .addNode('planner', planningNode)
    .addNode('iteration_guard', iterationGuardNode)
    .addNode('agent', agentNode)
    .addNode('approval', approvalNode)
    .addNode('tools', enhancedToolsNode)
    .addNode('verifier', verificationNode)
    .addNode('reporter', reporterNode);

  // Set entry point
  workflow.setEntryPoint('triage');

  // Add edges
  workflow.addConditionalEdges('triage', triageNextStep, {
    direct: 'direct_response',
    graph: 'planner',
  });

  workflow.addEdge('direct_response', END);
  workflow.addEdge('planner', 'iteration_guard');

  workflow.addConditionalEdges('iteration_guard', guardDecision, {
    continue: 'agent',
    stop: 'reporter',
  });

  workflow.addConditionalEdges('agent', shouldUseTool, {
    tools: 'approval',
    end: 'verifier',
  });

  workflow.addConditionalEdges('approval', approvalNextStep, {
    run_tools: 'tools',
    retry: 'iteration_guard',
  });

  workflow.addEdge('tools', 'verifier');

  workflow.addConditionalEdges('verifier', verificationNextStep, {
    continue: 'iteration_guard',
    report: 'reporter',
  });

  workflow.addEdge('reporter', END);

  return workflow.compile();
}

// ===========================
// CodingAgentGraph Class (stream support)
// ===========================

export class CodingAgentGraph {
  private toolApprovalCallback?: (toolCalls: any[]) => Promise<boolean>;

  async *stream(
    initialState: CodingAgentState,
    toolApprovalCallback?: (toolCalls: any[]) => Promise<boolean>
  ): AsyncGenerator<any> {
    this.toolApprovalCallback = toolApprovalCallback;
    let state = { ...initialState };

    console.log('[CodingAgentGraph] Starting stream (simplified Claude Code style)');

    try {
      const maxIterations = state.maxIterations || 10;
      let iterations = 0;
      let hasError = false;

      // Main ReAct loop (simplified - no triage, no planner)
      while (iterations < maxIterations) {
        // Agent (LLM with tools)
        yield { type: 'node', node: 'agent', data: { status: 'starting' } };
        const agentResult = await agentNode(state);
        state = {
          ...state,
          messages: [...state.messages, ...(agentResult.messages || [])],
          agentError: agentResult.agentError || state.agentError,
        };
        yield { type: 'node', node: 'agent', data: { ...agentResult, messages: state.messages } };

        // Check if agent encountered an error
        if (agentResult.agentError) {
          console.log('[CodingAgentGraph] Agent error detected, ending loop');
          hasError = true;
          break;
        }

        const lastMessage = state.messages[state.messages.length - 1];

        // Check if tools need to be called
        if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
          // No tools - normal completion
          console.log('[CodingAgentGraph] No tool calls, ending loop');
          break;
        }

        // Tool approval (human-in-the-loop)
        if (
          this.toolApprovalCallback &&
          lastMessage.tool_calls &&
          lastMessage.tool_calls.length > 0
        ) {
          console.log('[CodingAgentGraph] Requesting tool approval');

          // Yield tool approval request
          yield {
            type: 'tool_approval_request',
            messageId: lastMessage.id,
            toolCalls: lastMessage.tool_calls,
          };

          try {
            const approved = await this.toolApprovalCallback(lastMessage.tool_calls);

            yield {
              type: 'tool_approval_result',
              approved,
            };

            if (!approved) {
              console.log('[CodingAgentGraph] Tools rejected by user');
              const rejectionMessage: Message = {
                id: `msg-${Date.now()}`,
                role: 'assistant',
                content: '도구 실행이 사용자에 의해 거부되었습니다.',
                created_at: Date.now(),
              };
              state = {
                ...state,
                messages: [...state.messages, rejectionMessage],
                lastApprovalStatus: 'denied',
              };
              break;
            }

            state = { ...state, lastApprovalStatus: 'approved' };
          } catch (error: any) {
            console.error('[CodingAgentGraph] Tool approval error:', error);
            break;
          }
        } else {
          // Auto-approve if no callback
          state = { ...state, lastApprovalStatus: 'approved' };
        }

        // Execute tools
        yield { type: 'node', node: 'tools', data: { status: 'starting' } };
        const toolsResult = await enhancedToolsNode(state);

        // Check for errors
        if (toolsResult.toolResults?.some((r) => r.error)) {
          hasError = true;
        }

        state = {
          ...state,
          messages: [...state.messages, ...(toolsResult.messages || [])],
          toolResults: toolsResult.toolResults || state.toolResults,
          modifiedFiles: toolsResult.modifiedFiles || state.modifiedFiles,
          fileChangesCount: (state.fileChangesCount || 0) + (toolsResult.fileChangesCount || 0),
        };
        yield { type: 'node', node: 'tools', data: { ...toolsResult, messages: state.messages } };

        iterations++;
      }

      console.log('[CodingAgentGraph] Stream completed, total iterations:', iterations);

      // Reporter: Only for errors or max iterations
      yield { type: 'node', node: 'reporter', data: { status: 'starting' } };
      // Pass hasError and iterations through state
      const stateForReporter = {
        ...state,
        toolResults: hasError ? state.toolResults : [],
        iterationCount: iterations,
      };
      const reportResult = await reporterNode(stateForReporter);
      if (reportResult.messages && reportResult.messages.length > 0) {
        state = {
          ...state,
          messages: [...state.messages, ...reportResult.messages],
        };
      }
      yield { type: 'node', node: 'reporter', data: { ...reportResult, messages: state.messages } };
    } catch (error: any) {
      console.error('[CodingAgentGraph] Stream error:', error);
      yield { type: 'error', error: error.message || 'Graph execution failed' };
    }
  }
}
