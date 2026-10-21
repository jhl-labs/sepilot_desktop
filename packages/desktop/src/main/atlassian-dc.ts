import { request as httpRequest } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { URL } from 'node:url'

const DEFAULT_TIMEOUT_MS = 20000
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024

type AtlassianProduct = 'jira' | 'confluence'
type AtlassianAuthType = 'pat' | 'basic'

interface AtlassianConnection {
  baseUrl: string
  authType: AtlassianAuthType
  username: string
  token: string
}

interface AtlassianRequestEnvelope {
  op: string
  input: Record<string, unknown>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeMaxResults(value: unknown, fallback: number): number {
  const raw = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(raw)) return fallback
  return Math.max(1, Math.min(100, Math.floor(raw)))
}

function normalizeConnection(input: unknown): AtlassianConnection {
  const record = isRecord(input) ? input : {}
  const rawBaseUrl = cleanText(record.baseUrl, 500).replace(/\/+$/g, '')
  if (!rawBaseUrl) throw new Error('Atlassian server URL is required.')
  const url = new URL(rawBaseUrl)
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Atlassian server URL must use http or https.')
  }
  const authType = record.authType === 'basic' ? 'basic' : 'pat'
  const username = cleanText(record.username, 240)
  const token = cleanText(record.token, 4096)
  if (!token) throw new Error('Atlassian token or password is required.')
  if (authType === 'basic' && !username) {
    throw new Error('Basic authentication requires a username.')
  }
  if (record.insecureSkipTlsVerify) {
    throw new Error('Atlassian TLS verification cannot be disabled. Configure a trusted CA instead.')
  }
  return {
    baseUrl: rawBaseUrl,
    authType,
    username,
    token,
  }
}

function authHeaders(connection: AtlassianConnection): Record<string, string> {
  if (connection.authType === 'basic') {
    return {
      authorization: `Basic ${Buffer.from(`${connection.username}:${connection.token}`).toString('base64')}`,
    }
  }
  return { authorization: `Bearer ${connection.token}` }
}

function requestJson<T>(
  product: AtlassianProduct,
  connection: AtlassianConnection,
  path: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `${connection.baseUrl}/`)
    const isHttps = url.protocol === 'https:'
    const requestImpl = isHttps ? httpsRequest : httpRequest
    const req = requestImpl(
      url,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': `sepilotd-desktop-atlassian-${product}/1.0`,
          ...authHeaders(connection),
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy(new Error('Atlassian response is too large.'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let payload: unknown = null
          try {
            payload = text ? JSON.parse(text) : null
          } catch {
            payload = text
          }
          if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
            reject(
              new Error(
                `Atlassian request failed (${res.statusCode ?? 0}): ${cleanText(
                  typeof payload === 'string' ? payload : JSON.stringify(payload),
                  500,
                )}`,
              ),
            )
            return
          }
          resolve(payload as T)
        })
      },
    )
    req.setTimeout(DEFAULT_TIMEOUT_MS, () => {
      req.destroy(new Error(`Atlassian request timed out after ${DEFAULT_TIMEOUT_MS}ms.`))
    })
    req.on('error', reject)
    req.end()
  })
}

function objectValue(record: unknown, key: string): Record<string, unknown> {
  if (!isRecord(record)) return {}
  const value = record[key]
  return isRecord(value) ? value : {}
}

function jiraName(record: unknown): string {
  const value = isRecord(record) ? record : {}
  return (
    cleanText(value.displayName, 240) ||
    cleanText(value.name, 240) ||
    cleanText(value.emailAddress, 240)
  )
}

function normalizeJiraIssue(issue: unknown, baseUrl: string): Record<string, unknown> | null {
  if (!isRecord(issue)) return null
  const fields = objectValue(issue, 'fields')
  const key = cleanText(issue.key, 80)
  const summary = cleanText(fields.summary, 500)
  if (!key || !summary) return null
  const issueType = objectValue(fields, 'issuetype')
  const status = objectValue(fields, 'status')
  const priority = objectValue(fields, 'priority')
  const project = objectValue(fields, 'project')
  const labels = Array.isArray(fields.labels)
    ? fields.labels.map((label) => cleanText(label, 80)).filter(Boolean)
    : []
  const updated = cleanText(fields.updated, 80)
  return {
    id: `jira-${cleanText(issue.id, 80) || key}`,
    key,
    summary,
    type: cleanText(issueType.name, 80) || 'Task',
    status: cleanText(status.name, 80) || 'To Do',
    priority: cleanText(priority.name, 80) || 'Medium',
    assignee: jiraName(fields.assignee) || '',
    reporter: jiraName(fields.reporter) || '',
    project: cleanText(project.key, 80) || key.split('-')[0],
    sprint: '',
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(cleanText(fields.duedate, 40))
      ? cleanText(fields.duedate, 40)
      : '',
    labels: labels.join(', '),
    estimate: '',
    url: `${baseUrl}/browse/${encodeURIComponent(key)}`,
    description:
      typeof fields.description === 'string'
        ? cleanText(fields.description, 2000)
        : cleanText(JSON.stringify(fields.description ?? ''), 2000),
    nextAction: '',
    blockers: '',
    updatedAt: Date.parse(updated) || Date.now(),
  }
}

function confluenceUserName(user: unknown): string {
  const value = isRecord(user) ? user : {}
  return cleanText(value.displayName, 240) || cleanText(value.username, 240) || cleanText(value.name, 240)
}

function htmlToExcerpt(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function webUrl(baseUrl: string, links: unknown): string {
  const record = isRecord(links) ? links : {}
  const path = cleanText(record.webui, 500) || cleanText(record.tinyui, 500)
  if (!path) return ''
  return new URL(path, `${baseUrl}/`).toString()
}

function normalizeConfluencePage(page: unknown, baseUrl: string): Record<string, unknown> | null {
  if (!isRecord(page)) return null
  const title = cleanText(page.title, 500)
  const remoteId = cleanText(page.id, 100)
  if (!title || !remoteId) return null
  const space = objectValue(page, 'space')
  const version = objectValue(page, 'version')
  const body = objectValue(page, 'body')
  const storage = objectValue(body, 'storage')
  const storageValue = cleanText(storage.value, MAX_RESPONSE_BYTES)
  const ancestors = Array.isArray(page.ancestors) ? page.ancestors : []
  const parent = ancestors.length ? ancestors[ancestors.length - 1] : null
  const updated = cleanText(version.when, 80).slice(0, 10)
  return {
    id: `conf-${remoteId}`,
    remoteId,
    title,
    spaceKey: cleanText(space.key, 80),
    parentTitle: isRecord(parent) ? cleanText(parent.title, 240) : '',
    status: 'Published',
    author: confluenceUserName(version.by),
    labels: '',
    updated: /^\d{4}-\d{2}-\d{2}$/.test(updated) ? updated : new Date().toISOString().slice(0, 10),
    sourceUrl: webUrl(baseUrl, page._links),
    excerpt: htmlToExcerpt(storageValue),
    markdown: '',
    confluenceBody: storageValue,
    favorite: false,
  }
}

function normalizeConfluenceSpace(page: unknown): Record<string, unknown> | null {
  const space = objectValue(page, 'space')
  const key = cleanText(space.key, 80).toUpperCase()
  if (!key) return null
  return {
    id: `space-${key.toLowerCase()}`,
    key,
    name: cleanText(space.name, 240) || key,
    owner: '',
    color: '#2563eb',
    description: '',
  }
}

function spaceCqlClause(value: unknown): string {
  const keys = cleanText(value, 500)
    .split(',')
    .map((key) => key.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 25)
  if (!keys.length) return ''
  return `space in (${keys.map((key) => `"${key.replace(/"/g, '')}"`).join(', ')})`
}

async function probeJira(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const connection = normalizeConnection(input.connection)
  const user = await requestJson<Record<string, unknown>>('jira', connection, '/rest/api/2/myself')
  return { product: 'jira', baseUrl: connection.baseUrl, user }
}

async function searchJiraAssigned(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const connection = normalizeConnection(input.connection)
  const jql =
    cleanText(input.jql, 1200) ||
    'assignee = currentUser() AND statusCategory != Done ORDER BY priority DESC, updated DESC'
  const maxResults = normalizeMaxResults(input.maxResults, 50)
  const params = new URLSearchParams({
    jql,
    maxResults: String(maxResults),
    fields:
      'summary,issuetype,status,priority,assignee,reporter,project,duedate,labels,description,updated',
  })
  const payload = await requestJson<Record<string, unknown>>(
    'jira',
    connection,
    `/rest/api/2/search?${params.toString()}`,
  )
  const issues = Array.isArray(payload.issues)
    ? payload.issues
        .map((issue) => normalizeJiraIssue(issue, connection.baseUrl))
        .filter((issue): issue is Record<string, unknown> => Boolean(issue))
    : []
  return { product: 'jira', baseUrl: connection.baseUrl, issues, total: payload.total ?? issues.length }
}

async function probeConfluence(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const connection = normalizeConnection(input.connection)
  const user = await requestJson<Record<string, unknown>>(
    'confluence',
    connection,
    '/rest/api/user/current',
  )
  return { product: 'confluence', baseUrl: connection.baseUrl, user }
}

async function searchConfluencePages(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const connection = normalizeConnection(input.connection)
  const rawCql = cleanText(input.cql, 1200) || 'type=page order by lastmodified desc'
  const spaceClause = spaceCqlClause(input.spaceKeys)
  const cql =
    spaceClause && !/\bspace\b/i.test(rawCql) ? `${spaceClause} and (${rawCql})` : rawCql
  const limit = normalizeMaxResults(input.maxResults, 25)
  const params = new URLSearchParams({
    cql,
    expand: 'space,version,body.storage,ancestors',
    limit: String(limit),
  })
  const payload = await requestJson<Record<string, unknown>>(
    'confluence',
    connection,
    `/rest/api/content/search?${params.toString()}`,
  )
  const results = Array.isArray(payload.results) ? payload.results : []
  const pages = results
    .map((page) => normalizeConfluencePage(page, connection.baseUrl))
    .filter((page): page is Record<string, unknown> => Boolean(page))
  const spacesByKey = new Map<string, Record<string, unknown>>()
  for (const page of results) {
    const space = normalizeConfluenceSpace(page)
    if (space) spacesByKey.set(String(space.key), space)
  }
  return {
    product: 'confluence',
    baseUrl: connection.baseUrl,
    cql,
    spaces: Array.from(spacesByKey.values()),
    pages,
    total: payload.size ?? pages.length,
  }
}

export async function handleDesktopAtlassianRequest(input: unknown): Promise<Record<string, unknown>> {
  const envelope = isRecord(input)
    ? ({
        op: cleanText(input.op, 120),
        input: isRecord(input.input) ? input.input : {},
      } satisfies AtlassianRequestEnvelope)
    : { op: '', input: {} }

  if (envelope.op === 'atlassian.jira.probe') return probeJira(envelope.input)
  if (envelope.op === 'atlassian.jira.searchAssigned') return searchJiraAssigned(envelope.input)
  if (envelope.op === 'atlassian.confluence.probe') return probeConfluence(envelope.input)
  if (envelope.op === 'atlassian.confluence.searchPages') {
    return searchConfluencePages(envelope.input)
  }

  throw new Error(`Unsupported Atlassian operation: ${envelope.op || 'unknown'}`)
}
