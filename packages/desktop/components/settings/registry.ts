import type { ReactNode } from 'react'
import {
  isSettingsTabEnabled,
  type DesktopSettingsFeatureId,
} from '@/lib/feature-profile'

export type SettingsSectionId =
  | 'general'
  | 'models'
  | 'agent'
  | 'tools'
  | 'memory'
  | 'notifications'
  | 'integrations'
  | 'automation'
  | 'system'

export interface SettingsTab {
  key: string
  section: SettingsSectionId
  label: string
  search: string[]
  buildFeature?: DesktopSettingsFeatureId
  render: () => ReactNode
}

const tabs: SettingsTab[] = []

const SETTINGS_TAB_ALIASES: Readonly<Record<string, string>> = {
  'provider-connections': 'llm',
  'model-list': 'llm',
  'custom-headers': 'llm',
  'personal-docs': 'docs',
  'team-docs': 'docs',
}

export function resolveSettingsTabKey(key: string): string {
  return SETTINGS_TAB_ALIASES[key] ?? key
}

export function registerSettingsTab(tab: SettingsTab): void {
  if (tabs.some((t) => t.key === tab.key)) return
  tabs.push(tab)
}

export function listSettingsTabs(): readonly SettingsTab[] {
  return tabs.filter(isSettingsTabEnabled)
}

export function findSettingsTab(key: string): SettingsTab | undefined {
  const resolved = resolveSettingsTabKey(key)
  return listSettingsTabs().find((t) => t.key === resolved)
}

export function searchSettingsTabs(query: string): SettingsTab[] {
  const q = query.trim().toLowerCase()
  const visibleTabs = listSettingsTabs()
  if (!q) return visibleTabs.slice()
  return visibleTabs.filter(
    (t) => t.label.toLowerCase().includes(q) || t.search.some((s) => s.toLowerCase().includes(q)),
  )
}

export function resetSettingsRegistryForTests(): void {
  tabs.length = 0
}
