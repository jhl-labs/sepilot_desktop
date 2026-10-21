import { shell } from 'electron'
import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { join, resolve } from 'path'
import { ApiHttpClient, ApiHttpError } from '@sepilotd/api-client'

type GitProvider = 'GitHub' | 'GitLab' | 'Bitbucket' | 'Git'

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_API_TIMEOUT_MS = 10_000

interface GitRepoRef {
  provider: GitProvider
  owner: string
  repo: string
  url: string
  webUrl: string
}

function cleanText(value: unknown, maxLength = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function providerFromHost(host: string): GitProvider {
  const normalized = host.toLowerCase()
  if (normalized.includes('github')) return 'GitHub'
  if (normalized.includes('gitlab')) return 'GitLab'
  if (normalized.includes('bitbucket')) return 'Bitbucket'
  return 'Git'
}

function webUrlFor(provider: GitProvider, owner: string, repo: string, fallback: string): string {
  if (provider === 'GitHub') return `https://github.com/${owner}/${repo}`
  if (provider === 'GitLab') return `https://gitlab.com/${owner}/${repo}`
  if (provider === 'Bitbucket') return `https://bitbucket.org/${owner}/${repo}`
  return fallback
}

function githubPagesUrlFor(ref: GitRepoRef): string {
  if (ref.provider !== 'GitHub') return ''
  const owner = cleanText(ref.owner, 200)
  const repo = cleanText(ref.repo, 200)
  if (!owner || !repo) return ''
  const ownerHost = owner.toLowerCase()
  if (repo.toLowerCase() === `${ownerHost}.github.io`) {
    return `https://${ownerHost}.github.io/`
  }
  return `https://${ownerHost}.github.io/${encodeURIComponent(repo)}/`
}

function parseGitRepoUrl(rawValue: unknown): GitRepoRef {
  const url = cleanText(rawValue, 2048)
  if (!url) throw new Error('Repository URL is required.')

  const ssh = /^git@([^:]+):(.+)$/iu.exec(url)
  let host = ''
  let parts: string[] = []
  if (ssh) {
    host = ssh[1] ?? ''
    parts = (ssh[2] ?? '')
      .replace(/\.git$/iu, '')
      .split('/')
      .filter(Boolean)
  } else {
    try {
      const parsed = new URL(url)
      host = parsed.hostname
      parts = parsed.pathname
        .replace(/^\//u, '')
        .replace(/\.git$/iu, '')
        .split('/')
        .filter(Boolean)
    } catch {
      parts = url
        .replace(/\.git$/iu, '')
        .split('/')
        .filter(Boolean)
    }
  }

  if (parts.length < 2) throw new Error('Repository URL must include owner/group and repo.')
  const provider = providerFromHost(host)
  const repo = parts[parts.length - 1] ?? ''
  const owner = provider === 'GitLab' ? parts.slice(0, -1).join('/') : (parts[0] ?? '')
  if (!owner || !repo) throw new Error('Repository owner and repo could not be parsed.')
  return {
    provider,
    owner,
    repo,
    url,
    webUrl: webUrlFor(provider, owner, repo, url),
  }
}

function githubErrorDetail(error: ApiHttpError): string {
  try {
    const parsed = JSON.parse(error.rawBody) as { message?: unknown; error?: unknown }
    const nestedError = (
      parsed.error && typeof parsed.error === 'object' ? parsed.error : {}
    ) as Record<string, unknown>
    return cleanText(parsed.message, 500) || cleanText(nestedError.message, 500)
  } catch {
    return cleanText(error.rawBody, 500)
  }
}

async function fetchJson<T>(path: string, token = ''): Promise<T> {
  const client = new ApiHttpClient({
    baseUrl: GITHUB_API_ORIGIN,
    token: token || undefined,
    timeoutMs: GITHUB_API_TIMEOUT_MS,
    defaultHeaders: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sepilotd-desktop-apps',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  try {
    return await client.request<T>(path, {
      method: 'GET',
      retry: { maxAttempts: 1 },
    })
  } catch (error) {
    if (error instanceof ApiHttpError) {
      const detail = githubErrorDetail(error)
      throw new Error(`GitHub request failed (${error.status})${detail ? `: ${detail}` : ''}`)
    }
    throw error
  }
}

function githubApiPath(ref: GitRepoRef, suffix = ''): string {
  return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}${suffix}`
}

export async function inspectGitRepoUrl(raw: unknown) {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const ref = parseGitRepoUrl(input.url ?? raw)
  const token = cleanText(input.token, 4096)
  const pagesUrl = githubPagesUrlFor(ref)
  const baseRepo = {
    provider: ref.provider,
    owner: ref.owner,
    repo: ref.repo,
    url: ref.url,
    webUrl: ref.webUrl,
    pagesUrl,
    links: {
      commits: `${ref.webUrl}/commits`,
      tags: `${ref.webUrl}/tags`,
      releases: ref.provider === 'GitLab' ? `${ref.webUrl}/-/releases` : `${ref.webUrl}/releases`,
      pages: pagesUrl,
    },
  }

  if (ref.provider !== 'GitHub') {
    return {
      ok: true,
      source: 'url-parser',
      repo: baseRepo,
      commits: [],
      tags: [],
      releases: [],
      message: 'URL parsed. Provider-specific API lookup is available for GitHub repositories.',
    }
  }

  try {
    const [repo, commits, tags, releases] = await Promise.all([
      fetchJson<Record<string, unknown>>(githubApiPath(ref), token),
      fetchJson<Array<Record<string, unknown>>>(githubApiPath(ref, '/commits?per_page=5'), token),
      fetchJson<Array<Record<string, unknown>>>(githubApiPath(ref, '/tags?per_page=5'), token),
      fetchJson<Array<Record<string, unknown>>>(githubApiPath(ref, '/releases?per_page=5'), token),
    ])
    return {
      ok: true,
      source: 'github-api',
      repo: {
        ...baseRepo,
        description: cleanText(repo.description, 500),
        defaultBranch: cleanText(repo.default_branch, 120),
        visibility: repo.private === true ? 'private' : 'public',
        stars: Number(repo.stargazers_count || 0),
        forks: Number(repo.forks_count || 0),
        openIssues: Number(repo.open_issues_count || 0),
        pushedAt: cleanText(repo.pushed_at, 80),
        updatedAt: cleanText(repo.updated_at, 80),
      },
      commits: commits.map((commit) => {
        const detail = (
          commit.commit && typeof commit.commit === 'object' ? commit.commit : {}
        ) as Record<string, unknown>
        const author = (
          detail.author && typeof detail.author === 'object' ? detail.author : {}
        ) as Record<string, unknown>
        return {
          sha: cleanText(commit.sha, 80),
          message: cleanText(detail.message, 500).split(/\r?\n/u)[0] ?? '',
          date: cleanText(author.date, 80),
          url: cleanText(commit.html_url, 2048),
        }
      }),
      tags: tags.map((tag) => ({
        name: cleanText(tag.name, 200),
        sha:
          tag.commit && typeof tag.commit === 'object'
            ? cleanText((tag.commit as Record<string, unknown>).sha, 80)
            : '',
        url: `${ref.webUrl}/releases/tag/${encodeURIComponent(cleanText(tag.name, 200))}`,
      })),
      releases: releases.map((release) => ({
        name: cleanText(release.name, 300),
        tagName: cleanText(release.tag_name, 200),
        url: cleanText(release.html_url, 2048),
        publishedAt: cleanText(release.published_at, 80),
        draft: release.draft === true,
        prerelease: release.prerelease === true,
      })),
    }
  } catch (error) {
    return {
      ok: false,
      source: 'github-api',
      repo: baseRepo,
      commits: [],
      tags: [],
      releases: [],
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

const LAUNCHABLE_BUNDLE_EXTENSIONS = /\.(app|appex|bundle|framework|plugin|prefpane|kext|mpkg|pkg|xpc|qlgenerator|saver|workflow)$/i

export function isLaunchableBundleDirectory(path: string): boolean {
  return LAUNCHABLE_BUNDLE_EXTENSIONS.test(path.replace(/[/\\]+$/, ''))
}

export async function openDevTarget(raw: unknown) {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const kind = cleanText(input.kind, 40)
  const value = cleanText(input.value, 4096)
  if (!value) throw new Error('Open target is required.')

  if (kind === 'folder') {
    const folderPath = await realpath(resolve(value))
    const info = await stat(folderPath)
    if (!info.isDirectory()) throw new Error('Open target is not a folder.')
    if (isLaunchableBundleDirectory(folderPath)) throw new Error('Open target is an application bundle, not a folder.')
    const message = await shell.openPath(folderPath)
    if (message) throw new Error(message)
    return { ok: true, kind: 'folder', path: folderPath }
  }

  const parsed = new URL(value)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https links can be opened as URLs.')
  }
  await shell.openExternal(parsed.toString())
  return { ok: true, kind: 'url', url: parsed.toString() }
}

interface BrowserBookmark {
  id: string
  type: 'url'
  title: string
  url: string
  folder: string
  browser: string
  profile: string
  source: string
  updatedAt: number
}

function bookmarkRoots() {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return []
  return [
    { browser: 'Chrome', root: join(localAppData, 'Google', 'Chrome', 'User Data') },
    { browser: 'Edge', root: join(localAppData, 'Microsoft', 'Edge', 'User Data') },
    { browser: 'Brave', root: join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data') },
    { browser: 'Vivaldi', root: join(localAppData, 'Vivaldi', 'User Data') },
  ]
}

async function bookmarkFilesForRoot(
  root: string,
): Promise<Array<{ profile: string; path: string }>> {
  try {
    const entries = await readdir(root, { withFileTypes: true })
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ profile: entry.name, path: join(root, entry.name, 'Bookmarks') }))
  } catch {
    return []
  }
}

function extractChromeBookmarks(
  node: unknown,
  context: { browser: string; profile: string; source: string; folder: string[] },
  out: BrowserBookmark[],
): void {
  if (!node || typeof node !== 'object') return
  const record = node as Record<string, unknown>
  const type = cleanText(record.type, 40)
  const name = cleanText(record.name, 300)
  if (type === 'url') {
    const url = cleanText(record.url, 4096)
    if (!url) return
    out.push({
      id: `browser-${context.browser}-${context.profile}-${out.length + 1}`,
      type: 'url',
      title: name || url,
      url,
      folder: context.folder.join(' / '),
      browser: context.browser,
      profile: context.profile,
      source: context.source,
      updatedAt: Date.now(),
    })
    return
  }
  const children = Array.isArray(record.children) ? record.children : []
  if (children.length === 0 && !type) {
    for (const child of Object.values(record)) {
      extractChromeBookmarks(child, context, out)
    }
    return
  }
  const nextFolder = name ? [...context.folder, name] : context.folder
  for (const child of children) {
    extractChromeBookmarks(child, { ...context, folder: nextFolder }, out)
  }
}

export async function importInstalledBrowserBookmarks(raw: unknown) {
  const input = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const requestedBrowser = cleanText(input.browser, 80)
  const roots = bookmarkRoots().filter(
    (root) => requestedBrowser === 'all' || !requestedBrowser || root.browser === requestedBrowser,
  )
  const bookmarks: BrowserBookmark[] = []
  const sources: string[] = []
  const warnings: string[] = []

  for (const root of roots) {
    const files = await bookmarkFilesForRoot(root.root)
    for (const file of files) {
      try {
        const info = await stat(file.path)
        if (!info.isFile() || info.size > 20 * 1024 * 1024) continue
        const parsed = JSON.parse(await readFile(file.path, 'utf-8')) as Record<string, unknown>
        const source = `${root.browser}/${file.profile}`
        sources.push(source)
        extractChromeBookmarks(
          parsed.roots,
          {
            browser: root.browser,
            profile: file.profile,
            source,
            folder: [],
          },
          bookmarks,
        )
      } catch (error) {
        warnings.push(
          `${root.browser}/${file.profile}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    }
  }

  return {
    importedAt: Date.now(),
    sources,
    bookmarks: bookmarks.slice(0, 5000),
    truncated: bookmarks.length > 5000,
    warnings,
  }
}
