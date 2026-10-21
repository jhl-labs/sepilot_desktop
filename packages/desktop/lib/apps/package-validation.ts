import type {
  DesktopAppPermissions,
  DesktopAppValidationIssue,
  DesktopAppValidationResult,
  DesktopAppVersionInfo,
  SepilotAppCapabilities,
  SepilotAppHostRequestPermission,
} from '@sepilotd/api-client'
import {
  SEPILOT_APP_DATA_FILE,
  SEPILOT_APP_ENTRY_FILE,
  SEPILOT_APPS_FRAMEWORK_VERSION,
  SEPILOT_APPS_SCHEMA_VERSION,
} from '@sepilotd/api-client'
import { APP_IFRAME_SANDBOX, validateAppHtml } from './runtime'

export const DESKTOP_APP_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/u
export const DESKTOP_APP_VERSION_FILE_PATTERN = /^versions\/v\d{6}\.html$/u
export const DESKTOP_APP_HOST_REQUEST_OP_PATTERN =
  /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,5}$/u

const PERMISSION_KEYS: Array<keyof DesktopAppPermissions> = [
  'storage',
  'network',
  'clipboard',
  'fileSystem',
  'shell',
]

const CAPABILITY_KEYS: Array<keyof SepilotAppCapabilities> = [
  'fields',
  'collections',
  'timeSeries',
  'semanticSearch',
  'scheduler',
  'notifications',
  'backup',
  'encryption',
  'interAppRead',
  'agentTools',
  'workflow',
  'customComponents',
]

export interface DesktopAppManifestValidationOptions {
  expectedId?: string
}

export interface DesktopAppPackageValidationInput {
  manifest: unknown
  html?: unknown
  data?: unknown
  expectedId?: string
  versionFileHashes?: Record<string, string | null | undefined>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function addIssue(
  issues: DesktopAppValidationIssue[],
  severity: DesktopAppValidationIssue['severity'],
  code: string,
  message: string,
): void {
  issues.push({ severity, code, message })
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function isSafeDesktopAppId(value: unknown): value is string {
  return typeof value === 'string' && DESKTOP_APP_ID_PATTERN.test(value)
}

export function isSafeDesktopAppVersionFile(value: unknown): value is string {
  return typeof value === 'string' && DESKTOP_APP_VERSION_FILE_PATTERN.test(value)
}

function isValidSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value)
}

export function isValidDesktopAppVersionInfo(value: unknown): value is DesktopAppVersionInfo {
  if (!isRecord(value)) return false
  return (
    Number.isInteger(value.version) &&
    typeof value.version === 'number' &&
    value.version >= 1 &&
    isFiniteTimestamp(value.createdAt) &&
    isSafeDesktopAppVersionFile(value.file) &&
    isValidSha256(value.sha256) &&
    (value.prompt == null || typeof value.prompt === 'string')
  )
}

function validatePermissions(
  value: unknown,
  issues: DesktopAppValidationIssue[],
): value is DesktopAppPermissions {
  if (!isRecord(value)) {
    addIssue(issues, 'error', 'manifest_permissions_invalid', 'permissions must be an object.')
    return false
  }

  let ok = true
  for (const key of PERMISSION_KEYS) {
    if (typeof value[key] !== 'boolean') {
      addIssue(
        issues,
        'error',
        'manifest_permission_invalid',
        `permissions.${key} must be boolean.`,
      )
      ok = false
    }
  }
  if (value.storage !== true) {
    addIssue(
      issues,
      'error',
      'manifest_storage_permission_required',
      'Apps must keep storage permission enabled.',
    )
    ok = false
  }
  for (const key of ['network', 'clipboard', 'fileSystem', 'shell'] as const) {
    if (value[key] !== false) {
      addIssue(
        issues,
        'error',
        'manifest_privileged_permission_denied',
        `Apps cannot request ${key} permission in the sandbox.`,
      )
      ok = false
    }
  }
  return ok
}

function validateValidationResult(
  value: unknown,
  issues: DesktopAppValidationIssue[],
): value is DesktopAppValidationResult {
  if (!isRecord(value) || typeof value.ok !== 'boolean' || !Array.isArray(value.issues)) {
    addIssue(issues, 'error', 'manifest_validation_invalid', 'validation must include ok/issues.')
    return false
  }
  let ok = true
  for (const issue of value.issues) {
    if (
      !isRecord(issue) ||
      (issue.severity !== 'error' && issue.severity !== 'warning') ||
      typeof issue.code !== 'string' ||
      typeof issue.message !== 'string'
    ) {
      addIssue(
        issues,
        'error',
        'manifest_validation_issue_invalid',
        'validation.issues contains an invalid issue.',
      )
      ok = false
    }
  }
  return ok
}

function validateCapabilities(value: unknown, issues: DesktopAppValidationIssue[]): void {
  if (value == null) return
  if (!isRecord(value)) {
    addIssue(issues, 'error', 'manifest_capabilities_invalid', 'capabilities must be an object.')
    return
  }
  const known = new Set<string>(CAPABILITY_KEYS)
  for (const [key, candidate] of Object.entries(value)) {
    if (!known.has(key)) {
      addIssue(
        issues,
        'warning',
        'manifest_capability_unknown',
        `Unknown capability "${key}" will be ignored by this runtime.`,
      )
      continue
    }
    if (typeof candidate !== 'boolean') {
      addIssue(
        issues,
        'error',
        'manifest_capability_invalid',
        `capabilities.${key} must be boolean.`,
      )
    }
  }
}

function validateDataPolicy(value: unknown, issues: DesktopAppValidationIssue[]): void {
  if (value == null) return
  if (!isRecord(value)) {
    addIssue(issues, 'error', 'manifest_data_policy_invalid', 'dataPolicy must be an object.')
    return
  }
  for (const key of ['aiReadable', 'aiWritable', 'interAppReadable', 'encrypted'] as const) {
    if (value[key] != null && typeof value[key] !== 'boolean') {
      addIssue(
        issues,
        'error',
        'manifest_data_policy_invalid',
        `dataPolicy.${key} must be boolean.`,
      )
    }
  }
  if (value.backup != null && value.backup !== 'included' && value.backup !== 'excluded') {
    addIssue(
      issues,
      'error',
      'manifest_data_policy_invalid',
      'dataPolicy.backup must be included or excluded.',
    )
  }
  if (value.retentionDays != null && !Number.isInteger(value.retentionDays)) {
    addIssue(
      issues,
      'error',
      'manifest_data_policy_invalid',
      'dataPolicy.retentionDays must be an integer.',
    )
  }
  for (const key of ['sensitivePaths', 'redactedKeys'] as const) {
    if (
      value[key] != null &&
      (!Array.isArray(value[key]) || !value[key].every((item) => typeof item === 'string'))
    ) {
      addIssue(
        issues,
        'error',
        'manifest_data_policy_invalid',
        `dataPolicy.${key} must be a string array.`,
      )
    }
  }
}

function validateDataSchema(value: unknown, issues: DesktopAppValidationIssue[]): void {
  if (value == null) return
  if (!isRecord(value)) {
    addIssue(issues, 'error', 'manifest_data_schema_invalid', 'dataSchema must be an object.')
    return
  }
  for (const key of ['fields', 'collections', 'timeSeries'] as const) {
    if (value[key] != null && !isRecord(value[key])) {
      addIssue(
        issues,
        'error',
        'manifest_data_schema_invalid',
        `dataSchema.${key} must be an object.`,
      )
    }
  }
}

function isValidHostRequestOp(value: unknown): value is string {
  return typeof value === 'string' && DESKTOP_APP_HOST_REQUEST_OP_PATTERN.test(value)
}

function validateHostRequests(
  value: unknown,
  issues: DesktopAppValidationIssue[],
): value is SepilotAppHostRequestPermission[] | undefined {
  if (value == null) return true
  if (!Array.isArray(value)) {
    addIssue(issues, 'error', 'manifest_host_requests_invalid', 'hostRequests must be an array.')
    return false
  }
  const seen = new Set<string>()
  let ok = true
  for (const entry of value) {
    if (!isRecord(entry) || !isValidHostRequestOp(entry.op)) {
      addIssue(
        issues,
        'error',
        'manifest_host_request_invalid',
        'hostRequests entries must include a dotted op such as calendar.google.sync.',
      )
      ok = false
      continue
    }
    if (seen.has(entry.op)) {
      addIssue(
        issues,
        'error',
        'manifest_host_request_duplicate',
        `Duplicate host request op: ${entry.op}.`,
      )
      ok = false
    }
    seen.add(entry.op)
    if (entry.reason != null && (typeof entry.reason !== 'string' || entry.reason.length > 240)) {
      addIssue(
        issues,
        'error',
        'manifest_host_request_reason_invalid',
        `hostRequests.${entry.op}.reason must be a string up to 240 characters.`,
      )
      ok = false
    }
  }
  return ok
}

function validateVersions(value: unknown, issues: DesktopAppValidationIssue[]): void {
  if (!Array.isArray(value)) {
    addIssue(issues, 'error', 'manifest_versions_invalid', 'versions must be an array.')
    return
  }
  const seenVersions = new Set<number>()
  const seenFiles = new Set<string>()
  for (const entry of value) {
    if (!isValidDesktopAppVersionInfo(entry)) {
      addIssue(issues, 'error', 'manifest_version_invalid', 'versions contains an invalid entry.')
      continue
    }
    if (seenVersions.has(entry.version)) {
      addIssue(
        issues,
        'error',
        'manifest_version_duplicate',
        `Duplicate app version ${entry.version}.`,
      )
    }
    if (seenFiles.has(entry.file)) {
      addIssue(
        issues,
        'error',
        'manifest_version_file_duplicate',
        `Duplicate app version file ${entry.file}.`,
      )
    }
    const expectedFile = `versions/v${String(entry.version).padStart(6, '0')}.html`
    if (entry.file !== expectedFile) {
      addIssue(
        issues,
        'error',
        'manifest_version_file_mismatch',
        `Version ${entry.version} must use ${expectedFile}.`,
      )
    }
    seenVersions.add(entry.version)
    seenFiles.add(entry.file)
  }
}

export function validateDesktopAppManifest(
  value: unknown,
  options: DesktopAppManifestValidationOptions = {},
): DesktopAppValidationResult {
  const issues: DesktopAppValidationIssue[] = []
  if (!isRecord(value)) {
    addIssue(issues, 'error', 'manifest_invalid', 'manifest.json must be an object.')
    return { ok: false, issues }
  }

  if (value.schemaVersion !== SEPILOT_APPS_SCHEMA_VERSION) {
    addIssue(
      issues,
      'error',
      'manifest_schema_version_invalid',
      `schemaVersion must be ${SEPILOT_APPS_SCHEMA_VERSION}.`,
    )
  }
  if (value.frameworkVersion != null && value.frameworkVersion !== SEPILOT_APPS_FRAMEWORK_VERSION) {
    addIssue(
      issues,
      'error',
      'manifest_framework_version_invalid',
      `frameworkVersion must be ${SEPILOT_APPS_FRAMEWORK_VERSION}.`,
    )
  }
  if (!isSafeDesktopAppId(value.id)) {
    addIssue(issues, 'error', 'manifest_id_invalid', 'id must be a safe app directory name.')
  } else if (options.expectedId && value.id !== options.expectedId) {
    addIssue(
      issues,
      'error',
      'manifest_id_mismatch',
      `manifest id must match app directory "${options.expectedId}".`,
    )
  }
  if (!isNonEmptyString(value.title, 120)) {
    addIssue(issues, 'error', 'manifest_title_invalid', 'title is required.')
  }
  if (!isNonEmptyString(value.kind, 80)) {
    addIssue(issues, 'error', 'manifest_kind_invalid', 'kind is required.')
  }
  if (value.summary != null && typeof value.summary !== 'string') {
    addIssue(issues, 'error', 'manifest_summary_invalid', 'summary must be a string.')
  }
  if (value.category != null && typeof value.category !== 'string') {
    addIssue(issues, 'error', 'manifest_category_invalid', 'category must be a string.')
  }
  if (value.accent != null && typeof value.accent !== 'string') {
    addIssue(issues, 'error', 'manifest_accent_invalid', 'accent must be a string.')
  }
  if (value.origin != null && value.origin !== 'template' && value.origin !== 'code-agent') {
    addIssue(issues, 'error', 'manifest_origin_invalid', 'origin must be template or code-agent.')
  }
  if (value.entry !== SEPILOT_APP_ENTRY_FILE) {
    addIssue(issues, 'error', 'manifest_entry_invalid', `entry must be ${SEPILOT_APP_ENTRY_FILE}.`)
  }
  if (value.dataFile !== SEPILOT_APP_DATA_FILE) {
    addIssue(
      issues,
      'error',
      'manifest_data_file_invalid',
      `dataFile must be ${SEPILOT_APP_DATA_FILE}.`,
    )
  }
  if (!isFiniteTimestamp(value.createdAt) || !isFiniteTimestamp(value.updatedAt)) {
    addIssue(
      issues,
      'error',
      'manifest_timestamps_invalid',
      'createdAt and updatedAt must be finite timestamps.',
    )
  } else if (value.updatedAt < value.createdAt) {
    addIssue(
      issues,
      'warning',
      'manifest_updated_before_created',
      'updatedAt is earlier than createdAt.',
    )
  }
  if (!Number.isInteger(value.version) || typeof value.version !== 'number' || value.version < 1) {
    addIssue(issues, 'error', 'manifest_version_invalid', 'version must be a positive integer.')
  }
  validatePermissions(value.permissions, issues)
  validateCapabilities(value.capabilities, issues)
  validateHostRequests(value.hostRequests, issues)
  validateDataPolicy(value.dataPolicy, issues)
  validateDataSchema(value.dataSchema, issues)
  if (value.sandbox !== APP_IFRAME_SANDBOX) {
    addIssue(
      issues,
      'error',
      'manifest_sandbox_invalid',
      `sandbox must be "${APP_IFRAME_SANDBOX}".`,
    )
  }
  validateVersions(value.versions, issues)
  validateValidationResult(value.validation, issues)

  return { ok: issues.every((issue) => issue.severity !== 'error'), issues }
}

export function validateDesktopAppPackage(
  input: DesktopAppPackageValidationInput,
): DesktopAppValidationResult {
  const issues = validateDesktopAppManifest(input.manifest, {
    expectedId: input.expectedId,
  }).issues
  if (typeof input.html !== 'string') {
    addIssue(issues, 'error', 'package_entry_missing', `${SEPILOT_APP_ENTRY_FILE} is missing.`)
  } else {
    const htmlValidation = validateAppHtml(input.html)
    for (const issue of htmlValidation.issues) {
      addIssue(issues, issue.severity, `html_${issue.code}`, issue.message)
    }
  }
  if (!isRecord(input.data)) {
    addIssue(issues, 'error', 'package_data_invalid', `${SEPILOT_APP_DATA_FILE} must be an object.`)
  }
  if (isRecord(input.manifest) && Array.isArray(input.manifest.versions)) {
    for (const entry of input.manifest.versions) {
      if (!isValidDesktopAppVersionInfo(entry)) continue
      if (!input.versionFileHashes) continue
      const actualHash = input.versionFileHashes[entry.file]
      if (!actualHash) {
        addIssue(
          issues,
          'error',
          'package_version_file_missing',
          `Version file ${entry.file} is missing.`,
        )
      } else if (actualHash !== entry.sha256) {
        addIssue(
          issues,
          'error',
          'package_version_hash_mismatch',
          `Version file ${entry.file} does not match its manifest sha256.`,
        )
      }
    }
  }
  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
  }
}
