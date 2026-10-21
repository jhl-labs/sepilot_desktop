export function sendAiAssistant(userMessage: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent('sepilot:auto-send-message', {
      detail: { userMessage },
    }),
  )
}

export interface QuickAction {
  id: string
  label: string
  buildPrompt: (input: { selection: string; start: number; end: number }) => string
}

export const SELECTION_ACTIONS: readonly QuickAction[] = [
  {
    id: 'shorter',
    label: '더 짧게',
    buildPrompt: ({ selection, start, end }) =>
      `선택한 영역(char ${start}..${end})을 의미를 유지한 채 더 짧게 다시 써. doc.replace_range를 사용해 그 부분만 교체.\n\n선택 영역:\n${selection}`,
  },
  {
    id: 'longer',
    label: '더 길게',
    buildPrompt: ({ selection, start, end }) =>
      `선택한 영역(char ${start}..${end})을 자연스럽게 풀어 더 자세하게 다시 써. 예시나 설명을 추가해도 좋아. doc.replace_range로 그 부분만 교체.\n\n선택 영역:\n${selection}`,
  },
  {
    id: 'friendly',
    label: '친근한 어조',
    buildPrompt: ({ selection, start, end }) =>
      `선택한 영역(char ${start}..${end})을 친근하고 대화체에 가깝게 다시 써. 의미는 유지. doc.replace_range로 그 부분만 교체.\n\n선택 영역:\n${selection}`,
  },
  {
    id: 'formal',
    label: '공식적 어조',
    buildPrompt: ({ selection, start, end }) =>
      `선택한 영역(char ${start}..${end})을 정중하고 공식적인 어조로 다시 써. doc.replace_range로 그 부분만 교체.\n\n선택 영역:\n${selection}`,
  },
  {
    id: 'fix-grammar',
    label: '문법 교정',
    buildPrompt: ({ selection, start, end }) =>
      `선택한 영역(char ${start}..${end})의 맞춤법·문법·자연스러움을 교정해. 의미는 절대 바꾸지 마. doc.replace_range로 그 부분만 교체.\n\n선택 영역:\n${selection}`,
  },
  {
    id: 'add-example',
    label: '예시 추가',
    buildPrompt: ({ selection, start, end }) =>
      `선택한 영역(char ${start}..${end}) 내용을 보강할 구체적 예시 1-2개를 추가해. 기존 텍스트는 유지하면서 자연스럽게 이어 붙여. doc.replace_range로 그 부분을 (기존 + 예시) 형태로 교체.\n\n선택 영역:\n${selection}`,
  },
] as const

export interface DocAction {
  id: string
  label: string
  description: string
  buildPrompt: () => string
}

export const DOC_ACTIONS: readonly DocAction[] = [
  {
    id: 'rewrite-all',
    label: '전체 퇴고',
    description: '문서 전체 어조·문장을 다듬어 다시 쓰기',
    buildPrompt: () =>
      '활성 문서 전체를 의미는 유지하면서 더 자연스럽고 읽기 쉽게 퇴고해. 큰 변경이니 doc.diff_preview로 먼저 미리보기를 만들고 사용자 수락을 받아.',
  },
  {
    id: 'summary',
    label: '요약 추가',
    description: '문서 맨 앞에 한 단락 요약 삽입',
    buildPrompt: () =>
      '활성 문서의 핵심 내용을 3-5문장 요약하고, 그 요약을 문서 맨 앞에 "## 요약" 섹션으로 추가해. doc.insert_after_section(0, ...) 또는 적절한 위치에 doc.replace_range 사용.',
  },
  {
    id: 'outline',
    label: 'Outline 정리',
    description: '헤딩 구조를 더 일관성 있게 다시 정리',
    buildPrompt: () =>
      '활성 문서의 헤딩 구조(outline)를 더 논리적이고 일관성 있게 다시 정리해. 본문은 가능한 유지. 큰 변경이라면 doc.diff_preview 사용.',
  },
  {
    id: 'tone-consistency',
    label: '어조 일관성',
    description: '문서 전반의 어조를 통일',
    buildPrompt: () =>
      '활성 문서 전반의 어조를 검토하고 일관되지 않은 부분을 통일해. 가장 많이 쓰인 톤에 맞춰. doc.diff_preview로 변경점을 먼저 보여줘.',
  },
] as const

export type SlashCategory = 'insert' | 'ai-generate' | 'ai-transform'

interface BaseSlashCommand {
  id: string
  label: string
  description: string | (() => string)
  category: SlashCategory
  keywords: readonly string[]
}

export interface AiSlashCommand extends BaseSlashCommand {
  kind: 'ai'
  buildPrompt: (input: {
    cursor: number
    precedingText: string
    followingText: string
  }) => string
}

export interface InsertSnippet {
  text: string
  cursorOffset?: number
}

export interface InsertSlashCommand extends BaseSlashCommand {
  kind: 'insert'
  buildSnippet: (input: {
    cursor: number
    precedingText: string
    followingText: string
  }) => InsertSnippet
}

export type SlashCommand = AiSlashCommand | InsertSlashCommand

export function describeSlashCommand(command: SlashCommand): string {
  return typeof command.description === 'function'
    ? command.description()
    : command.description
}

const CATEGORY_LABEL: Record<SlashCategory, string> = {
  insert: '바로 삽입',
  'ai-generate': 'AI · 생성',
  'ai-transform': 'AI · 변환',
}

export function slashCategoryLabel(category: SlashCategory): string {
  return CATEGORY_LABEL[category]
}

function isoDateLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function paragraphSnippet(
  body: string,
  before: string,
  after: string,
  cursorBodyOffset?: number,
): InsertSnippet {
  const needsLeading = before.length > 0 && !before.endsWith('\n\n')
  const needsTrailing = after.length > 0 && !after.startsWith('\n\n')
  const lead = needsLeading ? (before.endsWith('\n') ? '\n' : '\n\n') : ''
  const trail = needsTrailing ? (after.startsWith('\n') ? '\n' : '\n\n') : '\n'
  const text = `${lead}${body}${trail}`
  return {
    text,
    cursorOffset:
      cursorBodyOffset != null ? lead.length + cursorBodyOffset : text.length,
  }
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: 'insert-divider',
    kind: 'insert',
    category: 'insert',
    label: '구분선',
    description: '수평선 (---)을 삽입',
    keywords: ['divider', 'hr', '구분선', '---'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('---', precedingText, followingText),
  },
  {
    id: 'insert-h1',
    kind: 'insert',
    category: 'insert',
    label: '제목 H1',
    description: '# 큰 제목',
    keywords: ['heading', 'h1', '제목', '헤딩1', '#'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('# ', precedingText, followingText, 2),
  },
  {
    id: 'insert-h2',
    kind: 'insert',
    category: 'insert',
    label: '제목 H2',
    description: '## 중간 제목',
    keywords: ['heading', 'h2', '제목', '헤딩2', '##'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('## ', precedingText, followingText, 3),
  },
  {
    id: 'insert-h3',
    kind: 'insert',
    category: 'insert',
    label: '제목 H3',
    description: '### 작은 제목',
    keywords: ['heading', 'h3', '제목', '헤딩3', '###'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('### ', precedingText, followingText, 4),
  },
  {
    id: 'insert-checkbox',
    kind: 'insert',
    category: 'insert',
    label: '체크박스',
    description: '- [ ] 체크박스 한 줄',
    keywords: ['checkbox', 'todo', '체크', '할일', 'task'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('- [ ] ', precedingText, followingText, 6),
  },
  {
    id: 'insert-bullet',
    kind: 'insert',
    category: 'insert',
    label: '글머리 기호',
    description: '- bullet 한 줄',
    keywords: ['bullet', 'list', '글머리', '목록', '-'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('- ', precedingText, followingText, 2),
  },
  {
    id: 'insert-quote',
    kind: 'insert',
    category: 'insert',
    label: '인용',
    description: '> 인용 한 단락',
    keywords: ['quote', 'blockquote', '인용', '>'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('> ', precedingText, followingText, 2),
  },
  {
    id: 'insert-callout',
    kind: 'insert',
    category: 'insert',
    label: '콜아웃',
    description: '> 💡 강조 박스 (GFM blockquote)',
    keywords: ['callout', 'note', 'tip', '강조', '콜아웃'],
    buildSnippet: ({ precedingText, followingText }) => {
      const prefix = '> 💡 '
      return paragraphSnippet(prefix, precedingText, followingText, prefix.length)
    },
  },
  {
    id: 'insert-code-empty',
    kind: 'insert',
    category: 'insert',
    label: '빈 코드 블록',
    description: '```\n```',
    keywords: ['code', 'codeblock', '코드'],
    buildSnippet: ({ precedingText, followingText }) =>
      paragraphSnippet('```\n\n```', precedingText, followingText, '```\n'.length),
  },
  {
    id: 'insert-date',
    kind: 'insert',
    category: 'insert',
    label: '현재 날짜',
    description: () => `오늘 날짜 (${isoDateLocal()})`,
    keywords: ['date', 'today', '오늘', '날짜'],
    buildSnippet: () => ({ text: isoDateLocal() }),
  },

  {
    id: 'continue',
    kind: 'ai',
    category: 'ai-generate',
    label: '이어쓰기',
    description: '커서 위치에서 자연스러운 한 단락 이어 쓰기',
    keywords: ['continue', 'write', 'cont', '이어', '계속'],
    buildPrompt: buildContinueWritingPrompt,
  },
  {
    id: 'brainstorm',
    kind: 'ai',
    category: 'ai-generate',
    label: '아이디어 5개',
    description: '현재 맥락에 어울리는 아이디어 5개를 bullet으로',
    keywords: ['brainstorm', 'idea', 'ideas', '아이디어', '브레인'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 위치(char ${cursor})에 현재 문맥에 어울리는 아이디어 5개를 markdown bullet (-)로 삽입해.`,
        '각 항목은 한 문장, 구체적이고 행동 가능한 형태로.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 문맥 (마지막 1500자)',
        '```',
        precedingText.slice(-1500),
        '```',
      ].join('\n'),
  },
  {
    id: 'todo',
    kind: 'ai',
    category: 'ai-generate',
    label: '할 일 목록 (AI)',
    description: '문맥에 맞는 체크박스 할 일 5개를 LLM으로 생성',
    keywords: ['todo', 'task', 'checklist', '할일', '체크리스트'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 위치(char ${cursor})에 현재 문맥에 맞는 할 일 5개를 GFM 체크박스 (- [ ])로 삽입해.`,
        '각 항목은 실행 가능한 액션 한 문장.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 문맥',
        '```',
        precedingText.slice(-1500),
        '```',
      ].join('\n'),
  },
  {
    id: 'table',
    kind: 'ai',
    category: 'ai-generate',
    label: '표 만들기 (AI)',
    description: '현재 맥락에 어울리는 markdown 표 생성',
    keywords: ['table', '표', '테이블'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 위치(char ${cursor})에 현재 문맥에 어울리는 GFM markdown 표 (3-5행)를 삽입해.`,
        '컬럼은 3개 내외. 표 위 아래에 빈 줄 1개씩.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 문맥',
        '```',
        precedingText.slice(-1500),
        '```',
      ].join('\n'),
  },
  {
    id: 'code-ai',
    kind: 'ai',
    category: 'ai-generate',
    label: '코드 예시 (AI)',
    description: '문맥에 맞는 코드 예시 생성',
    keywords: ['code', '코드', 'snippet'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 위치(char ${cursor})에 현재 문맥에 어울리는 코드 예시를 fenced code block으로 삽입해.`,
        '언어 태그를 명시(예: ```ts). 30줄 이내.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 문맥',
        '```',
        precedingText.slice(-1500),
        '```',
      ].join('\n'),
  },
  {
    id: 'title',
    kind: 'ai',
    category: 'ai-generate',
    label: '제목 생성',
    description: '현재 본문을 보고 H1 제목 후보 한 줄 삽입',
    keywords: ['title', 'h1', '제목', '타이틀'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `현재 본문을 보고 어울리는 H1 제목 한 줄을 cursor 위치(char ${cursor})에 삽입해.`,
        '형식: "# {제목}\\n". 군더더기 없이 핵심을 담은 짧은 명사구로.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 본문',
        '```',
        precedingText.slice(-3000),
        '```',
      ].join('\n'),
  },

  {
    id: 'summarize',
    kind: 'ai',
    category: 'ai-transform',
    label: '여기까지 요약',
    description: '커서 직전까지의 본문을 3-5문장으로 요약',
    keywords: ['summary', 'summarize', '요약'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 위치(char ${cursor})까지의 본문을 3-5문장으로 요약해 cursor 자리에 삽입해.`,
        '요약은 새 단락으로 시작하고, 핵심 주제와 결론만 간결하게.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 본문 (마지막 4000자)',
        '```',
        precedingText.slice(-4000),
        '```',
      ].join('\n'),
  },
  {
    id: 'tldr',
    kind: 'ai',
    category: 'ai-transform',
    label: 'TL;DR 한 줄',
    description: '본문 전체를 한 줄로 압축',
    keywords: ['tldr', 'tl;dr', 'oneliner', '한줄', '한 줄'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 위치(char ${cursor})에 본문 전체의 핵심을 한 문장으로 압축해 삽입해.`,
        '형식: "**TL;DR:** {한 문장}". 너무 길지 않게.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 본문',
        '```',
        precedingText.slice(-4000),
        '```',
      ].join('\n'),
  },
  {
    id: 'explain',
    kind: 'ai',
    category: 'ai-transform',
    label: '직전 단락 풀어쓰기',
    description: '커서 직전 단락을 더 자세히 풀어 설명',
    keywords: ['explain', 'expand', '풀어', '설명'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 직전 단락을 더 자세히 풀어 cursor 위치(char ${cursor})에 새 단락으로 삽입해.`,
        '기존 단락은 유지. 예시나 배경 설명을 추가해 이해를 돕도록.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 본문',
        '```',
        precedingText.slice(-2000),
        '```',
      ].join('\n'),
  },
  {
    id: 'translate-ko-en',
    kind: 'ai',
    category: 'ai-transform',
    label: '번역: 한 → 영',
    description: '직전 단락을 영어로 번역해 cursor 자리에 삽입',
    keywords: ['translate', 'english', '영어', '번역', 'ko-en'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 직전 단락을 자연스러운 영어로 번역해 cursor 위치(char ${cursor})에 삽입해.`,
        '원문 톤과 의미를 유지. 어색한 직역 금지.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 본문',
        '```',
        precedingText.slice(-2000),
        '```',
      ].join('\n'),
  },
  {
    id: 'translate-en-ko',
    kind: 'ai',
    category: 'ai-transform',
    label: '번역: 영 → 한',
    description: '직전 단락을 한국어로 번역해 cursor 자리에 삽입',
    keywords: ['translate', 'korean', '한국어', '번역', 'en-ko'],
    buildPrompt: ({ cursor, precedingText }) =>
      [
        `cursor 직전 단락을 자연스러운 한국어로 번역해 cursor 위치(char ${cursor})에 삽입해.`,
        '원문 톤과 의미를 유지.',
        `doc.replace_range(${cursor}, ${cursor}, 새 텍스트)로 정확히 삽입.`,
        '',
        '### 직전 본문',
        '```',
        precedingText.slice(-2000),
        '```',
      ].join('\n'),
  },
] as const

export function filterSlashCommands(query: string): readonly SlashCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((c) => {
    if (c.label.toLowerCase().includes(q)) return true
    return c.keywords.some((k) => k.toLowerCase().includes(q))
  })
}

export function buildContinueWritingPrompt(input: {
  cursor: number
  precedingText: string
  followingText: string
}): string {
  const before = input.precedingText.slice(-1500)
  const after = input.followingText.slice(0, 500)
  return [
    `cursor 위치(char ${input.cursor})에서 자연스러운 한 단락을 이어 써.`,
    'cursor 직전 문맥과 일관된 어조·주제로 이어가. 새 문단을 시작해도 좋고 같은 문단 안에 이어붙여도 좋음.',
    `doc.replace_range(${input.cursor}, ${input.cursor}, 새 텍스트)로 cursor 자리에 정확히 삽입.`,
    '',
    '### Cursor 직전 (마지막 1500자)',
    '```',
    before,
    '```',
    '',
    '### Cursor 직후 (앞 500자)',
    '```',
    after,
    '```',
  ].join('\n')
}
