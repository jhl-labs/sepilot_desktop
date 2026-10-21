import type { AppPage, AppPageKind } from './types'

export type SharedAppKind = Extract<
  AppPageKind,
  'calendar' | 'todo' | 'meetings' | 'scrum' | 'timeline' | 'kanban'
>

type SharedWorkType = 'event' | 'meeting' | 'task' | 'action' | 'blocker' | 'decision'
type SharedWorkStatus = 'planned' | 'in_progress' | 'waiting' | 'done' | 'skipped' | 'canceled'

export interface SharedWorkspaceLinkedApp {
  kind: SharedAppKind
  title: string
  relationship: string
}

interface SharedWorkSource {
  kind: SharedAppKind
  localId: string
}

type SharedWorkOwnership = {
  sharedOriginKind: SharedAppKind
  sharedOriginTitle: string
  sharedOriginId: string
  sharedReadonly: boolean
}

interface SharedWorkItem extends SharedWorkSource {
  sharedId: string
  type: SharedWorkType
  title: string
  date?: string
  time?: string
  endDate?: string
  endTime?: string
  dueAt?: number | null
  durationMinutes?: number
  status: SharedWorkStatus
  priority: 'P1' | 'P2' | 'P3'
  owner?: string
  project?: string
  source?: string
  detail?: string
  outcome?: string
  location?: string
  notes?: string
  updatedAt: number
  createdAt?: number
}

interface ExtractedSharedWorkItem extends SharedWorkItem {
  extractedFrom: SharedAppKind
}

export interface SharedWorkspaceSyncResult {
  pages: AppPage[]
  changedPageIds: string[]
}

const SHARED_APP_KINDS = new Set<AppPageKind>([
  'calendar',
  'todo',
  'meetings',
  'scrum',
  'timeline',
  'kanban',
])

const SHARED_APP_TITLES: Record<SharedAppKind, string> = {
  calendar: '캘린더',
  todo: '할 일',
  meetings: '회의',
  scrum: '스크럼',
  timeline: '업무 타임라인',
  kanban: '칸반',
}

const SHARED_APP_CONNECTIONS: Record<SharedAppKind, SharedWorkspaceLinkedApp[]> = {
  calendar: [
    { kind: 'todo', title: SHARED_APP_TITLES.todo, relationship: '회의·기한 작업' },
    { kind: 'meetings', title: SHARED_APP_TITLES.meetings, relationship: '회의 일정' },
    { kind: 'timeline', title: SHARED_APP_TITLES.timeline, relationship: '시간 흐름' },
    { kind: 'kanban', title: SHARED_APP_TITLES.kanban, relationship: '실행 카드' },
  ],
  todo: [
    { kind: 'calendar', title: SHARED_APP_TITLES.calendar, relationship: '기한 일정' },
    { kind: 'meetings', title: SHARED_APP_TITLES.meetings, relationship: '액션 아이템' },
    { kind: 'scrum', title: SHARED_APP_TITLES.scrum, relationship: '블로커' },
    { kind: 'timeline', title: SHARED_APP_TITLES.timeline, relationship: '업무 흐름' },
    { kind: 'kanban', title: SHARED_APP_TITLES.kanban, relationship: '보드 카드' },
  ],
  meetings: [
    { kind: 'calendar', title: SHARED_APP_TITLES.calendar, relationship: '회의 일정' },
    { kind: 'todo', title: SHARED_APP_TITLES.todo, relationship: '회의 일정·후속 작업' },
    { kind: 'scrum', title: SHARED_APP_TITLES.scrum, relationship: '블로커' },
    { kind: 'timeline', title: SHARED_APP_TITLES.timeline, relationship: '회의 기록' },
    { kind: 'kanban', title: SHARED_APP_TITLES.kanban, relationship: '실행 카드' },
  ],
  scrum: [
    { kind: 'todo', title: SHARED_APP_TITLES.todo, relationship: '처리 작업' },
    { kind: 'meetings', title: SHARED_APP_TITLES.meetings, relationship: '논의 항목' },
    { kind: 'timeline', title: SHARED_APP_TITLES.timeline, relationship: '업무 이력' },
    { kind: 'kanban', title: SHARED_APP_TITLES.kanban, relationship: '진행 카드' },
  ],
  timeline: [
    { kind: 'calendar', title: SHARED_APP_TITLES.calendar, relationship: '날짜 일정' },
    { kind: 'todo', title: SHARED_APP_TITLES.todo, relationship: '작업 기한' },
    { kind: 'meetings', title: SHARED_APP_TITLES.meetings, relationship: '회의 기록' },
    { kind: 'scrum', title: SHARED_APP_TITLES.scrum, relationship: '블로커 이력' },
    { kind: 'kanban', title: SHARED_APP_TITLES.kanban, relationship: '진행 상태' },
  ],
  kanban: [
    { kind: 'calendar', title: SHARED_APP_TITLES.calendar, relationship: '일정 카드' },
    { kind: 'todo', title: SHARED_APP_TITLES.todo, relationship: '작업 목록' },
    { kind: 'meetings', title: SHARED_APP_TITLES.meetings, relationship: '후속 카드' },
    { kind: 'scrum', title: SHARED_APP_TITLES.scrum, relationship: '블로커 카드' },
    { kind: 'timeline', title: SHARED_APP_TITLES.timeline, relationship: '상태 흐름' },
  ],
}

const SHARED_ID_PATTERN = /^(calendar|todo|meetings|scrum|timeline|kanban):(.+)$/u
const DEFAULT_KANBAN_LANES = ['백로그', '준비', '진행', '리뷰', '완료']
const SHARED_MEETING_ACTIONS_ID = 'shared-actions'
const SHARED_MEETING_ACTIONS_TITLE = '공유 후속 작업'

export function isSharedWorkspaceAppKind(kind: AppPageKind): kind is SharedAppKind {
  return SHARED_APP_KINDS.has(kind)
}

export function sharedWorkspaceLinkedAppsForKind(kind: AppPageKind): SharedWorkspaceLinkedApp[] {
  if (!isSharedWorkspaceAppKind(kind)) return []
  return [...SHARED_APP_CONNECTIONS[kind]]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function collections(data: Record<string, unknown>): Record<string, unknown> {
  return isRecord(data.collections) ? data.collections : {}
}

function collectionRows(data: Record<string, unknown>, name: string): Record<string, unknown>[] {
  const value = collections(data)[name]
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function appState(data: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = data[key]
  return isRecord(value) ? value : {}
}

function setCollection(
  data: Record<string, unknown>,
  name: string,
  rows: Record<string, unknown>[],
): Record<string, unknown> {
  return {
    ...data,
    collections: {
      ...collections(data),
      [name]: rows,
    },
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function changed(left: unknown, right: unknown): boolean {
  return stableJson(left) !== stableJson(right)
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

function number(value: unknown, fallback = 0): number {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^\d{2}:\d{2}$/u.test(value)
}

function dateFromTimestamp(value: unknown): string | undefined {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function timeFromTimestamp(value: unknown): string | undefined {
  const timestamp = Number(value)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return undefined
  const date = new Date(timestamp)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function todayIsoDate(): string {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function timestampFromDateTime(
  date: unknown,
  time: unknown,
  fallbackTime = '17:00',
): number | null {
  if (!isIsoDate(date)) return null
  const value = Date.parse(`${date}T${isTime(time) ? time : fallbackTime}:00`)
  return Number.isFinite(value) ? value : null
}

function sourceFromId(fallbackKind: SharedAppKind, rawId: unknown): SharedWorkSource {
  const id = text(rawId, `${fallbackKind}-${Date.now()}`)
  const match = id.match(SHARED_ID_PATTERN)
  if (!match) return { kind: fallbackKind, localId: id }
  return { kind: match[1] as SharedAppKind, localId: match[2] ?? id }
}

function sharedId(source: SharedWorkSource): string {
  return `${source.kind}:${source.localId}`
}

function rowIdForTarget(targetKind: SharedAppKind, item: SharedWorkItem): string {
  return item.kind === targetKind ? item.localId : item.sharedId
}

function ownershipFor(targetKind: SharedAppKind, item: SharedWorkItem): SharedWorkOwnership {
  return {
    sharedOriginKind: item.kind,
    sharedOriginTitle: SHARED_APP_TITLES[item.kind],
    sharedOriginId: item.localId,
    sharedReadonly: item.kind !== targetKind,
  }
}

function priority(value: unknown): 'P1' | 'P2' | 'P3' {
  return value === 'P1' || value === 'P3' ? value : 'P2'
}

function sharedStatus(value: unknown): SharedWorkStatus {
  if (value === 'done' || value === 'completed') return 'done'
  if (value === 'in_progress' || value === 'running') return 'in_progress'
  if (value === 'waiting' || value === 'blocked') return 'waiting'
  if (value === 'skipped' || value === 'archived') return 'skipped'
  if (value === 'canceled' || value === 'cancelled') return 'canceled'
  return 'planned'
}

function todoStatus(status: SharedWorkStatus, hasDue: boolean): string {
  if (status === 'done') return 'done'
  if (status === 'waiting') return 'waiting'
  if (status === 'in_progress') return 'in_progress'
  if (status === 'canceled' || status === 'skipped') return 'archived'
  return hasDue ? 'planned' : 'inbox'
}

function laneStatus(lane: unknown): SharedWorkStatus {
  const value = text(lane)
  if (/완료|done|closed/iu.test(value)) return 'done'
  if (/리뷰|review|검토/iu.test(value)) return 'waiting'
  if (/진행|doing|progress/iu.test(value)) return 'in_progress'
  return 'planned'
}

function laneForStatus(status: SharedWorkStatus, lanes: string[]): string {
  const find = (pattern: RegExp, fallback: string): string =>
    lanes.find((lane) => pattern.test(lane)) ?? lanes.find((lane) => lane === fallback) ?? lanes[0]!
  if (status === 'done') return find(/완료|done/iu, '완료')
  if (status === 'waiting') return find(/리뷰|대기|waiting|review/iu, '리뷰')
  if (status === 'in_progress') return find(/진행|doing|progress/iu, '진행')
  return find(/준비|백로그|todo|ready|backlog/iu, '백로그')
}

function eventTypeLabel(type: SharedWorkType): string {
  if (type === 'meeting') return '회의'
  if (type === 'action') return '액션'
  if (type === 'blocker') return '블로커'
  if (type === 'decision') return '결정'
  if (type === 'task') return '할 일'
  return '일정'
}

function timelineCategory(type: SharedWorkType): string {
  if (type === 'meeting') return 'meeting'
  if (type === 'decision') return 'decision'
  if (type === 'blocker') return 'blocker'
  return type === 'event' ? 'note' : 'task'
}

function workTypeFromCalendar(row: Record<string, unknown>): SharedWorkType {
  const raw = `${text(row.type)} ${text(row.title)}`.trim()
  if (/회의|미팅|meeting/iu.test(raw)) return 'meeting'
  if (/결정|decision/iu.test(raw)) return 'decision'
  if (/블로커|blocker/iu.test(raw)) return 'blocker'
  if (/할 일|액션|마감|기한|task|todo|action|deadline|due/iu.test(raw)) return 'task'
  return 'event'
}

function workTypeFromTimeline(row: Record<string, unknown>): SharedWorkType {
  const category = text(row.category)
  if (category === 'meeting') return 'meeting'
  if (category === 'decision') return 'decision'
  if (category === 'blocker') return 'blocker'
  if (category === 'focus' || category === 'note' || category === 'event') return 'event'
  return 'task'
}

function calendarItems(page: AppPage): ExtractedSharedWorkItem[] {
  return collectionRows(page.data, 'events')
    .map((row, index): ExtractedSharedWorkItem | null => {
      const title = text(row.title)
      if (!title || !isIsoDate(row.date)) return null
      const source = sourceFromId('calendar', row.id)
      return {
        ...source,
        sharedId: sharedId(source),
        extractedFrom: 'calendar',
        type: workTypeFromCalendar(row),
        title,
        date: row.date,
        time: isTime(row.time) ? row.time : undefined,
        endDate: isIsoDate(row.endDate) ? row.endDate : undefined,
        endTime: isTime(row.endTime) ? row.endTime : undefined,
        status: 'planned',
        priority: 'P2',
        source: '캘린더',
        location: text(row.location),
        notes: text(row.notes),
        updatedAt: number(row.updatedAt, Date.now() - index),
      }
    })
    .filter((item): item is ExtractedSharedWorkItem => Boolean(item))
}

function todoItems(page: AppPage): ExtractedSharedWorkItem[] {
  return collectionRows(page.data, 'tasks')
    .map((row, index): ExtractedSharedWorkItem | null => {
      const title = text(row.title)
      if (!title) return null
      const source = sourceFromId('todo', row.id)
      const dueAt = Number.isFinite(Number(row.dueAt)) ? Number(row.dueAt) : null
      const status = sharedStatus(row.status)
      return {
        ...source,
        sharedId: sharedId(source),
        extractedFrom: 'todo',
        type: source.kind === 'calendar' ? 'event' : 'task',
        title,
        date: dateFromTimestamp(dueAt),
        time: timeFromTimestamp(dueAt),
        dueAt,
        status,
        priority: priority(row.priority),
        owner: text(row.owner),
        project: text(row.project),
        detail: text(row.notes),
        notes: text(row.notes),
        source: '할 일',
        createdAt: number(row.createdAt, Date.now() - index),
        updatedAt: number(row.updatedAt, Date.now() - index),
      }
    })
    .filter((item): item is ExtractedSharedWorkItem => Boolean(item))
}

function meetingItems(page: AppPage): ExtractedSharedWorkItem[] {
  const meetings = collectionRows(page.data, 'meetings')
    .map((row, index): ExtractedSharedWorkItem | null => {
      const title = text(row.title)
      if (!title || !isIsoDate(row.date)) return null
      const source = sourceFromId('meetings', row.id)
      return {
        ...source,
        sharedId: sharedId(source),
        extractedFrom: 'meetings',
        type: 'meeting',
        title,
        date: row.date,
        time: isTime(row.time) ? row.time : undefined,
        durationMinutes: number(row.durationMinutes, 30),
        status: sharedStatus(row.status),
        priority: 'P2',
        owner: text(row.host),
        source: '회의',
        location: text(row.location),
        detail: text(row.objective),
        notes: [text(row.objective), text(row.summary), text(row.notes)]
          .filter(Boolean)
          .join('\n\n'),
        updatedAt: number(row.updatedAt, Date.now() - index),
      }
    })
    .filter((item): item is ExtractedSharedWorkItem => Boolean(item))

  const actions = collectionRows(page.data, 'actionItems')
    .map((row, index): ExtractedSharedWorkItem | null => {
      const title = text(row.title)
      if (!title) return null
      const source = sourceFromId('meetings', row.id)
      return {
        ...source,
        sharedId: sharedId(source),
        extractedFrom: 'meetings',
        type: 'action',
        title,
        date: isIsoDate(row.dueDate) ? row.dueDate : undefined,
        dueAt: timestampFromDateTime(row.dueDate, undefined),
        status: sharedStatus(row.status),
        priority: 'P2',
        owner: text(row.owner),
        source: '회의',
        detail: text(row.source),
        createdAt: number(row.createdAt, Date.now() - index),
        updatedAt: number(row.updatedAt, number(row.createdAt, Date.now() - index)),
      }
    })
    .filter((item): item is ExtractedSharedWorkItem => Boolean(item))

  return [...meetings, ...actions]
}

function scrumItems(page: AppPage): ExtractedSharedWorkItem[] {
  return collectionRows(page.data, 'blockers')
    .map((row, index): ExtractedSharedWorkItem | null => {
      const title = text(row.text) || text(row.title)
      if (!title) return null
      const source = sourceFromId('scrum', row.id)
      return {
        ...source,
        sharedId: sharedId(source),
        extractedFrom: 'scrum',
        type: 'blocker',
        title,
        status: sharedStatus(row.status) === 'done' ? 'done' : 'waiting',
        priority: 'P1',
        owner: text(row.name),
        source: '스크럼',
        detail: title,
        updatedAt: number(row.updatedAt, Date.now() - index),
      }
    })
    .filter((item): item is ExtractedSharedWorkItem => Boolean(item))
}

function timelineItems(page: AppPage): ExtractedSharedWorkItem[] {
  return collectionRows(page.data, 'timelineEntries')
    .map((row, index): ExtractedSharedWorkItem | null => {
      const title = text(row.title)
      if (!title || !isIsoDate(row.date)) return null
      const source = sourceFromId('timeline', row.id)
      return {
        ...source,
        sharedId: sharedId(source),
        extractedFrom: 'timeline',
        type: workTypeFromTimeline(row),
        title,
        date: row.date,
        time: isTime(row.startTime) ? row.startTime : undefined,
        endTime: isTime(row.endTime) ? row.endTime : undefined,
        dueAt: timestampFromDateTime(row.date, row.endTime ?? row.startTime),
        status: sharedStatus(row.status),
        priority: priority(row.priority),
        owner: text(row.owner),
        project: text(row.project),
        source: text(row.source) || '업무 타임라인',
        detail: text(row.detail),
        outcome: text(row.outcome),
        notes: [text(row.detail), text(row.outcome)].filter(Boolean).join('\n\n'),
        createdAt: number(row.createdAt, Date.now() - index),
        updatedAt: number(row.updatedAt, Date.now() - index),
      }
    })
    .filter((item): item is ExtractedSharedWorkItem => Boolean(item))
}

function kanbanItems(page: AppPage): ExtractedSharedWorkItem[] {
  return collectionRows(page.data, 'cards')
    .map((row, index): ExtractedSharedWorkItem | null => {
      const title = text(row.title)
      if (!title) return null
      const source = sourceFromId('kanban', row.id)
      return {
        ...source,
        sharedId: sharedId(source),
        extractedFrom: 'kanban',
        type: 'task',
        title,
        status: laneStatus(row.laneId),
        priority: 'P2',
        owner: text(row.owner),
        source: '칸반',
        detail: text(row.body),
        notes: text(row.body),
        updatedAt: number(row.updatedAt, Date.now() - index),
      }
    })
    .filter((item): item is ExtractedSharedWorkItem => Boolean(item))
}

function extractPageItems(page: AppPage): ExtractedSharedWorkItem[] {
  if (!SHARED_APP_KINDS.has(page.kind)) return []
  switch (page.kind) {
    case 'calendar':
      return calendarItems(page)
    case 'todo':
      return todoItems(page)
    case 'meetings':
      return meetingItems(page)
    case 'scrum':
      return scrumItems(page)
    case 'timeline':
      return timelineItems(page)
    case 'kanban':
      return kanbanItems(page)
    default:
      return []
  }
}

function relevantCollectionsForKind(kind: AppPageKind): string[] {
  if (kind === 'calendar') return ['events']
  if (kind === 'todo') return ['tasks']
  if (kind === 'meetings') return ['meetings', 'actionItems']
  if (kind === 'scrum') return ['blockers']
  if (kind === 'timeline') return ['timelineEntries']
  if (kind === 'kanban') return ['cards']
  return []
}

function hasRelevantSharedCollection(page: AppPage): boolean {
  const pageCollections = collections(page.data)
  return relevantCollectionsForKind(page.kind).some((key) => Array.isArray(pageCollections[key]))
}

function adoptedSharedMeetingSourceIds(pages: AppPage[]): Set<string> {
  const ids = new Set<string>()
  for (const page of pages) {
    if (page.kind !== 'meetings') continue
    for (const row of collectionRows(page.data, 'meetings')) {
      const adoptedFromSharedId = text(row.adoptedFromSharedId)
      if (adoptedFromSharedId) ids.add(adoptedFromSharedId)
    }
  }
  return ids
}

function collectSharedItems(pages: AppPage[]): SharedWorkItem[] {
  const extracted = pages.flatMap(extractPageItems)
  const adoptedMeetingSources = adoptedSharedMeetingSourceIds(pages)
  const nativeItems = new Map<string, SharedWorkItem>()
  for (const item of extracted) {
    if (adoptedMeetingSources.has(item.sharedId)) continue
    if (item.kind !== item.extractedFrom) continue
    const current = nativeItems.get(item.sharedId)
    if (!current || item.updatedAt >= current.updatedAt) nativeItems.set(item.sharedId, item)
  }
  return [...nativeItems.values()].sort(
    (left, right) =>
      (left.date ?? '').localeCompare(right.date ?? '') || left.title.localeCompare(right.title),
  )
}

function minutesToTime(minutes: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(
    2,
    '0',
  )}`
}

function endTimeFor(item: SharedWorkItem): string | undefined {
  if (item.endTime) return item.endTime
  if (!item.time || !item.durationMinutes) return undefined
  const [hours, minutes] = item.time.split(':').map(Number)
  return minutesToTime((hours || 0) * 60 + (minutes || 0) + item.durationMinutes)
}

function isActionWorkItem(item: SharedWorkItem): boolean {
  return item.type === 'task' || item.type === 'action' || item.type === 'blocker'
}

function isDatedWorkItem(item: SharedWorkItem): boolean {
  return Boolean(item.date ?? dateFromTimestamp(item.dueAt))
}

function shouldProjectToCalendar(item: SharedWorkItem): boolean {
  if (!isDatedWorkItem(item)) return false
  if (item.kind === 'calendar') return true
  if (item.status === 'canceled') return false
  return item.type !== 'decision'
}

function projectCalendar(page: AppPage, items: SharedWorkItem[]): Record<string, unknown> {
  const existing = new Map(collectionRows(page.data, 'events').map((row) => [text(row.id), row]))
  const events = items
    .filter(shouldProjectToCalendar)
    .map<Record<string, unknown> | null>((item) => {
      const date = item.date ?? dateFromTimestamp(item.dueAt)
      if (!date) return null
      const id = rowIdForTarget('calendar', item)
      const previous = existing.get(id) ?? {}
      return {
        ...previous,
        id,
        title: item.title,
        date,
        time: item.time ?? timeFromTimestamp(item.dueAt) ?? text(previous.time),
        endDate: (item.endDate ?? text(previous.endDate)) || undefined,
        endTime: (endTimeFor(item) ?? text(previous.endTime)) || undefined,
        type:
          item.kind === 'calendar'
            ? text(previous.type, eventTypeLabel(item.type)) || eventTypeLabel(item.type)
            : eventTypeLabel(item.type),
        location: item.location ?? text(previous.location),
        notes: item.notes ?? item.detail ?? text(previous.notes),
        ...ownershipFor('calendar', item),
        updatedAt: item.updatedAt,
      }
    })
    .filter((event): event is Record<string, unknown> => event !== null)
    .sort((left, right) =>
      `${left.date ?? ''}${left.time ?? ''}${left.title ?? ''}`.localeCompare(
        `${right.date ?? ''}${right.time ?? ''}${right.title ?? ''}`,
      ),
    )
  return setCollection(page.data, 'events', events)
}

function projectTodo(page: AppPage, items: SharedWorkItem[]): Record<string, unknown> {
  const existing = new Map(collectionRows(page.data, 'tasks').map((row) => [text(row.id), row]))
  const tasks = items
    .filter(shouldProjectToTodo)
    .map((item) => {
      const id = rowIdForTarget('todo', item)
      const previous = existing.get(id) ?? {}
      const dueAt = item.dueAt ?? timestampFromDateTime(item.date, item.time)
      const isDone = item.status === 'done' || item.status === 'skipped'
      const completedAt = isDone ? number(previous.completedAt, item.updatedAt) : null
      return {
        ...previous,
        id,
        title: item.title,
        priority: item.priority,
        status: todoStatus(item.status, Boolean(dueAt)),
        dueAt,
        reminders: Array.isArray(previous.reminders) ? previous.reminders : [],
        repeat: text(previous.repeat, 'none') || 'none',
        owner: item.owner ?? text(previous.owner),
        project: item.project ?? text(previous.project),
        tags: text(previous.tags),
        notes: item.notes ?? item.detail ?? text(previous.notes),
        completedAt,
        lastCompletedAt: (completedAt ?? number(previous.lastCompletedAt, 0)) || null,
        createdAt: number(previous.createdAt, item.createdAt ?? item.updatedAt),
        ...ownershipFor('todo', item),
        updatedAt: item.updatedAt,
      }
    })
    .sort((left, right) => {
      const leftDone = left.status === 'done' || left.status === 'archived'
      const rightDone = right.status === 'done' || right.status === 'archived'
      if (leftDone !== rightDone) return leftDone ? 1 : -1
      return (
        number(left.dueAt, Number.MAX_SAFE_INTEGER) - number(right.dueAt, Number.MAX_SAFE_INTEGER)
      )
    })
  return setCollection(page.data, 'tasks', tasks)
}

function shouldProjectToTodo(item: SharedWorkItem): boolean {
  if (item.status === 'canceled') return false
  return isActionWorkItem(item) || (item.type === 'meeting' && isDatedWorkItem(item))
}

function isRecoverableMeetingAction(item: SharedWorkItem): boolean {
  return (
    item.kind === 'meetings' &&
    item.type === 'action' &&
    /^meeting-/u.test(item.localId) &&
    !item.date &&
    !item.dueAt
  )
}

function projectMeetings(page: AppPage, items: SharedWorkItem[]): Record<string, unknown> {
  const existingMeetingRows = collectionRows(page.data, 'meetings')
  const existing = new Map(existingMeetingRows.map((row) => [text(row.id), row]))
  const projectedMeetingRows = items
    .filter(shouldProjectToMeetingRow)
    .map((item) => {
      const id = rowIdForTarget('meetings', item)
      const previous = existing.get(id) ?? {}
      return {
        ...previous,
        id,
        title: item.title,
        date: item.date ?? dateFromTimestamp(item.dueAt) ?? todayIsoDate(),
        time: item.time ?? text(previous.time),
        durationMinutes: item.durationMinutes ?? number(previous.durationMinutes, 30),
        host: item.owner ?? text(previous.host),
        attendees: text(previous.attendees),
        type: text(previous.type, '업무') || '업무',
        status:
          item.status === 'done' ? 'done' : item.status === 'canceled' ? 'canceled' : 'scheduled',
        location: item.location ?? text(previous.location),
        objective: item.detail ?? text(previous.objective),
        notes: item.notes ?? text(previous.notes),
        summary: item.outcome ?? text(previous.summary),
        ...ownershipFor('meetings', item),
        updatedAt: item.updatedAt,
      }
    })
  const projectedMeetingIds = new Set(projectedMeetingRows.map((row) => text(row.id)))
  const nativeMeetingRows = existingMeetingRows.filter((row) => {
    const id = text(row.id)
    return sourceFromId('meetings', id).kind === 'meetings' && !projectedMeetingIds.has(id)
  })
  const meetings = [...nativeMeetingRows, ...projectedMeetingRows]

  const existingActions = new Map(
    collectionRows(page.data, 'actionItems').map((row) => [text(row.id), row]),
  )
  const projectedActions = items
    .filter(shouldProjectToMeetingAction)
    .map((item) => {
      const id = rowIdForTarget('meetings', item)
      const previous = existingActions.get(id) ?? {}
      return {
        ...previous,
        id,
        meetingId: text(previous.meetingId) || SHARED_MEETING_ACTIONS_ID,
        title: item.title,
        owner: item.owner ?? text(previous.owner),
        dueDate: item.date ?? dateFromTimestamp(item.dueAt) ?? text(previous.dueDate),
        status: item.status === 'done' ? 'done' : item.status === 'waiting' ? 'waiting' : 'open',
        source: item.source ?? text(previous.source, '공유 업무'),
        createdAt: number(previous.createdAt, item.createdAt ?? item.updatedAt),
        ...ownershipFor('meetings', item),
        updatedAt: item.updatedAt,
      }
    })
  const projectedActionIds = new Set(projectedActions.map((row) => text(row.id)))
  const nativeActionRows = collectionRows(page.data, 'actionItems').filter((row) => {
    const id = text(row.id)
    const source = sourceFromId('meetings', id)
    const isMisfiledMeetingRow = /^meeting-/u.test(source.localId) && !text(row.meetingId)
    return (
      source.kind === 'meetings' && !projectedActionIds.has(id) && !isMisfiledMeetingRow
    )
  })
  const actions = [...nativeActionRows, ...projectedActions]
  const needsSharedActionsMeeting = actions.some(
    (action) => text(action.meetingId) === SHARED_MEETING_ACTIONS_ID,
  )
  if (
    needsSharedActionsMeeting &&
    !meetings.some((meeting) => text(meeting.id) === SHARED_MEETING_ACTIONS_ID)
  ) {
    const sharedActions = actions.filter(
      (action) => text(action.meetingId) === SHARED_MEETING_ACTIONS_ID,
    )
    meetings.push({
      id: SHARED_MEETING_ACTIONS_ID,
      title: SHARED_MEETING_ACTIONS_TITLE,
      date:
        sharedActions
          .map((action) => text(action.dueDate))
          .filter(isIsoDate)
          .sort()[0] ?? todayIsoDate(),
      time: '',
      durationMinutes: 30,
      host: '',
      attendees: '',
      type: '후속',
      status: 'scheduled',
      location: '',
      objective: '아직 특정 회의에 묶이지 않은 공유 액션입니다.',
      notes: '',
      summary: '',
      updatedAt: Math.max(
        ...sharedActions.map((action) => number(action.updatedAt, 0)),
        Date.now(),
      ),
    })
  }
  let next = setCollection(page.data, 'meetings', meetings)
  next = setCollection(next, 'actionItems', actions)
  return next
}

function shouldProjectToMeetingRow(item: SharedWorkItem): boolean {
  if (isRecoverableMeetingAction(item)) return true
  if (item.status === 'canceled' && item.kind !== 'meetings') return false
  return item.type === 'meeting' && isDatedWorkItem(item)
}

function shouldProjectToMeetingAction(item: SharedWorkItem): boolean {
  if (item.status === 'canceled' || isRecoverableMeetingAction(item)) return false
  if (item.kind === 'meetings') return item.type === 'action' || item.type === 'task'
  return item.type === 'action' || item.type === 'blocker'
}

function projectScrum(page: AppPage, items: SharedWorkItem[]): Record<string, unknown> {
  const existing = new Map(collectionRows(page.data, 'blockers').map((row) => [text(row.id), row]))
  const memberBlockers = collectionRows(page.data, 'blockers').filter((row) =>
    text(row.id).startsWith('blocker-'),
  )
  const externalBlockers = items
    .filter(shouldProjectToScrum)
    .map((item) => {
      const id = rowIdForTarget('scrum', item)
      const previous = existing.get(id) ?? {}
      return {
        ...previous,
        id,
        memberId: text(previous.memberId),
        name: item.owner ?? text(previous.name),
        text: item.detail ?? item.title,
        status: item.status === 'done' ? 'done' : 'open',
        source: item.source ?? '공유 업무',
        ...ownershipFor('scrum', item),
        updatedAt: item.updatedAt,
      }
    })
  return setCollection(page.data, 'blockers', [...memberBlockers, ...externalBlockers])
}

function shouldProjectToScrum(item: SharedWorkItem): boolean {
  if (item.status === 'canceled') return false
  return item.type === 'blocker' || (item.status === 'waiting' && isActionWorkItem(item))
}

function projectTimeline(page: AppPage, items: SharedWorkItem[]): Record<string, unknown> {
  const existing = new Map(
    collectionRows(page.data, 'timelineEntries').map((row) => [text(row.id), row]),
  )
  const entries = items
    .filter(shouldProjectToTimeline)
    .map<Record<string, unknown> | null>((item) => {
      const date = item.date ?? dateFromTimestamp(item.dueAt)
      if (!date) return null
      const id = rowIdForTarget('timeline', item)
      const previous = existing.get(id) ?? {}
      const start = item.time ?? timeFromTimestamp(item.dueAt) ?? text(previous.startTime, '09:00')
      return {
        ...previous,
        id,
        date,
        startTime: start,
        endTime: endTimeFor(item) ?? text(previous.endTime, start),
        title: item.title,
        category:
          item.kind === 'timeline'
            ? text(previous.category, timelineCategory(item.type)) || timelineCategory(item.type)
            : timelineCategory(item.type),
        project: item.project ?? text(previous.project),
        owner: item.owner ?? text(previous.owner),
        status: item.status === 'canceled' ? 'skipped' : item.status,
        priority: item.priority,
        source: item.source ?? text(previous.source, eventTypeLabel(item.type)),
        detail: item.detail ?? item.notes ?? text(previous.detail),
        outcome: item.outcome ?? text(previous.outcome),
        createdAt: number(previous.createdAt, item.createdAt ?? item.updatedAt),
        ...ownershipFor('timeline', item),
        updatedAt: item.updatedAt,
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .sort((left, right) =>
      `${left.date ?? ''}${left.startTime ?? ''}${left.title ?? ''}`.localeCompare(
        `${right.date ?? ''}${right.startTime ?? ''}${right.title ?? ''}`,
      ),
    )
  return setCollection(page.data, 'timelineEntries', entries)
}

function shouldProjectToTimeline(item: SharedWorkItem): boolean {
  return isDatedWorkItem(item)
}

function kanbanLaneNames(page: AppPage): string[] {
  const lanes = appState(page.data, 'kanban').lanes
  if (!Array.isArray(lanes)) return DEFAULT_KANBAN_LANES
  const names = lanes
    .map((lane) => (isRecord(lane) ? text(lane.id) || text(lane.name) : ''))
    .filter(Boolean)
  return names.length ? names : DEFAULT_KANBAN_LANES
}

function projectKanban(page: AppPage, items: SharedWorkItem[]): Record<string, unknown> {
  const existing = new Map(collectionRows(page.data, 'cards').map((row) => [text(row.id), row]))
  const lanes = kanbanLaneNames(page)
  const cards = items
    .filter(shouldProjectToKanban)
    .map((item) => {
      const id = rowIdForTarget('kanban', item)
      const previous = existing.get(id) ?? {}
      return {
        ...previous,
        id,
        title: item.title,
        body: item.notes ?? item.detail ?? text(previous.body),
        owner: item.owner ?? text(previous.owner),
        laneId: laneForStatus(item.status, lanes),
        syncState: text(previous.syncState, 'local') || 'local',
        syncError: text(previous.syncError),
        ...ownershipFor('kanban', item),
        updatedAt: item.updatedAt,
      }
    })
  return setCollection(page.data, 'cards', cards)
}

function shouldProjectToKanban(item: SharedWorkItem): boolean {
  if (item.status === 'canceled') return false
  return isActionWorkItem(item)
}

function projectPage(page: AppPage, items: SharedWorkItem[]): AppPage {
  if (!SHARED_APP_KINDS.has(page.kind)) return page
  const kind = page.kind as SharedAppKind
  const nextData =
    kind === 'calendar'
      ? projectCalendar(page, items)
      : kind === 'todo'
        ? projectTodo(page, items)
        : kind === 'meetings'
          ? projectMeetings(page, items)
          : kind === 'scrum'
            ? projectScrum(page, items)
            : kind === 'timeline'
              ? projectTimeline(page, items)
              : projectKanban(page, items)
  if (!changed(page.data, nextData)) return page
  return {
    ...page,
    data: nextData,
    updatedAt: Date.now(),
  }
}

export function syncSharedWorkspaceData(
  pages: AppPage[],
  changedPageId?: string | null,
): SharedWorkspaceSyncResult {
  const changedPage = changedPageId ? pages.find((page) => page.id === changedPageId) : null
  if (
    changedPage &&
    (!SHARED_APP_KINDS.has(changedPage.kind) || !hasRelevantSharedCollection(changedPage))
  ) {
    return { pages, changedPageIds: [] }
  }

  const items = collectSharedItems(pages)
  if (items.length === 0 && !changedPage) return { pages, changedPageIds: [] }

  const changedIds: string[] = []
  const nextPages = pages.map((page) => {
    const nextPage = projectPage(page, items)
    if (nextPage !== page) changedIds.push(page.id)
    return nextPage
  })
  return { pages: nextPages, changedPageIds: changedIds }
}
