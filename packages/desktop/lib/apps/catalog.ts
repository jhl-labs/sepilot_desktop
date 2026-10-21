import { desktopAppCatalogProfile, type DesktopAppCatalogProfile } from '@/lib/feature-profile'
import { APP_TEMPLATES } from './templates'
import type { AppPage, AppPageKind, AppTemplate } from './types'

export interface ResolvedAppTemplateCatalog {
  readonly templates: readonly AppTemplate[]
  readonly enabledTemplateIds: ReadonlySet<AppPageKind>
  readonly defaultOpenTemplateIds: ReadonlySet<AppPageKind>
}

export function resolveAppTemplateCatalog(
  profile: DesktopAppCatalogProfile,
  templates: readonly AppTemplate[] = APP_TEMPLATES,
): ResolvedAppTemplateCatalog {
  const templatesById = new Map(templates.map((template) => [template.id, template]))
  const requestedEnabledIds = profile.enabledTemplateIds ?? templates.map((template) => template.id)
  const requestedDefaultOpenIds = profile.defaultOpenTemplateIds ?? requestedEnabledIds
  const unknownIds = [...requestedEnabledIds, ...requestedDefaultOpenIds].filter(
    (id) => !templatesById.has(id as AppPageKind),
  )
  if (unknownIds.length > 0) {
    throw new Error(
      `Desktop app catalog references unknown built-in template(s): ${[...new Set(unknownIds)].join(', ')}`,
    )
  }

  const enabledTemplateIds = new Set(requestedEnabledIds as AppPageKind[])
  const unavailableDefaultIds = requestedDefaultOpenIds.filter(
    (id) => !enabledTemplateIds.has(id as AppPageKind),
  )
  if (unavailableDefaultIds.length > 0) {
    throw new Error(
      `Desktop default-open apps must be enabled first: ${unavailableDefaultIds.join(', ')}`,
    )
  }

  const defaultOpenTemplateIds = new Set(requestedDefaultOpenIds as AppPageKind[])
  return Object.freeze({
    templates: Object.freeze(
      requestedEnabledIds.map((id) => templatesById.get(id as AppPageKind)!),
    ),
    enabledTemplateIds,
    defaultOpenTemplateIds,
  })
}

export const enabledAppTemplateCatalog = resolveAppTemplateCatalog(desktopAppCatalogProfile)
export const ENABLED_APP_TEMPLATES = enabledAppTemplateCatalog.templates

export function isAppTemplateEnabled(kind: AppPageKind): boolean {
  return kind !== 'custom' && enabledAppTemplateCatalog.enabledTemplateIds.has(kind)
}

export function isAppPageEnabled(page: Pick<AppPage, 'kind'>): boolean {
  return page.kind === 'custom' || isAppTemplateEnabled(page.kind)
}

export function getEnabledAppTemplate(kind: AppPageKind): AppTemplate | undefined {
  return ENABLED_APP_TEMPLATES.find((template) => template.id === kind)
}
