import {
  BUILTIN_PERSONAS,
  type Persona,
} from '@/lib/store/persona-store'
import {
  MAX_SESSION_PERSONAS as SESSION_PERSONA_LIMIT,
  normalizeSessionPersonaIds as normalizeStoredPersonaIds,
} from '@/lib/store/session-store'

export const MAX_SESSION_PERSONAS = SESSION_PERSONA_LIMIT

export function mergePersonaCatalog(overrides: readonly Persona[]): Persona[] {
  const remaining = new Map(overrides.map((persona) => [persona.id, persona] as const))
  const merged = BUILTIN_PERSONAS.map((builtin) => {
    const override = remaining.get(builtin.id)
    if (!override) return builtin
    remaining.delete(builtin.id)
    return {
      ...builtin,
      ...override,
      description: override.description ?? builtin.description,
      avatar: override.avatar ?? builtin.avatar,
      isBuiltin: true,
    }
  })
  return [...merged, ...remaining.values()]
}

export function normalizeSessionPersonaIds(ids: readonly string[] | undefined): string[] {
  return normalizeStoredPersonaIds(ids ?? [])
}

export function resolveSessionPersonas(
  ids: readonly string[] | undefined,
  catalog: readonly Persona[],
): Persona[] {
  const byId = new Map(catalog.map((persona) => [persona.id, persona] as const))
  return normalizeSessionPersonaIds(ids).map((id) => (
    byId.get(id) ?? {
      id,
      name: id,
      description: '현재 카탈로그에서 찾을 수 없는 페르소나',
      systemPrompt: '',
      avatar: id.slice(0, 1).toUpperCase(),
      isActive: false,
    }
  ))
}

export function personaInitial(persona: Pick<Persona, 'name' | 'avatar'>): string {
  return persona.avatar?.trim() || persona.name.trim().slice(0, 1).toUpperCase() || 'P'
}
