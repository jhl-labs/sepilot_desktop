'use client'
import { SkillManager } from '@/components/skills/SkillManager'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'skills',
  section: 'tools',
  label: 'Skills',
  search: ['skills', 'automation', 'agents'],
  render: () => <SkillsSettingsTab />,
})

function SkillsSettingsTab() {
  return <SkillManager density="compact" />
}
