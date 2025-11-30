/**
 * Editor 외형 설정
 */
export interface EditorAppearanceConfig {
  fontSize: number; // 10-24px
  fontFamily: string;
  theme: 'vs-dark' | 'vs-light'; // Monaco Editor 테마
  tabSize: number; // 2, 4, 8
  wordWrap: 'on' | 'off';
  minimap: boolean;
  lineNumbers: 'on' | 'off';
}

/**
 * Editor LLM 프롬프트 설정
 */
export interface EditorLLMPromptsConfig {
  // 자동 완성 프롬프트
  autoCompletePrompt: string;

  // 컨텍스트 메뉴 프롬프트
  explainCodePrompt: string;
  refactorCodePrompt: string;
  fixBugPrompt: string;
  addCommentsPrompt: string;
  generateTestPrompt: string;
}

/**
 * 기본 Editor 외형 설정
 */
export const DEFAULT_EDITOR_APPEARANCE: EditorAppearanceConfig = {
  fontSize: 14,
  fontFamily: "'Consolas', 'Courier New', monospace",
  theme: 'vs-dark',
  tabSize: 2,
  wordWrap: 'off',
  minimap: true,
  lineNumbers: 'on',
};

/**
 * 기본 Editor LLM 프롬프트
 */
export const DEFAULT_EDITOR_LLM_PROMPTS: EditorLLMPromptsConfig = {
  autoCompletePrompt: 'Complete the following code based on the context. Only return the completion, no explanation.',

  explainCodePrompt: 'Explain what the following code does in Korean. Be concise and clear.',

  refactorCodePrompt: 'Refactor the following code to improve readability, performance, and maintainability. Explain the changes in Korean.',

  fixBugPrompt: 'Analyze the following code for potential bugs and suggest fixes. Explain the issues and solutions in Korean.',

  addCommentsPrompt: 'Add clear and concise comments to the following code. Use Korean for comments.',

  generateTestPrompt: 'Generate unit tests for the following code. Use a popular testing framework appropriate for the language.',
};

/**
 * 사용 가능한 폰트 목록
 */
export const EDITOR_AVAILABLE_FONTS = [
  { value: "'Consolas', 'Courier New', monospace", label: 'Consolas' },
  { value: "'Monaco', monospace", label: 'Monaco' },
  { value: "'Menlo', monospace", label: 'Menlo' },
  { value: "'Courier New', monospace", label: 'Courier New' },
  { value: "'Fira Code', monospace", label: 'Fira Code' },
  { value: "'Source Code Pro', monospace", label: 'Source Code Pro' },
  { value: "'JetBrains Mono', monospace", label: 'JetBrains Mono' },
  { value: "'D2Coding', monospace", label: 'D2Coding' },
  { value: "'Nanum Gothic Coding', monospace", label: 'Nanum Gothic Coding' },
];
