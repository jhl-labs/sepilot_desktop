import type { SkillItem } from '@/lib/store/skills-store'
import { appReferenceAliases, canonicalAppReference, type SepilotReadableAppSummary } from '@sepilotd/api-client'

export type DollarChoice = {
  key: string
  kind: 'wiki' | 'skill' | 'app'
  label: string
  description: string
  skillId?: string
  appReference?: string
  aliases?: string[]
}

export function dollarChoices(query: string, skills: readonly SkillItem[], apps: readonly SepilotReadableAppSummary[] = []): DollarChoice[] {
  const normalized = query.toLocaleLowerCase()
  const skillsOnly = normalized.startsWith('skill:')
  const appsOnly = normalized.startsWith('app:')
  const term = skillsOnly ? normalized.slice('skill:'.length) : appsOnly ? normalized.slice('app:'.length) : normalized
  const choices: DollarChoice[] = []
  if (!skillsOnly && !appsOnly && 'wiki'.startsWith(term)) {
    choices.push({
      key: 'wiki',
      kind: 'wiki',
      label: '$wiki',
      description: '개인 Wiki · 영구 지식 저장·검색',
    })
  }
  if (!skillsOnly) {
    for (const app of apps) {
      if (term && ![app.id, app.kind, app.title, app.summary ?? ''].some(value => value.toLocaleLowerCase().includes(term))) continue
      choices.push({ key: `app:${app.id}`, kind: 'app', label: app.title,
        description: app.summary ?? app.kind, appReference: canonicalAppReference(app.id), aliases: appReferenceAliases(app) })
    }
  }
  const seen = new Set<string>()
  for (const skill of appsOnly ? [] : skills) {
    const id = skill.id ?? skill.name
    if (!skill.enabled || seen.has(id)) continue
    seen.add(id)
    if (
      term &&
      ![id, skill.name, skill.description ?? ''].some((value) =>
        value.toLocaleLowerCase().includes(term),
      )
    )
      continue
    choices.push({
      key: `skill:${id}`,
      kind: 'skill',
      skillId: id,
      label: skill.name,
      description: skill.description ?? '설치된 스킬을 채팅에 적용',
    })
  }
  return choices
}
