import { CodingAgentState } from '../state';
import { LLMService } from '@/lib/domains/llm/service';
import { Message, Activity } from '@/types';
import { emitStreamingChunk, getCurrentGraphConfig } from '@/lib/domains/llm/streaming-callback';
import { executeBuiltinTool, getBuiltinTools } from '@/lib/domains/mcp/tools/builtin-tools';
import { MCPServerManager } from '@/lib/domains/mcp/server-manager';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'node:crypto';
import { ContextManager } from '../utils/context-manager';
import { VerificationPipeline } from '../utils/verification-pipeline';
import { ErrorRecovery } from '../utils/error-recovery';
import { ToolSelector } from '../utils/tool-selector';
import { FileTracker } from '../utils/file-tracker';
import { CodebaseAnalyzer } from '../utils/codebase-analyzer';
import { AgentTraceCollector } from '../utils/agent-observability';
import { buildCompletionChecklist } from '../utils/completion-checklist';
import {
  createToolExecutionTransaction,
  rollbackToolExecutionTransaction,
  ToolExecutionTransaction,
} from '../utils/tool-transaction';
import { buildWorkingMemory } from '../utils/working-memory';
import {
  getToolPathFromArguments,
  resolveToolApprovalDecision,
  ToolApprovalDecision,
  UNTRUSTED_APPROVAL_MARKER,
} from '../utils/tool-approval-risk';
import {
  filterUnexecutedToolCalls,
  mergeExecutedToolCallIds,
} from '../utils/tool-call-idempotency';
import { createApprovalHistoryEntry } from '../utils/approval-history';
import {
  getCodingAgentSystemPrompt,
  getExecutionSpecialistPrompt,
  getPlanStepPrompt,
} from '../prompts/coding-agent-system';

import { logger } from '@/lib/utils/logger';
import type { AgentTraceMetrics, ApprovalHistoryEntry, InputTrustLevel } from '../types';
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
  const MAX_FILES = 8000;

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common directories to ignore
      if (entry.isDirectory()) {
        if (
          ['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', 'out', 'release'].includes(
            entry.name
          )
        ) {
          continue;
        }
        if (results.length >= MAX_FILES) {
          continue;
        }
        const subFiles = await getAllFiles(fullPath);
        results.push(...subFiles);
      } else {
        results.push(fullPath);
      }

      if (results.length >= MAX_FILES) {
        break;
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
 * Extract plan step tag ([DISCUSS], [TOOL], [VERIFY]) from step text
 */
function getPlanStepTag(stepText: string): 'DISCUSS' | 'TOOL' | 'VERIFY' | null {
  const match = stepText.match(/\[(DISCUSS|TOOL|VERIFY)\]/i);
  return match ? (match[1].toUpperCase() as 'DISCUSS' | 'TOOL' | 'VERIFY') : null;
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

function getWorkspacePath(state?: Partial<CodingAgentState>): string {
  return state?.workingDirectory?.trim() || process.cwd();
}

function getLastUserText(state: CodingAgentState): string {
  const lastUserMessage = [...(state.messages || [])].reverse().find((m) => m.role === 'user');
  return lastUserMessage?.content || '';
}

function getInputTrustLevelForState(state: CodingAgentState): InputTrustLevel {
  const graphConfig = getCurrentGraphConfig(state.conversationId);
  if (graphConfig?.inputTrustLevel === 'trusted' || graphConfig?.inputTrustLevel === 'untrusted') {
    return graphConfig.inputTrustLevel;
  }
  return 'trusted';
}

function sanitizeApprovalNote(note: string): string {
  if (!note) {
    return '';
  }
  return note.replace(UNTRUSTED_APPROVAL_MARKER, '').trim();
}

function hasSkillSystemMessages(messages: Message[]): boolean {
  return (messages || []).some(
    (message) =>
      message.role === 'system' &&
      typeof message.id === 'string' &&
      message.id.startsWith('system-skill-')
  );
}

async function injectSkillsToStateIfNeeded(state: CodingAgentState): Promise<CodingAgentState> {
  if (hasSkillSystemMessages(state.messages || [])) {
    return state;
  }

  const query = getLastUserText(state).trim();
  if (!query) {
    return state;
  }

  try {
    const { skillsInjector } = await import('../skills-injector');
    const injectionResult = await skillsInjector.injectSkills(
      query,
      state.conversationId || 'unknown'
    );

    if (injectionResult.injectedSkills.length === 0) {
      return state;
    }

    const skillMessages = skillsInjector.getMessagesFromResult(injectionResult);
    // 활성화 메시지는 graph-factory.ts에서 이미 출력하므로 여기서는 생략
    // (CLI 직접 호출 등 graph-factory를 거치지 않는 경우에만 출력 필요하나, 중복 방지 우선)

    logger.info('[CodingAgentRunner] Skills injected before execution:', {
      count: injectionResult.injectedSkills.length,
      skillIds: injectionResult.injectedSkills,
      tokens: injectionResult.totalTokens,
    });

    return {
      ...state,
      messages: [...(state.messages || []), ...skillMessages],
    };
  } catch (error) {
    logger.error('[CodingAgentRunner] Skills injection failed at startup:', error);
    return state;
  }
}

function formatApprovalHistoryEntry(
  decision: ToolApprovalDecision<any>,
  toolCalls: Array<{ id?: string }>
): ApprovalHistoryEntry {
  const toolCallIds = toolCalls
    .map((toolCall) => toolCall.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  if (toolCalls.length === 0) {
    return createApprovalHistoryEntry({
      decision: 'approved',
      source: 'system',
      summary: 'no tools -> auto-approved',
      riskLevel: 'low',
      toolCallIds,
    });
  }

  const source =
    decision.status === 'feedback' || decision.status === 'denied' ? 'policy' : 'system';

  return createApprovalHistoryEntry({
    decision: decision.status,
    source,
    summary: sanitizeApprovalNote(decision.note),
    riskLevel: decision.risk.riskLevel,
    toolCallIds,
    metadata: {
      alwaysApproveTools: decision.alwaysApproveTools,
      oneTimeApprove: decision.oneTimeApprove,
    },
  });
}

function getPendingToolCalls(
  state: Pick<CodingAgentState, 'executedToolCallIds'>,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>
) {
  return filterUnexecutedToolCalls(toolCalls, state.executedToolCallIds || []);
}

function buildToolStatusMessage(
  toolCalls: Array<{ name: string; arguments?: unknown }>,
  mode: 'planning' | 'executing'
): string {
  if (!toolCalls || toolCalls.length === 0) {
    return mode === 'planning' ? 'Completed thinking' : 'Executing tools';
  }

  const firstToolCall = toolCalls[0];
  const pathArg = getToolPathFromArguments(firstToolCall.arguments);
  const args =
    firstToolCall.arguments && typeof firstToolCall.arguments === 'object'
      ? (firstToolCall.arguments as Record<string, unknown>)
      : {};
  const commandArg = typeof args.command === 'string' ? args.command : undefined;
  const patternArg = typeof args.pattern === 'string' ? args.pattern : undefined;

  if (firstToolCall.name === 'file_read' && pathArg) {
    return mode === 'planning' ? `Planning to read ${pathArg}` : `Reading ${pathArg}`;
  }
  if (firstToolCall.name === 'file_write' && pathArg) {
    return mode === 'planning' ? `Planning to write to ${pathArg}` : `Writing to ${pathArg}`;
  }
  if (firstToolCall.name === 'file_edit' && pathArg) {
    return mode === 'planning' ? `Planning to edit ${pathArg}` : `Editing ${pathArg}`;
  }
  if (firstToolCall.name === 'command_execute' && commandArg) {
    const cmd = commandArg.substring(0, 50);
    return mode === 'planning'
      ? `Planning to run: ${cmd}${commandArg.length > 50 ? '...' : ''}`
      : `Running: ${cmd}${commandArg.length > 50 ? '...' : ''}`;
  }
  if (firstToolCall.name === 'grep_search' && patternArg) {
    return mode === 'planning'
      ? `Planning to search for: ${patternArg}`
      : `Searching for: ${patternArg}`;
  }
  if (toolCalls.length > 1) {
    return mode === 'planning'
      ? `Planning to use ${toolCalls.length} tools`
      : `Executing ${toolCalls.length} tools`;
  }
  return mode === 'planning'
    ? `Planning to use ${firstToolCall.name}`
    : `Executing ${firstToolCall.name}`;
}

function updateWorkingMemorySnapshot(
  state: CodingAgentState,
  options?: {
    decisionNote?: string;
    toolOutcome?: string;
  }
) {
  return buildWorkingMemory({
    previous: state.workingMemory,
    messages: state.messages || [],
    planSteps: state.planSteps || [],
    currentPlanStep: state.currentPlanStep || 0,
    modifiedFiles: state.modifiedFiles || [],
    deletedFiles: state.deletedFiles || [],
    decisionNote: options?.decisionNote,
    toolOutcome: options?.toolOutcome,
  });
}

function applyWorkspaceDeltaToState(
  state: CodingAgentState,
  baselineSnapshot: Record<string, FileInfo>,
  currentSnapshot: Record<string, FileInfo>
): Partial<CodingAgentState> {
  const delta = detectFileChanges(baselineSnapshot, currentSnapshot);
  return {
    modifiedFiles: [...delta.added, ...delta.modified],
    deletedFiles: delta.deleted,
    fileChangesCount: delta.added.length + delta.modified.length + delta.deleted.length,
  };
}

/**
 * RAG 검색 헬퍼 함수
 */
async function retrieveContextIfEnabled(query: string, conversationId?: string): Promise<string> {
  const config = getCurrentGraphConfig(conversationId);
  if (!config?.enableRAG) {
    return '';
  }

  try {
    // Main Process 전용 로직
    if (typeof window !== 'undefined') {
      return '';
    }

    logger.info('[CodingAgent] RAG enabled, retrieving documents...');
    const { vectorDBService } = await import('../../../../electron/services/vectordb');
    const { databaseService } = await import('../../../../electron/services/database');
    const { initializeEmbedding, getEmbeddingProvider } =
      await import('@/lib/domains/rag/embeddings/client');

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
      logger.info(`[CodingAgent] Found ${results.length} documents`);
      return results.map((doc, i) => `[참고 문서 ${i + 1}]\n${doc.content}`).join('\n\n');
    }
  } catch (error) {
    console.error('[CodingAgent] RAG retrieval failed:', error);
    return '[RAG retrieval failed: context unavailable]';
  }
  return '';
}

/**
 * Shared runtime utilities for coding-agent nodes and stream runner.
 * Keep as module-level singletons so statistics/state persist across turns.
 */
const codingAgentRuntime = {
  toolSelector: new ToolSelector(),
  fileTracker: new FileTracker(),
  codebaseAnalyzer: new CodebaseAnalyzer(),
  contextManager: new ContextManager(100000), // 100k tokens
};

// ===========================
// Node Functions
// ===========================

/**
 * Triage Node: Decide whether to answer directly or run full pipeline
 */
export async function triageNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  const messages = state.messages || [];
  let userPrompt = '';

  // Find last user message
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      userPrompt = messages[i].content;
      break;
    }
  }

  const lowerPrompt = userPrompt.toLowerCase();

  // 1. Fast Path: Check for obvious modification/inspection keywords
  const modificationKeywords = [
    // Action keywords
    'make',
    'create',
    'build',
    'fix',
    'implement',
    'generate',
    'run ',
    'install',
    'edit',
    'update',
    // Inspection/Read keywords
    'test',
    'debug',
    'analyze',
    'review',
    'check',
    'verify',
    'list',
    'ls',
    'dir',
    'show',
    'read',
    'search',
    'find',
    'grep',
    'tree',
    'cat',
    'print',
    'locate',
    // Noun triggers (implies looking at them)
    'file',
    'folder',
    'directory',
    'path',
    'structure',
    'code',
    'error',
    'bug',
    'issue',
    // Korean action cues
    '만들',
    '생성',
    '작성',
    '수정',
    '변경',
    '편집',
    '설치',
    '실행',
    '빌드',
    // Korean Inspection/Read cues
    '테스트',
    '디버그',
    '분석',
    '리뷰',
    '검토',
    '확인',
    '목록',
    '리스트',
    '보여',
    '읽어',
    '검색',
    '찾아',
    '구조',
    '무엇',
    '뭐야',
    '어때',
    // Korean Noun triggers
    '파일',
    '폴더',
    '디렉터리',
    '디렉토리',
    '경로',
    '에러',
    '오류',
    '버그',
    '이슈',
    '코드',
  ];

  const hasComplexKeyword = modificationKeywords.some((k) => lowerPrompt.includes(k));
  const hasFileParams =
    userPrompt.includes('@') || /[a-zA-Z0-9_\-.]+\.(ts|js|py|html|css|json|md)/.test(userPrompt);

  if (hasComplexKeyword || hasFileParams) {
    logger.info(`[Triage] Fast path: Detected complex task via keywords`);
    return {
      triageDecision: 'graph',
      triageReason: 'Detected technical keywords or file references',
    };
  }

  // 2. LLM Classification: For ambiguous cases, ask the LLM
  try {
    const classificationMsg: Message = {
      id: 'triage-system',
      role: 'system',
      content:
        'You are a Triage Expert for a Coding Assistant.\n' +
        'Determine if the user request requires accessing the codebase, tools, or specific project context.\n\n' +
        'Respond with "COMPLEX" if:\n' +
        '- Requires reading/writing files or listing directories\n' +
        '- Requires searching the codebase or answering about project structure\n' +
        '- Requires running commands or using any tools\n' +
        '- Asks specific questions about the code (e.g. "what is in X?")\n\n' +
        'Respond with "SIMPLE" ONLY if:\n' +
        '- Pure greeting (Hi, Hello, How are you)\n' +
        '- General unrelated programming question (e.g. "What is a Variable?")\n' +
        '- Question about YOUR identity\n\n' +
        'Output ONE word: COMPLEX or SIMPLE.',
      created_at: Date.now(),
    };

    const userMsg: Message = {
      id: 'triage-user',
      role: 'user',
      content: userPrompt,
      created_at: Date.now(),
    };

    logger.info('[Triage] Calling LLM for classification...');
    const response = await LLMService.chat([classificationMsg, userMsg], {
      temperature: 0.1, // Deterministic
      maxTokens: 10,
    });

    const classification = response.content?.trim().toUpperCase();
    logger.info(`[Triage] LLM Classification: ${classification}`);

    if (classification?.includes('SIMPLE')) {
      return {
        triageDecision: 'direct_response',
        triageReason: 'LLM classified as general/simple query',
      };
    } else {
      return {
        triageDecision: 'graph',
        triageReason: 'LLM classified as complex/context-dependent',
      };
    }
  } catch (error) {
    logger.warn('[Triage] Classification failed, falling back to graph:', error);
    // Safety fallback: if in doubt, use the capable graph
    return {
      triageDecision: 'graph',
      triageReason: 'Triage fallback strategy',
    };
  }
}

/**
 * Direct Response Node: Answer without tools
 */
export async function directResponseNode(
  state: CodingAgentState
): Promise<Partial<CodingAgentState>> {
  logger.info('[DirectResponse] Generating direct response');

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
export async function planningNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  // Skip if plan already exists
  if (state.planCreated) {
    logger.info('[Planning] Plan already exists, skipping');
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

  logger.info('[Planning] Creating execution plan');

  /* Selection Awareness Logic */
  let selectionContext = '';
  if (state.activeFileSelection && state.activeFileSelection.text) {
    selectionContext = `
**CRITICAL: SELECTED TEXT DETECTED**
The user has selected text in the active editor.
- Text preview: "${state.activeFileSelection.text.substring(0, 50)}..."
- Range: Line ${state.activeFileSelection.range?.startLineNumber}-${state.activeFileSelection.range?.endLineNumber}

**PLANNING RULE FOR SELECTION:**
1. The user request usually applies ONLY to the selected text.
2. DO NOT plan \`file_read\`. The selected text is ALREADY provided to the execution agent.
3. Plan to \`replace_selection\` directly.
4. Your plan should be short (2-3 steps):
   - Step 1: Analyze the selected text and user request.
   - Step 2: Apply changes using \`replace_selection\`.
   - Step 3: Verify the change.
`;
  }

  const planningSystemMessage: Message = {
    id: 'system-plan',
    role: 'system',
    content:
      `You are SE Pilot, analyzing the user's request to create an execution plan.\n\n${
        selectionContext
      }CRITICAL: Determine the task type first:\n\n` +
      `READ-ONLY tasks (정보 요청):\n` +
      `- Keywords: 요약, 설명, 분석, 리뷰, 검토, 확인, 보기\n` +
      `- Action: Plan to READ files and RESPOND with analysis\n\n` +
      `MODIFICATION tasks (작업 요청):\n` +
      `- Keywords: 생성, 만들기, 작성, 수정, 편집, 변경, 실행\n` +
      `- Action: Plan to EXECUTE changes using tools\n\n` +
      `Create a focused execution plan (3-7 steps).${
        selectionContext ? ' (or 2-3 steps for Selection tasks)' : ''
      }`,
    created_at: Date.now(),
  };

  // Inject available tool names so planner doesn't hallucinate non-existent tools
  const builtinTools = getBuiltinTools();
  const mcpTools = MCPServerManager.getAllToolsInMainProcess();
  const graphConfig = getCurrentGraphConfig(state.conversationId);
  const enabledToolNames = new Set(graphConfig?.enabledTools || []);
  const hasToolAllowlist = enabledToolNames.size > 0;
  const availableTools = hasToolAllowlist
    ? [...builtinTools, ...mcpTools].filter((tool) => enabledToolNames.has(tool.name))
    : [...builtinTools, ...mcpTools];
  const toolSummaryList = availableTools
    .map((t) => `- ${t.name}: ${t.description || 'No description'}`)
    .join('\n');

  planningSystemMessage.content +=
    `\n\n## AVAILABLE TOOLS\n` +
    `You can ONLY use the following tools in your plan. Do NOT reference tools that are not in this list:\n${toolSummaryList}` +
    `\n\n## BINARY FILE FORMAT RULE\n` +
    `CRITICAL: \`file_write\` can ONLY write plain text content. It CANNOT create binary files.\n` +
    `For binary/office formats (.pptx, .xlsx, .docx, .pdf, .png, .zip, etc.), you MUST:\n` +
    `1. Write a Python/Node.js script using \`file_write\` (e.g., create_presentation.py using python-pptx)\n` +
    `2. Install required libraries using \`command_execute\` (e.g., pip install python-pptx)\n` +
    `3. Execute the script using \`command_execute\` (e.g., python create_presentation.py)\n` +
    `NEVER write plain text to a binary file extension. ALWAYS generate and execute a script.\n\n` +
    `## PPTX DESIGN GUIDELINES (python-pptx)\n` +
    `When generating PPTX files, create **professionally designed** presentations:\n\n` +
    `### Layout & Structure\n` +
    `- Use VARIED slide layouts: title slide, section header, two-column, comparison, data-focused\n` +
    `- Do NOT repeat the same layout for every content slide — alternate between designs\n` +
    `- Title slide: large centered title with subtitle, accent color strip or shape\n` +
    `- Ending slide: "Thank you" or summary with contact info\n\n` +
    `### Visual Hierarchy\n` +
    `- Title: 28-36pt bold, dark color (e.g., #1B3A5C)\n` +
    `- Subtitle/section: 20-24pt, accent color\n` +
    `- Body text: 14-18pt, dark gray (#2D2D2D)\n` +
    `- Key metrics/numbers: 36-48pt bold in accent color — make data POP\n\n` +
    `### Color Scheme\n` +
    `- Primary: deep navy (#1B3A5C) for titles and headers\n` +
    `- Accent: bright blue (#2E86C1) for highlights, key numbers\n` +
    `- Secondary accent: coral (#E74C3C) or teal (#1ABC9C) for emphasis\n` +
    `- Background: white (#FFFFFF) or very light gray (#F8F9FA)\n` +
    `- Use colored accent bars/strips (thin rectangles) at top or bottom of slides\n\n` +
    `### Data Visualization\n` +
    `- For data with 3+ items: use python-pptx TABLE (Tbl) with styled header row\n` +
    `- For comparisons: use side-by-side columns with colored boxes\n` +
    `- For statistics: create LARGE NUMBER callouts (48pt+ bold accent color) with small description below\n` +
    `- For timelines: use horizontal shapes with arrows/connectors\n\n` +
    `### Visual Elements (REQUIRED for quality)\n` +
    `- Add colored rectangle shapes as accent bars (Inches(0, 0, 10, 0.05) at top with accent color)\n` +
    `- Use rounded rectangle shapes as content cards with light fill + border\n` +
    `- Create icon-like shapes using simple geometric shapes (circles, rectangles)\n` +
    `- Add separator lines between sections\n` +
    `- Use gradient fills on title/section slides: from primary to slightly lighter\n\n` +
    `### Tables (python-pptx)\n` +
    `\`\`\`python\n` +
    `from pptx.util import Inches, Pt, Emu\n` +
    `from pptx.dml.color import RGBColor\n` +
    `from pptx.enum.text import PP_ALIGN\n` +
    `# Create table\n` +
    `rows, cols = 5, 4\n` +
    `table_shape = slide.shapes.add_table(rows, cols, Inches(0.8), Inches(2), Inches(8.4), Inches(3.5))\n` +
    `table = table_shape.table\n` +
    `# Style header row\n` +
    `for cell in table.rows[0].cells:\n` +
    `    cell.fill.solid()\n` +
    `    cell.fill.fore_color.rgb = RGBColor(0x1B, 0x3A, 0x5C)\n` +
    `    for p in cell.text_frame.paragraphs:\n` +
    `        p.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)\n` +
    `        p.font.bold = True\n` +
    `        p.font.size = Pt(12)\n` +
    `# Alternate row colors\n` +
    `for i, row in enumerate(table.rows[1:], 1):\n` +
    `    for cell in row.cells:\n` +
    `        cell.fill.solid()\n` +
    `        cell.fill.fore_color.rgb = RGBColor(0xF8, 0xF9, 0xFA) if i % 2 == 0 else RGBColor(0xFF, 0xFF, 0xFF)\n` +
    `\`\`\`\n\n` +
    `### Key Number Callout Pattern\n` +
    `\`\`\`python\n` +
    `# Large number + small label pattern\n` +
    `num_box = slide.shapes.add_textbox(left, top, Inches(2.5), Inches(1.2))\n` +
    `tf = num_box.text_frame\n` +
    `tf.word_wrap = True\n` +
    `p = tf.paragraphs[0]\n` +
    `p.text = "32.7%"\n` +
    `p.font.size = Pt(44)\n` +
    `p.font.bold = True\n` +
    `p.font.color.rgb = RGBColor(0x2E, 0x86, 0xC1)\n` +
    `p.alignment = PP_ALIGN.CENTER\n` +
    `p2 = tf.add_paragraph()\n` +
    `p2.text = "연평균 성장률 (CAGR)"\n` +
    `p2.font.size = Pt(12)\n` +
    `p2.font.color.rgb = RGBColor(0x7F, 0x8C, 0x8D)\n` +
    `p2.alignment = PP_ALIGN.CENTER\n` +
    `\`\`\``;

  // Extract skill system messages already injected into state.messages
  const skillMessages = (state.messages || []).filter(
    (m) => m.role === 'system' && typeof m.id === 'string' && m.id.startsWith('system-skill-')
  );
  if (skillMessages.length > 0) {
    const skillContext = skillMessages.map((m) => m.content).join('\n\n---\n\n');
    const truncated =
      skillContext.length > 2000
        ? `${skillContext.substring(0, 2000)}\n\n[... truncated for planning context]`
        : skillContext;
    planningSystemMessage.content +=
      `\n\n## SKILL GUIDELINES\n` +
      `The following skill guidelines are active. Your plan MUST follow these instructions:\n\n${
        truncated
      }`;
  }

  const planningPromptMessage: Message = {
    id: 'planning-prompt',
    role: 'user',
    content:
      `User request: \n${userPrompt} \n\n` +
      'Create an actionable execution plan:\n\n' +
      '1. First line: [READ-ONLY] or [MODIFICATION]\n' +
      '2. List numbered steps',
    created_at: Date.now(),
  };

  let planContent = '';

  try {
    for await (const chunk of LLMService.streamChat([
      planningSystemMessage,
      planningPromptMessage,
    ])) {
      planContent += chunk;
      // Send planning output to renderer (filter internal tags)
      const cleanedChunk = chunk
        .replace(/^\[MODIFICATION\]\s*/g, '')
        .replace(/^\[READ-ONLY\]\s*/g, '');
      if (cleanedChunk) {
        emitStreamingChunk(cleanedChunk, state.conversationId);
      }
    }

    const planResponse: Message = {
      id: `plan - ${Date.now()} `,
      role: 'assistant',
      content: planContent,
      created_at: Date.now(),
    };

    const executionInstruction: Message = {
      id: `exec - ${Date.now()} `,
      role: 'user',
      content: `위 계획을 참고하여 '${userPrompt}' 작업을 수행하세요.`,
      created_at: Date.now(),
    };

    // Parse plan steps
    const planSteps = parsePlanSteps(planContent);
    const requiredFiles = extractRequiredFiles(userPrompt);

    // Use CodebaseAnalyzer to recommend relevant files
    const workspacePath = getWorkspacePath(state);
    let recommendedFiles: string[] = [];
    try {
      const structure = await codingAgentRuntime.codebaseAnalyzer.analyzeStructure(
        workspacePath,
        3 // Max depth 3 for performance
      );
      recommendedFiles = codingAgentRuntime.codebaseAnalyzer.recommendFiles(
        userPrompt,
        structure,
        5 // Top 5 recommendations
      );
      if (recommendedFiles.length > 0) {
        logger.info(`[Planning] Recommended files: `, recommendedFiles);
      }
    } catch (error) {
      console.warn('[Planning] Failed to analyze codebase:', error);
    }

    // Combine manually extracted files with recommended files
    const allRequiredFiles = [...new Set([...requiredFiles, ...recommendedFiles])];

    logger.info(`[Planning] Plan created with ${planSteps.length} steps`);

    return {
      messages: [planResponse, executionInstruction],
      planningNotes: [planContent],
      planCreated: true,
      planSteps,
      currentPlanStep: 0,
      requiredFiles: allRequiredFiles.length > 0 ? allRequiredFiles : undefined,
    };
  } catch (error: any) {
    console.error('[Planning] Error:', error);
    return {
      planningNotes: [`Planning failed: ${error.message} `],
    };
  }
}

/**
 * Iteration Guard Node: Control iteration count and enforce limits
 */
export async function iterationGuardNode(
  state: CodingAgentState
): Promise<Partial<CodingAgentState>> {
  const iteration = state.iterationCount || 0;
  const maxIter = state.maxIterations || 10;

  logger.info(`[IterationGuard] Iteration ${iteration + 1}/${maxIter}`);

  // Check if limit reached
  if (iteration >= maxIter) {
    logger.info('[IterationGuard] Max iterations reached, forcing termination');
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
export async function agentNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  logger.info('[CodingAgent.Agent] Calling LLM with Tools');

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
      ragContext = await retrieveContextIfEnabled(lastUserMessage.content, state.conversationId);
      if (ragContext) {
        if (ragContext.startsWith('[RAG retrieval failed')) {
          emitStreamingChunk(
            '\n⚠️ RAG 컨텍스트를 불러오지 못했습니다. 자체 지식으로 진행합니다.\n\n',
            state.conversationId
          );
        }
        emitStreamingChunk(
          `\n📚 **관련 문서 ${ragContext.split('[참고 문서').length - 1}개를 참조합니다.**\n\n`,
          state.conversationId
        );
      }
    }
  } catch (e) {
    console.error('[CodingAgent.Agent] RAG error:', e);
    emitStreamingChunk(
      '\n⚠️ RAG 컨텍스트 조회 중 오류가 발생했습니다. 자체 지식으로 진행합니다.\n\n',
      state.conversationId
    );
  }

  // Debug: Log message count and sizes
  logger.info('[CodingAgent.Agent] Message summary:', {
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

  logger.info('[CodingAgent.Agent] Filtered messages:', {
    original: messages.length,
    filtered: filteredMessages.length,
    removed: messages.length - filteredMessages.length,
  });

  // Get Built-in tools
  const builtinTools = getBuiltinTools();
  const mcpTools = MCPServerManager.getAllToolsInMainProcess();
  const graphConfig = getCurrentGraphConfig(state.conversationId);
  const enabledToolNames = new Set(graphConfig?.enabledTools || []);
  const hasToolAllowlist = enabledToolNames.size > 0;
  const allTools = hasToolAllowlist
    ? [...builtinTools, ...mcpTools].filter((tool) => enabledToolNames.has(tool.name))
    : [...builtinTools, ...mcpTools];

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

  logger.info(
    `[CodingAgent.Agent] Available tools: ${builtinTools.length} builtin + ${mcpTools.length} MCP`
  );
  if (hasToolAllowlist) {
    logger.info('[CodingAgent.Agent] Applied enabledTools allowlist:', {
      requested: graphConfig?.enabledTools,
      remaining: allTools.map((tool) => tool.name),
    });
  }
  logger.info(
    '[CodingAgent.Agent] Tool details:',
    allTools.map((t) => t.name)
  );

  // Add system prompts (verified best practices from Cursor/Cline/Claude Code)
  // Ensure workingDirectory is passed to ground the agent
  const codingSystemMsg: Message = {
    id: 'system-coding',
    role: 'system',
    content: getCodingAgentSystemPrompt(state.workingDirectory),
    created_at: Date.now(),
  };

  const executionSpecialistMsg: Message = {
    id: 'system-exec',
    role: 'system',
    content: getExecutionSpecialistPrompt(),
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

  // Skills are injected once at GraphFactory/BaseGraph entry points.

  // Add selection awareness
  if (state.activeFileSelection && state.activeFileSelection.text) {
    messagesWithContext.push({
      id: 'system-selection',
      role: 'system',
      content: `**CRITICAL: SELECTED TEXT DETECTED**
The user has selected the following text (Line ${state.activeFileSelection.range?.startLineNumber}-${state.activeFileSelection.range?.endLineNumber}):
\`\`\`
${state.activeFileSelection.text}
\`\`\`

**INSTRUCTIONS:**
1. The user LIKELY wants you to modify ONLY this selected text.
2. You MUST prioritize using the \`replace_selection(text="...")\` tool to update this text directly in the editor.
3. DO NOT use \`file_edit\` or \`file_write\` unless you are certain the user wants to change files on disk that might mismatch the editor state.
4. If you use \`replace_selection\`, simply provide the new text that should replace the selection.`,
      created_at: Date.now(),
    });
  }

  // Add plan step awareness if plan exists
  if (state.planSteps && state.planSteps.length > 0) {
    const currentStep = state.currentPlanStep || 0;
    if (currentStep < state.planSteps.length) {
      const stepMessage: Message = {
        id: `step-${Date.now()}`,
        role: 'system',
        content: getPlanStepPrompt(
          currentStep,
          state.planSteps.length,
          state.planSteps[currentStep]
        ),
        created_at: Date.now(),
      };
      messagesWithContext.push(stepMessage);
    }
  }

  // Use ContextManager for intelligent context management
  const optimizedMessages = codingAgentRuntime.contextManager.getOptimizedContext(
    filteredMessages,
    messagesWithContext
  );

  // Log token statistics
  const tokenStats = codingAgentRuntime.contextManager.getTokenStats(optimizedMessages);
  logger.info('[CodingAgent.Agent] Token usage:', {
    total: tokenStats.totalTokens,
    utilization: `${tokenStats.utilization}%`,
    remaining: tokenStats.remaining,
  });

  // Replace messages with optimized set (system messages already included)
  messagesWithContext.length = 0;
  messagesWithContext.push(...optimizedMessages);

  try {
    // Call LLM with tools (streaming)
    let accumulatedContent = '';
    let finalToolCalls: any[] | undefined = undefined;

    logger.info('[CodingAgent.Agent] Starting streaming with tools...');

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
        logger.info('[CodingAgent.Agent] Received tool calls:', finalToolCalls);
      }
    }

    logger.info(
      '[CodingAgent.Agent] Streaming complete. Content length:',
      accumulatedContent.length
    );

    // Parse tool calls
    const allowedToolNamesForLLM = new Set(toolsForLLM.map((tool) => tool.function.name));
    const toolCalls = finalToolCalls
      ?.filter((tc: any) => {
        const toolName = tc?.function?.name;
        const allowed = typeof toolName === 'string' && allowedToolNamesForLLM.has(toolName);
        if (!allowed) {
          logger.warn('[CodingAgent.Agent] Ignoring tool call not in allowed tool list:', {
            toolName,
          });
        }
        return allowed;
      })
      .map((tc: any, index: number) => {
        const toolCallId = tc.id || `call_${Date.now()}_${index}`;
        let parsedArgs: any;
        try {
          parsedArgs =
            typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments || {};
        } catch (err) {
          console.warn('[CodingAgent.Agent] Failed to parse tool args, using raw value', err);
          parsedArgs = tc.function.arguments || {};
        }
        logger.info('[CodingAgent.Agent] Tool call:', {
          id: toolCallId,
          name: tc.function.name,
          arguments: parsedArgs,
        });

        return {
          id: toolCallId,
          name: tc.function.name,
          arguments: parsedArgs,
        };
      });

    const assistantMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: accumulatedContent || '',
      created_at: Date.now(),
      tool_calls: toolCalls,
    };

    logger.info('[CodingAgent.Agent] Assistant message created:', {
      hasContent: !!assistantMessage.content,
      hasToolCalls: !!assistantMessage.tool_calls,
      toolCallsCount: assistantMessage.tool_calls?.length,
    });

    return {
      messages: [assistantMessage],
    };
  } catch (error: any) {
    console.error('[CodingAgent.Agent] Error:', error);

    const errorContent = `\n\n❌ **LLM 호출 오류**: ${error.message}\n\n도구 호출과 함께 LLM API 요청이 실패했습니다. 가능한 원인:\n- 사용 중인 모델이 **Tool Calling (Function Calling)을 지원하지 않을 수** 있습니다\n- **max_tokens** 설정이 너무 낮아 도구 호출 응답을 생성할 수 없습니다\n- LLM 서버 연결 오류 또는 API 키 문제\n\n💡 **해결 방법**: Settings > LLM에서 Tool Calling을 지원하는 모델(GPT-4o, Claude, Gemini 등)을 선택하거나 max_tokens를 늘려주세요.\n`;

    // Stream error message to user so it's visible in the chat
    emitStreamingChunk(errorContent, state.conversationId);

    const errorMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: errorContent,
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
export async function approvalNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  const toolCalls = getPendingToolCalls(state, lastMessage?.tool_calls || []);
  const decision = resolveToolApprovalDecision(toolCalls, {
    alwaysApproveTools: state.alwaysApproveTools,
    userText: getLastUserText(state),
    inputTrustLevel: getInputTrustLevelForState(state),
    workingDirectory: state.workingDirectory,
  });
  const userFacingNote = sanitizeApprovalNote(decision.note);
  const historyEntry = formatApprovalHistoryEntry(decision, toolCalls);

  if (decision.status === 'denied') {
    const warning = `\n\n⚠️ ${userFacingNote}\n\n`;
    emitStreamingChunk(warning, state.conversationId);
    logger.warn('[Approval] Blocking dangerous tool execution');
    return {
      lastApprovalStatus: 'denied',
      alwaysApproveTools: decision.alwaysApproveTools,
      approvalHistory: [...(state.approvalHistory || []), historyEntry],
      messages: [
        {
          id: `approval-${Date.now()}`,
          role: 'assistant',
          content: warning,
          created_at: Date.now(),
        },
      ],
    };
  }

  if (decision.status === 'feedback') {
    const note = `\n\n⚠️ ${userFacingNote}\n\n`;
    emitStreamingChunk(note, state.conversationId);
    logger.info('[Approval] Explicit approval required for risky tools');
    return {
      lastApprovalStatus: 'feedback',
      alwaysApproveTools: decision.alwaysApproveTools,
      approvalHistory: [...(state.approvalHistory || []), historyEntry],
      messages: [
        {
          id: `approval-${Date.now()}`,
          role: 'assistant',
          content: note,
          created_at: Date.now(),
        },
      ],
    };
  }

  logger.info(`[Approval] Auto-approving ${toolCalls.length} tool(s)`);

  return {
    lastApprovalStatus: 'approved',
    alwaysApproveTools: decision.alwaysApproveTools,
    approvalHistory: [...(state.approvalHistory || []), historyEntry],
  };
}

/**
 * Enhanced Tools Node: Execute tools with file change tracking
 * Handles Built-in tools (file operations) directly, delegates MCP tools to toolsNode
 */
export async function enhancedToolsNode(
  state: CodingAgentState
): Promise<Partial<CodingAgentState>> {
  logger.info('[CodingAgent.Tools] Executing tools with file tracking');

  const lastMessage = state.messages[state.messages.length - 1];
  if (!lastMessage.tool_calls || lastMessage.tool_calls.length === 0) {
    return {};
  }
  const pendingToolCalls = getPendingToolCalls(state, lastMessage.tool_calls);
  if (pendingToolCalls.length === 0) {
    logger.info('[CodingAgent.Tools] Skipping already-executed tool calls');
    return {
      executedToolCallIds: state.executedToolCallIds || [],
    };
  }

  // Get file snapshot before tool execution
  const workspacePath = getWorkspacePath(state);
  const filesBefore = await getWorkspaceFiles(workspacePath);

  // Get Built-in tools
  const builtinTools = getBuiltinTools();
  const builtinToolNames = new Set(builtinTools.map((t) => t.name));

  logger.info(
    '[CodingAgent.Tools] Tool calls:',
    pendingToolCalls.map((c) => c.name)
  );
  logger.info('[CodingAgent.Tools] Built-in tools available:', Array.from(builtinToolNames));

  // Check for redundant calls and optimization opportunities
  const redundancyCheck = codingAgentRuntime.toolSelector.detectRedundantCalls(pendingToolCalls);
  if (redundancyCheck.isRedundant) {
    console.warn(
      '[CodingAgent.Tools] Redundant tool calls detected:',
      redundancyCheck.redundantCalls.length
    );
    emitStreamingChunk(`\n\n⚠️ ${redundancyCheck.suggestion}\n\n`, state.conversationId);
  }

  const optimizationSuggestions =
    codingAgentRuntime.toolSelector.suggestOptimization(pendingToolCalls);
  if (optimizationSuggestions.length > 0) {
    logger.info('[CodingAgent.Tools] Optimization suggestions:', optimizationSuggestions);
    for (const suggestion of optimizationSuggestions) {
      emitStreamingChunk(`\n\n${suggestion}\n\n`, state.conversationId);
    }
  }

  // Execute tools
  type ToolExecutionResult = {
    toolCallId: string;
    toolName: string;
    result: string | null;
    error?: string;
  };

  // Log tool execution start (Detailed)
  if (pendingToolCalls.length > 0) {
    const currentIter = (state.iterationCount || 0) + 1;
    const maxIter = state.maxIterations || 10;
    let logMessage = `\n\n---\n🔄 **Iteration ${currentIter}/${maxIter}**\n`;

    for (const toolCall of pendingToolCalls) {
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

  const executeToolCall = async (call: any): Promise<ToolExecutionResult> => {
    const startTime = Date.now();

    try {
      const graphConfig = getCurrentGraphConfig(state.conversationId);
      const enabledToolNames = new Set(graphConfig?.enabledTools || []);
      if (enabledToolNames.size > 0 && !enabledToolNames.has(call.name)) {
        logger.warn(`[CodingAgent.Tools] Blocked disabled tool call: ${call.name}`);
        return {
          toolCallId: call.id,
          toolName: call.name,
          result: null,
          error: `Tool '${call.name}' is disabled for this conversation`,
        };
      }

      // Track file before modification (for file write/edit operations)
      let beforeSnapshot = null;
      const isFileModifyOp = call.name === 'file_write' || call.name === 'file_edit';
      const targetPath = isFileModifyOp ? getToolPathFromArguments(call.arguments) : null;
      if (isFileModifyOp && targetPath) {
        beforeSnapshot = await codingAgentRuntime.fileTracker.trackBeforeModify(targetPath);
      }

      // Check if it's a built-in tool
      if (builtinToolNames.has(call.name)) {
        logger.info(`[CodingAgent.Tools] Executing builtin tool: ${call.name}`);

        // Execute with retry and timeout
        const TOOL_EXECUTION_TIMEOUT = 360000; // 6 minutes
        const retryResult = await ErrorRecovery.withTimeoutAndRetry(
          () => executeBuiltinTool(call.name, call.arguments, state.conversationId),
          TOOL_EXECUTION_TIMEOUT,
          { maxRetries: 2, initialDelayMs: 2000 }, // Retry twice with 2s initial delay
          `builtin tool '${call.name}'`
        );

        if (!retryResult.success) {
          throw retryResult.error;
        }

        const result = retryResult.result!;
        const duration = retryResult.totalDurationMs;

        // Record tool usage in ToolSelector
        codingAgentRuntime.toolSelector.recordUsage(call.name, true, duration);

        // Track file after modification
        if (isFileModifyOp && targetPath) {
          await codingAgentRuntime.fileTracker.trackAfterModify(targetPath, beforeSnapshot);
        }

        // Save activity to database (non-blocking)
        if (state.conversationId && typeof window !== 'undefined' && window.electronAPI?.activity) {
          const activity: Activity = {
            id: randomUUID(),
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
      }

      // Try to execute as MCP tool
      logger.info(`[CodingAgent.Tools] Checking MCP tools for: ${call.name}`);

      const mcpTools = MCPServerManager.getAllToolsInMainProcess();
      const targetTool = mcpTools.find((t) => t.name === call.name);

      if (targetTool) {
        logger.info(
          `[CodingAgent.Tools] Executing MCP tool: ${call.name} on server ${targetTool.serverName}`
        );

        // Execute with retry and timeout
        const TOOL_EXECUTION_TIMEOUT = 360000; // 6 minutes
        const retryResult = await ErrorRecovery.withTimeoutAndRetry(
          () =>
            MCPServerManager.callToolInMainProcess(
              targetTool.serverName,
              call.name,
              call.arguments
            ),
          TOOL_EXECUTION_TIMEOUT,
          { maxRetries: 2, initialDelayMs: 2000 },
          `MCP tool '${call.name}'`
        );

        if (!retryResult.success) {
          throw retryResult.error;
        }

        const mcpResult = retryResult.result!;

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

        const duration = retryResult.totalDurationMs;

        // Record tool usage in ToolSelector
        codingAgentRuntime.toolSelector.recordUsage(call.name, true, duration);

        // Save activity
        if (state.conversationId && typeof window !== 'undefined' && window.electronAPI?.activity) {
          const activity: Activity = {
            id: randomUUID(),
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
      if (state.conversationId && typeof window !== 'undefined' && window.electronAPI?.activity) {
        const activity: Activity = {
          id: randomUUID(),
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
    } catch (error: any) {
      console.error(`[CodingAgent.Tools] Error executing ${call.name}:`, error);
      const duration = Date.now() - startTime;

      // Record tool failure in ToolSelector
      codingAgentRuntime.toolSelector.recordUsage(call.name, false, duration, error.message);

      // Format error message with recovery suggestion
      const formattedError = ErrorRecovery.formatErrorMessage(error, 1);
      const suggestion = ErrorRecovery.getRecoverySuggestion(error);
      const errorMsg = `${formattedError}\n\n${suggestion}`;

      // Save error activity
      if (state.conversationId && typeof window !== 'undefined' && window.electronAPI?.activity) {
        const activity: Activity = {
          id: randomUUID(),
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
  };

  const results: ToolExecutionResult[] = [];
  for (const call of pendingToolCalls) {
    const result = await executeToolCall(call);
    results.push(result);
  }

  // Log tool execution end (Detailed)
  if (results.length > 0) {
    let logMessage = `\n<small>\n`;

    for (const result of results) {
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

  // Create rollback point after successful file modifications
  const hasFileModifications = results.some(
    (r) => !r.error && (r.toolName === 'file_write' || r.toolName === 'file_edit')
  );
  if (hasFileModifications) {
    const currentIter = (state.iterationCount || 0) + 1;
    codingAgentRuntime.fileTracker.createRollbackPoint(`After iteration ${currentIter}`);
  }

  // Get file snapshot after tool execution
  const filesAfter = await getWorkspaceFiles(workspacePath);
  const fileChanges = detectFileChanges(filesBefore, filesAfter);

  // Convert tool results to messages (OpenAI compatible format)
  const toolMessages: Message[] = results.map((result) => {
    let content: string;

    if (result.error) {
      content = `Error: ${result.error}`;
    } else if (result.result !== null && result.result !== undefined) {
      content = typeof result.result === 'string' ? result.result : JSON.stringify(result.result);
    } else {
      content = 'No result';
    }

    logger.info('[CodingAgent.Tools] Creating tool result message:', {
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
    messages: toolMessages, // Append only new tool messages (reducers/runner handle merge)
    executedToolCallIds: mergeExecutedToolCallIds(
      state.executedToolCallIds || [],
      results.map((result) => result.toolCallId)
    ),
  };

  // Track file changes if any
  if (fileChanges.added.length > 0 || fileChanges.modified.length > 0) {
    const totalChanges = fileChanges.added.length + fileChanges.modified.length;
    updates.fileChangesCount = totalChanges + fileChanges.deleted.length;
    updates.modifiedFiles = [...fileChanges.added, ...fileChanges.modified];
    if (fileChanges.deleted.length > 0) {
      updates.deletedFiles = fileChanges.deleted;
    }

    logger.info(`[CodingAgent.Tools] File changes detected: ${totalChanges} files`);
  }

  return updates;
}

/**
 * Verification Node: Validate execution results with automated checks
 */
export async function verificationNode(
  state: CodingAgentState
): Promise<Partial<CodingAgentState>> {
  logger.info('[Verification] Validating execution results');

  const planSteps = state.planSteps || [];
  const currentStep = state.currentPlanStep || 0;
  const toolResults = state.toolResults || [];

  const finalizeVerificationState = (
    partial: Partial<CodingAgentState>,
    options?: {
      verificationStatus?: 'not_run' | 'passed' | 'failed';
      failedChecks?: string[];
      decisionNote?: string;
    }
  ): Partial<CodingAgentState> => {
    const verificationStatus = options?.verificationStatus || 'not_run';
    const failedChecks = options?.failedChecks || [];
    const modifiedFiles = partial.modifiedFiles || state.modifiedFiles || [];
    const deletedFiles = partial.deletedFiles || state.deletedFiles || [];
    const nextPlanStep =
      typeof partial.currentPlanStep === 'number' ? partial.currentPlanStep : currentStep;

    const completionChecklist = buildCompletionChecklist({
      taskSummary: getLastUserText(state),
      requiredFiles: state.requiredFiles || [],
      modifiedFiles,
      planSteps,
      currentPlanStep: nextPlanStep,
      verificationStatus,
      verificationFailedChecks: failedChecks,
      hadExecutionError:
        Boolean(state.agentError && state.agentError.length > 0) ||
        (state.toolResults || []).some((toolResult) => Boolean(toolResult.error)),
    });

    const workingMemory = buildWorkingMemory({
      previous: state.workingMemory,
      messages: state.messages || [],
      planSteps,
      currentPlanStep: nextPlanStep,
      modifiedFiles,
      deletedFiles,
      decisionNote: options?.decisionNote,
    });

    return {
      ...partial,
      verificationStatus,
      verificationFailedChecks: failedChecks,
      completionChecklist,
      workingMemory,
    };
  };

  // ── [DISCUSS] step check FIRST ──
  // Must run before all other checks (planCreated, verification pipeline, required files)
  // because [DISCUSS] steps deliberately produce no tool calls and should immediately
  // pause for user input. Without this early check, the "plan created but not executed"
  // guard at L1780+ fires first and prevents the [DISCUSS] detection from ever running.
  if (planSteps.length > 0 && currentStep < planSteps.length) {
    const currentStepTag = getPlanStepTag(planSteps[currentStep]);

    if (currentStepTag === 'DISCUSS') {
      logger.info(
        `[Verification] DISCUSS step detected (early check) at ${currentStep + 1}/${planSteps.length}, awaiting user input`
      );

      emitStreamingChunk(
        `\n\n📋 **Step ${currentStep + 1}/${planSteps.length} 완료** ✅\n` +
          `💬 사용자 확인이 필요합니다.\n\n`,
        state.conversationId
      );

      return finalizeVerificationState(
        {
          currentPlanStep: currentStep + 1,
          awaitingDiscussInput: true,
          needsAdditionalIteration: false, // 자동 진행 차단
        },
        {
          verificationStatus: 'passed',
          decisionNote: 'Discuss step: awaiting user input',
        }
      );
    }
  }

  // Check if plan was created but not executed
  if (state.planCreated && toolResults.length === 0) {
    logger.info('[Verification] Plan created but no tools executed yet');

    const reminderMessage: Message = {
      id: `reminder-${Date.now()}`,
      role: 'user',
      content: '계획이 준비되었습니다. 이제 도구를 사용하여 실제 작업을 수행하세요.',
      created_at: Date.now(),
    };

    return finalizeVerificationState(
      {
        messages: [reminderMessage],
        verificationNotes: ['⚠️ Plan ready, awaiting execution'],
        needsAdditionalIteration: true,
      },
      {
        verificationStatus: 'not_run',
        decisionNote: 'Plan exists but no tool execution yet',
      }
    );
  }

  // Run automated verification pipeline if files were modified
  if (state.modifiedFiles && state.modifiedFiles.length > 0) {
    logger.info('[Verification] Running automated verification pipeline...');
    const pipeline = new VerificationPipeline();

    try {
      const verificationResult = await pipeline.verify(state);

      if (!verificationResult.allPassed) {
        logger.info('[Verification] Verification failed:', verificationResult);

        const failedChecks = verificationResult.checks.filter((c) => !c.passed);
        const failureMessage: Message = {
          id: `verification-${Date.now()}`,
          role: 'user',
          content: `⚠️ 코드 검증 실패:
${failedChecks
  .map(
    (c) => `- ${c.message}${c.command ? ` [${c.command}]` : ''}: ${c.details?.substring(0, 200)}`
  )
  .join('\n')}

${verificationResult.suggestions.join('\n')}

위 문제를 수정한 후 계속 진행하세요.`,
          created_at: Date.now(),
        };

        return finalizeVerificationState(
          {
            messages: [failureMessage],
            verificationNotes: failedChecks.map(
              (c) => `❌ ${c.name}: ${c.message}${c.command ? ` (${c.command})` : ''}`
            ),
            needsAdditionalIteration: true,
          },
          {
            verificationStatus: 'failed',
            failedChecks: failedChecks.map((check) => check.name),
            decisionNote: 'Automated verification failed; additional iteration required',
          }
        );
      } else {
        logger.info('[Verification] All automated checks passed');
        const executedSummary =
          verificationResult.executedCommands.length > 0
            ? verificationResult.executedCommands.map((command) => `- \`${command}\``).join('\n')
            : '- (no checks executed)';
        emitStreamingChunk(
          `\n\n✅ **자동 검증 통과**\n${executedSummary}\n\n`,
          state.conversationId
        );
      }
    } catch (error: any) {
      console.error('[Verification] Verification pipeline error:', error);
      // Continue anyway - don't block on verification errors
    }
  }

  // Check required files (for MODIFICATION tasks)
  const requiredFiles = state.requiredFiles || [];
  const modifiedFiles = state.modifiedFiles || [];

  if (requiredFiles.length > 0 && modifiedFiles.length > 0) {
    const missingFiles = requiredFiles.filter(
      (req) => !modifiedFiles.some((mod) => pathMatchesRequirement(mod, req))
    );

    if (missingFiles.length > 0 && (state.iterationCount || 0) < 3) {
      logger.info(`[Verification] Missing required files: ${missingFiles.join(', ')}`);

      // Detect if a Python script was created but the required output file wasn't generated
      const createdScripts = modifiedFiles.filter((f) => f.endsWith('.py') || f.endsWith('.sh'));
      const hasScriptButNotOutput = createdScripts.length > 0;

      let reminderContent = `다음 파일들이 아직 수정되지 않았습니다: ${missingFiles.join(', ')}`;
      if (hasScriptButNotOutput) {
        reminderContent +=
          '\n\n⚠️ Python 스크립트가 작성되었지만 실행되지 않았습니다. ' +
          '반드시 file_write와 command_execute를 같은 응답에서 호출하세요. ' +
          '스크립트 상단에 `import subprocess, sys; subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "패키지명"])` 패턴으로 의존성을 자동 설치하세요. ' +
          '사용자에게 pip install 수동 실행을 요청하지 마세요.';
      }

      const reminderMessage: Message = {
        id: `reminder-${Date.now()}`,
        role: 'user',
        content: reminderContent,
        created_at: Date.now(),
      };

      return finalizeVerificationState(
        {
          messages: [reminderMessage],
          verificationNotes: ['⚠️ Required files not modified'],
          needsAdditionalIteration: true,
        },
        {
          verificationStatus: 'failed',
          failedChecks: hasScriptButNotOutput
            ? ['required_files', 'script_not_executed']
            : ['required_files'],
          decisionNote: hasScriptButNotOutput
            ? `Script created but not executed. Missing output: ${missingFiles.join(', ')}`
            : `Required files still missing: ${missingFiles.join(', ')}`,
        }
      );
    }
  }

  // [DISCUSS] check already handled at the top of verificationNode (early check).
  // No duplicate needed here.

  // Advance plan step if we have a plan (non-DISCUSS steps only)
  if (planSteps.length > 0 && currentStep < planSteps.length - 1) {
    logger.info(
      `[Verification] Advancing to next plan step (${currentStep + 1}/${planSteps.length})`
    );

    emitStreamingChunk(
      `\n\n📋 **Step ${currentStep + 1}/${planSteps.length} 완료** ✅\n\n` +
        `➡️ 다음 단계: ${planSteps[currentStep + 1]}\n\n`,
      state.conversationId
    );

    return finalizeVerificationState(
      {
        currentPlanStep: currentStep + 1,
        verificationNotes: ['✅ Step completed, moving to next'],
        needsAdditionalIteration: true,
      },
      {
        verificationStatus: 'passed',
        decisionNote: `Plan step ${currentStep + 1} completed`,
      }
    );
  }

  // All checks passed
  logger.info('[Verification] Execution validated');
  return finalizeVerificationState(
    {
      verificationNotes: ['✅ Execution complete'],
      needsAdditionalIteration: false,
    },
    {
      verificationStatus: 'passed',
      decisionNote: 'Execution validated as complete',
    }
  );
}

/**
 * Reporter Node: Generate final summary for all completions
 */
export async function reporterNode(state: CodingAgentState): Promise<Partial<CodingAgentState>> {
  logger.info('[Reporter] Generating final summary');

  const hasToolError = state.toolResults?.some((r) => r.error);
  const hasAgentError = state.agentError && state.agentError.length > 0;
  const maxIterations = state.maxIterations || 50;
  const iterationCount = state.iterationCount || 0;
  const modifiedFilesCount = state.modifiedFiles?.length || 0;
  const deletedFilesCount = state.deletedFiles?.length || 0;

  const planSteps = state.planSteps || [];

  // Error cases
  if (hasAgentError) {
    logger.info('[Reporter] Agent error detected, generating error summary');
    const errorSummary: Message = {
      id: `report-${Date.now()}`,
      role: 'assistant',
      content:
        `\n\n⚠️ **에이전트 실행 중단**\n\n` +
        `오류: ${state.agentError}\n` +
        `🔁 **Iterations**: ${iterationCount}회\n` +
        `📋 **Plan Steps**: 0/${planSteps.length} 완료\n\n` +
        `💡 Tool Calling을 지원하는 모델을 사용하고 있는지 확인해주세요.`,
      created_at: Date.now(),
    };
    return { messages: [errorSummary] };
  } else if (hasToolError) {
    const errorMessage: Message = {
      id: `report-${Date.now()}`,
      role: 'assistant',
      content: '❌ 작업 중 오류가 발생했습니다. 위의 툴 실행 결과를 확인해주세요.',
      created_at: Date.now(),
    };

    logger.info('[Reporter] Tool error detected, generating error report');
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

    logger.info('[Reporter] Max iterations reached, generating warning');
    return {
      messages: [maxIterMessage],
    };
  }

  // Success case - generate summary
  logger.info('[Reporter] Normal completion, generating summary');

  const summaryParts: string[] = [];
  summaryParts.push('✅ **작업 완료**\n');

  // File changes
  if (modifiedFilesCount > 0 || deletedFilesCount > 0) {
    summaryParts.push(
      `📁 **변경된 파일**: ${modifiedFilesCount}개 수정${deletedFilesCount > 0 ? `, ${deletedFilesCount}개 삭제` : ''}`
    );
    if (state.modifiedFiles && state.modifiedFiles.length > 0) {
      const fileList = state.modifiedFiles
        .slice(0, 10)
        .map((f) => `  - ${f}`)
        .join('\n');
      summaryParts.push(fileList);
      if (state.modifiedFiles.length > 10) {
        summaryParts.push(`  ... 및 ${state.modifiedFiles.length - 10}개 파일 더`);
      }
    }
  }

  // Iteration count
  summaryParts.push(`\n🔁 **Iterations**: ${iterationCount}회`);

  // Plan completion
  if (state.planSteps && state.planSteps.length > 0) {
    summaryParts.push(
      `📋 **Plan Steps**: ${Math.min(state.currentPlanStep, state.planSteps.length)}/${state.planSteps.length} 완료`
    );
  }

  const summaryMessage: Message = {
    id: `report-${Date.now()}`,
    role: 'assistant',
    content: summaryParts.join('\n'),
    created_at: Date.now(),
  };

  return {
    messages: [summaryMessage],
  };
}

// ===========================
// Routing Functions
// ===========================

export function triageNextStep(state: CodingAgentState): 'direct' | 'graph' {
  const decision = state.triageDecision || 'graph';
  return decision === 'direct_response' ? 'direct' : 'graph';
}

export function guardDecision(state: CodingAgentState): 'continue' | 'stop' {
  if (state.forceTermination || (state.iterationCount || 0) >= (state.maxIterations || 10)) {
    return 'stop';
  }
  return 'continue';
}

export function approvalNextStep(state: CodingAgentState): 'run_tools' | 'retry' {
  const status = (state.lastApprovalStatus || 'approved').toLowerCase();
  if (status === 'denied' || status === 'feedback') {
    return 'retry';
  }
  return 'run_tools';
}

export function verificationNextStep(state: CodingAgentState): 'continue' | 'report' {
  if (state.needsAdditionalIteration) {
    return 'continue';
  }
  return 'report';
}

// ===========================
// CodingAgent Stream Runner (custom streaming support)
// ===========================

export class CodingAgentStreamRunner {
  private toolApprovalCallback?: (toolCalls: any[]) => Promise<boolean>;
  private discussInputCallback?: (stepIndex: number, question: string) => Promise<string>;

  async *stream(
    initialState: CodingAgentState,
    toolApprovalCallback?: (toolCalls: any[]) => Promise<boolean>,
    discussInputCallback?: (stepIndex: number, question: string) => Promise<string>
  ): AsyncGenerator<any> {
    this.toolApprovalCallback = toolApprovalCallback;
    this.discussInputCallback = discussInputCallback;
    let state = await injectSkillsToStateIfNeeded({ ...initialState });
    const traceCollector = new AgentTraceCollector();
    const getApprovalHistory = (): ApprovalHistoryEntry[] => [...(state.approvalHistory || [])];
    const getTraceMetrics = (): AgentTraceMetrics => traceCollector.getMetrics();
    const withRuntimeMetadata = <T extends Record<string, unknown>>(
      data: T
    ): T & { approvalHistory: ApprovalHistoryEntry[]; traceMetrics: AgentTraceMetrics } => ({
      ...data,
      approvalHistory: getApprovalHistory(),
      traceMetrics: getTraceMetrics(),
    });

    logger.info('[CodingAgentRunner] Starting stream with full planning pipeline');

    try {
      const workspacePath = getWorkspacePath(state);
      const workspaceBaselineSnapshot = await getWorkspaceFiles(workspacePath);
      state = {
        ...state,
        workingMemory: updateWorkingMemorySnapshot(state, {
          decisionNote: 'Starting coding agent execution',
        }),
      };

      // === PHASE 1: Triage ===
      logger.info('[CodingAgentRunner] Phase 1: Triage');
      traceCollector.startNode('triage');
      yield { type: 'node', node: 'triage', data: { status: 'starting' } };
      const triageResult = await triageNode(state);
      state = { ...state, ...triageResult };
      traceCollector.endNode('triage');
      traceCollector.decision('triage', `triage: ${state.triageDecision || 'graph'}`);
      state = {
        ...state,
        workingMemory: updateWorkingMemorySnapshot(state, {
          decisionNote: `Triage decision: ${state.triageDecision || 'graph'}`,
        }),
        agentTrace: traceCollector.getEntries(),
      };
      yield { type: 'node', node: 'triage', data: triageResult };

      // If simple question, use direct response
      if (state.triageDecision === 'direct_response') {
        logger.info('[CodingAgentRunner] Simple question detected, using direct response');
        traceCollector.startNode('reporter');
        yield { type: 'node', node: 'direct_response', data: { status: 'starting' } };
        const directResult = await directResponseNode(state);
        state = { ...state, messages: [...state.messages, ...(directResult.messages || [])] };
        traceCollector.endNode('reporter');
        state = { ...state, agentTrace: traceCollector.getEntries() };
        yield {
          type: 'node',
          node: 'direct_response',
          data: withRuntimeMetadata({ ...directResult, messages: state.messages }),
        };
        return;
      }

      // === PHASE 2: Planning ===
      logger.info('[CodingAgentRunner] Phase 2: Planning');
      traceCollector.startNode('planner');
      yield { type: 'node', node: 'planner', data: { status: 'starting' } };
      const planResult = await planningNode(state);
      state = {
        ...state,
        ...planResult,
        messages: [...state.messages, ...(planResult.messages || [])],
      };
      traceCollector.endNode('planner');
      state = {
        ...state,
        workingMemory: updateWorkingMemorySnapshot(state, {
          decisionNote: `Plan created (${(state.planSteps || []).length} steps)`,
        }),
        agentTrace: traceCollector.getEntries(),
      };
      yield {
        type: 'node',
        node: 'planner',
        data: withRuntimeMetadata({ ...planResult, messages: state.messages }),
      };

      const maxIterations = state.maxIterations || 50;
      let iterations = 0;
      let hasError = false;
      let awaitingToolApproval = false;
      let toolExecutionRejected = false;

      // Repeat detection: track consecutive identical tool call signatures
      let previousToolCallSignature = '';
      let consecutiveRepeatCount = 0;
      const MAX_CONSECUTIVE_REPEATS = 2; // Break after 3 identical consecutive calls

      // Track whether we just resumed from a [DISCUSS] step to skip the
      // hasExistingWork guard for one iteration (the agent may acknowledge the
      // user's feedback without calling tools, which is legitimate).
      let justResumedFromDiscuss = false;

      // === PHASE 3: Main ReAct loop with plan awareness ===
      logger.info('[CodingAgentRunner] Phase 3: Execution (max iterations:', maxIterations, ')');
      while (iterations < maxIterations) {
        const currentIteration = iterations + 1;

        // Agent (LLM with tools)
        traceCollector.startNode('agent', currentIteration);
        yield {
          type: 'node',
          node: 'agent',
          data: withRuntimeMetadata({
            status: 'starting',
            iterationCount: currentIteration,
            maxIterations,
            statusMessage: 'Thinking about next steps...',
          }),
        };
        const agentResult = await agentNode(state);
        state = {
          ...state,
          messages: [...state.messages, ...(agentResult.messages || [])],
          agentError: agentResult.agentError || state.agentError,
        };

        // Generate detailed status message based on tool calls
        const lastMessage = agentResult.messages?.[agentResult.messages.length - 1];
        const agentStatusMessage = buildToolStatusMessage(
          lastMessage?.tool_calls || [],
          'planning'
        );
        traceCollector.endNode('agent', currentIteration, {
          hasToolCalls: Boolean(lastMessage?.tool_calls && lastMessage.tool_calls.length > 0),
          hasAgentError: Boolean(agentResult.agentError),
        });

        yield {
          type: 'node',
          node: 'agent',
          data: withRuntimeMetadata({
            ...agentResult,
            messages: state.messages,
            iterationCount: currentIteration,
            maxIterations,
            statusMessage: agentStatusMessage,
          }),
        };
        state = {
          ...state,
          workingMemory: updateWorkingMemorySnapshot(state, {
            decisionNote: agentStatusMessage,
          }),
          agentTrace: traceCollector.getEntries(),
        };

        // Check if agent encountered an error
        if (agentResult.agentError) {
          logger.info('[CodingAgentRunner] Agent error detected, ending loop');
          traceCollector.error('agent', agentResult.agentError, { iteration: currentIteration });
          hasError = true;
          break;
        }

        const lastStateMessage = state.messages[state.messages.length - 1];
        const pendingToolCalls = getPendingToolCalls(state, lastStateMessage?.tool_calls || []);

        // ── [DISCUSS] step: pre-check BEFORE tool execution ──
        // This runs after agentNode (so the LLM can generate discussion text)
        // but BEFORE tool execution / verificationNode branching.
        // By handling [DISCUSS] here, we completely bypass the complex verification
        // logic that can interfere (hasExistingWork guard, planCreated check, etc.).
        const _currentStepForDiscuss = state.currentPlanStep || 0;
        if (
          state.planSteps &&
          state.planSteps.length > 0 &&
          _currentStepForDiscuss < state.planSteps.length
        ) {
          const _discussTag = getPlanStepTag(state.planSteps[_currentStepForDiscuss]);
          if (_discussTag === 'DISCUSS') {
            logger.info(
              `[CodingAgentRunner] [DISCUSS] step detected at ${_currentStepForDiscuss + 1}/${state.planSteps.length} — pausing for user input`
            );

            // Emit visual feedback
            emitStreamingChunk(
              `\n\n📋 **Step ${_currentStepForDiscuss + 1}/${state.planSteps.length}** [DISCUSS]\n` +
                `💬 사용자 의견을 기다리고 있습니다...\n\n`,
              state.conversationId
            );

            // Advance plan step past the [DISCUSS] step
            state = { ...state, currentPlanStep: _currentStepForDiscuss + 1 };

            // Build a question combining the plan step description and the
            // agent's most recent response (which should contain analysis/questions).
            const _discussQuestion = state.planSteps[_currentStepForDiscuss];

            yield {
              type: 'cowork_discuss_request',
              stepIndex: _currentStepForDiscuss,
              question: _discussQuestion,
              conversationId: state.conversationId,
            };

            if (this.discussInputCallback) {
              const userResponse = await this.discussInputCallback(
                _currentStepForDiscuss,
                _discussQuestion
              );
              state = {
                ...state,
                messages: [
                  ...state.messages,
                  {
                    id: `discuss-${Date.now()}`,
                    role: 'user' as const,
                    content: userResponse || '(건너뜀 - 계속 진행)',
                    created_at: Date.now(),
                  },
                ],
                awaitingDiscussInput: false,
              };
              logger.info('[CodingAgentRunner] [DISCUSS] user input received, resuming execution');
              justResumedFromDiscuss = true;
              iterations++;
              continue; // Skip tool execution & verification, go to next iteration
            } else {
              logger.info(
                '[CodingAgentRunner] Stream paused: awaiting discuss input (no callback)'
              );
              state = { ...state, awaitingDiscussInput: true };
              return;
            }
          }
        }

        // Check if tools need to be called (excluding already executed tool_call_ids)
        if (pendingToolCalls.length === 0) {
          logger.info(
            '[CodingAgentRunner] No pending tool calls, running verifier before completion'
          );

          traceCollector.startNode('verifier', currentIteration);
          yield {
            type: 'node',
            node: 'verifier',
            data: withRuntimeMetadata({
              status: 'starting',
              iterationCount: currentIteration,
              maxIterations,
              statusMessage: 'Checking if task is complete',
            }),
          };
          const verificationResult = await verificationNode(state);
          state = {
            ...state,
            ...verificationResult,
            messages: [...state.messages, ...(verificationResult.messages || [])],
            iterationCount: currentIteration,
            agentTrace: traceCollector.getEntries(),
          };
          traceCollector.endNode('verifier', currentIteration, {
            verificationStatus: verificationResult.verificationStatus,
            needsAdditionalIteration: verificationResult.needsAdditionalIteration,
          });
          yield {
            type: 'node',
            node: 'verifier',
            data: withRuntimeMetadata({
              ...verificationResult,
              messages: state.messages,
              iterationCount: currentIteration,
              maxIterations,
              statusMessage: verificationResult.needsAdditionalIteration
                ? 'Need more iterations'
                : 'Task completed',
            }),
          };

          // Check if [DISCUSS] step awaiting user input (no-tool-calls branch)
          // NOTE: This is a FALLBACK — the primary [DISCUSS] detection is in the
          // pre-check above (before tool/no-tool branching). This fires only if
          // verificationNode sets awaitingDiscussInput (which it shouldn't if
          // the pre-check already handled the [DISCUSS] step).
          if (state.awaitingDiscussInput) {
            logger.info(
              '[CodingAgentRunner] [DISCUSS] fallback handler fired (no-tool branch) — verificationNode set awaitingDiscussInput'
            );
            const discussStepIndex = Math.max(0, (state.currentPlanStep || 1) - 1);
            const discussStepText = state.planSteps?.[discussStepIndex] || '';

            yield {
              type: 'cowork_discuss_request',
              stepIndex: discussStepIndex,
              question: discussStepText,
              conversationId: state.conversationId,
            };

            if (this.discussInputCallback) {
              const userResponse = await this.discussInputCallback(
                discussStepIndex,
                discussStepText
              );
              state = {
                ...state,
                messages: [
                  ...state.messages,
                  {
                    id: `discuss-${Date.now()}`,
                    role: 'user' as const,
                    content: userResponse || '(건너뜀 - 계속 진행)',
                    created_at: Date.now(),
                  },
                ],
                awaitingDiscussInput: false,
                needsAdditionalIteration: true,
              };
              logger.info(
                '[CodingAgentRunner] Discuss input received (no-tool branch), resuming execution'
              );
              justResumedFromDiscuss = true;
              iterations++;
              continue;
            } else {
              logger.info('[CodingAgentRunner] Stream paused: awaiting discuss input');
              return;
            }
          }

          // Check if we need to continue based on verification
          if (verificationResult.needsAdditionalIteration) {
            // Guard: If agent produced no tool calls but existing work was done,
            // respect the agent's completion signal unless verification actually FAILED.
            // This prevents infinite loops where plan steps force continuation
            // but the agent has nothing more to do (especially with skill-injected plans).
            // Exceptions:
            // 1. Just resumed from a [DISCUSS] step — agent may acknowledge feedback without tools
            // 2. In Cowork mode with remaining plan steps — don't cut short prematurely
            if (!justResumedFromDiscuss) {
              const hasExistingWork =
                (state.toolResults || []).length > 0 || (state.modifiedFiles || []).length > 0;

              if (hasExistingWork && verificationResult.verificationStatus !== 'failed') {
                logger.info(
                  '[CodingAgentRunner] Agent produced no tool calls with existing work done - treating as completion'
                );
                break;
              }
            }
            justResumedFromDiscuss = false;
            iterations++;
            continue; // Continue to next iteration
          }

          // Verification complete, exit loop
          break;
        }

        // Repeat detection: compare tool call signatures with previous iteration
        const currentToolCallSignature = pendingToolCalls
          .map((tc) => `${tc.name || ''}:${JSON.stringify(tc.arguments || {})}`)
          .sort()
          .join('|');

        if (
          currentToolCallSignature === previousToolCallSignature &&
          currentToolCallSignature !== ''
        ) {
          consecutiveRepeatCount++;
          if (consecutiveRepeatCount >= MAX_CONSECUTIVE_REPEATS) {
            logger.info(
              `[CodingAgentRunner] Detected ${consecutiveRepeatCount + 1} consecutive identical tool calls, ending loop`
            );
            const repeatMessage: Message = {
              id: `repeat-guard-${Date.now()}`,
              role: 'assistant',
              content: `🔄 동일한 도구 호출이 ${consecutiveRepeatCount + 1}회 연속 감지되어 실행을 종료합니다.`,
              created_at: Date.now(),
            };
            state = {
              ...state,
              messages: [...state.messages, repeatMessage],
              agentTrace: traceCollector.getEntries(),
            };
            break;
          }
        } else {
          consecutiveRepeatCount = 0;
        }
        previousToolCallSignature = currentToolCallSignature;

        const approvalDecision = resolveToolApprovalDecision(pendingToolCalls, {
          alwaysApproveTools: state.alwaysApproveTools,
          userText: getLastUserText(state),
          inputTrustLevel: getInputTrustLevelForState(state),
          workingDirectory: state.workingDirectory,
        });
        traceCollector.startNode('approval', currentIteration);
        const approvalHistoryEntry = formatApprovalHistoryEntry(approvalDecision, pendingToolCalls);
        const userFacingApprovalNote = sanitizeApprovalNote(approvalDecision.note);

        if (approvalDecision.status === 'denied') {
          logger.warn('[CodingAgentRunner] Dangerous tool call blocked');
          const warningMessage: Message = {
            id: `approval-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ ${userFacingApprovalNote}`,
            created_at: Date.now(),
          };
          state = {
            ...state,
            alwaysApproveTools: approvalDecision.alwaysApproveTools,
            messages: [...state.messages, warningMessage],
            approvalHistory: [...(state.approvalHistory || []), approvalHistoryEntry],
            lastApprovalStatus: 'denied',
            workingMemory: updateWorkingMemorySnapshot(state, {
              decisionNote: `Approval denied by policy: ${approvalDecision.note}`,
            }),
            agentTrace: traceCollector.getEntries(),
          };
          traceCollector.approvalStatus('denied', approvalDecision.note, currentIteration);
          traceCollector.endNode('approval', currentIteration, { status: 'denied' });
          yield {
            type: 'tool_approval_result',
            approved: false,
            note: approvalDecision.note,
            riskLevel: approvalDecision.risk.riskLevel,
            approvalHistory: getApprovalHistory(),
            traceMetrics: getTraceMetrics(),
          };
          toolExecutionRejected = true;
          break;
        }

        if (approvalDecision.status === 'feedback') {
          logger.info('[CodingAgentRunner] Risky tool call requires user approval');
          traceCollector.approvalStatus('feedback', approvalDecision.note, currentIteration);
          yield {
            type: 'tool_approval_request',
            messageId: lastStateMessage?.id || `approval-${Date.now()}`,
            toolCalls: pendingToolCalls,
            note: approvalDecision.note,
            riskLevel: approvalDecision.risk.riskLevel,
            approvalHistory: [...getApprovalHistory(), approvalHistoryEntry],
            traceMetrics: getTraceMetrics(),
          };

          if (!this.toolApprovalCallback) {
            state = {
              ...state,
              alwaysApproveTools: approvalDecision.alwaysApproveTools,
              messages: [
                ...state.messages,
                {
                  id: `approval-${Date.now()}`,
                  role: 'assistant',
                  content: userFacingApprovalNote,
                  created_at: Date.now(),
                },
              ],
              approvalHistory: [...(state.approvalHistory || []), approvalHistoryEntry],
              lastApprovalStatus: 'feedback',
              workingMemory: updateWorkingMemorySnapshot(state, {
                decisionNote: `Waiting approval: ${approvalDecision.note}`,
              }),
              agentTrace: traceCollector.getEntries(),
            };
            traceCollector.endNode('approval', currentIteration, { status: 'feedback' });
            awaitingToolApproval = true;
            break;
          }

          try {
            const approved = await this.toolApprovalCallback(pendingToolCalls);

            if (!approved) {
              logger.info('[CodingAgentRunner] Tools rejected by user');
              const rejectionMessage: Message = {
                id: `approval-${Date.now()}`,
                role: 'assistant',
                content: '도구 실행이 사용자에 의해 거부되었습니다.',
                created_at: Date.now(),
              };
              state = {
                ...state,
                alwaysApproveTools: approvalDecision.alwaysApproveTools,
                messages: [...state.messages, rejectionMessage],
                approvalHistory: [
                  ...(state.approvalHistory || []),
                  approvalHistoryEntry,
                  createApprovalHistoryEntry({
                    decision: 'denied',
                    source: 'user',
                    summary: 'denied by user',
                    riskLevel: approvalDecision.risk.riskLevel,
                    toolCallIds: pendingToolCalls
                      .map((toolCall) => toolCall.id)
                      .filter((id): id is string => typeof id === 'string' && id.length > 0),
                  }),
                ],
                lastApprovalStatus: 'denied',
                workingMemory: updateWorkingMemorySnapshot(state, {
                  decisionNote: 'User denied tool approval',
                }),
                agentTrace: traceCollector.getEntries(),
              };
              traceCollector.approvalStatus('denied', 'denied by user', currentIteration);
              traceCollector.endNode('approval', currentIteration, { status: 'denied_by_user' });
              yield {
                type: 'tool_approval_result',
                approved: false,
                note: 'denied by user',
                riskLevel: approvalDecision.risk.riskLevel,
                approvalHistory: getApprovalHistory(),
                traceMetrics: getTraceMetrics(),
              };
              toolExecutionRejected = true;
              break;
            }

            state = {
              ...state,
              alwaysApproveTools: approvalDecision.alwaysApproveTools,
              approvalHistory: [
                ...(state.approvalHistory || []),
                approvalHistoryEntry,
                createApprovalHistoryEntry({
                  decision: 'approved',
                  source: 'user',
                  summary: 'approved after user confirmation',
                  riskLevel: approvalDecision.risk.riskLevel,
                  toolCallIds: pendingToolCalls
                    .map((toolCall) => toolCall.id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0),
                }),
              ],
              lastApprovalStatus: 'approved',
              workingMemory: updateWorkingMemorySnapshot(state, {
                decisionNote: 'User approved tool execution',
              }),
              agentTrace: traceCollector.getEntries(),
            };
            traceCollector.approvalStatus('approved', 'approved by user', currentIteration);
            traceCollector.endNode('approval', currentIteration, { status: 'approved_by_user' });
            yield {
              type: 'tool_approval_result',
              approved: true,
              note: 'approved by user',
              riskLevel: approvalDecision.risk.riskLevel,
              approvalHistory: getApprovalHistory(),
              traceMetrics: getTraceMetrics(),
            };
          } catch (error: any) {
            console.error('[CodingAgentRunner] Tool approval error:', error);
            traceCollector.error('approval', error?.message || 'approval callback failed', {
              iteration: currentIteration,
            });
            break;
          }
        } else {
          state = {
            ...state,
            alwaysApproveTools: approvalDecision.alwaysApproveTools,
            approvalHistory: [...(state.approvalHistory || []), approvalHistoryEntry],
            lastApprovalStatus: 'approved',
            workingMemory: updateWorkingMemorySnapshot(state, {
              decisionNote: 'Policy auto-approved tool execution',
            }),
            agentTrace: traceCollector.getEntries(),
          };
          traceCollector.approvalStatus('approved', approvalDecision.note, currentIteration);
          traceCollector.endNode('approval', currentIteration, { status: 'auto_approved' });
        }

        // Execute tools
        // Generate tool execution status message
        const executingMessage = buildToolStatusMessage(pendingToolCalls, 'executing');
        const stagedTransaction: ToolExecutionTransaction | null =
          await createToolExecutionTransaction(pendingToolCalls, workspacePath);
        traceCollector.startNode('tools', currentIteration);

        yield {
          type: 'node',
          node: 'tools',
          data: withRuntimeMetadata({
            status: 'starting',
            iterationCount: currentIteration,
            maxIterations,
            statusMessage: executingMessage,
          }),
        };
        const toolsResult = await enhancedToolsNode(state);
        traceCollector.endNode('tools', currentIteration, {
          toolCalls: pendingToolCalls.length,
          errors: (toolsResult.toolResults || []).filter((toolResult) => Boolean(toolResult.error))
            .length,
        });

        // Check for errors
        if (toolsResult.toolResults?.some((r) => r.error)) {
          hasError = true;
        }

        for (const toolResult of toolsResult.toolResults || []) {
          traceCollector.toolResult(
            toolResult.toolName,
            !toolResult.error,
            undefined,
            currentIteration
          );
        }

        state = {
          ...state,
          messages: [...state.messages, ...(toolsResult.messages || [])],
          toolResults: toolsResult.toolResults || state.toolResults,
          modifiedFiles: toolsResult.modifiedFiles || state.modifiedFiles,
          deletedFiles: toolsResult.deletedFiles || state.deletedFiles,
          executedToolCallIds: toolsResult.executedToolCallIds || state.executedToolCallIds,
          fileChangesCount: (state.fileChangesCount || 0) + (toolsResult.fileChangesCount || 0),
          workingMemory: updateWorkingMemorySnapshot(state, {
            toolOutcome:
              toolsResult.toolResults && toolsResult.toolResults.length > 0
                ? toolsResult.toolResults
                    .map((toolResult) =>
                      toolResult.error
                        ? `${toolResult.toolName}: error`
                        : `${toolResult.toolName}: success`
                    )
                    .join(', ')
                : 'No tool results',
          }),
          agentTrace: traceCollector.getEntries(),
        };

        // Generate completion status message
        const toolCompletionMessage =
          toolsResult.toolResults && toolsResult.toolResults.length > 0
            ? (() => {
                const hasErrors = toolsResult.toolResults.some((r) => r.error);
                const toolNames = toolsResult.toolResults.map((r) => r.toolName).join(', ');
                return hasErrors
                  ? `Completed ${toolNames} (with errors)`
                  : `Completed ${toolNames}`;
              })()
            : 'Tools completed';

        yield {
          type: 'node',
          node: 'tools',
          data: withRuntimeMetadata({
            ...toolsResult,
            messages: state.messages,
            iterationCount: currentIteration,
            maxIterations,
            statusMessage: toolCompletionMessage,
          }),
        };

        // Run verification after tools
        traceCollector.startNode('verifier', currentIteration);
        yield {
          type: 'node',
          node: 'verifier',
          data: withRuntimeMetadata({
            status: 'starting',
            iterationCount: currentIteration,
            maxIterations,
            statusMessage: 'Verifying changes and checking completion',
          }),
        };
        const verificationResult = await verificationNode(state);
        state = {
          ...state,
          ...verificationResult,
          messages: [...state.messages, ...(verificationResult.messages || [])],
          iterationCount: currentIteration, // Update iteration count
          agentTrace: traceCollector.getEntries(),
        };
        traceCollector.endNode('verifier', currentIteration, {
          verificationStatus: verificationResult.verificationStatus,
          needsAdditionalIteration: verificationResult.needsAdditionalIteration,
        });

        if (verificationResult.verificationStatus === 'failed' && stagedTransaction) {
          // When verification failed because a script was created but not executed,
          // preserve script files (.py, .sh) instead of rolling them back.
          // This allows the agent to execute them in the next iteration.
          const isScriptNotExecuted = (verificationResult.verificationFailedChecks || []).includes(
            'script_not_executed'
          );
          let transactionToRollback = stagedTransaction;
          if (isScriptNotExecuted) {
            const scriptExtensions = ['.py', '.sh', '.bash'];
            const filteredFiles = stagedTransaction.files.filter(
              (f) => !scriptExtensions.some((ext) => f.absolutePath.endsWith(ext))
            );
            if (filteredFiles.length < stagedTransaction.files.length) {
              logger.info(
                `[CodingAgentRunner] Preserving ${stagedTransaction.files.length - filteredFiles.length} script file(s) for next iteration`
              );
              transactionToRollback = { ...stagedTransaction, files: filteredFiles };
            }
          }
          const rollbackResult = await rollbackToolExecutionTransaction(transactionToRollback);
          const failureReasons = (verificationResult.verificationNotes || []).join('\n');
          const rollbackMessage: Message = {
            id: `rollback-${Date.now()}`,
            role: 'assistant',
            content:
              rollbackResult.errors.length === 0
                ? isScriptNotExecuted &&
                  rollbackResult.restored === 0 &&
                  rollbackResult.deleted === 0
                  ? `⚠️ 검증 실패: 스크립트가 작성되었지만 실행되지 않았습니다. 스크립트 파일은 보존됩니다. 다음 시도에서 command_execute로 실행하세요.${failureReasons ? `\n\n**실패 원인:**\n${failureReasons}` : ''}`
                  : `↩️ 검증 실패로 변경 사항을 롤백했습니다. 복구: ${rollbackResult.restored}개, 삭제 복원: ${rollbackResult.deleted}개${failureReasons ? `\n\n**실패 원인:**\n${failureReasons}` : ''}`
                : `⚠️ 검증 실패 후 롤백 중 일부 오류가 발생했습니다:\n${rollbackResult.errors.join('\n')}${failureReasons ? `\n\n**실패 원인:**\n${failureReasons}` : ''}`,
            created_at: Date.now(),
          };
          const currentWorkspaceSnapshot = await getWorkspaceFiles(workspacePath);
          const workspaceDeltaPatch = applyWorkspaceDeltaToState(
            state,
            workspaceBaselineSnapshot,
            currentWorkspaceSnapshot
          );

          state = {
            ...state,
            ...workspaceDeltaPatch,
            messages: [...state.messages, rollbackMessage],
            workingMemory: updateWorkingMemorySnapshot(
              {
                ...state,
                ...workspaceDeltaPatch,
              } as CodingAgentState,
              {
                decisionNote: 'Verification failed; rolled back staged tool changes',
              }
            ),
            agentTrace: traceCollector.getEntries(),
          };
        }

        yield {
          type: 'node',
          node: 'verifier',
          data: withRuntimeMetadata({
            ...verificationResult,
            messages: state.messages,
            iterationCount: currentIteration,
            maxIterations,
            statusMessage: verificationResult.needsAdditionalIteration
              ? 'Verification complete - continuing'
              : 'Verification complete - task finished',
          }),
        };

        // Check if [DISCUSS] step awaiting user input (tool-calls branch FALLBACK)
        // NOTE: Primary [DISCUSS] detection is the pre-check above (before branching).
        if (state.awaitingDiscussInput) {
          logger.info(
            '[CodingAgentRunner] [DISCUSS] fallback handler fired (tool branch) — verificationNode set awaitingDiscussInput'
          );
          // currentPlanStep was already incremented in verificationNode,
          // so subtract 1 to get the actual DISCUSS step's text
          const discussStepIndex = Math.max(0, (state.currentPlanStep || 1) - 1);
          const discussStepText = state.planSteps?.[discussStepIndex] || '';

          yield {
            type: 'cowork_discuss_request',
            stepIndex: discussStepIndex,
            question: discussStepText,
            conversationId: state.conversationId,
          };

          if (this.discussInputCallback) {
            const userResponse = await this.discussInputCallback(discussStepIndex, discussStepText);
            // 사용자 응답을 메시지에 주입하고 재개
            state = {
              ...state,
              messages: [
                ...state.messages,
                {
                  id: `discuss-${Date.now()}`,
                  role: 'user' as const,
                  content: userResponse || '(건너뜀 - 계속 진행)',
                  created_at: Date.now(),
                },
              ],
              awaitingDiscussInput: false,
              needsAdditionalIteration: true,
            };
            logger.info('[CodingAgentRunner] Discuss input received, resuming execution');
            justResumedFromDiscuss = true;
            iterations++;
            continue; // while 루프 재개
          } else {
            logger.info('[CodingAgentRunner] Stream paused: awaiting discuss input');
            return;
          }
        }

        // Check if we need to continue (based on verification)
        if (!verificationResult.needsAdditionalIteration) {
          logger.info('[CodingAgentRunner] Verification indicates completion, ending loop');
          break;
        }

        iterations++;
      }

      logger.info('[CodingAgentRunner] Stream completed, total iterations:', iterations);

      // Stop cleanly when [DISCUSS] input is still pending.
      if (state.awaitingDiscussInput) {
        logger.info('[CodingAgentRunner] Stream paused: awaiting discuss input');
        return;
      }

      // Stop cleanly when explicit approval is still pending.
      if (awaitingToolApproval || state.lastApprovalStatus === 'feedback') {
        logger.info('[CodingAgentRunner] Stream paused: awaiting user tool approval');
        return;
      }

      // Stop cleanly when tools were rejected by the user.
      if (toolExecutionRejected || state.lastApprovalStatus === 'denied') {
        logger.info('[CodingAgentRunner] Stream halted: tool execution rejected by user');
        return;
      }

      // Reporter: Only for errors or max iterations
      traceCollector.startNode('reporter', iterations);
      yield {
        type: 'node',
        node: 'reporter',
        data: withRuntimeMetadata({
          status: 'starting',
          statusMessage: 'Preparing final response',
        }),
      };
      // Pass hasError and iterations through state
      const stateForReporter = {
        ...state,
        toolResults: hasError ? state.toolResults : [],
        iterationCount: iterations,
      };
      const reportResult = await reporterNode(stateForReporter);
      if (reportResult.messages && reportResult.messages.length > 0) {
        // Stream reporter output to user so it's visible in the chat
        for (const msg of reportResult.messages) {
          if (msg.role === 'assistant' && msg.content) {
            emitStreamingChunk(msg.content, state.conversationId);
          }
        }
        state = {
          ...state,
          messages: [...state.messages, ...reportResult.messages],
        };
      }
      traceCollector.endNode('reporter', iterations, {
        hasReportMessage: Boolean(reportResult.messages && reportResult.messages.length > 0),
      });
      state = {
        ...state,
        workingMemory: updateWorkingMemorySnapshot(state, {
          decisionNote: 'Reporter generated final output',
        }),
        agentTrace: traceCollector.getEntries(),
      };
      yield {
        type: 'node',
        node: 'reporter',
        data: withRuntimeMetadata({
          ...reportResult,
          messages: state.messages,
          statusMessage: 'Final response ready',
        }),
      };
    } catch (error: any) {
      console.error('[CodingAgentRunner] Stream error:', error);
      traceCollector.error('reporter', error?.message || 'stream failed');
      yield { type: 'error', error: error.message || 'Graph execution failed' };
    }
  }
}
