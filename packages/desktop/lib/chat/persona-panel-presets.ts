export interface PersonaPanelPreset {
  id: string
  name: string
  description: string
  personaIds: readonly string[]
}

export const PERSONA_PANEL_PRESETS = [
  {
    id: 'architecture-qaw-atam',
    name: 'QAW / ATAM',
    description: 'VOS 수집, 품질속성 시나리오, 리스크/트레이드오프 평가',
    personaIds: [
      'workshop-facilitator',
      'software-architect',
      'customer-advocate',
      'operations-lead',
      'risk-analyst',
      'decision-recorder',
    ],
  },
  {
    id: 'product-discovery',
    name: '제품 발견',
    description: '고객 문제, 가치 제안, 우선순위, 출시 가설 점검',
    personaIds: [
      'workshop-facilitator',
      'customer-advocate',
      'product-strategist',
      'data-analyst',
      'operations-lead',
      'decision-recorder',
    ],
  },
  {
    id: 'policy-review',
    name: '정책 검토',
    description: '규정, 사용자 영향, 운영 가능성, 리스크를 함께 검토',
    personaIds: [
      'workshop-facilitator',
      'legal-compliance',
      'risk-analyst',
      'customer-advocate',
      'operations-lead',
      'decision-recorder',
    ],
  },
  {
    id: 'crisis-response',
    name: '위기 대응',
    description: '상황 판단, 고객 커뮤니케이션, 운영 복구, 사후 조치',
    personaIds: [
      'workshop-facilitator',
      'incident-commander',
      'communications-lead',
      'operations-lead',
      'risk-analyst',
      'decision-recorder',
    ],
  },
  {
    id: 'learning-design',
    name: '학습 설계',
    description: '교육 목표, 학습자 관점, 콘텐츠 구조, 평가 방법 설계',
    personaIds: [
      'workshop-facilitator',
      'learning-coach',
      'content-editor',
      'customer-advocate',
      'data-analyst',
      'decision-recorder',
    ],
  },
  {
    id: 'personal-decision',
    name: '개인 의사결정',
    description: '선택지, 가치 기준, 비용, 리스크, 실행 계획을 균형 있게 검토',
    personaIds: [
      'workshop-facilitator',
      'practical-coach',
      'values-advocate',
      'finance-operator',
      'risk-analyst',
      'decision-recorder',
    ],
  },
] as const satisfies readonly PersonaPanelPreset[]

export function getPersonaPanelPreset(id: string): PersonaPanelPreset | undefined {
  return PERSONA_PANEL_PRESETS.find((preset) => preset.id === id)
}

export interface PersonaPanelGroup<T extends { id: string }> {
  preset: PersonaPanelPreset | null
  personas: readonly T[]
}

export function groupPersonasByPreset<T extends { id: string }>(
  personas: readonly T[],
  presets: readonly PersonaPanelPreset[] = PERSONA_PANEL_PRESETS,
): PersonaPanelGroup<T>[] {
  const remaining = new Map(personas.map((p) => [p.id, p] as const))
  const groups: PersonaPanelGroup<T>[] = []

  for (const preset of presets) {
    const bucket: T[] = []
    for (const personaId of preset.personaIds) {
      const persona = remaining.get(personaId)
      if (!persona) continue
      bucket.push(persona)
      remaining.delete(personaId)
    }
    if (bucket.length > 0) {
      groups.push({ preset, personas: bucket })
    }
  }

  if (remaining.size > 0) {
    groups.push({ preset: null, personas: [...remaining.values()] })
  }

  return groups
}
