'use client'
import { create } from 'zustand'
import { SEPILOT_APPS_FRAMEWORK_VERSION } from '@sepilotd/api-client'
import type { DesktopAppBundle, DesktopAppSaveInput } from '@sepilotd/api-client'
import { getDesktopApi } from '@/lib/electron/bridge'
import {
  DEFAULT_APP_PERMISSIONS,
  getEffectiveAppCapabilities,
  validateAppHtml,
} from '@/lib/apps/runtime'
import {
  ENABLED_APP_TEMPLATES,
  enabledAppTemplateCatalog,
  getEnabledAppTemplate,
  isAppPageEnabled,
  isAppTemplateEnabled,
} from '@/lib/apps/catalog'
import { getAppTemplate } from '@/lib/apps/templates'
import { syncSharedWorkspaceData } from '@/lib/apps/shared-work'
import type { AppPage, AppPageKind, AppPageOrigin, AppTemplate } from '@/lib/apps/types'
import type { SepilotAppCapabilities, SepilotAppDataPolicy } from '@sepilotd/api-client'

const APPS_STORAGE_KEY = 'sepilotd.office.pages.v1'
const DEFAULT_APP_DATA_POLICY: SepilotAppDataPolicy = {
  aiReadable: true,
  aiWritable: true,
  interAppReadable: true,
  backup: 'included',
  sensitivePaths: [],
  redactedKeys: [],
}
const DEFAULT_APP_CAPABILITIES: SepilotAppCapabilities = {
  fields: true,
  collections: true,
  timeSeries: true,
  semanticSearch: true,
  scheduler: true,
  notifications: true,
  backup: true,
  encryption: false,
  interAppRead: true,
  agentTools: true,
  workflow: false,
  customComponents: true,
}

interface AppsSnapshot {
  pages: AppPage[]
  activeId: string | null
  openIds: string[]
  tabGroupOverrides: Record<string, string>
}

interface AppsState extends AppsSnapshot {
  storageHydrated: boolean
  storagePath: string | null
  storageError: string | null
  hydrateFromStorage: () => Promise<void>
  setActive: (id: string | null) => void
  reorderOpenPage: (id: string, targetIndex: number) => void
  setTabGroupOverride: (id: string, groupName: string | null) => void
  renameTabGroupOverride: (groupName: string, nextGroupName: string) => void
  addFromTemplate: (templateId: AppPageKind) => string
  addGeneratedPage: (input: {
    title: string
    html: string
    prompt?: string
    summary?: string
  }) => string
  updatePage: (
    id: string,
    patch: Partial<
      Pick<
        AppPage,
        | 'title'
        | 'html'
        | 'prompt'
        | 'summary'
        | 'dataPolicy'
        | 'capabilities'
        | 'hostRequests'
        | 'dataSchema'
      >
    >,
  ) => void
  updatePageData: (id: string, data: Record<string, unknown>) => void
  syncSharedWorkspace: (id: string) => string[]
  duplicatePage: (id: string) => string | null
  restorePageVersion: (id: string, version: number) => Promise<void>
  exportPage: (id: string) => Promise<string | null>
  importPage: () => Promise<string | null>
  exportBackup: () => Promise<string | null>
  restoreBackup: () => Promise<void>
  closePage: (id: string) => void
  deletePage: (id: string) => void
  resetToTemplates: () => void
}

const APP_KINDS = new Set<AppPageKind>([
  'calendar',
  'todo',
  'notepad',
  'scrum',
  'meetings',
  'inbox',
  'briefing',
  'timeline',
  'mermaid',
  'mindmap',
  'table',
  'kanban',
  'sticky',
  'vault',
  'subscriptions',
  'portfolio',
  'stocks',
  'ledger',
  'devices',
  'services',
  'jira',
  'confluence',
  'clusters',
  'network',
  'storage',
  'smarthome',
  'smartcar',
  'gitrepos',
  'bookmarks',
  'architect',
  'custom',
])

function normalizeKind(value: string): AppPageKind {
  return APP_KINDS.has(value as AppPageKind) ? (value as AppPageKind) : 'custom'
}

function normalizeOrigin(value: unknown): AppPageOrigin | undefined {
  return value === 'template' || value === 'code-agent' ? value : undefined
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `app-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function pageFromTemplate(template: AppTemplate, now = Date.now()): AppPage {
  const validation = validateAppHtml(template.html)
  return {
    id: createId(),
    title: template.title,
    kind: template.id,
    frameworkVersion: SEPILOT_APPS_FRAMEWORK_VERSION,
    summary: template.summary,
    category: template.category,
    accent: template.accent,
    origin: 'template',
    version: 1,
    permissions: DEFAULT_APP_PERMISSIONS,
    dataPolicy: template.dataPolicy ?? DEFAULT_APP_DATA_POLICY,
    capabilities: template.capabilities ?? DEFAULT_APP_CAPABILITIES,
    hostRequests: template.hostRequests,
    dataSchema: template.dataSchema,
    validation,
    versions: [],
    html: template.html,
    data: template.data ?? {},
    createdAt: now,
    updatedAt: now,
  }
}

function pageFromBundle(bundle: DesktopAppBundle): AppPage {
  const manifest = bundle.manifest
  return {
    id: manifest.id,
    title: manifest.title,
    kind: normalizeKind(manifest.kind),
    frameworkVersion: manifest.frameworkVersion,
    summary: manifest.summary,
    category: manifest.category,
    accent: manifest.accent,
    origin: normalizeOrigin(manifest.origin),
    version: manifest.version,
    permissions: manifest.permissions,
    dataPolicy: manifest.dataPolicy,
    capabilities: manifest.capabilities,
    hostRequests: manifest.hostRequests,
    dataSchema: manifest.dataSchema,
    validation: manifest.validation,
    versions: manifest.versions,
    storagePath: bundle.path,
    html: bundle.html,
    data: bundle.data,
    createdAt: manifest.createdAt,
    updatedAt: manifest.updatedAt,
  }
}

function pageToSaveInput(page: AppPage, createVersion = true): DesktopAppSaveInput {
  return {
    id: page.id,
    manifest: {
      title: page.title,
      kind: page.kind,
      summary: page.summary,
      category: page.category,
      accent: page.accent,
      origin: page.origin,
      permissions: page.permissions ?? DEFAULT_APP_PERMISSIONS,
      dataPolicy: page.dataPolicy,
      capabilities: getEffectiveAppCapabilities(page),
      hostRequests: page.hostRequests,
      dataSchema: page.dataSchema,
    },
    html: page.html,
    data: page.data,
    prompt: page.prompt,
    createVersion,
  }
}

function storageRootFromBundlePath(path: string | undefined): string | null {
  return path ? path.replace(/[/\\][^/\\]+$/u, '') : null
}

function cloneData(data: Record<string, unknown>): Record<string, unknown> {
  if (typeof structuredClone === 'function') {
    return structuredClone(data) as Record<string, unknown>
  }
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>
}

function normalizeOpenIds(value: unknown, pages: AppPage[], fallbackToAllPages: boolean): string[] {
  if (!Array.isArray(value)) return fallbackToAllPages ? pages.map((page) => page.id) : []
  const validIds = new Set(pages.map((page) => page.id))
  const openIds: string[] = []
  for (const id of value) {
    if (typeof id === 'string' && validIds.has(id) && !openIds.includes(id)) {
      openIds.push(id)
    }
  }
  return openIds
}

function defaultTabGroupForPage(page: AppPage): string {
  return page.category?.trim() || (page.kind === 'custom' ? 'Custom' : page.kind)
}

function normalizeTabGroupOverrides(value: unknown, pages: AppPage[]): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const validIds = new Set(pages.map((page) => page.id))
  const overrides: Record<string, string> = {}
  for (const [id, groupName] of Object.entries(value)) {
    if (!validIds.has(id) || typeof groupName !== 'string') continue
    const normalizedGroupName = groupName.trim()
    if (normalizedGroupName) overrides[id] = normalizedGroupName
  }
  return overrides
}

function activeIdForOpenPages(activeId: unknown, openIds: string[]): string | null {
  return typeof activeId === 'string' && openIds.includes(activeId)
    ? activeId
    : (openIds[0] ?? null)
}

function openedSnapshot(
  pages: AppPage[],
  openIds: string[],
  activeId: string | null,
  tabGroupOverrides: Record<string, string> = {},
): AppsSnapshot {
  const normalizedOpenIds = normalizeOpenIds(openIds, pages, false)
  return {
    pages,
    openIds: normalizedOpenIds,
    activeId: activeIdForOpenPages(activeId, normalizedOpenIds),
    tabGroupOverrides: normalizeTabGroupOverrides(tabGroupOverrides, pages),
  }
}

function replacePageFromBundle(bundle: DesktopAppBundle, previousId = bundle.manifest.id): void {
  const nextPage = pageFromBundle(bundle)
  useAppsStore.setState((state) => {
    const pages = state.pages.map((candidate) =>
      candidate.id === previousId ? nextPage : candidate,
    )
    const openIds = state.openIds.map((id) => (id === previousId ? nextPage.id : id))
    const activeId = state.activeId === previousId ? nextPage.id : state.activeId
    const tabGroupOverrides = { ...state.tabGroupOverrides }
    if (previousId !== nextPage.id && previousId in tabGroupOverrides) {
      tabGroupOverrides[nextPage.id] = tabGroupOverrides[previousId]
      delete tabGroupOverrides[previousId]
    }
    const snapshot = openedSnapshot(pages, openIds, activeId, tabGroupOverrides)
    persistSnapshot(snapshot)
    return {
      pages: snapshot.pages,
      activeId: snapshot.activeId,
      openIds: snapshot.openIds,
      tabGroupOverrides: snapshot.tabGroupOverrides,
      storagePath: storageRootFromBundlePath(bundle.path),
      storageError: null,
    }
  })
}

function defaultSnapshot(): AppsSnapshot {
  const now = Date.now()
  const pages = ENABLED_APP_TEMPLATES.map((template, index) =>
    pageFromTemplate(template, now + index),
  )
  const openIds = pages
    .filter((page) => enabledAppTemplateCatalog.defaultOpenTemplateIds.has(page.kind))
    .map((page) => page.id)
  return {
    pages,
    activeId: openIds[0] ?? null,
    openIds,
    tabGroupOverrides: {},
  }
}

function normalizeSnapshot(value: unknown): AppsSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Partial<AppsSnapshot>
  const pages = Array.isArray(record.pages)
    ? record.pages.filter((page): page is AppPage => {
        return (
          page != null &&
          typeof page === 'object' &&
          typeof page.id === 'string' &&
          typeof page.title === 'string' &&
          typeof page.html === 'string'
        )
      })
    : []
  if (pages.length === 0) return null
  const openIds = normalizeOpenIds(record.openIds, pages, !Array.isArray(record.openIds))
  return openedSnapshot(pages, openIds, record.activeId ?? null, record.tabGroupOverrides)
}

function mergeTemplateHostRequests(page: AppPage, template: AppTemplate): AppPage['hostRequests'] {
  const templateRequests = template.hostRequests ?? []
  if (templateRequests.length === 0) return page.hostRequests
  const pageRequests = page.hostRequests ?? []
  const merged = [...pageRequests]
  for (const request of templateRequests) {
    if (!merged.some((candidate) => candidate.op === request.op)) {
      merged.push(request)
    }
  }
  return merged
}

function mergeTemplateCapabilities(page: AppPage, template: AppTemplate): SepilotAppCapabilities {
  const templateCapabilities = template.capabilities ?? DEFAULT_APP_CAPABILITIES
  const pageCapabilities = page.capabilities ?? {}
  return { ...templateCapabilities, ...pageCapabilities }
}

function capabilitiesEqual(
  left: SepilotAppCapabilities | undefined,
  right: SepilotAppCapabilities,
): boolean {
  const leftRecord = left ?? {}
  const keys = new Set([...Object.keys(leftRecord), ...Object.keys(right)])
  for (const key of keys) {
    const typedKey = key as keyof SepilotAppCapabilities
    if (leftRecord[typedKey] !== right[typedKey]) return false
  }
  return true
}

function rehydrateTemplatePages(snapshot: AppsSnapshot): AppsSnapshot {
  const enabledPages = snapshot.pages.filter(isAppPageEnabled)
  let changed = enabledPages.length !== snapshot.pages.length
  const pages = enabledPages.map((page) => {
    if (page.kind === 'custom') return page
    const template = getAppTemplate(page.kind)
    if (!template) return page
    const hostRequests = mergeTemplateHostRequests(page, template)
    const hostRequestsChanged = hostRequests !== page.hostRequests
    let capabilities = mergeTemplateCapabilities(page, template)
    if (page.kind === 'storage' && template.capabilities?.interAppRead === false) {
      capabilities = { ...capabilities, interAppRead: false }
    }
    const capabilitiesChanged = !capabilitiesEqual(page.capabilities, capabilities)
    if (
      template.html === page.html &&
      page.summary &&
      page.category &&
      page.accent &&
      page.origin &&
      !hostRequestsChanged &&
      !capabilitiesChanged
    ) {
      return page
    }
    changed = true
    return {
      ...page,
      title: page.title || template.title,
      summary: page.summary ?? template.summary,
      category: page.category ?? template.category,
      accent: page.accent ?? template.accent,
      frameworkVersion: page.frameworkVersion ?? SEPILOT_APPS_FRAMEWORK_VERSION,
      origin: page.origin ?? 'template',
      dataPolicy: page.dataPolicy ?? template.dataPolicy ?? DEFAULT_APP_DATA_POLICY,
      capabilities,
      hostRequests,
      dataSchema: page.dataSchema ?? template.dataSchema,
      html: template.html,
    }
  })
  const existingTemplateKinds = new Set(
    pages.filter((page) => page.kind !== 'custom').map((page) => page.kind),
  )
  const now = Date.now()
  const missingTemplatePages = ENABLED_APP_TEMPLATES.filter(
    (template) => !existingTemplateKinds.has(template.id),
  ).map((template, index) => pageFromTemplate(template, now + pages.length + index))
  if (missingTemplatePages.length > 0) {
    changed = true
    pages.push(...missingTemplatePages)
  }
  if (!changed) return snapshot
  const defaultOpenMissingPageIds = missingTemplatePages
    .filter((page) => enabledAppTemplateCatalog.defaultOpenTemplateIds.has(page.kind))
    .map((page) => page.id)
  return openedSnapshot(
    pages,
    [...snapshot.openIds, ...defaultOpenMissingPageIds],
    snapshot.activeId,
    snapshot.tabGroupOverrides,
  )
}

function loadSnapshot(): AppsSnapshot {
  if (typeof window === 'undefined') return defaultSnapshot()
  try {
    const raw = window.localStorage.getItem(APPS_STORAGE_KEY)
    if (!raw) return defaultSnapshot()
    const normalized = normalizeSnapshot(JSON.parse(raw))
    return normalized ? rehydrateTemplatePages(normalized) : defaultSnapshot()
  } catch {
    return defaultSnapshot()
  }
}

function persistSnapshot(snapshot: AppsSnapshot): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(
    APPS_STORAGE_KEY,
    JSON.stringify({
      pages: snapshot.pages,
      activeId: snapshot.activeId,
      openIds: snapshot.openIds,
      tabGroupOverrides: snapshot.tabGroupOverrides,
    }),
  )
}

function commit(state: AppsSnapshot): AppsSnapshot {
  persistSnapshot(state)
  return state
}

const initial = loadSnapshot()

function setStorageError(error: unknown): void {
  useAppsStore.setState({
    storageError: error instanceof Error ? error.message : String(error),
  })
}

async function savePageToDesktop(page: AppPage, createVersion = true): Promise<void> {
  const api = getDesktopApi()
  if (!api?.apps) return
  try {
    const bundle = await api.apps.save(pageToSaveInput(page, createVersion))
    replacePageFromBundle(bundle, page.id)
  } catch (error) {
    setStorageError(error)
  }
}

async function savePageDataToDesktop(id: string, data: Record<string, unknown>): Promise<void> {
  const api = getDesktopApi()
  if (!api?.apps) return
  try {
    const bundle = await api.apps.saveData(id, data)
    replacePageFromBundle(bundle, id)
  } catch (error) {
    setStorageError(error)
  }
}

async function deletePageFromDesktop(id: string): Promise<void> {
  const api = getDesktopApi()
  if (!api?.apps) return
  try {
    await api.apps.delete(id)
    useAppsStore.setState({ storageError: null })
  } catch (error) {
    setStorageError(error)
  }
}

async function resetPagesOnDesktop(pages: AppPage[]): Promise<void> {
  const api = getDesktopApi()
  if (!api?.apps) return
  try {
    const existingBundles = await api.apps.list()
    for (const bundle of existingBundles) {
      const existingPage = pageFromBundle(bundle)
      const isDisabledBuiltIn =
        existingPage.kind !== 'custom' && !isAppTemplateEnabled(existingPage.kind)
      if (!isDisabledBuiltIn) await api.apps.delete(existingPage.id)
    }
    const bundles: DesktopAppBundle[] = []
    for (const page of pages) {
      bundles.push(await api.apps.save(pageToSaveInput(page, true)))
    }
    const activePages = bundles.map(pageFromBundle)
    const snapshot = openedSnapshot(
      activePages,
      activePages
        .filter((page) => enabledAppTemplateCatalog.defaultOpenTemplateIds.has(page.kind))
        .map((page) => page.id),
      useAppsStore.getState().activeId,
      useAppsStore.getState().tabGroupOverrides,
    )
    useAppsStore.setState((state) => ({
      pages: snapshot.pages,
      activeId: snapshot.activeId,
      openIds: snapshot.openIds,
      tabGroupOverrides: snapshot.tabGroupOverrides,
      storagePath: storageRootFromBundlePath(bundles[0]?.path) ?? state.storagePath,
      storageError: null,
    }))
    persistSnapshot(snapshot)
  } catch (error) {
    setStorageError(error)
  }
}

async function restoreVersionFromDesktop(id: string, version: number): Promise<void> {
  const api = getDesktopApi()
  if (!api?.apps) {
    setStorageError(new Error('Desktop app storage is unavailable.'))
    return
  }
  try {
    const bundle = await api.apps.restoreVersion(id, version)
    replacePageFromBundle(bundle, id)
  } catch (error) {
    setStorageError(error)
    throw error
  }
}

async function exportPageFromDesktop(id: string): Promise<string | null> {
  const api = getDesktopApi()
  if (!api?.apps) {
    setStorageError(new Error('Desktop app storage is unavailable.'))
    return null
  }
  try {
    const path = await api.apps.exportApp(id)
    useAppsStore.setState({ storageError: null })
    return path
  } catch (error) {
    setStorageError(error)
    throw error
  }
}

async function importPageFromDesktop(): Promise<string | null> {
  const api = getDesktopApi()
  if (!api?.apps) {
    setStorageError(new Error('Desktop app storage is unavailable.'))
    return null
  }
  try {
    const bundle = await api.apps.importApp()
    if (!bundle) return null
    const page = pageFromBundle(bundle)
    if (!isAppPageEnabled(page)) {
      throw new Error(`App "${page.title}" is disabled by the Desktop build profile.`)
    }
    useAppsStore.setState((state) => {
      const pages = [...state.pages, page]
      const snapshot = openedSnapshot(
        pages,
        [...state.openIds, page.id],
        page.id,
        state.tabGroupOverrides,
      )
      persistSnapshot(snapshot)
      return {
        pages: snapshot.pages,
        activeId: snapshot.activeId,
        openIds: snapshot.openIds,
        tabGroupOverrides: snapshot.tabGroupOverrides,
        storagePath: storageRootFromBundlePath(bundle.path),
        storageError: null,
      }
    })
    return page.id
  } catch (error) {
    setStorageError(error)
    throw error
  }
}

async function exportBackupFromDesktop(): Promise<string | null> {
  const api = getDesktopApi()
  if (!api?.apps) {
    setStorageError(new Error('Desktop app storage is unavailable.'))
    return null
  }
  try {
    const path = await api.apps.exportBackup()
    useAppsStore.setState({ storageError: null })
    return path
  } catch (error) {
    setStorageError(error)
    throw error
  }
}

async function restoreBackupFromDesktop(): Promise<void> {
  const api = getDesktopApi()
  if (!api?.apps) {
    setStorageError(new Error('Desktop app storage is unavailable.'))
    return
  }
  try {
    const bundles = await api.apps.restoreBackup()
    if (!bundles) return
    const restoredPages = bundles.map(pageFromBundle)
    const snapshot = rehydrateTemplatePages(
      openedSnapshot(
        restoredPages,
        restoredPages.map((page) => page.id),
        restoredPages[0]?.id ?? null,
        useAppsStore.getState().tabGroupOverrides,
      ),
    )
    useAppsStore.setState({
      pages: snapshot.pages,
      activeId: snapshot.activeId,
      openIds: snapshot.openIds,
      tabGroupOverrides: snapshot.tabGroupOverrides,
      storagePath: storageRootFromBundlePath(bundles[0]?.path),
      storageError: null,
    })
    persistSnapshot(snapshot)
  } catch (error) {
    setStorageError(error)
    throw error
  }
}

let appHydration: Promise<void> | undefined

export const useAppsStore = create<AppsState>((set) => ({
  ...initial,
  storageHydrated: false,
  storagePath: null,
  storageError: null,
  hydrateFromStorage: () => {
    if (appHydration) return appHydration
    appHydration = (async () => {
      const api = getDesktopApi()
      if (!api?.apps) {
        set({ storageHydrated: true })
        return
      }
      try {
        const bundles = await api.apps.list()
        if (bundles.length > 0) {
          const bundlePages = bundles.map(pageFromBundle)
          const currentState = useAppsStore.getState()
          const matchingOpenIds = normalizeOpenIds(currentState.openIds, bundlePages, false)
          const openIds =
            matchingOpenIds.length > 0 || currentState.openIds.length === 0
              ? matchingOpenIds
              : bundlePages.map((page) => page.id)
          const rehydrated = rehydrateTemplatePages(
            openedSnapshot(
              bundlePages,
              openIds,
              currentState.activeId,
              currentState.tabGroupOverrides,
            ),
          )
          const pages = rehydrated.pages
          set({
            pages,
            activeId: rehydrated.activeId,
            openIds: rehydrated.openIds,
            tabGroupOverrides: rehydrated.tabGroupOverrides,
            storageHydrated: true,
            storagePath: storageRootFromBundlePath(bundles[0]?.path),
            storageError: null,
          })
          persistSnapshot(rehydrated)
          const originalPagesById = new Map(bundlePages.map((page) => [page.id, page]))
          const upgradedTemplatePages = pages.filter(
            (page) => page !== originalPagesById.get(page.id),
          )
          for (const page of upgradedTemplatePages) void savePageToDesktop(page, false)
          return
        }

        const snapshot = loadSnapshot()
        const seeded = await api.apps.reset(snapshot.pages.map((page) => pageToSaveInput(page, true)))
        const pages = seeded.map(pageFromBundle)
        const nextSnapshot = openedSnapshot(
          pages,
          normalizeOpenIds(snapshot.openIds, pages, false),
          snapshot.activeId,
          snapshot.tabGroupOverrides,
        )
        set({
          pages: nextSnapshot.pages,
          activeId: nextSnapshot.activeId,
          openIds: nextSnapshot.openIds,
          tabGroupOverrides: nextSnapshot.tabGroupOverrides,
          storageHydrated: true,
          storagePath: storageRootFromBundlePath(seeded[0]?.path),
          storageError: null,
        })
        persistSnapshot(nextSnapshot)
      } catch (error) {
        set({
          storageHydrated: true,
          storageError: error instanceof Error ? error.message : String(error),
        })
      }
    })().finally(() => {
      appHydration = undefined
    })
    return appHydration
  },
  setActive: (id) =>
    set((state) =>
      commit(
        openedSnapshot(
          state.pages,
          id && state.pages.some((page) => page.id === id) ? [...state.openIds, id] : state.openIds,
          id,
          state.tabGroupOverrides,
        ),
      ),
    ),
  reorderOpenPage: (id, targetIndex) =>
    set((state) => {
      const currentIndex = state.openIds.indexOf(id)
      if (currentIndex < 0) return state
      const nextOpenIds = state.openIds.filter((openId) => openId !== id)
      const boundedIndex = Math.max(0, Math.min(targetIndex, nextOpenIds.length))
      nextOpenIds.splice(boundedIndex, 0, id)
      return commit(
        openedSnapshot(state.pages, nextOpenIds, state.activeId, state.tabGroupOverrides),
      )
    }),
  setTabGroupOverride: (id, groupName) =>
    set((state) => {
      if (!state.pages.some((page) => page.id === id)) return state
      const nextGroupName = groupName?.trim() ?? ''
      const tabGroupOverrides = { ...state.tabGroupOverrides }
      if (nextGroupName) {
        tabGroupOverrides[id] = nextGroupName
      } else {
        delete tabGroupOverrides[id]
      }
      return commit(openedSnapshot(state.pages, state.openIds, state.activeId, tabGroupOverrides))
    }),
  renameTabGroupOverride: (groupName, nextGroupName) =>
    set((state) => {
      const currentName = groupName.trim()
      const normalizedNextName = nextGroupName.trim()
      if (!currentName || !normalizedNextName || currentName === normalizedNextName) return state
      const tabGroupOverrides = { ...state.tabGroupOverrides }
      let changed = false
      for (const page of state.pages) {
        const pageGroupName = tabGroupOverrides[page.id] ?? defaultTabGroupForPage(page)
        if (pageGroupName !== currentName) continue
        tabGroupOverrides[page.id] = normalizedNextName
        changed = true
      }
      if (!changed) return state
      return commit(openedSnapshot(state.pages, state.openIds, state.activeId, tabGroupOverrides))
    }),
  addFromTemplate: (templateId) => {
    const template = getEnabledAppTemplate(templateId)
    if (!template) return ''
    let openedId: string | null = null
    let pageToSave: AppPage | null = null
    set((state) => {
      const existing = state.pages.find(
        (page) => page.origin === 'template' && page.kind === template.id,
      )
      if (existing) {
        openedId = existing.id
        return commit(
          openedSnapshot(
            state.pages,
            [...state.openIds, existing.id],
            existing.id,
            state.tabGroupOverrides,
          ),
        )
      }
      const page = pageFromTemplate(template)
      openedId = page.id
      pageToSave = page
      return commit(
        openedSnapshot(
          [...state.pages, page],
          [...state.openIds, page.id],
          page.id,
          state.tabGroupOverrides,
        ),
      )
    })
    if (pageToSave) void savePageToDesktop(pageToSave, true)
    return openedId ?? ''
  },
  addGeneratedPage: (input) => {
    const now = Date.now()
    const page: AppPage = {
      id: createId(),
      title: input.title,
      kind: 'custom',
      frameworkVersion: SEPILOT_APPS_FRAMEWORK_VERSION,
      summary: input.summary ?? 'Code Agent generated microweb app',
      category: 'Custom',
      accent: '#0f766e',
      origin: 'code-agent',
      html: input.html,
      data: {},
      prompt: input.prompt,
      createdAt: now,
      updatedAt: now,
      version: 1,
      permissions: DEFAULT_APP_PERMISSIONS,
      dataPolicy: DEFAULT_APP_DATA_POLICY,
      capabilities: DEFAULT_APP_CAPABILITIES,
      hostRequests: [],
      validation: validateAppHtml(input.html),
      versions: [],
    }
    set((state) =>
      commit(
        openedSnapshot(
          [...state.pages, page],
          [...state.openIds, page.id],
          page.id,
          state.tabGroupOverrides,
        ),
      ),
    )
    void savePageToDesktop(page, true)
    return page.id
  },
  updatePage: (id, patch) =>
    set((state) => {
      const pages = state.pages.map((page) =>
        page.id === id
          ? {
              ...page,
              ...patch,
              validation: patch.html ? validateAppHtml(patch.html) : page.validation,
              updatedAt: Date.now(),
            }
          : page,
      )
      const updated = pages.find((page) => page.id === id)
      if (updated) void savePageToDesktop(updated, Boolean(patch.html))
      return commit(openedSnapshot(pages, state.openIds, state.activeId, state.tabGroupOverrides))
    }),
  updatePageData: (id, data) => {
    const pagesToSave: AppPage[] = []
    set((state) => {
      const pages = state.pages.map((page) =>
        page.id === id ? { ...page, data, updatedAt: Date.now() } : page,
      )
      const synced = syncSharedWorkspaceData(pages, id)
      for (const changedId of new Set([id, ...synced.changedPageIds])) {
        const page = synced.pages.find((candidate) => candidate.id === changedId)
        if (page) pagesToSave.push(page)
      }
      return commit(
        openedSnapshot(synced.pages, state.openIds, state.activeId, state.tabGroupOverrides),
      )
    })
    for (const page of pagesToSave) void savePageDataToDesktop(page.id, page.data)
  },
  syncSharedWorkspace: (id) => {
    const pagesToSave: AppPage[] = []
    let changedPageIds: string[] = []
    set((state) => {
      const synced = syncSharedWorkspaceData(state.pages, id)
      changedPageIds = synced.changedPageIds
      for (const changedId of changedPageIds) {
        const page = synced.pages.find((candidate) => candidate.id === changedId)
        if (page) pagesToSave.push(page)
      }
      return commit(
        openedSnapshot(synced.pages, state.openIds, state.activeId, state.tabGroupOverrides),
      )
    })
    for (const page of pagesToSave) void savePageDataToDesktop(page.id, page.data)
    return changedPageIds
  },
  duplicatePage: (id) => {
    let pageToSave: AppPage | null = null
    let duplicatedId: string | null = null
    set((state) => {
      const source = state.pages.find((page) => page.id === id)
      if (!source) return state
      const now = Date.now()
      const page: AppPage = {
        ...source,
        id: createId(),
        title: `${source.title} Copy`,
        data: cloneData(source.data),
        version: 1,
        versions: [],
        storagePath: undefined,
        createdAt: now,
        updatedAt: now,
      }
      pageToSave = page
      duplicatedId = page.id
      return commit(
        openedSnapshot(
          [...state.pages, page],
          [...state.openIds, page.id],
          page.id,
          state.tabGroupOverrides,
        ),
      )
    })
    if (!pageToSave || !duplicatedId) return null
    void savePageToDesktop(pageToSave, true)
    return duplicatedId
  },
  restorePageVersion: restoreVersionFromDesktop,
  exportPage: exportPageFromDesktop,
  importPage: importPageFromDesktop,
  exportBackup: exportBackupFromDesktop,
  restoreBackup: restoreBackupFromDesktop,
  closePage: (id) =>
    set((state) =>
      commit(
        openedSnapshot(
          state.pages,
          state.openIds.filter((openId) => openId !== id),
          state.activeId === id ? null : state.activeId,
          state.tabGroupOverrides,
        ),
      ),
    ),
  deletePage: (id) =>
    set((state) => {
      const pages = state.pages.filter((page) => page.id !== id)
      const openIds = state.openIds.filter((openId) => openId !== id)
      void deletePageFromDesktop(id)
      return commit(
        openedSnapshot(
          pages,
          openIds,
          state.activeId === id ? null : state.activeId,
          state.tabGroupOverrides,
        ),
      )
    }),
  resetToTemplates: () =>
    set(() => {
      const snapshot = defaultSnapshot()
      void resetPagesOnDesktop(snapshot.pages)
      return commit(snapshot)
    }),
}))

export function resetAppsStoreForTests(): void {
  const snapshot = defaultSnapshot()
  persistSnapshot(snapshot)
  useAppsStore.setState({
    ...snapshot,
    storageHydrated: false,
    storagePath: null,
    storageError: null,
  })
}
