import { randomUUID } from 'node:crypto';
import { AgentTraceEntry, AgentTraceMetrics } from '../types';

type TracePhase = AgentTraceEntry['phase'];

const PHASE_BY_NODE: Record<string, TracePhase> = {
  triage: 'triage',
  planner: 'planner',
  agent: 'agent',
  approval: 'approval',
  tools: 'tools',
  verifier: 'verifier',
  reporter: 'reporter',
};

function createBaseMetrics(): AgentTraceMetrics {
  return {
    nodeLatencyMs: {},
    toolStats: {
      total: 0,
      success: 0,
      failed: 0,
    },
    approvalStats: {
      approved: 0,
      denied: 0,
      feedback: 0,
    },
  };
}

export class AgentTraceCollector {
  private entries: AgentTraceEntry[] = [];
  private metrics: AgentTraceMetrics = createBaseMetrics();
  private inFlightNodeStart = new Map<TracePhase, number>();
  private readonly MAX_TRACE_ENTRIES = 200;

  mapNodeToPhase(nodeName: string): TracePhase | null {
    return PHASE_BY_NODE[nodeName] || null;
  }

  private pushEntry(entry: Omit<AgentTraceEntry, 'id' | 'timestamp'>) {
    this.entries.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry,
    });
    if (this.entries.length > this.MAX_TRACE_ENTRIES) {
      this.entries = this.entries.slice(-this.MAX_TRACE_ENTRIES);
    }
  }

  startNode(phase: TracePhase, iteration?: number) {
    this.inFlightNodeStart.set(phase, Date.now());
    this.pushEntry({
      phase,
      event: 'start',
      iteration,
    });
  }

  endNode(phase: TracePhase, iteration?: number, metadata?: Record<string, unknown>) {
    const startedAt = this.inFlightNodeStart.get(phase);
    const durationMs = startedAt ? Date.now() - startedAt : undefined;
    if (startedAt) {
      this.inFlightNodeStart.delete(phase);
      this.metrics.nodeLatencyMs[phase] = durationMs;
    }

    this.pushEntry({
      phase,
      event: 'end',
      iteration,
      durationMs,
      metadata,
    });
  }

  decision(
    phase: TracePhase,
    note: string,
    options?: { iteration?: number; approved?: boolean; metadata?: Record<string, unknown> }
  ) {
    this.pushEntry({
      phase,
      event: 'decision',
      note,
      iteration: options?.iteration,
      approved: options?.approved,
      metadata: options?.metadata,
    });
  }

  error(
    phase: TracePhase,
    note: string,
    options?: { iteration?: number; metadata?: Record<string, unknown> }
  ) {
    this.pushEntry({
      phase,
      event: 'error',
      note,
      iteration: options?.iteration,
      metadata: options?.metadata,
    });
  }

  toolResult(toolName: string, success: boolean, durationMs?: number, iteration?: number) {
    this.metrics.toolStats.total += 1;
    if (success) {
      this.metrics.toolStats.success += 1;
    } else {
      this.metrics.toolStats.failed += 1;
    }

    this.pushEntry({
      phase: 'tools',
      event: success ? 'end' : 'error',
      toolName,
      iteration,
      durationMs,
      metadata: { success },
    });
  }

  approvalStatus(status: 'approved' | 'denied' | 'feedback', note?: string, iteration?: number) {
    this.metrics.approvalStats[status] += 1;
    this.pushEntry({
      phase: 'approval',
      event: 'decision',
      iteration,
      approved: status === 'approved',
      note,
      metadata: { status },
    });
  }

  getEntries(): AgentTraceEntry[] {
    return [...this.entries];
  }

  getMetrics(): AgentTraceMetrics {
    return {
      nodeLatencyMs: { ...this.metrics.nodeLatencyMs },
      toolStats: { ...this.metrics.toolStats },
      approvalStats: { ...this.metrics.approvalStats },
    };
  }
}
