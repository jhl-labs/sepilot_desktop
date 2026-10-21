'use client'
import { AIModelsWorkspace } from './models/AIModelsWorkspace'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'llm',
  section: 'models',
  label: 'Providers & Models',
  search: ['llm', 'provider', 'connection', 'model', 'catalog', 'baseurl', 'apikey', 'headers'],
  render: () => <LLMSettingsTab />,
})

export function LLMSettingsTab() {
  return <AIModelsWorkspace />
}
