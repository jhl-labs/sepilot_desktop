/**
 * Agent Flow Visualizer
 *
 * Coding Agent의 실행 흐름을 추적하고 Mermaid 다이어그램으로 변환
 */

export interface FlowNode {
  id: string;
  node: string; // 'agent', 'tools', 'verifier', 'reporter'
  iteration: number;
  statusMessage?: string;
  timestamp: number;
}

export interface AgentFlowTracker {
  nodes: FlowNode[];
  startTime: number;
  endTime?: number;
}

/**
 * Create a new flow tracker
 */
export function createFlowTracker(): AgentFlowTracker {
  return {
    nodes: [],
    startTime: Date.now(),
  };
}

/**
 * Add a node to the flow tracker
 */
export function addFlowNode(
  tracker: AgentFlowTracker,
  node: string,
  iteration: number,
  statusMessage?: string
): void {
  tracker.nodes.push({
    id: `${node}_${iteration}_${tracker.nodes.length}`,
    node,
    iteration,
    statusMessage,
    timestamp: Date.now(),
  });
}

/**
 * Mark flow as complete
 */
export function completeFlow(tracker: AgentFlowTracker): void {
  tracker.endTime = Date.now();
}

/**
 * Generate Mermaid diagram from flow tracker
 */
export function generateMermaidDiagram(tracker: AgentFlowTracker): string {
  if (tracker.nodes.length === 0) {
    return '```mermaid\ngraph TD\n    Start[No flow data]\n```';
  }

  const lines: string[] = ['```mermaid', 'graph TD'];

  // Group nodes by iteration
  const iterationGroups = new Map<number, FlowNode[]>();
  for (const node of tracker.nodes) {
    if (!iterationGroups.has(node.iteration)) {
      iterationGroups.set(node.iteration, []);
    }
    iterationGroups.get(node.iteration)!.push(node);
  }

  // Start node
  lines.push('    Start([Start])');

  let previousNodeId = 'Start';
  const iterations = Array.from(iterationGroups.keys()).sort((a, b) => a - b);

  for (let i = 0; i < iterations.length; i++) {
    const iteration = iterations[i];
    const nodes = iterationGroups.get(iteration)!;

    // Subgraph for iteration
    lines.push(`    subgraph Iteration${iteration}[Iteration ${iteration}]`);

    for (let j = 0; j < nodes.length; j++) {
      const node = nodes[j];
      const nodeLabel = getNodeLabel(node);
      const nodeShape = getNodeShape(node.node);

      // Node definition
      lines.push(`        ${node.id}${nodeShape[0]}${nodeLabel}${nodeShape[1]}`);

      // Connection from previous node
      if (j === 0) {
        lines.push(`    ${previousNodeId} --> ${node.id}`);
      } else {
        const prevNode = nodes[j - 1];
        lines.push(`        ${prevNode.id} --> ${node.id}`);
      }

      // Apply style based on node type
      const styleClass = getNodeStyleClass(node.node);
      if (styleClass) {
        lines.push(`        class ${node.id} ${styleClass}`);
      }
    }

    lines.push('    end');

    // Update previous node for next iteration
    previousNodeId = nodes[nodes.length - 1].id;
  }

  // End node
  lines.push('    End([End])');
  lines.push(`    ${previousNodeId} --> End`);

  // Style definitions
  lines.push('');
  lines.push('    classDef agentStyle fill:#e1f5ff,stroke:#0288d1,stroke-width:2px');
  lines.push('    classDef toolsStyle fill:#fff3e0,stroke:#f57c00,stroke-width:2px');
  lines.push('    classDef verifierStyle fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px');
  lines.push('    classDef reporterStyle fill:#e8f5e9,stroke:#388e3c,stroke-width:2px');

  lines.push('```');

  return lines.join('\n');
}

/**
 * Get node label with status message
 */
function getNodeLabel(node: FlowNode): string {
  const baseLabel = getNodeName(node.node);

  if (node.statusMessage) {
    // Truncate long messages
    const msg =
      node.statusMessage.length > 40
        ? `${node.statusMessage.substring(0, 40)}...`
        : node.statusMessage;
    return `${baseLabel}<br/><small>${msg}</small>`;
  }

  return baseLabel;
}

/**
 * Get node display name
 */
function getNodeName(node: string): string {
  const names: Record<string, string> = {
    agent: '🤖 Agent',
    tools: '🔧 Tools',
    verifier: '✅ Verifier',
    reporter: '📊 Reporter',
  };
  return names[node] || node;
}

/**
 * Get node shape (opening and closing brackets)
 */
function getNodeShape(node: string): [string, string] {
  const shapes: Record<string, [string, string]> = {
    agent: ['[', ']'], // Rectangle
    tools: ['[[', ']]'], // Subroutine
    verifier: ['{', '}'], // Rhombus
    reporter: ['[(', ')]'], // Stadium
  };
  return shapes[node] || ['[', ']'];
}

/**
 * Get node CSS class for styling
 */
function getNodeStyleClass(node: string): string | null {
  const classes: Record<string, string> = {
    agent: 'agentStyle',
    tools: 'toolsStyle',
    verifier: 'verifierStyle',
    reporter: 'reporterStyle',
  };
  return classes[node] || null;
}

/**
 * Generate simple summary text
 */
export function generateFlowSummary(tracker: AgentFlowTracker): string {
  if (tracker.nodes.length === 0) {
    return 'No flow data available.';
  }

  const duration = tracker.endTime
    ? ((tracker.endTime - tracker.startTime) / 1000).toFixed(1)
    : 'N/A';

  const iterationCount = new Set(tracker.nodes.map((n) => n.iteration)).size;
  const nodeCounts: Record<string, number> = {};

  for (const node of tracker.nodes) {
    nodeCounts[node.node] = (nodeCounts[node.node] || 0) + 1;
  }

  const summary = [
    `**Coding Agent Execution Summary**`,
    ``,
    `- **Duration**: ${duration}s`,
    `- **Iterations**: ${iterationCount}`,
    `- **Nodes Executed**:`,
  ];

  for (const [nodeName, count] of Object.entries(nodeCounts)) {
    summary.push(`  - ${getNodeName(nodeName)}: ${count}`);
  }

  return summary.join('\n');
}
