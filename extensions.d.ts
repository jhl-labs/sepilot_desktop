/**
 * Extension Module Type Declarations
 *
 * .d.ts 파일이 없는 Extension 패키지들의 타입 정의
 */

declare module '@sepilot/extension-architect' {
  const extension: import('@/lib/extensions/types').ExtensionDefinition;
  export default extension;
}

declare module '@sepilot/extension-editor' {
  const extension: import('@/lib/extensions/types').ExtensionDefinition;
  export default extension;

  // Named exports
  export interface EditorAppearanceConfig {
    fontSize: number;
    theme: string;
    lineHeight: number;
    fontFamily: string;
  }

  export interface EditorLLMPromptsConfig {
    system: string;
    user: string;
  }

  export const DEFAULT_EDITOR_APPEARANCE: EditorAppearanceConfig;
  export const DEFAULT_EDITOR_LLM_PROMPTS: EditorLLMPromptsConfig;
}

declare module '@sepilot/extension-editor/agents/editor-agent-graph' {
  export class EditorAgentGraph {
    constructor(config?: any);
  }
  export function createEditorAgentGraph(config?: any): any;
  export default EditorAgentGraph;
}

declare module '@sepilot/extension-github-actions' {
  const extension: import('@/lib/extensions/types').ExtensionDefinition;
  export default extension;
}

declare module '@sepilot/extension-github-pr-review' {
  const extension: import('@/lib/extensions/types').ExtensionDefinition;
  export default extension;
}

declare module '@sepilot/extension-github-project' {
  const extension: import('@/lib/extensions/types').ExtensionDefinition;
  export default extension;
}

declare module '@sepilot/extension-presentation' {
  const extension: import('@/lib/extensions/types').ExtensionDefinition;
  export default extension;
}

declare module '@sepilot/extension-terminal' {
  const extension: import('@/lib/extensions/types').ExtensionDefinition;
  export default extension;
}

declare module '@sepilot/extension-terminal/agents/terminal-agent-graph' {
  export class TerminalAgentGraph {
    constructor(config?: any);
  }
  export function createTerminalAgentGraph(config?: any): any;
  export default TerminalAgentGraph;
}

// agents/* 경로는 dist/에 없으므로 모든 Extension에 대해 정의
declare module '@sepilot/extension-browser/agents/browser-agent-graph' {
  export class BrowserAgentGraph {
    constructor(config?: any);
    stream(initialState: any, options?: any): AsyncIterableIterator<any>;
  }
  export function createBrowserAgentGraph(config?: any): any;
  export default BrowserAgentGraph;
}
