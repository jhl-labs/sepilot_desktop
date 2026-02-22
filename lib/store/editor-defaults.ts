/**
 * Editor Extension Default Values
 * Copied from @sepilot/extension-editor to avoid importing the extension in browser environment
 */

export type EditorAppearanceConfig = {
  fontSize: number;
  fontFamily: string;
  theme: string;
  tabSize: number;
  wordWrap: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  wordWrapColumn: number;
  minimap: boolean;
  lineNumbers: 'on' | 'off' | 'relative';
  autoSave: boolean;
  autoSaveDelay: number;
};

export type EditorLLMPromptsConfig = {
  // === 코드용 AI 프롬프트 ===
  explainCodePrompt: string;
  fixCodePrompt: string;
  improveCodePrompt: string;
  completeCodePrompt: string;
  addCommentsPrompt: string;
  generateTestPrompt: string;
  // === 문서용 AI 프롬프트 ===
  continueWritingPrompt: string;
  makeShorterPrompt: string;
  makeLongerPrompt: string;
  simplifyPrompt: string;
  fixGrammarPrompt: string;
};

export const DEFAULT_EDITOR_APPEARANCE: EditorAppearanceConfig = {
  fontSize: 14,
  fontFamily: "'Consolas', 'Courier New', monospace",
  theme: 'vs-dark',
  tabSize: 2,
  wordWrap: 'off',
  wordWrapColumn: 80,
  minimap: true,
  lineNumbers: 'on',
  autoSave: false,
  autoSaveDelay: 5000, // 5초
};

export const DEFAULT_EDITOR_LLM_PROMPTS: EditorLLMPromptsConfig = {
  // === 코드용 AI 프롬프트 ===
  explainCodePrompt: '',
  fixCodePrompt: '',
  improveCodePrompt: '',
  completeCodePrompt: '',
  addCommentsPrompt: '',
  generateTestPrompt: '',
  // === 문서용 AI 프롬프트 ===
  continueWritingPrompt: '',
  makeShorterPrompt: '',
  makeLongerPrompt: '',
  simplifyPrompt: '',
  fixGrammarPrompt: '',
};
