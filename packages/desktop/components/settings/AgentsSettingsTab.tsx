'use client'
import { AgentManager } from '@/components/agents/AgentManager'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'agents',
  section: 'agent',
  label: 'Agents',
  search: ['agents', 'user agent', 'custom agent', 'graph'],
  render: () => <AgentsSettingsTab />,
})

function AgentsSettingsTab() {
  return <AgentManager />
}
