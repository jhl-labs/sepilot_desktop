import type {
  SepilotAppCapabilities,
  SepilotAppDataPolicy,
  SepilotAppDataSchema,
  SepilotAppHostRequestPermission,
} from '@sepilotd/api-client'

export type AppPageKind =
  | 'calendar'
  | 'todo'
  | 'notepad'
  | 'scrum'
  | 'meetings'
  | 'inbox'
  | 'briefing'
  | 'timeline'
  | 'mermaid'
  | 'mindmap'
  | 'table'
  | 'kanban'
  | 'sticky'
  | 'vault'
  | 'subscriptions'
  | 'portfolio'
  | 'stocks'
  | 'ledger'
  | 'devices'
  | 'services'
  | 'jira'
  | 'confluence'
  | 'clusters'
  | 'network'
  | 'storage'
  | 'smarthome'
  | 'smartcar'
  | 'gitrepos'
  | 'bookmarks'
  | 'architect'
  | 'custom'

export type AppPageOrigin = 'template' | 'code-agent'

export interface AppPageVersion {
  version: number
  createdAt: number
  file: string
  sha256: string
  prompt?: string
}

export interface AppPagePermissions {
  storage: boolean
  network: boolean
  clipboard: boolean
  fileSystem: boolean
  shell: boolean
}

export interface AppPageValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface AppPageValidation {
  ok: boolean
  issues: AppPageValidationIssue[]
}

export interface AppPage {
  id: string
  title: string
  kind: AppPageKind
  frameworkVersion?: 1
  summary?: string
  category?: string
  accent?: string
  origin?: AppPageOrigin
  version?: number
  permissions?: AppPagePermissions
  dataPolicy?: SepilotAppDataPolicy
  capabilities?: SepilotAppCapabilities
  hostRequests?: SepilotAppHostRequestPermission[]
  dataSchema?: SepilotAppDataSchema
  validation?: AppPageValidation
  versions?: AppPageVersion[]
  storagePath?: string
  html: string
  data: Record<string, unknown>
  prompt?: string
  createdAt: number
  updatedAt: number
}

export interface AppTemplate {
  id: AppPageKind
  title: string
  summary: string
  category: string
  accent: string
  description: string
  html: string
  data?: Record<string, unknown>
  dataPolicy?: SepilotAppDataPolicy
  capabilities?: SepilotAppCapabilities
  hostRequests?: SepilotAppHostRequestPermission[]
  dataSchema?: SepilotAppDataSchema
}
