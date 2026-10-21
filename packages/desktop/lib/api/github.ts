import { CapabilityUnavailableError, getJson, makeHttp, sendJson } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

export interface OAuthStatus {
  connected: boolean
  login: string | null
  configured: boolean
  pending: boolean
  lastError: string | null
}

export interface SyncRepo {
  fullName: string
  enabled: boolean
  lastSyncedAt: number | null
  lastSyncStatus?: 'success' | 'error' | null
  lastSyncError?: string | null
  pullRequests?: number
  issues?: number
  releases?: number
}

export interface SyncPolicy {
  intervalMin: number
  pullRequests: boolean
  issues: boolean
  releases: boolean
}

export interface DiscoveredGitHubRepo {
  fullName: string
  private: boolean
  defaultBranch: string | null
  updatedAt: string | null
  htmlUrl: string | null
}

export interface GitHubSyncResult {
  startedAt: number
  finishedAt: number
  total: number
  succeeded: number
  failed: number
  repos: SyncRepo[]
}

export interface GitHubRepoInspection {
  ok: boolean
  source: string
  repo: Record<string, unknown>
  commits: Array<Record<string, unknown>>
  tags: Array<Record<string, unknown>>
  releases: Array<Record<string, unknown>>
  message?: string
}

export interface GitHubApi {
  startOAuth: () => Promise<{ url: string }>
  connectToken: (token: string) => Promise<OAuthStatus>
  disconnect: () => Promise<OAuthStatus>
  getStatus: () => Promise<OAuthStatus>
  listRepos: () => Promise<SyncRepo[]>
  setRepos: (repos: SyncRepo[]) => Promise<SyncRepo[]>
  discoverRepos: () => Promise<DiscoveredGitHubRepo[]>
  inspectRepo: (input: {
    url?: string
    owner?: string
    repo?: string
  }) => Promise<GitHubRepoInspection>
  getPolicy: () => Promise<SyncPolicy>
  setPolicy: (policy: SyncPolicy) => Promise<SyncPolicy>
  syncNow: () => Promise<GitHubSyncResult>
}

export async function createGitHubApi(transport: Transport): Promise<GitHubApi> {
  const http = await makeHttp(transport)
  return {
    startOAuth: () => sendJson<{ url: string }>(http, 'POST', '/github/oauth/start', {}, 'github'),
    connectToken: (token) =>
      sendJson<OAuthStatus>(http, 'POST', '/github/oauth/token', { token }, 'github'),
    disconnect: () => sendJson<OAuthStatus>(http, 'DELETE', '/github/oauth', {}, 'github'),
    getStatus: () => getJson<OAuthStatus>(http, '/github/oauth/status', 'github'),
    listRepos: () => getJson<SyncRepo[]>(http, '/github/sync/repos', 'github'),
    setRepos: (repos) => sendJson<SyncRepo[]>(http, 'PUT', '/github/sync/repos', repos, 'github'),
    discoverRepos: () => getJson<DiscoveredGitHubRepo[]>(http, '/github/sync/discover', 'github'),
    inspectRepo: (input) =>
      sendJson<GitHubRepoInspection>(http, 'POST', '/github/repo/inspect', input, 'github'),
    getPolicy: () => getJson<SyncPolicy>(http, '/github/sync/policy', 'github'),
    setPolicy: (policy) =>
      sendJson<SyncPolicy>(http, 'PUT', '/github/sync/policy', policy, 'github'),
    syncNow: () => sendJson<GitHubSyncResult>(http, 'POST', '/github/sync/run', {}, 'github'),
  }
}
export { CapabilityUnavailableError }
