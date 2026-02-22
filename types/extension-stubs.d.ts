/**
 * Extension 모듈 타입 선언 (Stub)
 *
 * Public repo에는 Extension 소스가 없지만, TypeScript 컴파일을 위해
 * 모듈이 존재하는 것처럼 선언합니다.
 * 런타임에는 동적 import가 실패하면 try-catch로 처리됩니다.
 */

declare module '@sepilot/extension-browser/agents/browser-agent-graph' {
  export const BrowserAgentGraph: any;
  export function resolveGraphClass(mod: any, className: string): any;
}

declare module '@sepilot/extension-editor/agents/editor-agent-graph' {
  export const EditorAgentGraph: any;
  export function initializeLLMClient(config: any): void;
}

declare module '@sepilot/extension-editor' {
  export function initializeLLMClient(config: any): void;
}

declare module '@sepilot/extension-terminal' {
  export function executeRunCommand(args: {
    command: string;
    cwd?: string;
    timeout?: number;
  }): Promise<{
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    duration?: number;
    error?: string;
  }>;
}

declare module '@sepilot/extension-terminal/agents/terminal-agent-graph' {
  export function createTerminalAgentGraph(maxIterations?: number): any;
}
