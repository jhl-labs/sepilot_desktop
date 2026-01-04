/**
 * Browser Agent Workflow 및 Session Management 타입 정의
 */

import { BrowserError } from './errors';

// =============================================================================
// Workflow Step Types
// =============================================================================

/**
 * Workflow Step Type
 */
export type BrowserWorkflowStepType =
  | 'navigate'
  | 'search'
  | 'extract'
  | 'click'
  | 'type'
  | 'scroll'
  | 'screenshot'
  | 'verify'
  | 'wait'
  | 'custom';

/**
 * Workflow Step Status
 */
export type BrowserWorkflowStepStatus =
  | 'pending'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'retrying';

/**
 * Browser Workflow Step
 */
export interface BrowserWorkflowStep {
  /** Step ID */
  id: string;

  /** Step Type */
  type: BrowserWorkflowStepType;

  /** Step Description */
  description: string;

  /** Tool Name */
  tool: string;

  /** Tool Arguments */
  arguments: Record<string, any>;

  /** Expected Result (검증용) */
  expectedResult?: string;

  /** Status */
  status: BrowserWorkflowStepStatus;

  /** Result */
  result?: string;

  /** Error */
  error?: string;

  /** Retry Count */
  retryCount: number;

  /** Max Retries */
  maxRetries: number;

  /** 시작 시간 */
  startTime?: number;

  /** 종료 시간 */
  endTime?: number;

  /** 소요 시간 (ms) */
  duration?: number;

  /** Dependencies (이 step들이 완료되어야 실행 가능) */
  dependencies?: string[];

  /** Conditional (조건부 실행) */
  conditional?: {
    condition: string; // 예: "previous_step.result.success === true"
    skipIfFalse: boolean;
  };
}

// =============================================================================
// Tool Call Record
// =============================================================================

/**
 * Tool Call Record
 */
export interface ToolCallRecord {
  /** Call ID */
  id: string;

  /** Tool Name */
  toolName: string;

  /** Arguments */
  arguments: any;

  /** Result */
  result?: string;

  /** Error */
  error?: string;

  /** Timestamp */
  timestamp: number;

  /** Duration (ms) */
  duration?: number;

  /** Success */
  success: boolean;

  /** Retry Number (0 = first attempt) */
  retryNumber: number;
}

// =============================================================================
// Browser Session
// =============================================================================

/**
 * Browser Session Status
 */
export type BrowserSessionStatus =
  | 'planning'
  | 'executing'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Browser Session
 */
export interface BrowserSession {
  /** Session ID */
  id: string;

  /** User Goal */
  goal: string;

  /** Conversation ID */
  conversationId?: string;

  /** 시작 시간 */
  startTime: number;

  /** 종료 시간 */
  endTime?: number;

  // Workflow
  /** Planned Steps */
  plannedSteps: BrowserWorkflowStep[];

  /** Current Step Index */
  currentStep: number;

  /** Completed Steps Count */
  completedSteps: number;

  /** Failed Steps Count */
  failedSteps: number;

  // State
  /** Current URL */
  currentUrl?: string;

  /** Current Tab ID */
  currentTab?: string;

  /** Visited Pages */
  visitedPages: Array<{
    url: string;
    title?: string;
    timestamp: number;
    duration?: number;
  }>;

  /** Open Tabs */
  openTabs: string[];

  // Performance
  /** Tool Calls */
  toolCalls: ToolCallRecord[];

  /** Errors */
  errors: BrowserError[];

  /** Total Iterations */
  totalIterations: number;

  /** Max Iterations */
  maxIterations: number;

  // Status
  /** Status */
  status: BrowserSessionStatus;

  /** Status Message */
  statusMessage?: string;

  /** Progress (0-100) */
  progress: number;

  // Results
  /** Extracted Data */
  extractedData?: Record<string, any>;

  /** Screenshots */
  screenshots: Array<{
    path: string;
    timestamp: number;
    description?: string;
  }>;

  /** Final Report */
  finalReport?: string;
}

// =============================================================================
// Session Analytics
// =============================================================================

/**
 * Session Analytics
 */
export interface BrowserSessionAnalytics {
  /** Session ID */
  sessionId: string;

  /** Duration (ms) */
  duration: number;

  /** Total Steps */
  totalSteps: number;

  /** Completed Steps */
  completedSteps: number;

  /** Failed Steps */
  failedSteps: number;

  /** Skipped Steps */
  skippedSteps: number;

  /** Total Tool Calls */
  totalToolCalls: number;

  /** Successful Tool Calls */
  successfulToolCalls: number;

  /** Failed Tool Calls */
  failedToolCalls: number;

  /** Average Tool Call Duration (ms) */
  avgToolCallDuration: number;

  /** Total Pages Visited */
  totalPagesVisited: number;

  /** Total Tabs Created */
  totalTabsCreated: number;

  /** Total Screenshots Taken */
  totalScreenshots: number;

  /** Total Errors */
  totalErrors: number;

  /** Recoverable Errors */
  recoverableErrors: number;

  /** Error Recovery Success Rate (%) */
  errorRecoveryRate: number;

  /** Most Used Tool */
  mostUsedTool?: {
    name: string;
    count: number;
  };

  /** Slowest Tool */
  slowestTool?: {
    name: string;
    avgDuration: number;
  };

  /** Tool Performance Breakdown */
  toolPerformance: Array<{
    toolName: string;
    callCount: number;
    successCount: number;
    failCount: number;
    avgDuration: number;
    totalDuration: number;
  }>;
}

// =============================================================================
// Workflow Plan
// =============================================================================

/**
 * Workflow Plan
 */
export interface BrowserWorkflowPlan {
  /** Plan ID */
  id: string;

  /** Goal */
  goal: string;

  /** Steps */
  steps: BrowserWorkflowStep[];

  /** Estimated Duration (ms) */
  estimatedDuration?: number;

  /** Created At */
  createdAt: number;

  /** Created By (LLM model) */
  createdBy?: string;

  /** Reasoning (왜 이 plan을 만들었는지) */
  reasoning?: string;

  /** Alternative Plans */
  alternatives?: Array<{
    id: string;
    description: string;
    steps: BrowserWorkflowStep[];
  }>;
}

// =============================================================================
// Multi-Step Task
// =============================================================================

/**
 * Multi-Step Task
 */
export interface BrowserMultiStepTask {
  /** Task ID */
  id: string;

  /** Task Name */
  name: string;

  /** Task Description */
  description: string;

  /** Sub-Tasks */
  subTasks: Array<{
    id: string;
    name: string;
    description: string;
    workflow: BrowserWorkflowPlan;
    status: BrowserWorkflowStepStatus;
    result?: string;
    error?: string;
  }>;

  /** Overall Status */
  status: BrowserSessionStatus;

  /** Current Sub-Task Index */
  currentSubTask: number;

  /** Created At */
  createdAt: number;

  /** Started At */
  startedAt?: number;

  /** Completed At */
  completedAt?: number;
}

// =============================================================================
// Session Utilities
// =============================================================================

/**
 * Create Browser Session
 */
export function createBrowserSession(
  goal: string,
  conversationId?: string,
  maxIterations = 30
): BrowserSession {
  return {
    id: `session-${Date.now()}`,
    goal,
    conversationId,
    startTime: Date.now(),
    plannedSteps: [],
    currentStep: 0,
    completedSteps: 0,
    failedSteps: 0,
    visitedPages: [],
    openTabs: [],
    toolCalls: [],
    errors: [],
    totalIterations: 0,
    maxIterations,
    status: 'planning',
    progress: 0,
    screenshots: [],
  };
}

/**
 * Create Workflow Step
 */
export function createWorkflowStep(
  type: BrowserWorkflowStepType,
  description: string,
  tool: string,
  args: Record<string, any>,
  maxRetries = 2
): BrowserWorkflowStep {
  return {
    id: `step-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    type,
    description,
    tool,
    arguments: args,
    status: 'pending',
    retryCount: 0,
    maxRetries,
  };
}

/**
 * Calculate Session Analytics
 */
export function calculateSessionAnalytics(session: BrowserSession): BrowserSessionAnalytics {
  const duration = session.endTime
    ? session.endTime - session.startTime
    : Date.now() - session.startTime;

  const totalSteps = session.plannedSteps.length;
  const completedSteps = session.plannedSteps.filter((s) => s.status === 'completed').length;
  const failedSteps = session.plannedSteps.filter((s) => s.status === 'failed').length;
  const skippedSteps = session.plannedSteps.filter((s) => s.status === 'skipped').length;

  const totalToolCalls = session.toolCalls.length;
  const successfulToolCalls = session.toolCalls.filter((t) => t.success).length;
  const failedToolCalls = session.toolCalls.filter((t) => !t.success).length;

  const avgToolCallDuration =
    totalToolCalls > 0
      ? session.toolCalls.reduce((sum, t) => sum + (t.duration || 0), 0) / totalToolCalls
      : 0;

  const totalErrors = session.errors.length;
  const recoverableErrors = session.errors.filter((e) => e.recoverable).length;
  const errorRecoveryRate = totalErrors > 0 ? (recoverableErrors / totalErrors) * 100 : 0;

  // Tool usage statistics
  const toolUsage = new Map<string, { count: number; success: number; durations: number[] }>();

  session.toolCalls.forEach((call) => {
    if (!toolUsage.has(call.toolName)) {
      toolUsage.set(call.toolName, { count: 0, success: 0, durations: [] });
    }

    const stats = toolUsage.get(call.toolName)!;
    stats.count++;
    if (call.success) {
      stats.success++;
    }
    if (call.duration) {
      stats.durations.push(call.duration);
    }
  });

  const toolPerformance = Array.from(toolUsage.entries()).map(([toolName, stats]) => ({
    toolName,
    callCount: stats.count,
    successCount: stats.success,
    failCount: stats.count - stats.success,
    avgDuration:
      stats.durations.length > 0
        ? stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length
        : 0,
    totalDuration: stats.durations.reduce((a, b) => a + b, 0),
  }));

  const mostUsedTool = toolPerformance.reduce(
    (max, curr) => (curr.callCount > (max?.callCount || 0) ? curr : max),
    toolPerformance[0]
  );

  const slowestTool = toolPerformance.reduce(
    (max, curr) => (curr.avgDuration > (max?.avgDuration || 0) ? curr : max),
    toolPerformance[0]
  );

  return {
    sessionId: session.id,
    duration,
    totalSteps,
    completedSteps,
    failedSteps,
    skippedSteps,
    totalToolCalls,
    successfulToolCalls,
    failedToolCalls,
    avgToolCallDuration,
    totalPagesVisited: session.visitedPages.length,
    totalTabsCreated: session.openTabs.length,
    totalScreenshots: session.screenshots.length,
    totalErrors,
    recoverableErrors,
    errorRecoveryRate,
    mostUsedTool: mostUsedTool
      ? { name: mostUsedTool.toolName, count: mostUsedTool.callCount }
      : undefined,
    slowestTool: slowestTool
      ? { name: slowestTool.toolName, avgDuration: slowestTool.avgDuration }
      : undefined,
    toolPerformance,
  };
}
