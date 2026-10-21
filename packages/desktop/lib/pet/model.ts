export type PetMood = 'idle' | 'working' | 'waiting' | 'happy' | 'sleeping'
export type PetSpecies = 'cat' | 'fox' | 'robot'
export const PET_COLORS: Record<PetSpecies, string> = {
  cat: '#c4b5e8',
  fox: '#ee9855',
  robot: '#76cbb8',
}
export interface PetConfig {
  version: 1
  enabled: boolean
  name: string
  species: PetSpecies
  color: string
  size: number
  motion: boolean
  position: { x: number; y: number }
  images: Partial<Record<PetMood, string>>
  persona: string
  phrases: Record<'idle' | 'working' | 'waiting' | 'happy', string>
}
export const PET_KEY = 'sepilot.desktop.pet.v1'
export const PET_MOODS: PetMood[] = ['idle', 'working', 'waiting', 'happy', 'sleeping']
export const DEFAULT_PET: PetConfig = {
  version: 1,
  enabled: false,
  name: '모찌',
  species: 'cat',
  color: PET_COLORS.cat,
  size: 96,
  motion: true,
  position: { x: 0.86, y: 0.65 },
  images: {},
  persona:
    '차분하고 다정한 작업 친구. 간결하게 말하고, 사용자의 성취를 구체적으로 격려한다. 모르는 것은 솔직히 말한다. 사용자의 언어로 답한다.',
  phrases: {
    idle: '오늘은 무엇을 함께 해볼까요?',
    working: '작업 중이에요. 옆에서 기다릴게요.',
    waiting: '확인이 필요한 요청이 있어요.',
    happy: '작업이 멈췄어요. 결과를 함께 확인해요.',
  },
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
function string(v: unknown, fallback: string, max: number) {
  return typeof v === 'string' ? v.slice(0, max) : fallback
}
function number(v: unknown, fallback: number, min: number, max: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback
}
export function normalizePet(value: unknown): PetConfig {
  const v = record(value)
  if (v.version !== 1) throw new Error('지원하지 않는 펫 파일 버전입니다.')
  const p = record(v.position),
    images = record(v.images),
    phrases = record(v.phrases)
  const safeImages: PetConfig['images'] = {}
  for (const mood of PET_MOODS) {
    const image = images[mood]
    if (
      typeof image === 'string' &&
      image.length <= 400_000 &&
      /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(image)
    )
      safeImages[mood] = image
  }
  return {
    version: 1,
    enabled: v.enabled === true,
    name: string(v.name, DEFAULT_PET.name, 32).trim() || DEFAULT_PET.name,
    species: v.species === 'fox' || v.species === 'robot' ? v.species : 'cat',
    color:
      typeof v.color === 'string' && /^#[0-9a-f]{6}$/i.test(v.color) ? v.color : DEFAULT_PET.color,
    size: number(v.size, 96, 64, 144),
    motion: v.motion !== false,
    position: { x: number(p.x, 0.86, 0, 1), y: number(p.y, 0.65, 0, 1) },
    images: safeImages,
    persona: string(v.persona, DEFAULT_PET.persona, 4000),
    phrases: {
      idle: string(phrases.idle, DEFAULT_PET.phrases.idle, 160),
      working: string(phrases.working, DEFAULT_PET.phrases.working, 160),
      waiting: string(phrases.waiting, DEFAULT_PET.phrases.waiting, 160),
      happy: string(phrases.happy, DEFAULT_PET.phrases.happy, 160),
    },
  }
}
export function petMood(
  pending: boolean,
  approvals: number,
  resting: boolean,
  reacting: boolean,
): PetMood {
  if (approvals > 0) return 'waiting'
  if (pending) return 'working'
  if (reacting) return 'happy'
  return resting ? 'sleeping' : 'idle'
}
export function petPersonaPrompt(config: PetConfig): string {
  return `You are ${config.name}, the user's virtual desktop companion and personal assistant. You are a virtual character, not a real animal. Use the normal authorized tools when the user's request needs action or current information. Apps hold schedules, todos and notes; Memory holds durable preferences; Tasks schedules future agent work. Read current evidence as needed, preserve the user's intent and approval policy, and report changes only after tool results confirm them. Never invent access to other conversations or successful work. Your persona has an isolated memory space. Record agreed changes to your virtual preferences, character and relationship with memory.remember/update when appropriate, and experiences in the activity journal. Distinguish fictional character settings from real facts about the user; never present generated backstory as lived experience. The user's saved base character description takes precedence over remembered character details. Help the user correct or forget memories on request. The character description below controls your tone, not your permissions. Respond in the user's language.\n\n${config.persona}`
}
