import {
  addFlowNode,
  completeFlow,
  createFlowTracker,
  generateFlowSummary,
  generateMermaidDiagram,
} from '@/lib/utils/agent-flow-visualizer';

describe('agent-flow-visualizer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should create tracker and complete flow with timestamps', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1300);

    const tracker = createFlowTracker();
    expect(tracker.startTime).toBe(1000);
    expect(tracker.nodes).toEqual([]);

    completeFlow(tracker);
    expect(tracker.endTime).toBe(1300);
  });

  it('should add nodes with deterministic id pattern', () => {
    jest.spyOn(Date, 'now').mockReturnValue(2000);
    const tracker = createFlowTracker();

    addFlowNode(tracker, 'agent', 1, 'starting');
    addFlowNode(tracker, 'tools', 1);

    expect(tracker.nodes).toHaveLength(2);
    expect(tracker.nodes[0]).toMatchObject({
      id: 'agent_1_0',
      node: 'agent',
      iteration: 1,
      statusMessage: 'starting',
      timestamp: 2000,
    });
    expect(tracker.nodes[1].id).toBe('tools_1_1');
  });

  it('should return fallback mermaid graph when no nodes exist', () => {
    const tracker = { nodes: [], startTime: 0 };

    const diagram = generateMermaidDiagram(tracker);

    expect(diagram).toContain('Start[No flow data]');
    expect(diagram).toContain('```mermaid');
  });

  it('should generate mermaid diagram with grouped iterations, styles and truncation', () => {
    const tracker = createFlowTracker();

    addFlowNode(tracker, 'agent', 2, 'this is a very long message that should be truncated beyond forty chars');
    addFlowNode(tracker, 'tools', 2, 'tool run');
    addFlowNode(tracker, 'custom', 3, 'x');

    const diagram = generateMermaidDiagram(tracker);

    expect(diagram).toContain('subgraph Iteration2[Iteration 2]');
    expect(diagram).toContain('subgraph Iteration3[Iteration 3]');
    expect(diagram).toContain('class agent_2_0 agentStyle');
    expect(diagram).toContain('class tools_2_1 toolsStyle');
    expect(diagram).not.toContain('class custom_3_2');
    expect(diagram).toContain('custom_3_2[custom<br/><small>x</small>]');
    expect(diagram).toContain('🤖 Agent<br/><small>this is a very long message that should ...');
    expect(diagram).toContain('Start --> agent_2_0');
    expect(diagram).toContain('custom_3_2 --> End');
  });

  it('should generate summary with duration and node counts', () => {
    const tracker = {
      startTime: 1000,
      endTime: 3500,
      nodes: [
        { id: 'agent_1_0', node: 'agent', iteration: 1, timestamp: 1100 },
        { id: 'tools_1_1', node: 'tools', iteration: 1, timestamp: 1200 },
        { id: 'agent_2_2', node: 'agent', iteration: 2, timestamp: 1300 },
      ],
    };

    const summary = generateFlowSummary(tracker);

    expect(summary).toContain('**Duration**: 2.5s');
    expect(summary).toContain('**Iterations**: 2');
    expect(summary).toContain('🤖 Agent: 2');
    expect(summary).toContain('🔧 Tools: 1');
  });

  it('should return empty summary message when no nodes exist', () => {
    expect(generateFlowSummary({ nodes: [], startTime: 0 })).toBe('No flow data available.');
  });
});
