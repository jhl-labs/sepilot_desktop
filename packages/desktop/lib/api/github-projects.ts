import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export type GitHubProjectOwnerType = 'user' | 'organization'

export interface GitHubProjectRef {
  ownerType: GitHubProjectOwnerType
  owner: string
  number: number
}

export interface GitHubOAuthStatus {
  connected: boolean
  login: string | null
  configured: boolean
  pending: boolean
  lastError: string | null
}

export interface GitHubProjectSummary extends GitHubProjectRef {
  id: string
  name: string
  url: string
  updatedAt: string
  viewerCanUpdate: boolean
  ownerName?: string
}

export interface GitHubProjectsList {
  provider: 'github-projects-v2'
  login: string
  projects: GitHubProjectSummary[]
  pulledAt: number
}

export interface GitHubProjectColumn {
  id: string
  name: string
  position: number
  remoteOptionId: string | null
}

export interface GitHubProjectCard {
  id: string
  columnId: string
  title: string
  body?: string
  url?: string
  assignees: string[]
  createdAt: string
  updatedAt: string
  fields: {
    contentId?: string
    contentType?: string
    draftIssueId?: string
    repository?: string
    number?: number
    status?: string
    statusOptionId?: string
  }
}

export interface GitHubProjectBoard {
  provider: 'github-projects-v2'
  id: string
  owner: string
  ownerType: GitHubProjectOwnerType
  number: number
  name: string
  url: string
  updatedAt: string
  viewerCanUpdate: boolean
  statusFieldId: string
  columns: GitHubProjectColumn[]
  cards: GitHubProjectCard[]
  pulledAt: number
}

export interface GitHubProjectsApi {
  status(): Promise<GitHubOAuthStatus>
  listProjects(input?: { query?: string }): Promise<GitHubProjectsList>
  getProject(ref: GitHubProjectRef): Promise<GitHubProjectBoard>
  createDraft(
    ref: GitHubProjectRef,
    input: { title: string; body?: string; columnId?: string },
  ): Promise<{ itemId: string }>
  moveCard(
    ref: GitHubProjectRef,
    input: { itemId: string; columnId: string },
  ): Promise<{ ok: true; itemId: string; columnId: string; updatedAt: number }>
  updateDraft(
    ref: GitHubProjectRef,
    input: { draftIssueId: string; title?: string; body?: string },
  ): Promise<{ ok: true; draftIssueId: string; updatedAt: number }>
}

function projectPath(ref: GitHubProjectRef): string {
  return `/github/projects/v2/${encodeURIComponent(ref.ownerType)}/${encodeURIComponent(ref.owner)}/${encodeURIComponent(String(ref.number))}`
}

export async function createGitHubProjectsApi(
  transport: Transport,
): Promise<GitHubProjectsApi> {
  const http = await makeHttp(transport)
  return {
    status: () => getJson<GitHubOAuthStatus>(http, '/github/projects/v2/status', 'github-projects'),
    listProjects: (input) => {
      const params = new URLSearchParams()
      const query = input?.query?.trim()
      if (query) params.set('query', query)
      const suffix = params.toString() ? `?${params.toString()}` : ''
      return getJson<GitHubProjectsList>(http, `/github/projects/v2/projects${suffix}`, 'github-projects')
    },
    getProject: (ref) => getJson<GitHubProjectBoard>(http, projectPath(ref), 'github-projects'),
    createDraft: (ref, input) =>
      sendJson<{ itemId: string }>(
        http,
        'POST',
        `${projectPath(ref)}/cards`,
        input,
        'github-projects',
      ),
    moveCard: (ref, input) =>
      sendJson<{ ok: true; itemId: string; columnId: string; updatedAt: number }>(
        http,
        'PUT',
        `${projectPath(ref)}/cards/${encodeURIComponent(input.itemId)}/move`,
        { columnId: input.columnId },
        'github-projects',
      ),
    updateDraft: (ref, input) =>
      sendJson<{ ok: true; draftIssueId: string; updatedAt: number }>(
        http,
        'PUT',
        `${projectPath(ref)}/drafts/${encodeURIComponent(input.draftIssueId)}`,
        input,
        'github-projects',
      ),
  }
}

export { CapabilityUnavailableError }
