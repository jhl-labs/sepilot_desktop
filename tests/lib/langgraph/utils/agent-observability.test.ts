import { AgentTraceCollector } from '@/lib/domains/agent/utils/agent-observability';

describe('agent-observability', () => {
  it('records node latency, tool stats, and approval stats', () => {
    const collector = new AgentTraceCollector();

    collector.startNode('agent', 1);
    collector.endNode('agent', 1);
    collector.toolResult('file_edit', true, 100, 1);
    collector.toolResult('command_execute', false, 200, 1);
    collector.approvalStatus('feedback', 'requires approval', 1);
    collector.approvalStatus('approved', 'approved', 1);

    const metrics = collector.getMetrics();
    expect(metrics.nodeLatencyMs.agent).toBeDefined();
    expect(metrics.toolStats.total).toBe(2);
    expect(metrics.toolStats.success).toBe(1);
    expect(metrics.toolStats.failed).toBe(1);
    expect(metrics.approvalStats.feedback).toBe(1);
    expect(metrics.approvalStats.approved).toBe(1);
  });

  it('maps known node names to trace phases', () => {
    const collector = new AgentTraceCollector();
    expect(collector.mapNodeToPhase('tools')).toBe('tools');
    expect(collector.mapNodeToPhase('unknown')).toBeNull();
  });
});
