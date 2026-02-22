/**
 * Agent SDK - Extension Agent 개발을 위한 모듈
 *
 * @example
 * ```typescript
 * import { BaseAgentGraph, type AgentGraphServices } from '@sepilot/extension-sdk/agent';
 *
 * class MyAgentGraph extends BaseAgentGraph<MyState> {
 *   protected createStateAnnotation() { ... }
 *   protected buildNodes(workflow) { ... }
 *   protected buildEdges(workflow) { ... }
 * }
 * ```
 */

// Base class
export { BaseAgentGraph } from './base-agent-graph';
export type { BaseAgentState, AgentGraphExecutionOptions } from './base-agent-graph';

// Services interface (DI)
export type {
  AgentGraphServices,
  AgentLLMService,
  AgentStreamingService,
  AgentToolsService,
  AgentMCPService,
  AgentLanguageService,
  AgentSkillsService,
} from './services';

// Runtime interface (Host implements)
export type { AgentRuntime, CompiledAgentGraph } from './runtime';

// State Registry (Host registers, Extension uses)
export {
  registerAgentStateRegistry,
  getAgentStateAnnotation,
  getCodingAgentStateAnnotation,
  createAgentState,
  createCodingAgentState,
} from './state-registry';
export type { AgentStateRegistry } from './state-registry';

// Tools Registry (Host registers, Extension uses)
export { registerToolsRegistry, getToolsNode, getShouldUseTool } from './tools-registry';
export type { AgentToolsRegistry } from './tools-registry';

// Agent State types
export type { AgentState, CodingAgentState, GeneratedImage } from '../types/agent-state';
