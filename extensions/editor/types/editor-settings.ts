/**
 * Editor 외형 설정
 */
export interface EditorAppearanceConfig {
  fontSize: number; // 10-24px
  fontFamily: string;
  theme: 'vs-dark' | 'vs-light'; // Monaco Editor 테마
  tabSize: number; // 2, 4, 8
  wordWrap: 'on' | 'off' | 'wordWrapColumn' | 'bounded';
  wordWrapColumn: number;
  minimap: boolean;
  lineNumbers: 'on' | 'off';
}

/**
 * Editor LLM 프롬프트 설정
 * 코드용과 문서용으로 구분
 */
export interface EditorLLMPromptsConfig {
  // === 코드용 AI 프롬프트 ===
  /** 코드 설명 */
  explainCodePrompt: string;
  /** 코드 버그 수정 */
  fixCodePrompt: string;
  /** 코드 개선/리팩토링 */
  improveCodePrompt: string;
  /** 코드 자동 완성 */
  completeCodePrompt: string;
  /** 주석 추가 */
  addCommentsPrompt: string;
  /** 테스트 생성 */
  generateTestPrompt: string;

  // === 문서용 AI 프롬프트 ===
  /** 계속 작성 */
  continueWritingPrompt: string;
  /** 짧게 만들기 */
  makeShorterPrompt: string;
  /** 길게 만들기 */
  makeLongerPrompt: string;
  /** 단순화 */
  simplifyPrompt: string;
  /** 문법/맞춤법 수정 */
  fixGrammarPrompt: string;
  /** 요약 */
  summarizePrompt: string;
  /** 번역 */
  translatePrompt: string;
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
  wordWrapColumn: 80,
  minimap: true,
  lineNumbers: 'on',
};

/**
 * 기본 Editor LLM 프롬프트
 *
 * 주의: 이 값은 타입 안정성을 위한 placeholder입니다.
 * 실제 기본값은 다국어 시스템을 통해 EditorSettings 컴포넌트에서 설정됩니다.
 * 하드코딩된 값은 사용하지 않으며, 마이그레이션 로직에 의해 자동으로 번역된 값으로 대체됩니다.
 */
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
  summarizePrompt: '',
  translatePrompt: '',
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
