import { StateGraph, END } from '@langchain/langgraph';
import { CodingAgentStateAnnotation, CodingAgentState } from '../state';
import { generateWithToolsNode } from '../nodes/generate';
import { toolsNode, shouldUseTool } from '../nodes/tools';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';
import { createBaseSystemMessage } from '../utils/system-message';
import { emitStreamingChunk } from '@/lib/llm/streaming-callback';
import { executeBuiltinTool, getBuiltinTools } from '@/lib/mcp/tools/builtin-tools';
import type { MCPTool } from '@/lib/mcp/types';
import * as fs from 'fs/promises';
import * as path from 'path';

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
    if (/^\d+[\.\)\:]/.test(trimmed)) {
      steps.push(trimmed);
    }
  }

  return steps;
}

/**
 * Extract required files from user prompt
 */
function extractRequiredFiles(prompt: string): string[] {
  if (!prompt) return [];

  const matches = new Set<string>();

  // Pattern 1: Files with path separators
  const pathPattern = /[@`"']?([A-Za-z0-9_-]+\/[A-Za-z0-9_\/.-]+\.(?:py|md|txt|json|yaml|yml|ini|cfg|sh|js|ts|tsx|jsx|java|go|rs|c|cpp|h|hpp))[@`"']?/gi;
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
  const quotedPattern = /[`"']([A-Za-z0-9_\/.-]+\.(?:py|md|txt|json|yaml|yml|ini|cfg|sh|js|ts|tsx|jsx|java|go|rs|c|cpp|h|hpp))[`"']/gi;
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
  if (prompt.includes('README') && !Array.from(matches).some(m => m.toLowerCase().includes('readme'))) {
    matches.add('README.md');
  }

  return Array.from(matches).sort();
}

/**
 * Check if a changed path matches a requirement
 */
function pathMatchesRequirement(changedPath: string, requirement: string): boolean {
  if (!changedPath || !requirement) return false;

  const changedName = path.basename(changedPath).toLowerCase();
  const reqName = path.basename(requirement).toLowerCase();

  return (
    changedPath.endsWith(requirement) ||
    changedName === reqName ||
    changedName.includes(reqName)
  );
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
  const isSimpleQuestion = (
    userPrompt.length < 200 &&
    (userPrompt.includes('?') || userPrompt.includes('what') || userPrompt.includes('how'))
  );

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
    content: (
      '💬 You are a DIRECT RESPONSE SPECIALIST.\n\n' +
      'Provide immediate answers without using tools.\n' +
      'Answer questions using your knowledge base.\n' +
      'Keep responses concise and relevant.'
    ),
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
    content: (
      'You are SE Pilot, analyzing the user\'s request to create an execution plan.\n\n' +
      'CRITICAL: Determine the task type first:\n\n' +
      'READ-ONLY tasks (정보 요청):\n' +
      '- Keywords: 요약, 설명, 분석, 리뷰, 검토, 확인, 보기\n' +
      '- Action: Plan to READ files and RESPOND with analysis\n\n' +
      'MODIFICATION tasks (작업 요청):\n' +
      '- Keywords: 생성, 만들기, 작성, 수정, 편집, 변경, 실행\n' +
      '- Action: Plan to EXECUTE changes using tools\n\n' +
      'Create a focused execution plan (3-7 steps).'
    ),
    created_at: Date.now(),
  };

  const planningPromptMessage: Message = {
    id: 'planning-prompt',
    role: 'user',
    content: (
      `User request:\n${userPrompt}\n\n` +
      'Create an actionable execution plan:\n\n' +
      '1. First line: [READ-ONLY] or [MODIFICATION]\n' +
      '2. List 3-7 specific steps'
    ),
    created_at: Date.now(),
  };

  let planContent = '';

  try {
    for await (const chunk of LLMService.streamChat([planningSystemMessage, planningPromptMessage])) {
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
  console.log('[CodingAgent.Agent] Calling LLM with Built-in tools');

  const messages = state.messages || [];

  // Get Built-in tools and convert to OpenAI format
  const builtinTools = getBuiltinTools();
  const toolsForLLM = builtinTools.map(tool => ({
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

  console.log(`[CodingAgent.Agent] Available Built-in tools: ${builtinTools.length}`);
  console.log('[CodingAgent.Agent] Tool details:', builtinTools.map(t => t.name));

  // Add system prompts
  const codingSystemMsg: Message = {
    id: 'system-coding',
    role: 'system',
    content: `You are an expert coding assistant with ACTUAL file system access through tools.

🔴 CRITICAL RULES - YOU MUST FOLLOW THESE:
1. You HAVE access to real file system through tools - this is NOT a simulated environment
2. You MUST use tools for ALL file operations - NEVER say you cannot access files
3. DO NOT provide code examples or explanations - USE THE TOOLS to create/modify actual files
4. If a user asks about files or code, USE file_read or file_list first, then act

Available tools (YOU MUST USE THESE):
- file_read: Read actual file contents from the real file system
- file_write: Create or overwrite actual files on disk
- file_edit: Modify existing files with precise replacements
- file_list: List actual directory contents

Examples of CORRECT responses:
❌ WRONG: "I cannot access your file system..."
✅ CORRECT: Use file_list or file_read tool immediately

❌ WRONG: "Here's example code: \`\`\`python..."
✅ CORRECT: Use file_write to create the actual file

❌ WRONG: "You can modify the file by..."
✅ CORRECT: Use file_edit to modify it right now

Remember: You are running in a desktop application with REAL file system access. Use the tools!`,
    created_at: Date.now(),
  };

  const executionSpecialistMsg: Message = {
    id: 'system-exec',
    role: 'system',
    content: (
      '⚙️ You are an EXECUTION SPECIALIST agent.\n\n' +
      'Your role: Execute plans using available tools\n' +
      'Focus on implementation, not re-planning\n\n' +
      '🔴 NEVER respond with text explanations - ALWAYS use tools to perform actions'
    ),
    created_at: Date.now(),
  };

  const messagesWithContext = [codingSystemMsg, executionSpecialistMsg, ...messages];

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

    console.log('[CodingAgent.Agent] Streaming complete. Content length:', accumulatedContent.length);

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
      content: `LLM error: ${error.message}`,
      created_at: Date.now(),
    };

    return {
      messages: [errorMessage],
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
  const builtinToolNames = new Set(builtinTools.map(t => t.name));

  console.log('[CodingAgent.Tools] Tool calls:', lastMessage.tool_calls.map(c => c.name));
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
      try {
        // Check if it's a built-in tool
        if (builtinToolNames.has(call.name)) {
          console.log(`[CodingAgent.Tools] Executing builtin tool: ${call.name}`);
          const result = await executeBuiltinTool(call.name, call.arguments);
          return {
            toolCallId: call.id,
            toolName: call.name,
            result: result,
          };
        } else {
          // Not a built-in tool, should not happen in Coding Agent
          // But if it does, log a warning
          console.warn(`[CodingAgent.Tools] Non-builtin tool called: ${call.name}`);
          return {
            toolCallId: call.id,
            toolName: call.name,
            result: null,
            error: `Tool '${call.name}' is not a built-in tool for Coding Agent`,
          };
        }
      } catch (error: any) {
        console.error(`[CodingAgent.Tools] Error executing ${call.name}:`, error);
        return {
          toolCallId: call.id,
          toolName: call.name,
          result: null,
          error: error.message || 'Tool execution failed',
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
      req => !modifiedFiles.some(mod => pathMatchesRequirement(mod, req))
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
    console.log(`[Verification] Advancing to next plan step (${currentStep + 1}/${planSteps.length})`);
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

  const hasError = state.toolResults?.some(r => r.error);
  const maxIterations = state.maxIterations || 10;
  const iterationCount = state.iterationCount || 0;

  // Only generate a report message for errors or max iterations reached
  if (hasError) {
    const errorMessage: Message = {
      id: `report-${Date.now()}`,
      role: 'assistant',
      content: '❌ 작업 중 오류가 발생했습니다. 위의 툴 실행 결과를 확인해주세요.',
      created_at: Date.now(),
    };

    console.log('[Reporter] Error detected, generating error report');
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
  workflow.addConditionalEdges(
    'triage',
    triageNextStep,
    {
      direct: 'direct_response',
      graph: 'planner',
    }
  );

  workflow.addEdge('direct_response', END);
  workflow.addEdge('planner', 'iteration_guard');

  workflow.addConditionalEdges(
    'iteration_guard',
    guardDecision,
    {
      continue: 'agent',
      stop: 'reporter',
    }
  );

  workflow.addConditionalEdges(
    'agent',
    shouldUseTool,
    {
      tools: 'approval',
      end: 'verifier',
    }
  );

  workflow.addConditionalEdges(
    'approval',
    approvalNextStep,
    {
      run_tools: 'tools',
      retry: 'iteration_guard',
    }
  );

  workflow.addEdge('tools', 'verifier');

  workflow.addConditionalEdges(
    'verifier',
    verificationNextStep,
    {
      continue: 'iteration_guard',
      report: 'reporter',
    }
  );

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
        };
        yield { type: 'node', node: 'agent', data: { ...agentResult, messages: state.messages } };

        const lastMessage = state.messages[state.messages.length - 1];

        // Check if tools need to be called
        if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
          // No tools - normal completion
          console.log('[CodingAgentGraph] No tool calls, ending loop');
          break;
        }

        // Tool approval (human-in-the-loop)
        if (this.toolApprovalCallback && lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
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
        if (toolsResult.toolResults?.some(r => r.error)) {
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
