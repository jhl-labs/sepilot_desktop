import {
  SEPILOT_APPS_FRAMEWORK_VERSION,
  applySepilotAppMutations,
  sanitizeAppDataForAgent,
} from '@sepilotd/api-client'
import type {
  SepilotAppCapabilities,
  SepilotAppMutation,
  SepilotAppMutationApplyResult,
  SepilotAppMutationIssue,
  SepilotReadableAppSearchResult,
} from '@sepilotd/api-client'
import { SEPILOT_APPS_SDK_PROMPT_REFERENCE, SEPILOT_APPS_SDK_VERSION } from './sdk'
import { getAppTemplate } from './templates'
import type { AppPage, AppTemplate } from './types'

export interface AppValidationIssue {
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface AppValidationResult {
  ok: boolean
  issues: AppValidationIssue[]
}

export interface AppDataPreservationReport {
  ok: boolean
  previousFields: string[]
  nextFields: string[]
  persistedFields: string[]
  preservedFields: string[]
  missingPreviousFields: string[]
  missingPersistedFields: string[]
  addedFields: string[]
  issues: AppValidationIssue[]
}

export interface AppRuntimeError {
  kind: 'error' | 'unhandledrejection'
  message: string
  source?: string
  lineno?: number
  colno?: number
  stack?: string
  createdAt: number
}

export interface AppChatHistoryEntry {
  role: 'user' | 'assistant'
  content: string
}

interface AppChatRelatedAppContext {
  id: string
  title: string
  kind: string
  summary?: string
  category?: string
  score: number
  matches: Array<{ path: string; label?: string; text: string; score: number }>
  dataExcerpt: string
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

export type AppChatMutation = SepilotAppMutation

export type AppChatAction =
  | {
      op: 'scheduler.upsert'
      id?: string
      name?: string
      when?: string
      cron?: string
      timezone?: string
      instruction: string
      enabled?: boolean
      maxAttempts?: number
      retryBackoffMs?: number
    }
  | {
      op: 'scheduler.remove'
      id: string
    }
  | {
      op: 'notification.publish'
      id?: string
      title: string
      body?: string
      url?: string | null
    }
  | {
      op: 'notification.schedule'
      id?: string
      title: string
      body?: string
      url?: string | null
      when?: string
      runAt?: number
      timezone?: string
      source?: Record<string, unknown>
    }

export interface AppChatAgentResponse {
  reply: string
  mutations?: AppChatMutation[]
  actions?: AppChatAction[]
  dataPatch?: Record<string, unknown>
  dataReplace?: Record<string, unknown>
}

export type AppChatMutationIssue = SepilotAppMutationIssue
export type AppChatMutationApplyResult = SepilotAppMutationApplyResult
export const applyAppChatMutations = applySepilotAppMutations

export interface AppPermissions {
  storage: boolean
  network: boolean
  clipboard: boolean
  fileSystem: boolean
  shell: boolean
}

export const APP_IFRAME_SANDBOX = 'allow-scripts allow-forms'
export const DEFAULT_APP_PERMISSIONS: AppPermissions = {
  storage: true,
  network: false,
  clipboard: false,
  fileSystem: false,
  shell: false,
}

const MAX_APP_HTML_BYTES = 1_500_000
const APP_FIELD_SELECTOR =
  '[data-app-field], [data-office-field], input[name], textarea[name], select[name], [contenteditable][id]'

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/<\/script/gi, '<\\/script')
}

function stringifyPromptExcerpt(value: unknown, maxLength: number): string {
  try {
    const text = JSON.stringify(value, null, 2)
    return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
  } catch {
    return String(value).slice(0, maxLength)
  }
}

function compactRelatedAppContext(
  currentAppId: string,
  relatedApps: SepilotReadableAppSearchResult[] | undefined,
): AppChatRelatedAppContext[] {
  return (relatedApps ?? [])
    .filter((app) => app.id !== currentAppId)
    .slice(0, 4)
    .map((app) => ({
      id: app.id,
      title: app.title,
      kind: app.kind,
      summary: app.summary,
      category: app.category,
      score: Number(app.score.toFixed(3)),
      matches: app.matches.slice(0, 3).map((match) => ({
        path: match.path,
        label: match.label,
        text: match.text.slice(0, 400),
        score: Number(match.score.toFixed(3)),
      })),
      dataExcerpt: stringifyPromptExcerpt(app.data, 2800),
    }))
}

function byteLength(value: string): number {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).byteLength
  }
  return value.length
}

function addIssue(
  issues: AppValidationIssue[],
  severity: AppValidationIssue['severity'],
  code: string,
  message: string,
): void {
  issues.push({ severity, code, message })
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  )
}

interface FieldElementLike {
  tagName?: string
  id?: string
  getAttribute: (name: string) => string | null
}

function fieldNameForElement(element: FieldElementLike): string | null {
  return (
    element.getAttribute('data-app-field') ||
    element.getAttribute('data-office-field') ||
    element.getAttribute('name') ||
    element.id ||
    null
  )
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrPattern = /([a-zA-Z_:][\w:.-]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/gu
  let match: RegExpExecArray | null
  while ((match = attrPattern.exec(source))) {
    const key = match[1]?.toLowerCase()
    if (!key) continue
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? ''
  }
  return attrs
}

function extractFieldNamesWithRegex(html: string): string[] {
  const names: string[] = []
  const tagPattern = /<([a-zA-Z][\w:-]*)\b([^>]*)>/gu
  let match: RegExpExecArray | null
  while ((match = tagPattern.exec(html))) {
    const tagName = match[1]?.toLowerCase()
    const attrs = parseAttributes(match[2] ?? '')
    const isFormField = tagName === 'input' || tagName === 'textarea' || tagName === 'select'
    const isContentEditable = 'contenteditable' in attrs
    const name =
      attrs['data-app-field'] ||
      attrs['data-office-field'] ||
      (isFormField ? attrs.name : undefined) ||
      (isContentEditable ? attrs.id : undefined)
    if (name) names.push(name)
  }
  return uniqueSorted(names)
}

export function extractAppFieldNames(html: string): string[] {
  if (!html.trim()) return []
  const Parser = (
    globalThis as {
      DOMParser?: new () => {
        parseFromString: (
          source: string,
          mimeType: string,
        ) => {
          querySelectorAll: (selector: string) => ArrayLike<FieldElementLike>
        }
      }
    }
  ).DOMParser
  if (!Parser) return extractFieldNamesWithRegex(html)
  try {
    const doc = new Parser().parseFromString(html, 'text/html')
    const elements = Array.from(doc.querySelectorAll(APP_FIELD_SELECTOR))
    return uniqueSorted(
      elements
        .map((element) => fieldNameForElement(element))
        .filter((name): name is string => Boolean(name)),
    )
  } catch {
    return extractFieldNamesWithRegex(html)
  }
}

function extractPersistedFieldNames(data: Record<string, unknown> | undefined): string[] {
  const fields = data?.fields
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) return []
  return uniqueSorted(Object.keys(fields as Record<string, unknown>))
}

export function analyzeAppDataPreservation(input: {
  previousHtml?: string
  nextHtml: string
  data?: Record<string, unknown>
}): AppDataPreservationReport {
  const previousFields = extractAppFieldNames(input.previousHtml ?? '')
  const nextFields = extractAppFieldNames(input.nextHtml)
  const persistedFields = extractPersistedFieldNames(input.data)
  const next = new Set(nextFields)
  const previous = new Set(previousFields)
  const missingPreviousFields = previousFields.filter((field) => !next.has(field))
  const missingPersistedFields = persistedFields.filter((field) => !next.has(field))
  const preservedFields = persistedFields.filter((field) => next.has(field))
  const addedFields = nextFields.filter((field) => !previous.has(field))
  const issues: AppValidationIssue[] = []

  if (missingPersistedFields.length > 0) {
    addIssue(
      issues,
      'warning',
      'persisted_fields_unmatched',
      `Saved data fields are not present in the new app HTML: ${missingPersistedFields
        .slice(0, 8)
        .join(', ')}${missingPersistedFields.length > 8 ? '...' : ''}.`,
    )
  } else if (missingPreviousFields.length > 0) {
    addIssue(
      issues,
      'warning',
      'app_fields_removed',
      `Existing input fields were removed or renamed: ${missingPreviousFields
        .slice(0, 8)
        .join(', ')}${missingPreviousFields.length > 8 ? '...' : ''}.`,
    )
  }

  return {
    ok: issues.length === 0,
    previousFields,
    nextFields,
    persistedFields,
    preservedFields,
    missingPreviousFields,
    missingPersistedFields,
    addedFields,
    issues,
  }
}

export function normalizeAppRuntimeError(value: unknown): AppRuntimeError | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const kind =
    record.kind === 'unhandledrejection' || record.kind === 'error' ? record.kind : 'error'
  const message =
    typeof record.message === 'string' && record.message.trim()
      ? record.message.trim().slice(0, 500)
      : 'Unknown app runtime error'
  return {
    kind,
    message,
    source: typeof record.source === 'string' ? record.source.slice(0, 300) : undefined,
    lineno: typeof record.lineno === 'number' ? record.lineno : undefined,
    colno: typeof record.colno === 'number' ? record.colno : undefined,
    stack: typeof record.stack === 'string' ? record.stack.slice(0, 1_500) : undefined,
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
  }
}

const ALLOWED_LOCAL_RUNTIME_SCRIPT_SRCS = new Set([
  '/vendor/mermaid.min.js',
  '/vendor/plotly.min.js',
])

function isAllowedLocalRuntimeScriptSrc(value: string): boolean {
  return ALLOWED_LOCAL_RUNTIME_SCRIPT_SRCS.has(value.trim())
}

function stripAllowedRuntimeScriptsForValidation(html: string): string {
  return html.replace(/<script\b([^>]*)>\s*<\/script>/giu, (tag, attrsSource: string) => {
    const attrs = parseAttributes(attrsSource)
    const src = attrs.src
    if (!src || !isAllowedLocalRuntimeScriptSrc(src)) return tag
    return '<script data-sepilot-allowed-runtime-script></script>'
  })
}

export function validateAppHtml(html: string): AppValidationResult {
  const issues: AppValidationIssue[] = []
  const trimmed = stripAllowedRuntimeScriptsForValidation(html).trim()

  if (!trimmed) {
    addIssue(issues, 'error', 'empty_html', 'App HTML is empty.')
  }
  if (byteLength(trimmed) > MAX_APP_HTML_BYTES) {
    addIssue(
      issues,
      'error',
      'html_too_large',
      `App HTML must be ${MAX_APP_HTML_BYTES} bytes or smaller.`,
    )
  }
  if (!/<html[\s>]/i.test(trimmed)) {
    addIssue(issues, 'error', 'missing_html_document', 'App must be a complete HTML document.')
  }
  if (!/<title>[^<]+<\/title>/i.test(trimmed)) {
    addIssue(issues, 'warning', 'missing_title', 'App should include a concise <title>.')
  }

  const blockedPatterns: Array<[RegExp, string, string]> = [
    [/<script\b[^>]*\bsrc\s*=/i, 'external_script', 'External scripts are not allowed.'],
    [/<script\b[^>]*\btype\s*=\s*["']?module/i, 'module_script', 'Module scripts are not allowed.'],
    [/<link\b[^>]*\bhref\s*=/i, 'external_link', 'External link resources are not allowed.'],
    [/<iframe\b/i, 'nested_frame', 'Nested iframes are not allowed.'],
    [/<object\b|<embed\b/i, 'plugin_embed', 'Object/embed content is not allowed.'],
    [/<base\b/i, 'base_tag', 'Base tags are not allowed.'],
    [/<meta\b[^>]*http-equiv\s*=\s*["']?refresh/i, 'meta_refresh', 'Meta refresh is not allowed.'],
    [/<form\b[^>]*\baction\s*=/i, 'form_action', 'Forms cannot submit outside the app sandbox.'],
    [
      /\b(?:src|href|action)\s*=\s*["']\s*(?:https?:|\/\/)/i,
      'remote_url',
      'Remote URLs are not allowed in app markup.',
    ],
    [
      /\b(?:src|href|action)\s*=\s*["']\s*javascript:/i,
      'javascript_url',
      'javascript: URLs are not allowed.',
    ],
    [/\bfetch\s*\(/i, 'network_fetch', 'Network fetch is blocked for Apps.'],
    [/\bXMLHttpRequest\b/i, 'network_xhr', 'XMLHttpRequest is blocked for Apps.'],
    [/\bWebSocket\s*\(/i, 'network_websocket', 'WebSocket is blocked for Apps.'],
    [/\bEventSource\s*\(/i, 'network_eventsource', 'EventSource is blocked for Apps.'],
    [/\bnavigator\.sendBeacon\s*\(/i, 'network_beacon', 'sendBeacon is blocked for Apps.'],
    [/\b(?:Worker|SharedWorker)\s*\(/i, 'worker', 'Workers are not allowed.'],
    [/\bimportScripts\s*\(/i, 'import_scripts', 'importScripts is not allowed.'],
    [
      /\b(?:localStorage|sessionStorage|indexedDB)\b/i,
      'browser_storage',
      'Use window.sepilotApps storage instead of browser storage.',
    ],
    [/\bdocument\.cookie\b/i, 'cookie_access', 'Cookie access is not allowed.'],
    [
      /\bnavigator\.clipboard\b/i,
      'clipboard_access',
      'Clipboard access must go through the Apps permission broker.',
    ],
    [/\bdocument\.execCommand\s*\(/i, 'exec_command', 'document.execCommand is not allowed.'],
    [
      /\bshow(?:OpenFile|SaveFile|Directory)Picker\s*\(/i,
      'file_picker',
      'File picker access is not allowed.',
    ],
    [
      /<input\b[^>]*\btype\s*=\s*["']?file/i,
      'file_input',
      'File inputs are not allowed in sandboxed Apps.',
    ],
    [/\beval\s*\(/i, 'eval', 'eval is not allowed.'],
    [/\bnew\s+Function\s*\(/i, 'function_constructor', 'Function constructors are not allowed.'],
    [/\bwindow\.open\s*\(/i, 'window_open', 'Opening new windows is not allowed.'],
    [/\b(?:top|opener)\s*\./i, 'top_or_opener_access', 'Top/opener window access is not allowed.'],
    [/\bparent\s*\./i, 'parent_access', 'Parent window access is reserved for the Apps bridge.'],
  ]

  for (const [pattern, code, message] of blockedPatterns) {
    if (pattern.test(trimmed)) addIssue(issues, 'error', code, message)
  }

  return {
    ok: issues.every((issue) => issue.severity !== 'error'),
    issues,
  }
}

const bridgeSource = `
(function () {
  const seed = __SEED__;
  const pageId = seed.pageId;
  const manifest = Object.freeze(seed.manifest || {});
  const permissions = Object.freeze(seed.permissions || {});
  const capabilities = Object.freeze(asRecord(manifest.capabilities));
  const dataPolicy = Object.freeze(asRecord(manifest.dataPolicy));
  const hostRequests = Object.freeze(Array.isArray(manifest.hostRequests) ? manifest.hostRequests.slice() : []);
  const pending = new Map();
  let requestSeq = 0;
  let state = clone(seed.data || {});
  let sendQueued = false;
  let sendDirty = false;

  function clone(value) {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  }
  function asRecord(value) {
    return isRecord(value) ? value : {};
  }
  function isRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value);
  }
  function createSdkError(code, message, details) {
    const error = new Error(message);
    error.name = 'SepilotAppSdkError';
    error.code = String(code || 'sdk_error');
    const extra = asRecord(details);
    for (const key of Object.keys(extra)) {
      if (extra[key] !== undefined) error[key] = extra[key];
    }
    return error;
  }
  function isSdkError(error) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        error.name === 'SepilotAppSdkError' &&
        typeof error.code === 'string'
    );
  }
  function capabilityEnabled(capability) {
    return capabilities[String(capability)] !== false;
  }
  function permissionEnabled(permission) {
    return permissions[String(permission)] !== false;
  }
  function requireCapability(capability, operation) {
    if (capabilityEnabled(capability)) return;
    throw createSdkError(
      'capability_disabled',
      'Apps SDK capability "' + capability + '" is disabled for ' + operation + '.',
      { capability, operation }
    );
  }
  function requirePermission(permission, operation) {
    if (permissionEnabled(permission)) return;
    throw createSdkError(
      'permission_denied',
      'Apps SDK permission "' + permission + '" is denied for ' + operation + '.',
      { permission, operation }
    );
  }
  function requireStorage(operation) {
    requirePermission('storage', operation);
  }
  function hostRequestAllowed(op) {
    return hostRequests.some((entry) => asRecord(entry).op === op);
  }
  function requireHostRequest(op) {
    if (hostRequestAllowed(op)) return;
    throw createSdkError(
      'capability_disabled',
      'Apps SDK host request "' + op + '" is not allowed for this app.',
      { capability: 'hostRequest', operation: op }
    );
  }
  function requireBrokerCapability(op) {
    if (op === 'apps.list' || op === 'apps.read' || op === 'apps.search' || op === 'apps.syncSharedWorkspace') return requireCapability('interAppRead', op);
    if (op.indexOf('scheduler.') === 0) return requireCapability('scheduler', op);
    if (op.indexOf('notifications.') === 0) return requireCapability('notifications', op);
    if (op === 'clipboard.write' || op === 'clipboard.writeText' || op === 'clipboard.readText') return;
    if (op.indexOf('agent.') === 0) return requireCapability('agentTools', op);
    if (op.indexOf('workflow.') === 0) return requireCapability('workflow', op);
    if (op.indexOf('crypto.') === 0) return requireCapability('encryption', op);
    requireHostRequest(op);
  }
  function normalizePath(path) {
    if (Array.isArray(path)) return path.map(String).filter(Boolean);
    if (typeof path !== 'string') return [];
    return path.split('.').map((part) => part.trim()).filter(Boolean);
  }
  function readPath(root, path) {
    let cursor = root;
    for (const part of normalizePath(path)) {
      if (cursor == null || typeof cursor !== 'object') return undefined;
      cursor = cursor[part];
    }
    return clone(cursor);
  }
  function setPathValue(root, path, value) {
    const parts = normalizePath(path);
    if (parts.length === 0) return asRecord(value);
    const next = Array.isArray(root) ? root.slice() : { ...asRecord(root) };
    let cursor = next;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const child = cursor[part];
      cursor[part] = Array.isArray(child) ? child.slice() : { ...asRecord(child) };
      cursor = cursor[part];
    }
    cursor[parts[parts.length - 1]] = value;
    return next;
  }
  function removePathValue(root, path) {
    const parts = normalizePath(path);
    if (parts.length === 0) return {};
    const next = Array.isArray(root) ? root.slice() : { ...asRecord(root) };
    let cursor = next;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      const child = cursor[part];
      if (!child || typeof child !== 'object') return next;
      cursor[part] = Array.isArray(child) ? child.slice() : { ...child };
      cursor = cursor[part];
    }
    delete cursor[parts[parts.length - 1]];
    return next;
  }
  function randomId(prefix) {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
      return prefix + '-' + globalThis.crypto.randomUUID();
    }
    return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(16).slice(2);
  }
  function flushSend() {
    if (!sendDirty) {
      sendQueued = false;
      return;
    }
    sendDirty = false;
    sendQueued = false;
    requireStorage('data.save');
    parent.postMessage({ type: 'sepilot-apps:update-data', pageId, data: state }, '*');
  }
  function send() {
    requireStorage('data.save');
    sendDirty = true;
    if (sendQueued) return;
    sendQueued = true;
    const enqueue =
      typeof queueMicrotask === 'function'
        ? queueMicrotask
        : (callback) => Promise.resolve().then(callback);
    enqueue(flushSend);
  }
  function brokerTimeoutMsForOperation(op) {
    if (op === 'calendar.google.connect') return 310000;
    if (op.indexOf('calendar.google.') === 0 || op === 'calendar.ics.export') return 120000;
    if (op.indexOf('services.file.') === 0) return 120000;
    if (op === 'services.health.check' || op === 'network.health.check') return 60000;
    if (op === 'market.quotes.fetch') return 60000;
    if (op === 'kubernetes.cluster.snapshot' || op === 'kubernetes.rancher.import') return 60000;
    if (op.indexOf('atlassian.') === 0) return 60000;
    if (op.indexOf('smarthome.') === 0) return 60000;
    if (op.indexOf('agent.') === 0 || op.indexOf('workflow.') === 0) return 60000;
    return 15000;
  }
  function requestBroker(op, input) {
    op = String(op || 'capability.request');
    requireBrokerCapability(op);
    const requestId = 'appreq-' + (++requestSeq);
    return new Promise((resolve, reject) => {
      const brokerTimeoutMs = brokerTimeoutMsForOperation(op);
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(createSdkError('broker_timeout', 'Apps broker timed out: ' + op, { operation: op }));
      }, brokerTimeoutMs);
      pending.set(requestId, { resolve, reject, timeout, operation: op });
      parent.postMessage({
        type: 'sepilot-apps:api-request',
        pageId,
        requestId,
        op,
        input: input || {},
      }, '*');
    });
  }
  function reportRuntimeError(kind, raw) {
    try {
      const error = raw && raw.error ? raw.error : raw;
      const reason = raw && raw.reason ? raw.reason : error;
      const message =
        (error && error.message) ||
        (reason && reason.message) ||
        (typeof reason === 'string' ? reason : '') ||
        'Unknown app runtime error';
      parent.postMessage({
        type: 'sepilot-apps:runtime-error',
        pageId,
        error: {
          kind,
          message: String(message).slice(0, 500),
          source: raw && raw.filename ? String(raw.filename).slice(0, 300) : undefined,
          lineno: raw && typeof raw.lineno === 'number' ? raw.lineno : undefined,
          colno: raw && typeof raw.colno === 'number' ? raw.colno : undefined,
          stack: error && error.stack ? String(error.stack).slice(0, 1500) : undefined,
          createdAt: Date.now(),
        },
      }, '*');
    } catch (_) {}
  }
  const data = Object.freeze({
    get: (path) => {
      requireStorage('data.get');
      return path == null ? clone(state) : readPath(state, path);
    },
    set: (path, value) => {
      requireStorage('data.set');
      state = setPathValue(state, path, value);
      send();
      return clone(value);
    },
    patch: function (pathOrPatch, maybePatch) {
      requireStorage('data.patch');
      if (maybePatch === undefined) {
        const patch = asRecord(pathOrPatch);
        state = { ...asRecord(state), ...patch };
        send();
        return clone(state);
      }
      const current = asRecord(readPath(state, pathOrPatch));
      const next = { ...current, ...asRecord(maybePatch) };
      state = setPathValue(state, pathOrPatch, next);
      send();
      return clone(next);
    },
    batch: function (mutator) {
      requireStorage('data.batch');
      if (typeof mutator !== 'function') {
        throw createSdkError('sdk_error', 'data.batch requires a mutator function.', {
          operation: 'data.batch',
        });
      }
      const draft = clone(asRecord(state));
      const result = mutator(draft);
      if (result && typeof result.then === 'function') {
        throw createSdkError('sdk_error', 'data.batch mutator must be synchronous.', {
          operation: 'data.batch',
        });
      }
      state = isRecord(result) ? result : draft;
      send();
      return clone(state);
    },
    remove: (path) => {
      requireStorage('data.remove');
      state = removePathValue(state, path);
      send();
      return clone(state);
    },
  });
  function setField(name, value) {
    if (!capabilityEnabled('fields')) return;
    if (!name) return;
    state = setPathValue(state, ['fields', name], value);
  }
  function readValue(element) {
    if (element.type === 'checkbox') return element.checked;
    if (element.isContentEditable) return element.innerHTML;
    return element.value;
  }
  function writeValue(element, value) {
    if (value == null) return;
    if (element.type === 'checkbox') element.checked = Boolean(value);
    else if (element.isContentEditable) element.innerHTML = String(value);
    else element.value = String(value);
  }
  const fieldName = (element) => element.getAttribute('data-app-field') || element.getAttribute('data-office-field') || element.getAttribute('name') || element.id;
  const fields = () => Array.from(document.querySelectorAll('[data-app-field], [data-office-field], input[name], textarea[name], select[name], [contenteditable][id]'));
  function hydrate() {
    if (!permissionEnabled('storage') || !capabilityEnabled('fields')) return;
    const saved = asRecord(state.fields);
    for (const element of fields()) writeValue(element, saved[fieldName(element)]);
  }
  let timer = null;
  function capture() {
    if (!permissionEnabled('storage') || !capabilityEnabled('fields')) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      for (const element of fields()) setField(fieldName(element), readValue(element));
      send();
    }, 120);
  }
  function collection(name) {
    requireCapability('collections', 'collection');
    requireStorage('collection');
    const key = String(name || 'items');
    const list = () => Array.isArray(readPath(state, ['collections', key])) ? readPath(state, ['collections', key]) : [];
    const write = (rows) => data.set(['collections', key], rows);
    return Object.freeze({
      list,
      get: (id) => list().find((item) => item && String(item.id) === String(id)) || null,
      upsert: (item) => {
        const nextItem = { ...asRecord(item), id: String(asRecord(item).id || randomId(key)) };
        const rows = list();
        const index = rows.findIndex((row) => row && String(row.id) === String(nextItem.id));
        const nextRows = index >= 0 ? rows.map((row, idx) => idx === index ? nextItem : row) : [...rows, nextItem];
        write(nextRows);
        return clone(nextItem);
      },
      remove: (id) => write(list().filter((item) => !item || String(item.id) !== String(id))),
      clear: () => write([]),
    });
  }
  function timeSeries(name) {
    requireCapability('timeSeries', 'timeSeries');
    requireStorage('timeSeries');
    const key = String(name || 'default');
    const listAll = () => Array.isArray(readPath(state, ['timeSeries', key])) ? readPath(state, ['timeSeries', key]) : [];
    const write = (points) => data.set(['timeSeries', key], points);
    return Object.freeze({
      append: (point) => {
        const next = { ...asRecord(point), ts: Number(asRecord(point).ts || Date.now()) };
        write([...listAll(), next].slice(-5000));
        return clone(next);
      },
      list: (options) => {
        const opts = asRecord(options);
        const from = typeof opts.from === 'number' ? opts.from : null;
        const to = typeof opts.to === 'number' ? opts.to : null;
        const limit = Math.max(1, Math.min(1000, Number(opts.limit || 500)));
        return listAll()
          .filter((point) => (from == null || Number(point.ts) >= from) && (to == null || Number(point.ts) <= to))
          .slice(-limit);
      },
      clear: () => write([]),
    });
  }
  window.addEventListener('message', (event) => {
    const payload = event.data || {};
    if (payload.type === 'sepilot-apps:replace-data' && payload.pageId === pageId) {
      state = asRecord(payload.data);
      hydrate();
      window.dispatchEvent(new CustomEvent('sepilot-apps:data-replaced', { detail: clone(state) }));
      return;
    }
    if (payload.type !== 'sepilot-apps:api-response' || payload.pageId !== pageId) return;
    const entry = pending.get(payload.requestId);
    if (!entry) return;
    clearTimeout(entry.timeout);
    pending.delete(payload.requestId);
    if (payload.ok) entry.resolve(payload.result);
    else {
      const raw = payload.error;
      const errorInfo = asRecord(raw);
      entry.reject(createSdkError(
        errorInfo.code || 'broker_error',
        String(errorInfo.message || raw || 'Apps broker request failed'),
        {
          operation: entry.operation,
          capability: errorInfo.capability,
        }
      ));
    }
  });
  const api = {
    version: 1,
    frameworkVersion: ${SEPILOT_APPS_FRAMEWORK_VERSION},
    sdkVersion: ${SEPILOT_APPS_SDK_VERSION},
    appId: pageId,
    getManifest: () => manifest,
    getPermissions: () => permissions,
    getCapabilities: () => capabilities,
    getHostRequests: () => hostRequests,
    getDataPolicy: () => dataPolicy,
    getState: () => {
      requireStorage('getState');
      return clone(state);
    },
    save: (next) => {
      requireStorage('save');
      state = asRecord(next);
      send();
      return clone(state);
    },
    patch: (next) => data.patch(next),
    data,
    collection,
    timeSeries,
    apps: Object.freeze({
      list: () => requestBroker('apps.list'),
      read: (id) => requestBroker('apps.read', { id }),
      search: (query, options) => requestBroker('apps.search', { query, ...(options || {}) }),
      syncSharedWorkspace: () => requestBroker('apps.syncSharedWorkspace'),
    }),
    scheduler: Object.freeze({
      list: () => requestBroker('scheduler.list'),
      upsert: (job) => requestBroker('scheduler.upsert', job),
      run: (id) => requestBroker('scheduler.run', { id }),
      pause: (id) => requestBroker('scheduler.pause', { id }),
      resume: (id) => requestBroker('scheduler.resume', { id }),
      remove: (id) => requestBroker('scheduler.remove', { id }),
    }),
    notifications: Object.freeze({
      list: () => requestBroker('notifications.list'),
      publish: (notification) => requestBroker('notifications.publish', notification),
      schedule: (notification) => requestBroker('notifications.schedule', notification),
    }),
    clipboard: Object.freeze({
      readText: () => requestBroker('clipboard.readText'),
      write: (input) => {
        const record = input && typeof input === 'object' ? input : {};
        return requestBroker('clipboard.write', {
          text: String(record.text || ''),
          html: typeof record.html === 'string' ? record.html : '',
          rtf: typeof record.rtf === 'string' ? record.rtf : '',
        });
      },
      writeText: (text) => requestBroker('clipboard.writeText', { text: String(text || '') }),
    }),
    agent: Object.freeze({
      write: (input) => requestBroker('agent.write', input || {}),
    }),
    workflow: Object.freeze({
      github: Object.freeze({
        status: () => requestBroker('workflow.github.status'),
        listProjects: (input) => requestBroker('workflow.github.listProjects', input || {}),
        getProject: (input) => requestBroker('workflow.github.getProject', input || {}),
        createDraft: (input) => requestBroker('workflow.github.createDraft', input || {}),
        moveCard: (input) => requestBroker('workflow.github.moveCard', input || {}),
        updateDraft: (input) => requestBroker('workflow.github.updateDraft', input || {}),
      }),
    }),
    crypto: Object.freeze({
      status: () => requestBroker('crypto.status'),
      encryptAesGcm: (input) => requestBroker('crypto.encryptAesGcm', input || {}),
      decryptAesGcm: (input) => requestBroker('crypto.decryptAesGcm', input || {}),
    }),
    request: (capability, input) => requestBroker(String(capability || 'capability.request'), input || {}),
    errors: Object.freeze({
      isSdkError,
      create: createSdkError,
    }),
  };
  window.sepilotApps = Object.freeze(api);
  window.sepilotOffice = window.sepilotApps;
  window.addEventListener('error', (event) => reportRuntimeError('error', event));
  window.addEventListener('unhandledrejection', (event) => reportRuntimeError('unhandledrejection', event));
  document.addEventListener('input', capture);
  document.addEventListener('change', capture);
  document.addEventListener('DOMContentLoaded', hydrate);
  setTimeout(hydrate, 0);
})();
`

const appCsp = [
  "default-src 'none'",
  "script-src 'unsafe-inline' app: http://localhost:* http://127.0.0.1:*",
  "style-src 'unsafe-inline' https:",
  'img-src data: blob: https:',
  'font-src data:',
  'media-src data: blob:',
  "connect-src 'none'",
  "worker-src 'none'",
  "child-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const frameworkCss = `
  :root {
    --s-bg: var(--app-bg, #f6f7f9);
    --s-fg: var(--app-fg, #101827);
    --s-muted: var(--app-muted, #64748b);
    --s-card: var(--app-card-bg, #ffffff);
    --s-border: var(--app-card-border, #d8dee8);
    --s-field: var(--app-field-bg, #ffffff);
    --s-primary: var(--app-primary-bg, #1d4ed8);
    --s-primary-fg: var(--app-primary-fg, #ffffff);
    --s-danger: var(--app-danger, #dc2626);
  }
  .s-page { min-height: 100vh; padding: 12px; background: var(--s-bg); color: var(--s-fg); font: 12px/1.4 Inter, ui-sans-serif, system-ui, sans-serif; }
  .s-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
  .s-grid { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
  .s-card, .s-section { border: 1px solid var(--s-border); border-radius: 6px; background: var(--s-card); padding: 8px; }
  .s-stack { display: grid; gap: 6px; }
  .s-row { display: flex; align-items: center; gap: 6px; }
  .s-field { width: 100%; min-height: 28px; border: 1px solid var(--s-border); border-radius: 4px; background: var(--s-field); color: var(--s-fg); padding: 4px 7px; font: inherit; }
  textarea.s-field { min-height: 58px; resize: vertical; }
  .s-button { min-height: 28px; border: 1px solid var(--s-border); border-radius: 4px; background: var(--s-card); color: var(--s-fg); padding: 4px 8px; font: inherit; cursor: pointer; }
  .s-button:hover { border-color: var(--s-primary); }
  .s-button-primary { border-color: var(--s-primary); background: var(--s-primary); color: var(--s-primary-fg); }
  .s-button-danger { border-color: color-mix(in srgb, var(--s-danger) 35%, transparent); color: var(--s-danger); }
  .s-pill { display: inline-flex; align-items: center; justify-content: center; min-height: 20px; border: 1px solid var(--s-border); border-radius: 999px; padding: 0 7px; color: var(--s-muted); font-size: 10px; font-weight: 700; white-space: nowrap; }
  .s-table { width: 100%; border-collapse: collapse; font-size: 11px; }
  .s-table th, .s-table td { border-bottom: 1px solid var(--s-border); padding: 6px; text-align: left; vertical-align: top; }
  .s-kpi { border: 1px solid var(--s-border); border-radius: 6px; background: var(--s-card); padding: 7px 8px; }
  .s-kpi strong { display: block; color: var(--s-fg); font-size: 15px; line-height: 1; }
  .s-kpi span, .s-muted { color: var(--s-muted); }
  .s-empty { border: 1px dashed var(--s-border); border-radius: 6px; padding: 10px; color: var(--s-muted); text-align: center; }
`

const themeOverrideCss = `
  :root[data-theme="light"] {
    --app-bg: #f6f7f9;
    --app-fg: #101827;
  }
  :root[data-theme="dark"] {
    --app-bg: #0d1117;
    --app-fg: #e6edf3;
  }
  html, body { background: var(--app-bg) !important; color: var(--app-fg) !important; }
`

export function getEffectiveAppHostRequests(page: AppPage): AppPage['hostRequests'] {
  const template = getEffectiveAppTemplate(page)
  const templateRequests = template?.hostRequests ?? []
  if (templateRequests.length === 0) return page.hostRequests
  const merged = [...(page.hostRequests ?? [])]
  for (const request of templateRequests) {
    if (!merged.some((candidate) => candidate.op === request.op)) {
      merged.push(request)
    }
  }
  return merged
}

function usesWorkflowBridge(html: string | undefined): boolean {
  return Boolean(
    html?.includes('window.sepilotApps.workflow.github') || html?.includes('workflow.github.'),
  )
}

function getLegacyWorkflowTemplate(page: AppPage): AppTemplate | undefined {
  const title = page.title.trim()
  const hasWorkflowBridge = usesWorkflowBridge(page.html)
  if (page.origin !== 'template' && page.origin != null && !hasWorkflowBridge) return undefined
  for (const id of ['kanban', 'scrum'] as const) {
    const template = getAppTemplate(id)
    if (!template || title !== template.title) continue
    if (
      page.summary === template.summary ||
      page.category === template.category ||
      page.category === '워크플로' ||
      hasWorkflowBridge
    ) {
      return template
    }
  }
  return undefined
}

function getEffectiveAppTemplate(page: AppPage): AppTemplate | undefined {
  if (page.kind !== 'custom') return getAppTemplate(page.kind)
  return getLegacyWorkflowTemplate(page)
}

export function getEffectiveAppCapabilities(page: AppPage): SepilotAppCapabilities {
  const template = getEffectiveAppTemplate(page)
  const capabilities: SepilotAppCapabilities = {
    ...DEFAULT_APP_CAPABILITIES,
    ...(template?.capabilities ?? {}),
    ...(page.capabilities ?? {}),
  }
  if (usesWorkflowBridge(template?.html)) capabilities.workflow = true
  return capabilities
}

export function buildAppSrcDoc(page: AppPage, options: { theme?: 'light' | 'dark' } = {}): string {
  const theme = options.theme === 'dark' ? 'dark' : 'light'
  const capabilities = getEffectiveAppCapabilities(page)
  const hostRequests = getEffectiveAppHostRequests(page)
  const bootstrap = `<script>(function(){try{document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme)});document.documentElement.style.colorScheme=${JSON.stringify(theme)};}catch(_){}})();</script>`
  const bridge = `<script>${bridgeSource.replace(
    '__SEED__',
    escapeScriptJson({
      pageId: page.id,
      data: page.data,
      manifest: {
        id: page.id,
        title: page.title,
        kind: page.kind,
        summary: page.summary,
        category: page.category,
        origin: page.origin,
        version: page.version ?? 1,
        dataPolicy: page.dataPolicy,
        capabilities,
        hostRequests,
        dataSchema: page.dataSchema,
      },
      permissions: page.permissions ?? DEFAULT_APP_PERMISSIONS,
    }),
  )}</script>`
  const framework = `<style data-sepilot-app-framework>${frameworkCss}</style>`
  const themeOverride = `<style data-sepilot-app-theme>${themeOverrideCss}</style>`
  const csp = `<meta http-equiv="Content-Security-Policy" content="${appCsp}">`
  const headInjection = `${csp}${framework}${bootstrap}${bridge}`
  const doctype = /^\s*<!doctype[^>]*>/i.exec(page.html)?.[0] ?? ''
  const body = page.html.slice(doctype.length)
  const headEnd = /<\/head\s*>/i.exec(body)
  const withTheme = headEnd
    ? `${body.slice(0, headEnd.index)}${themeOverride}${body.slice(headEnd.index)}`
    : `${themeOverride}${body}`
  return `${doctype}${headInjection}${withTheme}`
}

export function extractHtmlDocument(text: string): string | null {
  const fenced = text.match(/```(?:html)?\s*([\s\S]*?)```/i)
  const candidate = (fenced?.[1] ?? text).trim()
  if (!candidate) return null
  const docMatch = candidate.match(/<!doctype html[\s\S]*<\/html>/i)
  if (docMatch) return docMatch[0]
  const htmlMatch = candidate.match(/<html[\s\S]*<\/html>/i)
  if (htmlMatch) return `<!doctype html>\n${htmlMatch[0]}`
  if (candidate.includes('<body') || candidate.includes('<main')) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apps Page</title>
</head>
<body>
${candidate}
</body>
</html>`
  }
  return null
}

export function inferAppTitle(html: string, fallback: string): string {
  const title = html.match(/<title>(.*?)<\/title>/i)?.[1]?.trim()
  if (title) return title.replace(/\s+/g, ' ').slice(0, 80)
  const heading = html
    .match(/<h1[^>]*>(.*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, '')
    .trim()
  return heading ? heading.replace(/\s+/g, ' ').slice(0, 80) : fallback
}

export function inferAppSummary(html: string, fallback: string): string {
  const description = html
    .match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]
    ?.trim()
  if (description) return description.replace(/\s+/g, ' ').slice(0, 110)
  const subtitle = html
    .match(/<p[^>]*class=["'][^"']*muted[^"']*["'][^>]*>(.*?)<\/p>/i)?.[1]
    ?.replace(/<[^>]+>/g, '')
    .trim()
  return subtitle ? subtitle.replace(/\s+/g, ' ').slice(0, 110) : fallback
}

export function buildAppCodeAgentPrompt(input: {
  request: string
  currentPage?: AppPage | null
}): string {
  const current = input.currentPage
  const currentData = current
    ? JSON.stringify(sanitizeAppDataForAgent(current.data, current.dataPolicy), null, 2)
    : '(none)'
  return `You are the sepilotd Apps Code Agent. Build one self-contained microweb app page for the desktop Apps surface.

Return ONLY a complete HTML document. Do not use Markdown fences.

Requirements:
- Build a practical microweb app matching the user's request. It should feel like a focused tool, not a landing page.
- Use inline CSS and inline JavaScript only. No external network assets.
- The page runs in a sandboxed iframe inside the desktop shell, which
  exposes the user's current theme on the root element via
  \`document.documentElement.getAttribute('data-theme')\` ("light" | "dark").
- Include a concise <title> and a <meta name="description" content="..."> describing the app in one sentence.
- Theme support is required. Define colors as CSS custom properties on
  \`:root\` and override them under \`[data-theme="dark"]\`, e.g.:
    :root { --bg: #fff; --fg: #111; --card: #f7f7f9; --border: #e5e7eb; }
    [data-theme="dark"] { --bg: #0d1117; --fg: #e6edf3; --card: #161b22; --border: #30363d; }
  Then reference those vars (\`background: var(--bg); color: var(--fg);\`).
  Never hard-code white backgrounds or black text directly on body.
${SEPILOT_APPS_SDK_PROMPT_REFERENCE}
- Backward compatibility is available through window.sepilotApps.save(data), getState(), patch(data), and window.sepilotOffice.
- For normal inputs, also add stable name/data-app-field attributes so the host can autosave them.
- Use the built-in enterprise component classes when practical: s-page, s-toolbar, s-grid, s-card, s-section, s-stack, s-row, s-field, s-button, s-button-primary, s-pill, s-table, s-kpi, s-empty. Custom CSS is allowed when the app needs richer UI.
- Use professional, dense business UI: calendar, todo, notepad, scrum, kanban, CRM, dashboard, vault, tracker, etc. as needed.
- If creating a vault or sensitive page, store only encrypted data or non-secret placeholders and do not expose those values through inter-app context.
- If the app creates scheduler jobs, names and instructions must clearly include the app title and the user-visible reason for the job.
- Prefer accessible controls, keyboard-friendly buttons, stable layouts, and responsive grids.
- Do not include explanations outside the HTML document.

Current page title: ${current?.title ?? '(new page)'}
Current page redacted saved data:
${currentData}
Current page HTML:
${current?.html ?? '(none)'}

User request:
${input.request}
`
}

export function buildAppChatAgentPrompt(input: {
  request: string
  currentPage: AppPage
  history?: AppChatHistoryEntry[]
  relatedApps?: SepilotReadableAppSearchResult[]
}): string {
  const current = input.currentPage
  const currentData = JSON.stringify(
    sanitizeAppDataForAgent(current.data, current.dataPolicy),
    null,
    2,
  )
  const dataSchema = JSON.stringify(current.dataSchema ?? {}, null, 2)
  const relatedAppContext = compactRelatedAppContext(current.id, input.relatedApps)
  const relatedAppContextText =
    relatedAppContext.length > 0 ? JSON.stringify(relatedAppContext, null, 2) : '(none)'
  const writable = current.dataPolicy?.aiWritable !== false
  const history = (input.history ?? [])
    .slice(-8)
    .map((entry) => `${entry.role === 'user' ? 'User' : 'App'}: ${entry.content}`)
    .join('\n')
  return `You are the embedded chat agent for one sepilotd Desktop micro app.

Answer in Korean unless the user clearly asks for another language.
You are scoped to this app and its saved data. Use the schema to reason about fields and collections.
When the user asks to add, edit, remove, classify, summarize, or reorganize app data, update saved app data by returning structured mutations.

Return ONLY one JSON object. Do not use Markdown fences.
JSON shape:
{
  "reply": "short user-facing answer",
  "mutations": [
    { "op": "fields.set", "field": "owner", "value": "Grace" },
    { "op": "collection.upsert", "collection": "tasks", "item": { "id": "task-123", "title": "..." } },
    { "op": "collection.remove", "collection": "tasks", "id": "task-123" },
    { "op": "timeSeries.append", "series": "metrics", "point": { "value": 10 } }
  ],
  "actions": [
    { "op": "scheduler.upsert", "id": "daily-review", "name": "Daily review", "when": "tomorrow 9am", "instruction": "Review overdue tasks in this app" },
    { "op": "scheduler.remove", "id": "daily-review" },
    { "op": "notification.publish", "title": "Follow up", "body": "Check this app" }
  ]
}

Rules:
- If no data mutation is needed, omit mutations. If no external action is needed, omit actions.
- Do not call tools and do not ask the user to switch autonomy or Supervised mode. Desktop applies your JSON mutations through the app host after the user confirms.
- The app iframe sandbox is not a blocker for this protocol. Return JSON mutations for app-data changes instead of asking for host-mode changes.
- Prefer structured mutations over raw dataPatch/dataReplace. dataPatch/dataReplace are legacy fallback only.
- Keep existing data unless the user explicitly asks to delete or replace it.
- Use the app framework data shape: fields, collections, timeSeries, and app-specific keys.
- For collections, preserve item ids when editing existing rows and create stable ids for new rows.
- Match the dataSchema types and required fields. If unsure, ask a clarifying question in reply and omit mutations.
- Use actions for reminders, scheduled follow-ups, recurring checks, and notifications. Actions are applied only after the user confirms them.
- Use notification.schedule for due-date reminders and one-off user notifications. Use "when" for natural language times or "runAt" for epoch milliseconds.
- Scheduler actions need a clear user-visible name and instruction. Use "when" for one-off jobs or "cron" for recurring jobs.
- Do not invent secrets. Do not expose redacted values.
- This app is ${writable ? 'AI-writable' : 'not AI-writable'}. If it is not writable, answer normally and do not include mutations.
- Related app context is read-only and already redacted. Use it to answer cross-app questions, but do not return mutations for related apps. If the user asks to modify another app, tell them to open that app first.
- Treat "Current redacted app data" as the source of truth for this app's current contents.
- Recent app chat is conversational context only and may mention stale or deleted data. Do not cite, summarize, or mutate items from chat history unless they still exist in current app data or related app context.
- If current app data conflicts with recent app chat, current app data wins.
- Keep reply concise and mention what changed when you mutate data.

Recent app chat (context only; not a data source):
${history || '(none)'}

Current app:
${JSON.stringify(
  {
    id: current.id,
    title: current.title,
    kind: current.kind,
    summary: current.summary,
    category: current.category,
    dataPolicy: current.dataPolicy,
    capabilities: current.capabilities,
  },
  null,
  2,
)}

Data schema:
${dataSchema}

Related redacted app context:
${relatedAppContextText}

Current redacted app data (authoritative):
${currentData}

User request:
${input.request}
`
}

export function extractAppChatAgentResponse(text: string): AppChatAgentResponse | null {
  const candidate = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? text.trim()
  const objectText = candidate.startsWith('{') ? candidate : candidate.match(/\{[\s\S]*\}/u)?.[0]
  if (!objectText) return null
  try {
    const parsed = JSON.parse(objectText) as unknown
    if (!isRecord(parsed)) return null
    const reply = typeof parsed.reply === 'string' ? parsed.reply : ''
    const mutations = Array.isArray(parsed.mutations)
      ? (parsed.mutations.filter(isRecord) as AppChatMutation[])
      : undefined
    const actions = Array.isArray(parsed.actions)
      ? (parsed.actions.filter(isRecord) as AppChatAction[])
      : undefined
    const dataPatch = isRecord(parsed.dataPatch) ? parsed.dataPatch : undefined
    const dataReplace = isRecord(parsed.dataReplace) ? parsed.dataReplace : undefined
    if (!reply && !mutations?.length && !actions?.length && !dataPatch && !dataReplace) {
      return null
    }
    return {
      reply,
      mutations,
      actions,
      dataPatch,
      dataReplace,
    }
  } catch {
    return null
  }
}

export const buildAppCoworkPrompt = buildAppCodeAgentPrompt
