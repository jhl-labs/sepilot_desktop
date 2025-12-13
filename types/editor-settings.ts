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
  minimap: true,
  lineNumbers: 'on',
};

/**
 * 기본 Editor LLM 프롬프트
 */
export const DEFAULT_EDITOR_LLM_PROMPTS: EditorLLMPromptsConfig = {
  // === 코드용 AI 프롬프트 ===
  explainCodePrompt:
    '다음 코드가 무엇을 하는지 한국어로 설명해주세요. 간결하고 명확하게 작성해주세요.',

  fixCodePrompt:
    '다음 코드의 잠재적인 버그를 분석하고 수정해주세요. 수정된 코드만 반환하고, 문제점과 해결책을 주석으로 간략히 설명해주세요.',

  improveCodePrompt:
    '다음 코드의 가독성, 성능, 유지보수성을 개선해주세요. 개선된 코드만 반환하고, 주요 변경사항을 주석으로 간략히 설명해주세요.',

  completeCodePrompt:
    '컨텍스트를 기반으로 다음 코드를 완성해주세요. 완성할 코드만 반환하고, 설명은 포함하지 마세요.',

  addCommentsPrompt:
    '다음 코드에 명확하고 간결한 주석을 추가해주세요. 한국어로 주석을 작성하고, 코드의 의도와 로직을 설명해주세요.',

  generateTestPrompt:
    '다음 코드에 대한 단위 테스트를 생성해주세요. 해당 언어에 적합한 테스트 프레임워크를 사용하세요.',

  // === 문서용 AI 프롬프트 ===
  continueWritingPrompt:
    '다음 텍스트를 자연스럽게 이어서 작성해주세요. 문맥과 스타일을 유지하세요.',

  makeShorterPrompt: '다음 텍스트를 핵심 내용을 유지하면서 더 짧게 요약해주세요.',

  makeLongerPrompt:
    '다음 텍스트를 더 자세하고 풍부하게 확장해주세요. 추가적인 설명이나 예시를 포함하세요.',

  simplifyPrompt: '다음 텍스트를 더 간단하고 이해하기 쉬운 언어로 다시 작성해주세요.',

  fixGrammarPrompt: '다음 텍스트의 맞춤법과 문법 오류를 수정해주세요. 수정된 텍스트만 반환하세요.',

  summarizePrompt: '다음 내용의 핵심을 요약해주세요. 주요 포인트를 간결하게 정리해주세요.',

  translatePrompt: '다음 텍스트를 {targetLanguage}로 번역해주세요. 자연스러운 표현을 사용하세요.',
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
