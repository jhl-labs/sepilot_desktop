import { CHAT_MODES, isChatModeId, type ChatModeId, type ChatModeMeta } from './chat-modes'

export type SlashCommandCategory =
  | 'session'
  | 'model'
  | 'mode'
  | 'context'
  | 'knowledge'
  | 'tools'
  | 'automation'
  | 'admin'
  | 'info'
  | 'ui'

export const CATEGORY_LABEL: Record<SlashCommandCategory, string> = {
  session: '세션',
  model: '모델',
  mode: '모드 / 권한',
  context: '컨텍스트 / 메모리',
  knowledge: '지식 / 문서',
  tools: '도구 / 연동',
  automation: '자동화',
  admin: 'daemon 관리',
  info: '정보 / 진단',
  ui: 'UI',
}

const CATEGORY_ORDER: readonly SlashCommandCategory[] = [
  'session',
  'model',
  'mode',
  'context',
  'knowledge',
  'tools',
  'automation',
  'admin',
  'info',
  'ui',
] as const

export interface SlashCommand {
  name: string
  description: string
  category: SlashCommandCategory
  args?: string
}

export interface SlashCommandPaletteItem {
  label: string
  description: string
  insertValue: string
  category?: SlashCommandCategory
}

const CLI_ALIGNED_SLASH_COMMANDS: readonly SlashCommand[] = [
  { name: '/new', description: '새 세션 시작', category: 'session' },
  { name: '/clear', description: '활성 대화 컨텍스트 비우기', category: 'session' },
  {
    name: '/session',
    description: '세션 타임라인 (이어가기/포크/압축/내보내기/삭제)',
    args: '[current|branch|compact|export|delete]',
    category: 'session',
  },
  {
    name: '/resume',
    description: '체크포인트 이어가기 또는 최근 세션 열기',
    args: '[--force]',
    category: 'session',
  },
  { name: '/continue', description: '/resume 별칭', args: '[--force]', category: 'session' },
  {
    name: '/rewind',
    description: '이전 user turn 앞에서 새 포크 만들기',
    args: '[turns]',
    category: 'session',
  },
  { name: '/compact', description: '대화를 요약해 컨텍스트 절약', category: 'session' },
  { name: '/report', description: '현재 대화의 마크다운 리포트 다이얼로그', category: 'session' },
  {
    name: '/model',
    description: '모델/프로바이더 피커 열기 또는 세션 모델 변경',
    args: '<provider/model|name|current|default>',
    category: 'model',
  },
  {
    name: '/provider',
    description: '프로바이더 피커, 전환, 또는 설정',
    args: '<name|current|setup|edit|default|delete>',
    category: 'model',
  },
  { name: '/providers', description: '사용 가능한 프로바이더 목록', category: 'model' },
  {
    name: '/mode',
    description: '에이전트 모드 피커 또는 모드 변경',
    args: '<mode|current>',
    category: 'mode',
  },
  {
    name: '/privilege',
    description: 'privilege 레벨 피커 또는 변경',
    args: '<level|current>',
    category: 'mode',
  },
  {
    name: '/autonomy',
    description: 'privilege 레벨 피커 또는 변경 (/privilege 별칭)',
    args: '<level|current>',
    category: 'mode',
  },
  {
    name: '/thinking',
    description: 'thinking 레벨 설정',
    args: '<off|low|medium|high|max>',
    category: 'mode',
  },
  {
    name: '/max-tokens',
    description: '세션 출력 토큰 상한',
    args: '<number|off|current>',
    category: 'mode',
  },
  {
    name: '/context',
    description: '컨텍스트 맵: 토큰 사용량/이어가기/되감기 대상',
    args: '[map|resume|rewind]',
    category: 'context',
  },
  {
    name: '/memory',
    description: '시맨틱 메모리 검색',
    args: '<query|current|close>',
    category: 'context',
  },
  {
    name: '/remember',
    description: '수동으로 메모리 항목 저장',
    args: '<content>',
    category: 'context',
  },
  { name: '/files', description: '파일 첨부 피커', category: 'context' },
  { name: '/artifacts', description: '현재 세션의 저장된 아티팩트', category: 'context' },
  {
    name: '/project',
    description: '활성 프로젝트 선택 또는 정보',
    args: '<name|auto|none>',
    category: 'context',
  },
  {
    name: '/rag',
    description: '로컬 RAG 소스 검색/추가/동기화',
    args: '[search <query>|add <path>|sync|current|close]',
    category: 'knowledge',
  },
  {
    name: '/team-docs',
    description: '팀 문서 소스 관리',
    args: '[list|add|docs|show|test|sync|sync-all|remove]',
    category: 'knowledge',
  },
  {
    name: '/personal-docs',
    description: '개인 문서 관리',
    args: '[list|show|set|delete]',
    category: 'knowledge',
  },
  {
    name: '/prompts',
    description: '프롬프트 템플릿 관리',
    args: '[list|show|set|delete]',
    category: 'knowledge',
  },
  {
    name: '/snippets',
    description: '재사용 코드 스니펫 관리',
    args: '[list|set|delete]',
    category: 'knowledge',
  },
  {
    name: '/wiki',
    description: 'daemon wiki 노드 관리',
    args: '[tree|search|set|delete|move]',
    category: 'knowledge',
  },
  {
    name: '/skills',
    description: '설치된 skills, 스토어 검색, 설치',
    args: '<installed|store|search|install>',
    category: 'tools',
  },
  {
    name: '/skills-admin',
    description: 'daemon skills 활성/비활성 관리',
    args: '[list|enable|disable]',
    category: 'tools',
  },
  {
    name: '/mcp',
    description: 'MCP 서버 상태/도구/프롬프트/리소스/마켓플레이스 관리',
    args: '[list|add|search|install|marketplace|enable|disable|remove|tools|prompts|resources|logging|metrics|call]',
    category: 'tools',
  },
  {
    name: '/hooks',
    description: 'outbound delivery hook 관리',
    args: '<list|add|deliveries|dead-letters|replay|ack>',
    category: 'tools',
  },
  {
    name: '/webhooks',
    description: 'generic inbound webhook endpoint 관리',
    args: '[list|add|enable|disable|remove]',
    category: 'tools',
  },
  {
    name: '/channels',
    description: 'Slack / Telegram / Webhook 채널 및 보안 진단',
    args: '[list|telegram|slack|pipeline|security ...]',
    category: 'tools',
  },
  {
    name: '/telegram',
    description: 'Telegram 채널 설정, pairing, 허용 사용자, rate limit',
    category: 'tools',
  },
  {
    name: '/github',
    description: 'GitHub OAuth 및 sync 설정',
    args: '[status|login|repos|policy|enable|disable]',
    category: 'tools',
  },
  {
    name: '/extensions',
    description: '확장 목록/설치/활성화/비활성화/삭제',
    args: '[list|install|enable|disable|remove]',
    category: 'tools',
  },
  {
    name: '/acp',
    description: 'ACP 에디터/외부 에이전트 연동 정보',
    args: '[help|status|config|opencode|codex|zed]',
    category: 'tools',
  },
  {
    name: '/scheduler',
    description: '스케줄러 job 목록/추가/활성화/삭제',
    args: '[add|enable|disable|remove]',
    category: 'automation',
  },
  {
    name: '/quick-input',
    description: '빠른 입력 설정 또는 텍스트 publish',
    args: '[publish <text>|set prefix|hotkey]',
    category: 'automation',
  },
  {
    name: '/messages',
    description: '메시지 구독 큐 관리',
    args: '[overview|list|start|stop|refresh|process]',
    category: 'automation',
  },
  { name: '/queue', description: 'daemon message queue snapshot', category: 'automation' },
  {
    name: '/jobs',
    description: 'daemon jobs 상태 확인/취소',
    args: '[status|items|cancel]',
    category: 'automation',
  },
  {
    name: '/migration',
    description: 'migration 실행/상태/리포트/취소',
    args: '[run|status|report|cancel]',
    category: 'automation',
  },
  {
    name: '/subagent',
    description: '격리된 subagent dispatch',
    args: 'dispatch <prompt>',
    category: 'automation',
  },
  {
    name: '/swarm',
    description: '외부 CLI agents를 tmux에서 오케스트레이션',
    args: '<run|run!|list|history|status|agents|logs|kill|attach|help>',
    category: 'automation',
  },
  {
    name: '/status',
    description: 'daemon health, boot info, clients, capabilities, shutdown',
    args: '[boot|clients|capabilities|shutdown confirm]',
    category: 'admin',
  },
  {
    name: '/config',
    description: 'config, policy, daemon config key/env 업데이트',
    args: '[policy|set <key> <value>|env set <KEY> <value>]',
    category: 'admin',
  },
  {
    name: '/settings-json',
    description: 'daemon settings JSON 보기/교체/patch',
    args: '[show|set <json>|patch <json>]',
    category: 'admin',
  },
  {
    name: '/settings',
    description: '설정 다이얼로그 열기 또는 daemon 설정 검사',
    args: '[general|llm]',
    category: 'admin',
  },
  {
    name: '/llm',
    description: 'LLM provider 조회 또는 연결 테스트',
    args: '[providers|test <provider> [model]]',
    category: 'admin',
  },
  {
    name: '/network',
    description: 'network 설정 조회/probe/update',
    args: '[probe <url>|set proxy|timeout|concurrency]',
    category: 'admin',
  },
  {
    name: '/notifications',
    description: '알림 목록/publish/read/settings',
    args: '[list|publish|read|settings]',
    category: 'admin',
  },
  {
    name: '/rag-admin',
    description: '로컬 RAG 폴더/문서/진단 관리',
    args: '[folders|docs|show|set|delete|sync|test-vector|test-rerank]',
    category: 'admin',
  },
  { name: '/usage-snapshot', description: 'raw daemon usage counters', category: 'admin' },
  {
    name: '/files-admin',
    description: '업로드 파일 조회/index/search/delete',
    args: '[search|info|content-part|index|delete]',
    category: 'admin',
  },
  {
    name: '/backups',
    description: 'daemon backup 목록/생성/삭제',
    args: '[list|create|delete]',
    category: 'admin',
  },
  {
    name: '/tokens',
    description: 'daemon extension token 목록/발급/폐기',
    args: '[list|issue|revoke]',
    category: 'admin',
  },
  {
    name: '/secrets',
    description: '암호화된 daemon secret 설정/목록/삭제',
    args: '[list|set|remove]',
    category: 'admin',
  },
  {
    name: '/devices',
    description: 'paired daemon device 목록/인증/폐기',
    args: '[list|challenge|complete|revoke]',
    category: 'admin',
  },
  { name: '/personas', description: 'daemon persona 목록', category: 'admin' },
  { name: '/plugins', description: 'daemon plugin loader 상태', category: 'admin' },
  {
    name: '/agents',
    description: 'user agent 목록/생성/삭제',
    args: '[list|create|delete]',
    category: 'admin',
  },
  {
    name: '/commands',
    description: 'custom slash command 목록/생성/삭제',
    args: '[list|create|delete]',
    category: 'admin',
  },
  {
    name: '/cron',
    description: 'legacy daemon cron task 관리',
    args: '[list|add|remove]',
    category: 'admin',
  },
  {
    name: '/image-gen',
    description: '이미지 provider/job 조회, 생성, 취소',
    args: '[providers|jobs|create|cancel]',
    category: 'admin',
  },
  {
    name: '/observability',
    description: 'observability snapshot/event/crash/privacy/prune',
    args: '[snapshot|events|crashes|privacy|prune]',
    category: 'admin',
  },
  { name: '/metrics', description: 'daemon metrics snapshot', category: 'admin' },
  {
    name: '/marketplaces',
    description: 'skill marketplace 목록/추가/삭제',
    args: '[list|add|remove]',
    category: 'admin',
  },
  {
    name: '/usage',
    description: '사용량 대시보드 열기/새로고침',
    args: '[days|current|close]',
    category: 'info',
  },
  { name: '/doctor', description: 'daemon/프로바이더/사용량 운영 헬스 요약', category: 'info' },
  {
    name: '/approvals',
    description: '대기/저장된 승인 표시 또는 정리',
    args: '[clear|clear session|clear always]',
    category: 'info',
  },
  { name: '/canvas', description: 'Canvas 이미지/비디오 생성 화면 열기', category: 'ui' },
  {
    name: '/theme',
    description: '테마 전환 또는 정보',
    args: '<dark|light|current>',
    category: 'ui',
  },
  { name: '/help', description: '도움말 보기', category: 'ui' },
] as const

type SlashCommandOverride = Partial<Omit<SlashCommand, 'args'>> & {
  args?: string | undefined
}

const SUPPORTED_DESKTOP_COMMANDS: Record<string, SlashCommandOverride> = {
  '/new': {},
  '/clear': {},
  '/compact': {},
  '/report': {},
  '/model': {
    description: '모델 변경 또는 LLM 설정 열기',
    args: '<provider/model>',
  },
  '/provider': {
    description: '프로바이더 설정 열기',
    args: undefined,
  },
  '/providers': {
    description: '프로바이더 설정 열기',
  },
  '/privilege': {
    description: 'privilege 레벨 변경',
    args: '<readonly|accept-edits|workspace-write|supervised|autonomous>',
  },
  '/autonomy': {
    description: 'privilege 레벨 변경 (/privilege 별칭)',
    args: '<readonly|accept-edits|workspace-write|supervised|autonomous>',
  },
  '/mode': {
    description: '에이전트 모드 변경',
    args: '<mode|current>',
  },
  '/memory': {
    description: '메모리 검색 화면 열기',
    args: undefined,
  },
  '/artifacts': {
    description: 'Canvas/아티팩트 화면 열기',
  },
  '/rag': {
    description: '지식의 참조 자료 열기',
    args: undefined,
  },
  '/team-docs': {
    description: '팀 문서 설정 열기',
    args: undefined,
  },
  '/personal-docs': {
    description: '개인 문서 설정 열기',
    args: undefined,
  },
  '/prompts': {
    description: '프롬프트 템플릿 설정 열기',
    args: undefined,
  },
  '/snippets': {
    description: '스니펫 화면 열기',
    args: undefined,
  },
  '/wiki': {
    description: '지식의 작성 문서 열기',
    args: undefined,
  },
  '/skills': {
    description: '스킬 화면 열기',
    args: undefined,
  },
  '/mcp': {
    description: 'MCP 설정 열기',
    args: undefined,
  },
  '/hooks': {
    description: 'outbound hook 설정 열기',
    args: undefined,
  },
  '/webhooks': {
    description: '채널/Webhook 설정 열기',
    args: undefined,
  },
  '/channels': {
    description: '채널 설정 열기',
    args: undefined,
  },
  '/telegram': {
    description: '채널 설정 열기',
  },
  '/github': {
    description: 'GitHub sync 설정 열기',
    args: undefined,
  },
  '/extensions': {
    description: '확장 설정 열기',
    args: undefined,
  },
  '/scheduler': {
    description: '스케줄러 화면 열기',
    args: undefined,
  },
  '/quick-input': {
    description: '빠른 입력 설정 열기',
    args: undefined,
  },
  '/messages': {
    description: '메시지 구독 설정 열기',
    args: undefined,
  },
  '/queue': {
    description: '메시지 큐 설정 열기',
  },
  '/status': {
    description: 'daemon 부팅/상태 설정 열기',
    args: undefined,
  },
  '/config': {
    description: 'settings JSON 열기',
    args: undefined,
  },
  '/settings-json': {
    description: 'settings JSON 열기',
    args: undefined,
  },
  '/settings': {
    description: '설정 다이얼로그 열기',
    args: '[general|llm]',
  },
  '/llm': {
    description: 'LLM 설정 열기',
    args: undefined,
  },
  '/network': {
    description: '네트워크 설정 열기',
    args: undefined,
  },
  '/notifications': {
    description: '알림 설정 열기',
    args: undefined,
  },
  '/image-gen': {
    description: '이미지 생성 설정 열기',
    args: undefined,
  },
  '/backups': {
    description: '백업 설정 열기',
    args: undefined,
  },
  '/usage': {
    description: '사용량 설정 열기',
    args: undefined,
  },
  '/doctor': {
    description: '진단 설정 열기',
  },
  '/canvas': {},
  '/theme': {
    args: '<dark|light|system>',
  },
  '/help': {},
}

export const SLASH_COMMANDS: readonly SlashCommand[] = CLI_ALIGNED_SLASH_COMMANDS.filter(
  (command) => Object.prototype.hasOwnProperty.call(SUPPORTED_DESKTOP_COMMANDS, command.name),
).map((command) => {
  const override = SUPPORTED_DESKTOP_COMMANDS[command.name]
  const next: SlashCommand = { ...command, ...override }
  if (Object.prototype.hasOwnProperty.call(override, 'args') && override.args === undefined) {
    delete next.args
  }
  return next
})

function commandToPaletteItem(command: SlashCommand): SlashCommandPaletteItem {
  return {
    label: command.args ? `${command.name} ${command.args}` : command.name,
    description: command.description,
    insertValue: command.args ? `${command.name} ` : command.name,
    category: command.category,
  }
}

export function groupCommandsByCategory(): Array<{
  category: SlashCommandCategory
  label: string
  items: SlashCommandPaletteItem[]
}> {
  const buckets = new Map<SlashCommandCategory, SlashCommandPaletteItem[]>()
  for (const c of SLASH_COMMANDS) {
    const arr = buckets.get(c.category) ?? []
    arr.push(commandToPaletteItem(c))
    buckets.set(c.category, arr)
  }
  return CATEGORY_ORDER.filter((cat) => (buckets.get(cat)?.length ?? 0) > 0).map((cat) => ({
    category: cat,
    label: CATEGORY_LABEL[cat],
    items: buckets.get(cat) ?? [],
  }))
}

type ThemePreference = 'light' | 'dark' | 'system'

type AutonomyLevel = 'readonly' | 'accept-edits' | 'workspace-write' | 'supervised' | 'autonomous'

export interface SlashCommandContext {
  newChat: () => void
  clearActiveContext: () => void
  openSettings: () => void
  openSettingsTab?: (tabKey: string) => void
  openView?: (view: string) => void
  setTheme: (theme: ThemePreference) => void
  toggleTheme: () => void
  showHelp: () => void
  compressConversation: () => void
  openConversationReport: () => void
  setAutonomy: (level: AutonomyLevel) => void
  setMode?: (mode: ChatModeId) => void
  availableModes?: readonly ChatModeMeta[]
  showModeStatus?: () => void
  selectModel?: (target: string) => void
}

export type SlashDispatchResult = 'handled' | 'forward'

const SETTINGS_TAB_BY_COMMAND: Record<string, string> = {
  providers: 'llm',
  provider: 'llm',
  llm: 'llm',
  usage: 'usage',
  doctor: 'doctor',
  mcp: 'mcp',
  skills: 'skills',
  'skills-admin': 'skills',
  hooks: 'outbound-hooks',
  webhooks: 'channels',
  channels: 'channels',
  telegram: 'channels',
  notifications: 'notifications',
  'quick-input': 'quick-input',
  messages: 'message-subscription',
  queue: 'message-queue',
  rag: 'rag',
  'rag-admin': 'rag',
  'team-docs': 'team-docs',
  'personal-docs': 'personal-docs',
  prompts: 'prompt-templates',
  snippets: 'code-snippets',
  github: 'github-sync',
  extensions: 'extensions',
  'image-gen': 'image-gen',
  network: 'network',
  backups: 'backup',
  status: 'boot-info',
  config: 'settings-json',
  'settings-json': 'settings-json',
}

const VIEW_BY_COMMAND: Record<string, string> = {
  artifacts: 'canvas',
  canvas: 'canvas',
  memory: 'memory',
  rag: 'rag',
  scheduler: 'tasks',
  wiki: 'wiki',
  snippets: 'snippets',
  skills: 'skills',
}

export function dispatchSlashCommand(input: string, ctx: SlashCommandContext): SlashDispatchResult {
  if (!input.startsWith('/')) return 'forward'
  const body = input.slice(1).trim()
  if (!body) return 'forward'
  const tokens = body.split(/\s+/)
  const name = tokens[0]?.toLowerCase() ?? ''
  const rawArgs = tokens.slice(1)
  const args = rawArgs.map((token) => token.toLowerCase())
  const rawArgText = body.slice(tokens[0]?.length ?? 0).trim()

  switch (name) {
    case 'new':
      ctx.newChat()
      return 'handled'
    case 'clear':
      ctx.clearActiveContext()
      return 'handled'
    case 'settings':
      if (args[0] === 'llm') {
        ctx.openSettingsTab?.('llm')
      } else if (args[0] === 'general') {
        ctx.openSettingsTab?.('general')
      } else {
        ctx.openSettings()
      }
      return 'handled'
    case 'help':
      ctx.showHelp()
      return 'handled'
    case 'theme': {
      const arg = args[0]
      if (arg === 'dark' || arg === 'light' || arg === 'system') {
        ctx.setTheme(arg)
      } else {
        ctx.toggleTheme()
      }
      return 'handled'
    }
    case 'compact':
      ctx.compressConversation()
      return 'handled'
    case 'report':
      ctx.openConversationReport()
      return 'handled'
    case 'model':
      if (rawArgText) {
        ctx.selectModel?.(rawArgText)
      } else {
        ctx.openSettingsTab?.('llm')
      }
      return 'handled'
    case 'autonomy':
    case 'privilege': {
      const arg = args[0]
      if (
        arg === 'readonly' ||
        arg === 'accept-edits' ||
        arg === 'workspace-write' ||
        arg === 'supervised' ||
        arg === 'autonomous'
      ) {
        ctx.setAutonomy(arg)
        return 'handled'
      }
      return 'forward'
    }
    case 'mode': {
      const arg = args[0]
      if (!arg || arg === 'current') {
        if (!ctx.showModeStatus) return 'forward'
        ctx.showModeStatus()
        return 'handled'
      }
      if (!isChatModeId(arg, ctx.availableModes ?? CHAT_MODES)) return 'forward'
      if (!ctx.setMode) return 'forward'
      ctx.setMode(arg)
      return 'handled'
    }
    default:
      if (VIEW_BY_COMMAND[name] && args.length === 0) {
        ctx.openView?.(VIEW_BY_COMMAND[name])
        return 'handled'
      }
      if (SETTINGS_TAB_BY_COMMAND[name] && args.length === 0) {
        ctx.openSettingsTab?.(SETTINGS_TAB_BY_COMMAND[name])
        return 'handled'
      }
      return 'forward'
  }
}

export interface SlashProviderSummary {
  id: string
  label: string
  models: {
    id: string
    label: string
    contextWindow?: number
    vision?: boolean
    maxOutputTokens?: number
  }[]
}

export interface SlashPromptTemplate {
  id: string
  title?: string
  body?: string
}

export interface FilterOptions {
  providers?: SlashProviderSummary[]
  modes?: readonly ChatModeMeta[]
  promptTemplates?: SlashPromptTemplate[]
}

function promptTemplateSlug(template: SlashPromptTemplate): string {
  const fromTitle = template.title
    ?.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return fromTitle || template.id.replace(/[^a-z0-9-]+/gi, '-').toLowerCase() || template.id
}

function buildPromptTemplateItems(
  query: string,
  templates: readonly SlashPromptTemplate[],
): SlashCommandPaletteItem[] {
  const seen = new Set<string>()
  const items: SlashCommandPaletteItem[] = []
  for (const template of templates) {
    const slug = promptTemplateSlug(template)
    if (!slug || seen.has(slug)) continue
    if (SLASH_COMMANDS.some((command) => command.name.slice(1).toLowerCase() === slug)) continue
    seen.add(slug)
    const description = template.title?.trim() || '저장된 프롬프트 템플릿'
    if (query && !slug.includes(query) && !description.toLowerCase().includes(query)) continue
    items.push({
      label: `/${slug}`,
      description,
      insertValue: template.body ?? '',
      category: 'context',
    })
  }
  return items
}

function buildArgumentItems(
  commandName: string,
  options: FilterOptions = {},
): SlashCommandPaletteItem[] {
  if (
    !new Set(['/model', '/mode', '/autonomy', '/privilege', '/theme', '/settings']).has(
      commandName,
    )
  ) {
    return []
  }

  const providers = options.providers ?? []
  switch (commandName) {
    case '/model': {
      return providers
        .flatMap((p) =>
          p.models.map((m) => item(`/model ${p.id}/${m.id}`, `${p.label} · ${m.label}`)),
        )
        .slice(0, 16)
    }
    case '/autonomy':
    case '/privilege':
      return [
        item(`${commandName} readonly`, '읽기 전용 (모든 비-읽기 작업 승인 필요)'),
        item(`${commandName} accept-edits`, '편집은 자동 수락, 그 외는 감독'),
        item(`${commandName} workspace-write`, '작업공간 파일 편집 자동 허용, 명령은 감독'),
        item(`${commandName} supervised`, '감독 (승인 기반 실행)'),
        item(`${commandName} autonomous`, '자동 (승인 없이 실행)'),
      ]
    case '/mode':
      return [
        item('/mode current', '현재 에이전트 모드 표시'),
        ...(options.modes ?? CHAT_MODES).map((mode) => item(`/mode ${mode.id}`, mode.description)),
      ]
    case '/theme':
      return [
        item('/theme dark', '다크 테마'),
        item('/theme light', '라이트 테마'),
        item('/theme system', '시스템 설정 따르기'),
      ]
    case '/settings':
      return [item('/settings general', '일반 설정 열기'), item('/settings llm', 'LLM 설정 열기')]
    default:
      return []
  }
}

function item(insertValue: string, description: string): SlashCommandPaletteItem {
  return { label: insertValue, description, insertValue }
}

export function filterSlashCommands(
  input: string,
  options: FilterOptions = {},
): SlashCommandPaletteItem[] {
  if (!input.startsWith('/')) return []
  const body = input.slice(1)
  const hasTrailingSpace = /\s$/.test(input)
  const tokens = body.split(/\s+/).filter(Boolean)

  const templates = options.promptTemplates ?? []

  if (tokens.length === 0) {
    return [...SLASH_COMMANDS.map(commandToPaletteItem), ...buildPromptTemplateItems('', templates)]
  }

  const commandToken = tokens[0].toLowerCase()
  const exactCommand = SLASH_COMMANDS.find((c) => c.name.slice(1).toLowerCase() === commandToken)

  if (tokens.length === 1 && !hasTrailingSpace) {
    const templateItems = buildPromptTemplateItems(commandToken, templates)

    const startsWith = SLASH_COMMANDS.filter((c) =>
      c.name.slice(1).toLowerCase().startsWith(commandToken),
    )
    if (startsWith.length > 0) return [...startsWith.map(commandToPaletteItem), ...templateItems]

    const includes = SLASH_COMMANDS.filter((c) =>
      c.name.slice(1).toLowerCase().includes(commandToken),
    )
    if (includes.length > 0) return [...includes.map(commandToPaletteItem), ...templateItems]

    return [
      ...SLASH_COMMANDS.filter((c) => c.description.toLowerCase().includes(commandToken)).map(
        commandToPaletteItem,
      ),
      ...templateItems,
    ]
  }

  if (!exactCommand) {
    return SLASH_COMMANDS.filter((c) => c.name.slice(1).toLowerCase().startsWith(commandToken)).map(
      commandToPaletteItem,
    )
  }

  const argItems = buildArgumentItems(exactCommand.name, options)
  if (argItems.length === 0) {
    return tokens.length === 1 ? [commandToPaletteItem(exactCommand)] : []
  }

  const argQuery = hasTrailingSpace ? '' : body.slice(tokens[0].length).trimStart().toLowerCase()
  if (!argQuery) return argItems

  return argItems.filter((entry) => {
    const argument = entry.insertValue.slice(exactCommand.name.length).trim().toLowerCase()
    return argument.includes(argQuery) || entry.description.toLowerCase().includes(argQuery)
  })
}
