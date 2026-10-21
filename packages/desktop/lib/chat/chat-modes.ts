import {
  desktopFeatures,
  desktopModeFeatures,
  type DesktopModeFeatures,
} from '@/lib/feature-profile'
import type { DaemonAgentDescriptor } from '@sepilotd/api-client'

export type KnownChatModeId =
  | 'auto'
  | 'chat-only'
  | 'instant'
  | 'react'
  | 'sequential'
  | 'tree-of-thought'
  | 'deep'
  | 'deep-web-research'
  | 'coding'
  | 'external-claude'
  | 'external-codex'
  | 'external-gemini'
  | 'external-opencode'
  | 'codebase-scout'
  | 'computer-use'
  | 'cowork'
  | 'persona-panel'
  | 'writing'

export type ChatModeId = KnownChatModeId | (string & {})

export type ThinkingLevel = 'auto' | 'off' | 'low' | 'medium' | 'high' | 'max'

export type ChatModeIconName =
  | 'Zap'
  | 'Brain'
  | 'Network'
  | 'Sparkles'
  | 'Globe'
  | 'Code'
  | 'Terminal'
  | 'Monitor'
  | 'Users'
  | 'MessagesSquare'
  | 'FileText'

export type ChatModeCategoryId =
  | 'automatic'
  | 'instant'
  | 'general'
  | 'thinking'
  | 'research'
  | 'development'
  | 'external'
  | 'automation'
  | 'collaboration'
  | 'custom'

export interface ChatModeCategoryMeta {
  id: ChatModeCategoryId
  label: string
}

export type ChatModeTranslator = (key: string) => string

const ALL_CHAT_MODE_CATEGORIES: readonly ChatModeCategoryMeta[] = [
  { id: 'automatic', label: '자동' },
  { id: 'instant', label: '즉시 응답' },
  { id: 'general', label: '일반 작업' },
  { id: 'thinking', label: '사고' },
  { id: 'research', label: '연구' },
  { id: 'development', label: '개발' },
  { id: 'external', label: '외부 Agent' },
  { id: 'automation', label: '자동화' },
  { id: 'collaboration', label: '협업' },
  { id: 'custom', label: '사용자 Agent' },
] as const

export interface ChatModeMeta {
  id: ChatModeId
  daemonId: string
  label: string
  description: string
  examplePrompt: string
  searchAliases?: readonly string[]
  iconName: ChatModeIconName
  needsWorkingDir?: boolean
  category: ChatModeCategoryId
}

const ALL_CHAT_MODES: readonly ChatModeMeta[] = [
  {
    id: 'chat-only', daemonId: 'chat-only', label: 'Chat Only (ChatGPT)',
    description: '대화와 RAG·저장된 지식 조회만 가능합니다. 작업 실행이나 정보 저장은 하지 않습니다.',
    examplePrompt: '저장된 지식을 참고해서 설명해줘: ',
    searchAliases: ['채팅', '대화', '읽기 전용', 'RAG'],
    iconName: 'MessagesSquare', category: 'instant',
  },
  {
    id: 'auto',
    daemonId: 'auto',
    label: '알아서 선택',
    description: '어떤 방식이 맞을지 애매한 요청에서 작업 성격에 맞춰 실행 방식을 고릅니다.',
    examplePrompt: '이 요청을 처리하는 데 가장 적합한 방식으로 진행해줘: ',
    iconName: 'Sparkles',
    category: 'automatic',
  },
  {
    id: 'instant',
    daemonId: 'instant',
    label: '즉시 응답',
    description: '빠른 답변과 기억 조회로 시작하고, 필요한 도구와 작업에 따라 실행 모드를 자동 전환합니다.',
    examplePrompt: '이 내용을 짧게 요약하고 바로 답해줘: ',
    iconName: 'Zap',
    category: 'instant',
  },
  {
    id: 'react',
    daemonId: 'react',
    label: '일반 작업 Agent',
    description: '허용된 도구로 정보를 확인하고 작업을 실행하며, 결과를 살펴 필요한 다음 작업을 이어갑니다.',
    examplePrompt: '사용 가능한 도구로 다음 작업을 수행하고 결과를 확인해줘: ',
    searchAliases: ['ReAct', 'react', '일반 작업', '범용', 'general', 'tools'],
    iconName: 'Sparkles',
    category: 'general',
  },
  {
    id: 'sequential',
    daemonId: 'sequential-thinking',
    label: '순차 사고',
    description: '요구사항을 순서대로 정리하거나 단계별 판단 근거가 필요한 문제에 적합합니다.',
    examplePrompt: '다음 요구사항을 단계별 실행 계획으로 정리해줘: ',
    iconName: 'Brain',
    category: 'thinking',
  },
  {
    id: 'tree-of-thought',
    daemonId: 'tree-of-thought',
    label: '트리 사고',
    description: '여러 접근법을 비교해 장단점을 따져야 하는 설계·의사결정에 적합합니다.',
    examplePrompt: '이 선택지들의 장단점을 비교하고 추천해줘: ',
    iconName: 'Network',
    category: 'thinking',
  },
  {
    id: 'deep',
    daemonId: 'deep-thinking',
    label: '깊은 사고',
    description: '실패 비용이 큰 난제나 복잡한 추론을 충분히 검토해야 할 때 사용합니다.',
    examplePrompt: '이 설계의 숨은 리스크와 반례를 꼼꼼히 검토해줘: ',
    iconName: 'Sparkles',
    category: 'thinking',
  },
  {
    id: 'deep-web-research',
    daemonId: 'deep-web-research',
    label: '웹 리서치',
    description: '최신 정보, 근거 확인, 출처 비교가 필요한 조사에 적합합니다.',
    examplePrompt: '최근 자료를 찾아 근거와 함께 비교해줘: ',
    iconName: 'Globe',
    category: 'research',
  },
  {
    id: 'codebase-scout', daemonId: 'codebase-scout', label: '코드베이스 탐색',
    description: '작업 폴더의 파일·의존성·아키텍처를 읽기 전용으로 분석합니다.',
    examplePrompt: '이 코드베이스의 아키텍처와 주요 의존성을 분석해줘.',
    iconName: 'Code', category: 'development', needsWorkingDir: true,
  },
  {
    id: 'coding',
    daemonId: 'coder',
    label: '코딩',
    description: '빠른 기본 코딩 루프. 관련 코드를 읽고 집중 수정·검증 후 보고합니다. 끝내지 못하면 딥 코딩을 제안합니다.',
    examplePrompt: '이 저장소에서 다음 기능을 구현하고 테스트해줘: ',
    iconName: 'Code',
    needsWorkingDir: true,
    category: 'development',
  },
  {
    id: 'deep-coding',
    daemonId: 'deep-coder',
    label: '딥 코딩',
    description: '탐색·계획·구현·검증·독립 리뷰를 거치는 심층 코딩 워크플로. 기본 코딩이 끝내지 못한 큰 작업에 사용합니다. 느립니다.',
    examplePrompt: '이 저장소에서 다음 기능을 설계부터 검증까지 구현해줘: ',
    iconName: 'Code',
    needsWorkingDir: true,
    category: 'development',
  },
  {
    id: 'writing',
    daemonId: 'writing',
    label: '글쓰기',
    description: '초안 작성, 구조화, Markdown 문서 편집을 함께 다듬을 때 사용합니다.',
    examplePrompt: '이 내용을 Markdown 문서로 구조화하고 다듬어줘: ',
    iconName: 'FileText',
    category: 'development',
  },
  {
    id: 'external-claude',
    daemonId: 'external-claude',
    label: 'Claude CLI',
    description: 'Claude CLI의 로컬 코드 작업 흐름을 이 채팅에서 이어갈 때 사용합니다.',
    examplePrompt: '이 작업 디렉터리에서 Claude CLI로 다음 코딩 작업을 진행해줘: ',
    iconName: 'Terminal',
    needsWorkingDir: true,
    category: 'external',
  },
  {
    id: 'external-codex',
    daemonId: 'external-codex',
    label: 'Codex CLI',
    description: 'Codex CLI 기반의 터미널 코딩 세션을 채팅 안에서 진행할 때 사용합니다.',
    examplePrompt: '이 작업 디렉터리에서 Codex CLI로 다음 변경을 처리해줘: ',
    iconName: 'Terminal',
    needsWorkingDir: true,
    category: 'external',
  },
  {
    id: 'external-gemini',
    daemonId: 'external-gemini',
    label: 'Gemini CLI',
    description: 'Gemini CLI가 설치된 작업 디렉터리에서 외부 모델 분석을 맡길 때 사용합니다.',
    examplePrompt: '이 작업 디렉터리에서 Gemini CLI로 다음 내용을 분석해줘: ',
    iconName: 'Terminal',
    needsWorkingDir: true,
    category: 'external',
  },
  {
    id: 'external-opencode',
    daemonId: 'external-opencode',
    label: 'OpenCode CLI',
    description: 'OpenCode CLI의 대화형 코딩 작업을 desktop 채팅으로 제어할 때 사용합니다.',
    examplePrompt: '이 작업 디렉터리에서 OpenCode CLI로 다음 작업을 진행해줘: ',
    iconName: 'Terminal',
    needsWorkingDir: true,
    category: 'external',
  },
  {
    id: 'computer-use',
    daemonId: 'computer-use',
    label: '컴퓨터 사용',
    description: '화면을 보고 클릭·입력 같은 승인된 GUI 작업을 수행해야 할 때 사용합니다.',
    examplePrompt: '화면에서 다음 작업을 단계별 승인으로 진행해줘: ',
    iconName: 'Monitor',
    category: 'automation',
  },
  {
    id: 'cowork',
    daemonId: 'cowork',
    label: '협업',
    description: '범위가 크고 역할 분담이 필요한 프로젝트에서 계획·실행·검토를 나눠 진행합니다.',
    examplePrompt: '이 프로젝트를 여러 역할로 나눠 계획부터 검토까지 진행해줘: ',
    iconName: 'Users',
    needsWorkingDir: true,
    category: 'collaboration',
  },
  {
    id: 'persona-panel',
    daemonId: 'persona-panel',
    label: '다중 관점',
    description: '한 질문을 여러 관점으로 검토하고 합의점과 차이를 보고 싶을 때 사용합니다.',
    examplePrompt: '이 제안을 제품·보안·운영 관점에서 검토해줘: ',
    searchAliases: ['페르소나', 'persona', 'panel'],
    iconName: 'MessagesSquare',
    category: 'collaboration',
  },
] as const

export const EXTERNAL_AGENT_WORKSPACE_SANDBOX_AVAILABLE = false

const externalAgentModesEnabled =
  desktopFeatures.externalAgents

const disabledModeCategories = new Set<ChatModeCategoryId>([
  ...(externalAgentModesEnabled ? [] : ['external' as const]),
  ...(desktopFeatures.automation ? [] : ['automation' as const]),
  ...(desktopFeatures.collaboration ? [] : ['collaboration' as const]),
])

export function isChatModeEnabledByBuildProfile(
  modeId: ChatModeId,
  modeFeatures: DesktopModeFeatures,
): boolean {
  if (modeId === 'coding' || modeId === 'coder' || modeId === 'deep-coding' || modeId === 'deep-coder') return modeFeatures.coding
  if (modeId === 'computer-use') return modeFeatures['computer-use']
  return true
}

export const CHAT_MODES: readonly ChatModeMeta[] = ALL_CHAT_MODES.filter(
  (mode) =>
    !disabledModeCategories.has(mode.category) &&
    isChatModeEnabledByBuildProfile(mode.id, desktopModeFeatures),
)

export function chatModeCategories(
  modes: readonly ChatModeMeta[],
): readonly ChatModeCategoryMeta[] {
  return ALL_CHAT_MODE_CATEGORIES.filter((category) =>
    modes.some((mode) => mode.category === category.id),
  )
}

export const CHAT_MODE_CATEGORIES: readonly ChatModeCategoryMeta[] = chatModeCategories(CHAT_MODES)

const DAEMON_MODE_PRESENTATION = new Map(
  ALL_CHAT_MODES.filter((mode) => mode.category !== 'external' && mode.id !== 'writing').map(
    (mode) => [mode.daemonId, mode] as const,
  ),
)

function modeEnabled(mode: ChatModeMeta): boolean {
  return (
    !disabledModeCategories.has(mode.category) &&
    isChatModeEnabledByBuildProfile(mode.id, desktopModeFeatures)
  )
}

function descriptorMode(descriptor: DaemonAgentDescriptor): ChatModeMeta | null {
  const daemonId = descriptor.id.trim()
  if (!daemonId) return null
  const presentation = DAEMON_MODE_PRESENTATION.get(daemonId)
  if (presentation) {
    return { ...presentation }
  }
  return {
    id: daemonId,
    daemonId,
    label: descriptor.name.trim() || daemonId,
    description: descriptor.description.trim() || 'Daemon에서 등록된 사용자 실행 모드입니다.',
    examplePrompt: '이 실행 모드로 다음 요청을 처리해줘: ',
    searchAliases: [daemonId, descriptor.source ?? ''],
    iconName: 'Sparkles',
    category: 'custom',
  }
}

export function buildChatModeCatalog(
  descriptors: readonly DaemonAgentDescriptor[],
): readonly ChatModeMeta[] {
  const modes: ChatModeMeta[] = []
  const seenDaemonIds = new Set<string>()
  for (const descriptor of descriptors) {
    const mode = descriptorMode(descriptor)
    if (!mode || seenDaemonIds.has(mode.daemonId) || !modeEnabled(mode)) continue
    seenDaemonIds.add(mode.daemonId)
    modes.push(mode)
  }

  const localOverlays = ALL_CHAT_MODES.filter(
    (mode) => mode.id === 'writing' || mode.category === 'external',
  )
  for (const mode of localOverlays) {
    if (seenDaemonIds.has(mode.daemonId) || !modeEnabled(mode)) continue
    seenDaemonIds.add(mode.daemonId)
    modes.push(mode)
  }
  return modes
}

export const DEFAULT_CHAT_MODE: ChatModeId = 'instant'

export const THINKING_LEVELS: readonly ThinkingLevel[] = [
  'auto',
  'off',
  'low',
  'medium',
  'high',
  'max',
] as const

export const THINKING_LABEL: Record<ThinkingLevel, string> = {
  auto: '자동',
  off: '끔',
  low: '낮음',
  medium: '보통',
  high: '높음',
  max: '최대',
}

const TRANSLATED_MODE_IDS = new Set<ChatModeId>(ALL_CHAT_MODES.map((mode) => mode.id))

export function localizeChatModes(
  modes: readonly ChatModeMeta[],
  translate: ChatModeTranslator,
): readonly ChatModeMeta[] {
  return modes.map((mode) => {
    if (!TRANSLATED_MODE_IDS.has(mode.id)) return mode
    const prefix = `chatModes.modes.${mode.id}`
    return {
      ...mode,
      label: translate(`${prefix}.label`),
      description: translate(`${prefix}.description`),
      examplePrompt: translate(`${prefix}.examplePrompt`),
    }
  })
}

export function localizeChatModeCategories(
  categories: readonly ChatModeCategoryMeta[],
  translate: ChatModeTranslator,
): readonly ChatModeCategoryMeta[] {
  return categories.map((category) => ({
    ...category,
    label: translate(`chatModes.categories.${category.id}`),
  }))
}

export function localizedThinkingLabel(
  level: ThinkingLevel,
  translate: ChatModeTranslator,
): string {
  return translate(`chatModes.thinking.${level}`)
}

export function isChatModeId(
  value: unknown,
  modes: readonly ChatModeMeta[] = CHAT_MODES,
): value is ChatModeId {
  return typeof value === 'string' && modes.some((mode) => mode.id === value)
}

export function normalizeChatMode(
  value: ChatModeId,
  modes: readonly ChatModeMeta[] = CHAT_MODES,
): ChatModeId {
  if (isChatModeId(value, modes)) return value
  if (isChatModeId(DEFAULT_CHAT_MODE, modes)) return DEFAULT_CHAT_MODE
  return modes[0]?.id ?? DEFAULT_CHAT_MODE
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return typeof value === 'string' && (THINKING_LEVELS as readonly string[]).includes(value)
}

export function getChatModePlaceholder(
  id: ChatModeId,
  modes: readonly ChatModeMeta[] = CHAT_MODES,
): string {
  const meta = modes.find((mode) => mode.id === id)
  return meta?.examplePrompt ?? '메시지를 입력하세요'
}

export function toDaemonMode(id: ChatModeId, modes: readonly ChatModeMeta[] = CHAT_MODES): string {
  const catalogId = modes.find((mode) => mode.id === id)?.daemonId
  if (catalogId) return catalogId
  switch (id) {
    case 'sequential':
      return 'sequential-thinking'
    case 'deep':
      return 'deep-thinking'
    case 'coding':
      return 'coder'
    case 'deep-coding':
      return 'deep-coder'
    case 'computer-use':
      return 'computer-use'
    case 'writing':
      return 'writing'
    case 'external-claude':
    case 'external-codex':
    case 'external-gemini':
    case 'external-opencode':
      return id
    default:
      return id
  }
}
