import React, { useEffect, useState } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Check,
  Clock,
  Copy,
  Keyboard,
  MessageSquarePlus,
  Move,
  MousePointerClick,
  Type,
  X,
} from 'lucide-react'
import {
  SEPILOT_APP_SENSITIVE_KEY_PATTERN,
  approvalNoteCopy,
  toolStatusLabel,
  type ApprovalScope,
  type Message,
} from '@sepilotd/api-client'
import { useLocale, type SupportedLocale } from './useLocale'
import { useModalViewportLock } from '../../lib/hooks/use-modal-viewport-lock'

const TOOL_CARD_COPY = {
  en: {
    yes: 'Yes',
    no: 'No',
    leftLabel: 'Left',
    rightLabel: 'Right',
    doubleLabel: 'Double',
    leftClickAria: 'Left click',
    rightClickAria: 'Right click',
    doubleClickAria: 'Double click',
    downLabel: 'Down',
    upLabel: 'Up',
    scrollDownAria: 'Scroll down',
    scrollUpAria: 'Scroll up',
    enterLabel: 'Enter',
    tabLabel: 'Tab',
    escLabel: 'Esc',
    enterAria: 'Enter key',
    tabAria: 'Tab key',
    escAria: 'Escape key',
    screenshotCaptured: 'Screenshot captured',
    unknownSize: 'unknown size',
    openScreenshotAria: 'Open computer observation screenshot',
    screenshotAlt: 'Computer observation screenshot',
    previewAria: 'Computer observation screenshot preview',
    closePreviewAria: 'Close screenshot preview',
    screenshotEnlargedAlt: 'Computer observation screenshot enlarged',
    selectedCoordinate: 'Selected coordinate',
    focusedActions: 'Focused actions',
    noCoordinate: 'No coordinate',
    dragStart: 'Drag start',
    dragEnd: 'Drag end',
    clickActionTypeAria: 'Click action type',
    scrollActionTypeAria: 'Scroll action type',
    keyboardActionTypeAria: 'Keyboard action type',
    textInputAria: 'Text input action',
    waitDurationAria: 'Wait duration action',
    selectedCoordinateCopied: 'Selected coordinate copied',
    copySelectedCoordinate: 'Copy selected coordinate',
    moveActionCopied: 'Move action copied',
    copyMoveAction: 'Copy move action',
    windowsListed: 'Windows listed',
    foreground: 'Foreground',
    untitledWindow: 'Untitled window',
    observation: 'Observation',
    origin: 'Origin',
    coordinates: 'Coordinates',
    windowBounds: 'Window bounds',
    cursorLabel: 'Cursor',
    selected: 'Selected',
    captured: 'Captured',
    typeMime: 'Type',
    screenshotFile: 'Screenshot file',
    visibleWindowSuffix: (n: number) => `${n} visible window${n === 1 ? '' : 's'}`,
    focusActionCopied: 'Focus action copied',
    copyFocusAction: 'Copy focus action',
    focusInstructionInserted: 'Focus instruction inserted',
    insertFocusInstruction: 'Insert focus instruction',
    noVisibleWindows: 'No visible windows returned.',
    showingNofM: (shown: number, total: number) => `Showing ${shown} of ${total} windows.`,
    approvalRequested: 'Approval requested',
    toolActivity: 'Tool activity',
    toolFallback: 'Tool',
    decline: 'Decline',
    reject: 'Reject',
    resume: 'Resume',
    continueLabel: 'Continue',
    approve: 'Approve',
    approveComputerRun: 'Approve CUA run',
    result: 'Result',
    appMutationRequest: 'App data change',
    appMutationPreviewRequest: 'App data preview',
    appMutationPreviewResult: 'Preview ready',
    appMutationWrittenResult: 'App data updated',
    appMutationFailedResult: 'App data change failed',
    appMutationApp: 'App',
    appMutationMode: 'Mode',
    appMutationDryRun: 'Dry run',
    appMutationApply: 'Write on approval',
    appMutationWritten: 'Written',
    appMutationNotWritten: 'Not written',
    appMutationChanges: 'Changes',
    appMutationIssues: 'Issues',
    appMutationNoIssues: 'No validation issues',
    appMutationUnknownApp: 'Unknown app',
    appMutationCountSuffix: (n: number) => `${n} change${n === 1 ? '' : 's'}`,
    appMutationSetToPrefix: 'Set to',
    appMutationUpsertPrefix: 'Upsert',
    appMutationRemovePrefix: 'Remove',
    appMutationAppendPrefix: 'Append point',
  },
  ko: {
    yes: '예',
    no: '아니오',
    leftLabel: '왼쪽',
    rightLabel: '오른쪽',
    doubleLabel: '더블',
    leftClickAria: '왼쪽 클릭',
    rightClickAria: '오른쪽 클릭',
    doubleClickAria: '더블 클릭',
    downLabel: '아래',
    upLabel: '위',
    scrollDownAria: '아래로 스크롤',
    scrollUpAria: '위로 스크롤',
    enterLabel: 'Enter',
    tabLabel: 'Tab',
    escLabel: 'Esc',
    enterAria: 'Enter 키',
    tabAria: 'Tab 키',
    escAria: 'Escape 키',
    screenshotCaptured: '스크린샷 캡처됨',
    unknownSize: '알 수 없는 크기',
    openScreenshotAria: '컴퓨터 관찰 스크린샷 열기',
    screenshotAlt: '컴퓨터 관찰 스크린샷',
    previewAria: '컴퓨터 관찰 스크린샷 미리보기',
    closePreviewAria: '스크린샷 미리보기 닫기',
    screenshotEnlargedAlt: '컴퓨터 관찰 스크린샷 확대',
    selectedCoordinate: '선택된 좌표',
    focusedActions: '집중 작업',
    noCoordinate: '좌표 없음',
    dragStart: '드래그 시작',
    dragEnd: '드래그 끝',
    clickActionTypeAria: '클릭 동작 유형',
    scrollActionTypeAria: '스크롤 동작 유형',
    keyboardActionTypeAria: '키보드 동작 유형',
    textInputAria: '텍스트 입력 동작',
    waitDurationAria: '대기 시간 동작',
    selectedCoordinateCopied: '선택된 좌표가 복사되었습니다',
    copySelectedCoordinate: '선택된 좌표 복사',
    moveActionCopied: '이동 동작이 복사되었습니다',
    copyMoveAction: '이동 동작 복사',
    windowsListed: '나열된 창',
    foreground: '포어그라운드',
    untitledWindow: '제목 없는 창',
    observation: '관찰',
    origin: '원점',
    coordinates: '좌표',
    windowBounds: '창 경계',
    cursorLabel: '커서',
    selected: '선택됨',
    captured: '캡처됨',
    typeMime: '유형',
    screenshotFile: '스크린샷 파일',
    visibleWindowSuffix: (n: number) => `표시된 창 ${n}개`,
    focusActionCopied: '포커스 동작이 복사되었습니다',
    copyFocusAction: '포커스 동작 복사',
    focusInstructionInserted: '포커스 지시가 삽입되었습니다',
    insertFocusInstruction: '포커스 지시 삽입',
    noVisibleWindows: '표시된 창이 반환되지 않았습니다.',
    showingNofM: (shown: number, total: number) => `${total}개 중 ${shown}개 창 표시 중.`,
    approvalRequested: '승인 요청됨',
    toolActivity: '도구 활동',
    toolFallback: '도구',
    decline: '거절',
    reject: '거부',
    resume: '재개',
    continueLabel: '계속',
    approve: '승인',
    approveComputerRun: '이번 작업 승인',
    result: '결과',
    appMutationRequest: '앱 데이터 변경',
    appMutationPreviewRequest: '앱 데이터 미리보기',
    appMutationPreviewResult: '미리보기 완료',
    appMutationWrittenResult: '앱 데이터 업데이트됨',
    appMutationFailedResult: '앱 데이터 변경 실패',
    appMutationApp: '앱',
    appMutationMode: '모드',
    appMutationDryRun: '미리보기',
    appMutationApply: '승인 후 저장',
    appMutationWritten: '저장됨',
    appMutationNotWritten: '저장 안 됨',
    appMutationChanges: '변경',
    appMutationIssues: '검증 이슈',
    appMutationNoIssues: '검증 이슈 없음',
    appMutationUnknownApp: '알 수 없는 앱',
    appMutationCountSuffix: (n: number) => `변경 ${n}개`,
    appMutationSetToPrefix: '값 설정',
    appMutationUpsertPrefix: '추가/수정',
    appMutationRemovePrefix: '삭제',
    appMutationAppendPrefix: '시점 데이터 추가',
  },
} as const

type ToolCardCopy = (typeof TOOL_CARD_COPY)[SupportedLocale]

interface ToolMessageCardProps {
  message: Message
  onApprovalDecision: (
    requestId: string,
    toolMessageId: string,
    approved: boolean,
    approvalState?: Message['approvalState'],
    resumeAvailable?: boolean,
    scope?: ApprovalScope,
    targetSessionId?: string,
  ) => void | Promise<void>
}

interface ComputerObservationResult {
  observationId?: string
  path: string
  mimeType?: string
  width?: number
  height?: number
  originX?: number
  originY?: number
  capturedAt?: string
  coordinateSystem?: string
  foregroundWindow?: {
    hwnd?: number
    pid?: number
    processName?: string
    title?: string
    bounds?: ComputerObservationRect
  }
  cursor?: {
    x?: number
    y?: number
  }
}

interface ComputerObservationRect {
  x: number
  y: number
  width: number
  height: number
}

interface ComputerActionResult {
  title: string
  summary: string
  fields: Array<{ label: string; value: string }>
}

interface AppMutationDisplayRow {
  label: string
  detail: string
}

interface AppMutationDisplayIssue {
  severity?: string
  code?: string
  message: string
}

interface AppMutationDisplay {
  phase: 'request' | 'result'
  failed?: boolean
  dryRun?: boolean
  written?: boolean
  appId?: string
  appTitle?: string
  changeCount: number
  rows: AppMutationDisplayRow[]
  issues: AppMutationDisplayIssue[]
}

interface ComputerWindowEntry {
  hwnd?: number
  pid?: number
  processName?: string
  title?: string
  bounds?: ComputerObservationRect
  foreground?: boolean
}

interface ComputerWindowListResult {
  windows: ComputerWindowEntry[]
}

interface ComputerObservationCoordinate {
  x: number
  y: number
}

type ComputerObservationClickAction = 'left' | 'right' | 'double'
type ComputerObservationScrollAction = 'down' | 'up'
type ComputerObservationHotkeyAction = 'enter' | 'tab' | 'escape'
type ComputerObservationCopyKind =
  | 'coordinate'
  | 'move'
  | 'insert-move'
  | 'drag-start'
  | 'drag-end'
  | 'drag'
  | 'insert-drag'
  | 'click'
  | 'insert'
  | 'scroll'
  | 'insert-scroll'
  | 'hotkey'
  | 'insert-hotkey'
  | 'type'
  | 'insert-type'
  | 'wait'
  | 'insert-wait'
type ComputerActionPhase = 'request' | 'result'

function buildComputerObservationClickActions(copy: ToolCardCopy): Array<{
  value: ComputerObservationClickAction
  label: string
  ariaLabel: string
}> {
  return [
    { value: 'left', label: copy.leftLabel, ariaLabel: copy.leftClickAria },
    { value: 'right', label: copy.rightLabel, ariaLabel: copy.rightClickAria },
    { value: 'double', label: copy.doubleLabel, ariaLabel: copy.doubleClickAria },
  ]
}

function buildComputerObservationScrollActions(copy: ToolCardCopy): Array<{
  value: ComputerObservationScrollAction
  label: string
  ariaLabel: string
}> {
  return [
    { value: 'down', label: copy.downLabel, ariaLabel: copy.scrollDownAria },
    { value: 'up', label: copy.upLabel, ariaLabel: copy.scrollUpAria },
  ]
}

const COMPUTER_OBSERVATION_HOTKEY_ACTIONS: Array<{
  value: ComputerObservationHotkeyAction
  label: string
  ariaLabel: string
  keys: string[]
}> = [
  { value: 'enter', label: 'Enter', ariaLabel: 'Enter key', keys: ['ENTER'] },
  { value: 'tab', label: 'Tab', ariaLabel: 'Tab key', keys: ['TAB'] },
  { value: 'escape', label: 'Esc', ariaLabel: 'Escape key', keys: ['ESC'] },
]

function buildComputerObservationHotkeyActions(copy: ToolCardCopy): Array<{
  value: ComputerObservationHotkeyAction
  label: string
  ariaLabel: string
  keys: string[]
}> {
  return [
    { value: 'enter', label: copy.enterLabel, ariaLabel: copy.enterAria, keys: ['ENTER'] },
    { value: 'tab', label: copy.tabLabel, ariaLabel: copy.tabAria, keys: ['TAB'] },
    { value: 'escape', label: copy.escLabel, ariaLabel: copy.escAria, keys: ['ESC'] },
  ]
}

const COMPUTER_OBSERVATION_DEFAULT_TYPE_TEXT = 'hello from CUA'
const COMPUTER_OBSERVATION_DEFAULT_WAIT_MS = '1000'
const COMPUTER_WINDOW_LIST_PREVIEW_LIMIT = 8

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function formatBoolean(value: boolean | undefined): string | undefined {
  if (value === undefined) return undefined
  return value ? 'Yes' : 'No'
}

function formatNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value)
}

function formatStringList(value: unknown): string | undefined {
  if (!Array.isArray(value)) return asString(value)
  const items = value.map((item) => String(item).trim()).filter(Boolean)
  return items.length > 0 ? items.join(' + ') : undefined
}

function formatTextPreview(value: unknown): string | undefined {
  const text = asString(value)
  if (!text) return undefined
  return text.length > 240 ? `${text.slice(0, 240)}...` : text
}

function appendField(
  fields: ComputerActionResult['fields'],
  label: string,
  value: string | undefined,
) {
  if (value) fields.push({ label, value })
}

function formatAppPreviewValue(value: unknown, keyHint?: string): string {
  if (keyHint && SEPILOT_APP_SENSITIVE_KEY_PATTERN.test(keyHint)) return '[REDACTED]'
  if (value == null) return 'null'
  if (typeof value === 'string') return formatTextPreview(value) ?? ''
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `array(${value.length})`
  const record = asRecord(value)
  if (record) {
    const keys = Object.keys(record).filter((key) => !SEPILOT_APP_SENSITIVE_KEY_PATTERN.test(key))
    return keys.length > 0 ? `object(${keys.slice(0, 5).join(', ')})` : 'object'
  }
  return String(value)
}

function parseAppMutationIssues(value: unknown): AppMutationDisplayIssue[] {
  if (!Array.isArray(value)) return []
  return value
    .map((issue) => {
      const record = asRecord(issue)
      if (!record) return null
      const message = asString(record.message) ?? asString(record.code)
      if (!message) return null
      const parsedIssue: AppMutationDisplayIssue = { message }
      const severity = asString(record.severity)
      const code = asString(record.code)
      if (severity) parsedIssue.severity = severity
      if (code) parsedIssue.code = code
      return parsedIssue
    })
    .filter((issue): issue is AppMutationDisplayIssue => Boolean(issue))
}

function buildAppMutationRow(
  mutation: unknown,
  index: number,
  copy: ToolCardCopy,
): AppMutationDisplayRow {
  const record = asRecord(mutation)
  const fallback = `#${index + 1}`
  if (!record) {
    return {
      label: fallback,
      detail: formatAppPreviewValue(mutation),
    }
  }
  const op = asString(record.op) ?? fallback
  if (op === 'fields.set') {
    const field = asString(record.field) ?? fallback
    return {
      label: `fields.${field}`,
      detail: `${copy.appMutationSetToPrefix}: ${formatAppPreviewValue(record.value, field)}`,
    }
  }
  if (op === 'collection.upsert') {
    const collection = asString(record.collection) ?? fallback
    const item = asRecord(record.item)
    const itemId = asString(item?.id)
    const itemTitle = asString(item?.title) ?? asString(item?.name) ?? itemId
    return {
      label: itemId ? `${collection}.${itemId}` : collection,
      detail: itemTitle
        ? `${copy.appMutationUpsertPrefix}: ${itemTitle}`
        : copy.appMutationUpsertPrefix,
    }
  }
  if (op === 'collection.remove') {
    const collection = asString(record.collection) ?? fallback
    const itemId = asString(record.id)
    return {
      label: itemId ? `${collection}.${itemId}` : collection,
      detail: itemId ? `${copy.appMutationRemovePrefix}: ${itemId}` : copy.appMutationRemovePrefix,
    }
  }
  if (op === 'timeSeries.append') {
    const series = asString(record.series) ?? fallback
    return {
      label: series,
      detail: `${copy.appMutationAppendPrefix}: ${formatAppPreviewValue(record.point)}`,
    }
  }
  return {
    label: op,
    detail: formatAppPreviewValue(record),
  }
}

function parseAppMutationInput(message: Message, copy: ToolCardCopy): AppMutationDisplay | null {
  if (message.toolName !== 'apps.mutate' || !message.toolInput) return null
  const input = asRecord(message.toolInput)
  if (!input) return null
  const mutations = Array.isArray(input.mutations) ? input.mutations : []
  return {
    phase: 'request',
    dryRun: asBoolean(input.dryRun) === true,
    written: false,
    appId: asString(input.id),
    changeCount: mutations.length,
    rows: mutations
      .slice(0, 8)
      .map((mutation, index) => buildAppMutationRow(mutation, index, copy)),
    issues: [],
  }
}

function parseAppliedMutationRows(applied: unknown, copy: ToolCardCopy): AppMutationDisplayRow[] {
  if (!Array.isArray(applied)) return []
  return applied
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 8)
    .map((entry) => {
      const [op, target] = entry.split(':', 2)
      return {
        label: target || entry,
        detail: op || copy.appMutationChanges,
      }
    })
}

function parseAppMutationResult(message: Message, copy: ToolCardCopy): AppMutationDisplay | null {
  if (message.toolName !== 'apps.mutate' || !message.toolResult) return null
  try {
    const parsed = asRecord(JSON.parse(message.toolResult))
    if (!parsed) return null
    const app = asRecord(parsed.app)
    const appliedRows = parseAppliedMutationRows(parsed.applied, copy)
    const inputRows = parseAppMutationInput(message, copy)?.rows ?? []
    const rows = appliedRows.length > 0 ? appliedRows : inputRows
    const issues = parseAppMutationIssues(parsed.issues)
    return {
      phase: 'result',
      failed: message.toolStatus === 'error',
      dryRun: asBoolean(parsed.dryRun),
      written: asBoolean(parsed.written),
      appId: asString(app?.id) ?? asString(parsed.id) ?? asString(message.toolInput?.id),
      appTitle: asString(app?.title),
      changeCount: rows.length,
      rows,
      issues,
    }
  } catch {
    return null
  }
}

function parseForegroundWindow(value: unknown): ComputerObservationResult['foregroundWindow'] {
  const record = asRecord(value)
  if (!record) return undefined
  const foregroundWindow = {
    hwnd: asNumber(record.hwnd),
    pid: asNumber(record.pid),
    processName: asString(record.processName),
    title: asString(record.title),
    bounds: parseObservationRect(record.bounds),
  }
  return foregroundWindow.hwnd !== undefined ||
    foregroundWindow.pid !== undefined ||
    foregroundWindow.processName ||
    foregroundWindow.title ||
    foregroundWindow.bounds
    ? foregroundWindow
    : undefined
}

function parseObservationRect(value: unknown): ComputerObservationRect | undefined {
  const record = asRecord(value)
  if (!record) return undefined
  const x = asNumber(record.x)
  const y = asNumber(record.y)
  const width = asNumber(record.width)
  const height = asNumber(record.height)
  return x !== undefined && y !== undefined && width !== undefined && height !== undefined
    ? { x, y, width, height }
    : undefined
}

function parseCursor(value: unknown): ComputerObservationResult['cursor'] {
  const record = asRecord(value)
  if (!record) return undefined
  const cursor = {
    x: asNumber(record.x),
    y: asNumber(record.y),
  }
  return cursor.x !== undefined && cursor.y !== undefined ? cursor : undefined
}

function parseComputerObservationResult(message: Message): ComputerObservationResult | null {
  if (message.toolName !== 'computer.observe' || !message.toolResult) {
    return null
  }

  try {
    const parsed = asRecord(JSON.parse(message.toolResult))
    const path = asString(parsed?.path)
    if (!parsed || !path) return null
    return {
      observationId: asString(parsed.observationId),
      path,
      mimeType: asString(parsed.mimeType),
      width: asNumber(parsed.width),
      height: asNumber(parsed.height),
      originX: asNumber(parsed.originX),
      originY: asNumber(parsed.originY),
      capturedAt: asString(parsed.capturedAt),
      coordinateSystem: asString(parsed.coordinateSystem),
      foregroundWindow: parseForegroundWindow(parsed.foregroundWindow),
      cursor: parseCursor(parsed.cursor),
    }
  } catch {
    return null
  }
}

function buildComputerAction(
  toolName: string,
  payload: unknown,
  phase: ComputerActionPhase,
): ComputerActionResult | null {
  const record = asRecord(payload)
  const fields: ComputerActionResult['fields'] = []

  switch (toolName) {
    case 'computer.open_url': {
      if (!record) return null
      const url = asString(record.url)
      appendField(fields, 'URL', url)
      appendField(fields, 'Browser', asString(record.app) ?? 'default-browser')
      appendField(fields, 'Opened', formatBoolean(asBoolean(record.opened)))
      appendField(fields, 'Wait', formatNumber(asNumber(record.waitMs))?.concat(' ms'))
      return {
        title: phase === 'request' ? 'Open URL requested' : 'URL opened',
        summary:
          phase === 'request'
            ? 'Open in default browser'
            : asBoolean(record.opened)
              ? 'Default browser accepted the request'
              : 'Default browser',
        fields,
      }
    }
    case 'computer.launch_app': {
      if (!record) return null
      const app = asString(record.app) ?? asString(record.executable) ?? 'app'
      appendField(fields, 'App', app)
      appendField(fields, 'Executable', asString(record.executable))
      appendField(fields, 'Path', asString(record.path))
      appendField(fields, 'PID', formatNumber(asNumber(record.pid)))
      appendField(fields, 'Window', formatNumber(asNumber(record.hwnd)))
      appendField(fields, 'Focused', formatBoolean(asBoolean(record.focused)))
      appendField(fields, 'Focus verified', formatBoolean(asBoolean(record.focusVerified)))
      appendField(fields, 'Foreground window', formatNumber(asNumber(record.foregroundHwnd)))
      appendField(fields, 'Wait', formatNumber(asNumber(record.waitMs))?.concat(' ms'))
      return {
        title: phase === 'request' ? 'Launch app requested' : 'App launched',
        summary: `${app}${asBoolean(record.focused) ? ' focused' : ''}`,
        fields,
      }
    }
    case 'computer.focus_window': {
      if (!record) return null
      const target =
        asString(record.title) ??
        formatNumber(asNumber(record.hwnd)) ??
        formatNumber(asNumber(record.pid))
      appendField(fields, 'Title', asString(record.title))
      appendField(fields, 'Process', asString(record.processName))
      appendField(fields, 'Window', formatNumber(asNumber(record.hwnd)))
      appendField(fields, 'PID', formatNumber(asNumber(record.pid)))
      appendField(fields, 'Focused', formatBoolean(asBoolean(record.focused)))
      appendField(fields, 'Focus verified', formatBoolean(asBoolean(record.focusVerified)))
      appendField(fields, 'Foreground window', formatNumber(asNumber(record.foregroundHwnd)))
      return {
        title: phase === 'request' ? 'Focus window requested' : 'Window focused',
        summary:
          phase === 'request'
            ? target
              ? `Target ${target}`
              : 'Focus target requested'
            : asBoolean(record.focused)
              ? 'Foreground window updated'
              : 'Focus requested',
        fields,
      }
    }
    case 'computer.click': {
      if (!record) return null
      const x = asNumber(record.x)
      const y = asNumber(record.y)
      const button = asString(record.button) ?? 'left'
      const coordinates = x !== undefined && y !== undefined ? `${x}, ${y}` : undefined
      appendField(fields, 'Coordinates', coordinates)
      appendField(fields, 'Button', button)
      appendField(fields, 'Double click', formatBoolean(asBoolean(record.doubleClick)))
      return {
        title: phase === 'request' ? 'Mouse click requested' : 'Mouse clicked',
        summary: coordinates ? `${button} click at ${coordinates}` : `${button} click`,
        fields,
      }
    }
    case 'computer.move_mouse': {
      if (!record) return null
      const x = asNumber(record.x)
      const y = asNumber(record.y)
      const coordinates = x !== undefined && y !== undefined ? `${x}, ${y}` : undefined
      const durationMs = asNumber(record.durationMs)
      const steps = asNumber(record.steps)
      appendField(fields, 'Coordinates', coordinates)
      appendField(fields, 'Duration', formatNumber(durationMs)?.concat(' ms'))
      appendField(fields, 'Steps', formatNumber(steps))
      return {
        title: phase === 'request' ? 'Mouse move requested' : 'Mouse moved',
        summary: coordinates ? `Move to ${coordinates}` : 'Pointer moved',
        fields,
      }
    }
    case 'computer.drag': {
      if (!record) return null
      const fromX = asNumber(record.fromX)
      const fromY = asNumber(record.fromY)
      const toX = asNumber(record.toX)
      const toY = asNumber(record.toY)
      const start = fromX !== undefined && fromY !== undefined ? `${fromX}, ${fromY}` : undefined
      const end = toX !== undefined && toY !== undefined ? `${toX}, ${toY}` : undefined
      const button = asString(record.button) ?? 'left'
      const durationMs = asNumber(record.durationMs)
      const steps = asNumber(record.steps)
      appendField(fields, 'Start', start)
      appendField(fields, 'End', end)
      appendField(fields, 'Button', button)
      appendField(fields, 'Duration', formatNumber(durationMs)?.concat(' ms'))
      appendField(fields, 'Steps', formatNumber(steps))
      return {
        title: phase === 'request' ? 'Mouse drag requested' : 'Mouse dragged',
        summary: start && end ? `${button} drag ${start} to ${end}` : `${button} drag`,
        fields,
      }
    }
    case 'computer.type_text': {
      if (!record) return null
      const text = asString(record.text)
      const chars = asNumber(record.chars) ?? text?.length
      const pasted = asBoolean(record.paste)
      const clipboardRestoreValue =
        pasted === false
          ? undefined
          : phase === 'request'
            ? (asBoolean(record.restoreClipboard) ?? true)
            : asBoolean(record.clipboardRestored)
      appendField(fields, 'Text', formatTextPreview(record.text))
      appendField(fields, 'Characters', formatNumber(chars))
      appendField(fields, 'Input method', pasted === false ? 'SendKeys typing' : 'Clipboard paste')
      appendField(
        fields,
        phase === 'request' ? 'Restore clipboard' : 'Clipboard restored',
        formatBoolean(clipboardRestoreValue),
      )
      return {
        title: phase === 'request' ? 'Text entry requested' : 'Text entered',
        summary: chars !== undefined ? `${chars} characters` : 'Text sent to focused app',
        fields,
      }
    }
    case 'computer.hotkey': {
      if (!record) return null
      const keys = formatStringList(record.keys)
      appendField(fields, 'Keys', keys)
      appendField(fields, 'SendKeys', asString(record.sequence))
      return {
        title: phase === 'request' ? 'Hotkey requested' : 'Hotkey sent',
        summary: keys ?? 'Shortcut sent to focused app',
        fields,
      }
    }
    case 'computer.scroll': {
      if (!record) return null
      const x = asNumber(record.x)
      const y = asNumber(record.y)
      const coordinates = x !== undefined && y !== undefined ? `${x}, ${y}` : undefined
      const deltaY = asNumber(record.deltaY)
      appendField(fields, 'Coordinates', coordinates)
      appendField(fields, 'Delta Y', formatNumber(deltaY))
      return {
        title: phase === 'request' ? 'Scroll requested' : 'Mouse scrolled',
        summary: deltaY !== undefined ? `Wheel delta ${deltaY}` : 'Scroll event sent',
        fields,
      }
    }
    case 'computer.wait': {
      if (!record) return null
      const waitedMs = asNumber(record.waitedMs) ?? asNumber(record.ms)
      appendField(fields, 'Duration', formatNumber(waitedMs)?.concat(' ms'))
      appendField(
        fields,
        'Next',
        phase === 'request' ? 'Observe after wait' : 'Ready to observe again',
      )
      return {
        title: phase === 'request' ? 'Wait requested' : 'Wait completed',
        summary: waitedMs !== undefined ? `${waitedMs} ms` : 'Delay completed',
        fields,
      }
    }
    case 'computer.observe': {
      if (!record || phase !== 'request') return null
      appendField(fields, 'Note', asString(record.note))
      return {
        title: 'Screenshot requested',
        summary: asString(record.note) ?? 'Capture the current desktop',
        fields,
      }
    }
    case 'computer.list_windows': {
      if (phase === 'request') {
        return {
          title: 'Window list requested',
          summary: 'Read visible desktop windows',
          fields,
        }
      }
      if (!Array.isArray(payload)) return null
      const visibleWindows = payload
        .map(asRecord)
        .filter((item): item is Record<string, unknown> => Boolean(item))
      const firstWindow = visibleWindows[0]
      appendField(fields, 'Visible windows', String(visibleWindows.length))
      appendField(fields, 'First match', asString(firstWindow?.title))
      return {
        title: 'Windows listed',
        summary: `${visibleWindows.length} visible window${visibleWindows.length === 1 ? '' : 's'}`,
        fields,
      }
    }
    default:
      return null
  }
}

function parseComputerActionInput(message: Message): ComputerActionResult | null {
  if (!message.toolName?.startsWith('computer.') || !message.toolInput) {
    return null
  }

  return buildComputerAction(message.toolName, message.toolInput, 'request')
}

function parseComputerActionResult(message: Message): ComputerActionResult | null {
  if (
    !message.toolName?.startsWith('computer.') ||
    message.toolName === 'computer.observe' ||
    !message.toolResult
  ) {
    return null
  }

  try {
    const parsed = JSON.parse(message.toolResult)
    return buildComputerAction(message.toolName, parsed, 'result')
  } catch {
    return null
  }
}

function parseComputerWindowEntry(value: unknown): ComputerWindowEntry | null {
  const record = asRecord(value)
  if (!record) return null
  const entry = {
    hwnd: asNumber(record.hwnd),
    pid: asNumber(record.pid),
    processName: asString(record.processName),
    title: asString(record.title),
    bounds: parseObservationRect(record.bounds),
    foreground: asBoolean(record.foreground),
  }
  return entry.hwnd !== undefined ||
    entry.pid !== undefined ||
    entry.processName ||
    entry.title ||
    entry.bounds ||
    entry.foreground !== undefined
    ? entry
    : null
}

function parseComputerWindowListResult(message: Message): ComputerWindowListResult | null {
  if (message.toolName !== 'computer.list_windows' || !message.toolResult) {
    return null
  }

  try {
    const parsed = JSON.parse(message.toolResult)
    if (!Array.isArray(parsed)) return null
    return {
      windows: parsed
        .map(parseComputerWindowEntry)
        .filter((window): window is ComputerWindowEntry => Boolean(window)),
    }
  } catch {
    return null
  }
}

function getComputerObservationMarkerStyle(
  observation: ComputerObservationResult,
  point: ComputerObservationCoordinate | undefined,
): React.CSSProperties | null {
  const width = observation.width
  const height = observation.height
  if (!width || !height || !point) {
    return null
  }

  const originX = observation.originX ?? 0
  const originY = observation.originY ?? 0
  const relativeX = point.x - originX
  const relativeY = point.y - originY
  if (relativeX < 0 || relativeY < 0 || relativeX > width || relativeY > height) {
    return null
  }

  return {
    left: `${(relativeX / width) * 100}%`,
    top: `${(relativeY / height) * 100}%`,
  }
}

function getComputerObservationCoordinateFromPoint(
  observation: ComputerObservationResult,
  rect: DOMRect,
  clientX: number,
  clientY: number,
): ComputerObservationCoordinate | null {
  const width = observation.width
  const height = observation.height
  if (!width || !height || rect.width <= 0 || rect.height <= 0) {
    return null
  }

  const relativeClientX = clientX - rect.left
  const relativeClientY = clientY - rect.top
  if (
    relativeClientX < 0 ||
    relativeClientY < 0 ||
    relativeClientX > rect.width ||
    relativeClientY > rect.height
  ) {
    return null
  }

  const originX = observation.originX ?? 0
  const originY = observation.originY ?? 0
  const relativeX = Math.min(
    width - 1,
    Math.max(0, Math.round((relativeClientX / rect.width) * width)),
  )
  const relativeY = Math.min(
    height - 1,
    Math.max(0, Math.round((relativeClientY / rect.height) * height)),
  )

  return {
    x: originX + relativeX,
    y: originY + relativeY,
  }
}

function buildComputerObservationClickInputText(
  coordinate: ComputerObservationCoordinate | null,
  clickAction: ComputerObservationClickAction,
): string | undefined {
  if (!coordinate) return undefined

  return JSON.stringify({
    x: coordinate.x,
    y: coordinate.y,
    button: clickAction === 'right' ? 'right' : 'left',
    ...(clickAction === 'double' ? { doubleClick: true } : {}),
  })
}

function buildComputerObservationMoveInputText(
  coordinate: ComputerObservationCoordinate | null,
): string | undefined {
  if (!coordinate) return undefined

  return JSON.stringify({
    x: coordinate.x,
    y: coordinate.y,
  })
}

function buildComputerObservationDragInputText(
  start: ComputerObservationCoordinate | null,
  end: ComputerObservationCoordinate | null,
): string | undefined {
  if (!start || !end) return undefined

  return JSON.stringify({
    fromX: start.x,
    fromY: start.y,
    toX: end.x,
    toY: end.y,
  })
}

function buildComputerObservationScrollInputText(
  coordinate: ComputerObservationCoordinate | null,
  scrollAction: ComputerObservationScrollAction,
): string | undefined {
  if (!coordinate) return undefined

  return JSON.stringify({
    x: coordinate.x,
    y: coordinate.y,
    deltaY: scrollAction === 'down' ? -600 : 600,
  })
}

function buildComputerObservationHotkeyInputText(
  hotkeyAction: ComputerObservationHotkeyAction,
): string {
  const action = COMPUTER_OBSERVATION_HOTKEY_ACTIONS.find(
    (candidate) => candidate.value === hotkeyAction,
  )

  return JSON.stringify({ keys: action?.keys ?? ['ENTER'] })
}

function buildComputerObservationTypeInputText(text: string): string | undefined {
  if (!text.trim()) return undefined
  return JSON.stringify({ text, paste: true })
}

function buildComputerObservationWaitInputText(waitMsInput: string): string | undefined {
  if (!waitMsInput.trim()) return undefined
  const waitMs = Number(waitMsInput)
  if (!Number.isFinite(waitMs)) return undefined
  return JSON.stringify({
    ms: Math.max(0, Math.min(30_000, Math.trunc(waitMs))),
  })
}

function buildComputerObservationInstructionText(
  toolName:
    | 'computer.move_mouse'
    | 'computer.drag'
    | 'computer.click'
    | 'computer.scroll'
    | 'computer.hotkey'
    | 'computer.type_text'
    | 'computer.wait',
  inputText: string | undefined,
): string | undefined {
  return inputText
    ? `Use ${toolName} with ${inputText}, then use computer.observe again.`
    : undefined
}

function buildComputerWindowFocusInputText(windowEntry: ComputerWindowEntry): string | undefined {
  if (windowEntry.hwnd !== undefined) {
    return JSON.stringify({ hwnd: windowEntry.hwnd })
  }
  if (windowEntry.pid !== undefined) {
    return JSON.stringify({ pid: windowEntry.pid })
  }
  if (windowEntry.title) {
    return JSON.stringify({ title: windowEntry.title })
  }
  return undefined
}

function buildComputerWindowFocusInstructionText(
  windowEntry: ComputerWindowEntry,
): string | undefined {
  const inputText = buildComputerWindowFocusInputText(windowEntry)
  return inputText
    ? `Use computer.focus_window with ${inputText}, then use computer.observe again.`
    : undefined
}

function formatComputerWindowTitle(
  windowEntry: ComputerWindowEntry,
  untitledLabel = 'Untitled window',
): string {
  return (
    windowEntry.title ??
    windowEntry.processName ??
    (windowEntry.pid !== undefined ? `pid ${windowEntry.pid}` : untitledLabel)
  )
}

function formatComputerWindowMeta(windowEntry: ComputerWindowEntry): string | undefined {
  const meta = [
    windowEntry.processName,
    windowEntry.pid !== undefined ? `pid ${windowEntry.pid}` : '',
    windowEntry.hwnd !== undefined ? `hwnd ${windowEntry.hwnd}` : '',
    windowEntry.bounds ? `bounds ${formatObservationBounds(windowEntry.bounds)}` : '',
  ].filter(Boolean)
  return meta.length > 0 ? meta.join(', ') : undefined
}

function ComputerObservationCard({ observation }: { observation: ComputerObservationResult }) {
  const { locale } = useLocale()
  const copy = TOOL_CARD_COPY[locale] ?? TOOL_CARD_COPY.en
  const clickActions = buildComputerObservationClickActions(copy)
  const scrollActions = buildComputerObservationScrollActions(copy)
  const hotkeyActions = buildComputerObservationHotkeyActions(copy)
  const [previewSrc, setPreviewSrc] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [selectedCoordinate, setSelectedCoordinate] =
    useState<ComputerObservationCoordinate | null>(null)
  const [dragStartCoordinate, setDragStartCoordinate] =
    useState<ComputerObservationCoordinate | null>(null)
  const [dragEndCoordinate, setDragEndCoordinate] = useState<ComputerObservationCoordinate | null>(
    null,
  )
  const [selectedClickAction, setSelectedClickAction] =
    useState<ComputerObservationClickAction>('left')
  const [selectedScrollAction, setSelectedScrollAction] =
    useState<ComputerObservationScrollAction>('down')
  const [selectedHotkeyAction, setSelectedHotkeyAction] =
    useState<ComputerObservationHotkeyAction>('enter')
  const [typeText, setTypeText] = useState(COMPUTER_OBSERVATION_DEFAULT_TYPE_TEXT)
  const [waitMsInput, setWaitMsInput] = useState(COMPUTER_OBSERVATION_DEFAULT_WAIT_MS)
  const [copiedPayload, setCopiedPayload] = useState<ComputerObservationCopyKind | null>(null)
  useModalViewportLock(previewOpen)
  const size =
    observation.width && observation.height
      ? `${observation.width} x ${observation.height}`
      : copy.unknownSize
  const origin =
    observation.originX !== undefined && observation.originY !== undefined
      ? `${observation.originX}, ${observation.originY}`
      : '0, 0'
  const foregroundWindow = observation.foregroundWindow
    ? formatObservationForegroundWindow(observation.foregroundWindow, copy.untitledWindow)
    : undefined
  const foregroundBounds = observation.foregroundWindow?.bounds
    ? formatObservationBounds(observation.foregroundWindow.bounds)
    : undefined
  const cursorCoordinate =
    observation.cursor?.x !== undefined && observation.cursor.y !== undefined
      ? { x: observation.cursor.x, y: observation.cursor.y }
      : undefined
  const cursor = cursorCoordinate ? `${cursorCoordinate.x}, ${cursorCoordinate.y}` : undefined
  const cursorMarkerStyle = getComputerObservationMarkerStyle(observation, cursorCoordinate)
  const selectedCoordinateText = selectedCoordinate
    ? `${selectedCoordinate.x}, ${selectedCoordinate.y}`
    : undefined
  const dragStartText = dragStartCoordinate
    ? `${dragStartCoordinate.x}, ${dragStartCoordinate.y}`
    : undefined
  const dragEndText = dragEndCoordinate
    ? `${dragEndCoordinate.x}, ${dragEndCoordinate.y}`
    : undefined
  const selectedClickInputText = buildComputerObservationClickInputText(
    selectedCoordinate,
    selectedClickAction,
  )
  const selectedMoveInputText = buildComputerObservationMoveInputText(selectedCoordinate)
  const selectedMoveInstructionText = buildComputerObservationInstructionText(
    'computer.move_mouse',
    selectedMoveInputText,
  )
  const selectedDragInputText = buildComputerObservationDragInputText(
    dragStartCoordinate,
    dragEndCoordinate,
  )
  const selectedDragInstructionText = buildComputerObservationInstructionText(
    'computer.drag',
    selectedDragInputText,
  )
  const selectedClickInstructionText = buildComputerObservationInstructionText(
    'computer.click',
    selectedClickInputText,
  )
  const selectedScrollInputText = buildComputerObservationScrollInputText(
    selectedCoordinate,
    selectedScrollAction,
  )
  const selectedScrollInstructionText = buildComputerObservationInstructionText(
    'computer.scroll',
    selectedScrollInputText,
  )
  const selectedHotkeyInputText = buildComputerObservationHotkeyInputText(selectedHotkeyAction)
  const selectedHotkeyInstructionText = buildComputerObservationInstructionText(
    'computer.hotkey',
    selectedHotkeyInputText,
  )
  const typeInputText = buildComputerObservationTypeInputText(typeText)
  const typeInstructionText = buildComputerObservationInstructionText(
    'computer.type_text',
    typeInputText,
  )
  const waitInputText = buildComputerObservationWaitInputText(waitMsInput)
  const waitInstructionText = buildComputerObservationInstructionText(
    'computer.wait',
    waitInputText,
  )
  const selectedMarkerStyle = getComputerObservationMarkerStyle(
    observation,
    selectedCoordinate ?? undefined,
  )

  useEffect(() => {
    let active = true
    setPreviewSrc(null)
    setPreviewOpen(false)
    setSelectedCoordinate(null)
    setDragStartCoordinate(null)
    setDragEndCoordinate(null)
    setSelectedClickAction('left')
    setSelectedScrollAction('down')
    setSelectedHotkeyAction('enter')
    setTypeText(COMPUTER_OBSERVATION_DEFAULT_TYPE_TEXT)
    setWaitMsInput(COMPUTER_OBSERVATION_DEFAULT_WAIT_MS)
    setCopiedPayload(null)
    const loadImage = window.sepilot?.computerObservationImage
    if (!loadImage)
      return () => {
        active = false
      }

    void loadImage(observation.path)
      .then((src) => {
        if (active) setPreviewSrc(src)
      })
      .catch(() => {
        if (active) setPreviewSrc(null)
      })

    return () => {
      active = false
    }
  }, [observation.path])

  useEffect(() => {
    if (!previewOpen) return undefined

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [previewOpen])

  useEffect(() => {
    setCopiedPayload(null)
  }, [
    selectedClickAction,
    selectedCoordinateText,
    selectedHotkeyAction,
    selectedScrollAction,
    typeText,
    waitMsInput,
  ])

  useEffect(() => {
    if (!copiedPayload) return undefined
    const timeout = window.setTimeout(() => setCopiedPayload(null), 1600)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [copiedPayload])

  const handleLightboxImageClick = (event: React.MouseEvent<HTMLSpanElement>) => {
    event.stopPropagation()
    const coordinate = getComputerObservationCoordinateFromPoint(
      observation,
      event.currentTarget.getBoundingClientRect(),
      event.clientX,
      event.clientY,
    )
    if (coordinate) {
      setSelectedCoordinate(coordinate)
    }
  }

  const handleCopyObservationPayload = async (
    event: React.MouseEvent<HTMLButtonElement>,
    value: string | undefined,
    kind: ComputerObservationCopyKind,
  ) => {
    event.stopPropagation()
    if (!value || !navigator.clipboard?.writeText) {
      return
    }

    try {
      await navigator.clipboard.writeText(value)
      setCopiedPayload(kind)
    } catch {
      setCopiedPayload(null)
    }
  }

  const handleInsertObservationInstruction = (
    event: React.MouseEvent<HTMLButtonElement>,
    value: string | undefined,
    kind: ComputerObservationCopyKind,
  ) => {
    event.stopPropagation()
    if (!value) return

    window.dispatchEvent(
      new CustomEvent('sepilot:insert-composer-text', {
        detail: { text: value },
      }),
    )
    setCopiedPayload(kind)
  }

  const handleSetDragCoordinate = (
    event: React.MouseEvent<HTMLButtonElement>,
    slot: 'start' | 'end',
  ) => {
    event.stopPropagation()
    if (!selectedCoordinate) return

    const coordinate = {
      x: selectedCoordinate.x,
      y: selectedCoordinate.y,
    }
    if (slot === 'start') {
      setDragStartCoordinate(coordinate)
      setCopiedPayload('drag-start')
    } else {
      setDragEndCoordinate(coordinate)
      setCopiedPayload('drag-end')
    }
  }

  return (
    <div className="message-computer-observation">
      <div className="message-computer-observation-head">
        <span>{copy.screenshotCaptured}</span>
        <strong>{size}</strong>
      </div>
      {previewSrc ? (
        <>
          <button
            type="button"
            className="message-computer-observation-preview"
            aria-label={copy.openScreenshotAria}
            onClick={() => setPreviewOpen(true)}
          >
            <span className="message-computer-observation-image-frame">
              <img
                className="message-computer-observation-image"
                src={previewSrc}
                alt={copy.screenshotAlt}
              />
              {cursorMarkerStyle ? (
                <span
                  className="message-computer-observation-cursor-marker"
                  data-testid="computer-observation-cursor-marker"
                  aria-hidden="true"
                  style={cursorMarkerStyle}
                />
              ) : null}
              {selectedMarkerStyle ? (
                <span
                  className="message-computer-observation-cursor-marker message-computer-observation-selected-marker"
                  data-testid="computer-observation-selected-marker"
                  aria-hidden="true"
                  style={selectedMarkerStyle}
                />
              ) : null}
            </span>
          </button>
          {previewOpen ? (
            <div
              className="message-computer-observation-lightbox"
              role="dialog"
              aria-modal="true"
              aria-label={copy.previewAria}
              onClick={() => setPreviewOpen(false)}
            >
              <button
                type="button"
                className="message-computer-observation-lightbox-close"
                aria-label={copy.closePreviewAria}
                onClick={() => setPreviewOpen(false)}
              >
                <X className="shell-icon" />
              </button>
              <span
                className="message-computer-observation-lightbox-frame"
                onClick={handleLightboxImageClick}
              >
                <img
                  className="message-computer-observation-lightbox-image"
                  src={previewSrc}
                  alt={copy.screenshotEnlargedAlt}
                />
                {cursorMarkerStyle ? (
                  <span
                    className="message-computer-observation-cursor-marker"
                    data-testid="computer-observation-cursor-marker"
                    aria-hidden="true"
                    style={cursorMarkerStyle}
                  />
                ) : null}
                {selectedMarkerStyle ? (
                  <span
                    className="message-computer-observation-cursor-marker message-computer-observation-selected-marker"
                    data-testid="computer-observation-selected-marker"
                    aria-hidden="true"
                    style={selectedMarkerStyle}
                  />
                ) : null}
              </span>
              <div
                className="message-computer-observation-coordinate-readout"
                data-testid="computer-observation-coordinate-readout"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="message-computer-observation-coordinate-copy">
                  <span>
                    {selectedCoordinateText ? copy.selectedCoordinate : copy.focusedActions}
                  </span>
                  <strong>{selectedCoordinateText ?? copy.noCoordinate}</strong>
                </div>
                <div className="message-computer-observation-drag-points">
                  <span>
                    {copy.dragStart} <strong>{dragStartText ?? '-'}</strong>
                  </span>
                  <span>
                    {copy.dragEnd} <strong>{dragEndText ?? '-'}</strong>
                  </span>
                </div>
                <div
                  className="message-computer-observation-action-mode"
                  role="toolbar"
                  aria-label={copy.clickActionTypeAria}
                >
                  {clickActions.map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      className={selectedClickAction === action.value ? 'active' : ''}
                      aria-label={action.ariaLabel}
                      aria-pressed={selectedClickAction === action.value}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedClickAction(action.value)
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <div
                  className="message-computer-observation-action-mode"
                  role="toolbar"
                  aria-label={copy.scrollActionTypeAria}
                >
                  {scrollActions.map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      className={selectedScrollAction === action.value ? 'active' : ''}
                      aria-label={action.ariaLabel}
                      aria-pressed={selectedScrollAction === action.value}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedScrollAction(action.value)
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <div
                  className="message-computer-observation-action-mode"
                  role="toolbar"
                  aria-label={copy.keyboardActionTypeAria}
                >
                  {hotkeyActions.map((action) => (
                    <button
                      key={action.value}
                      type="button"
                      className={selectedHotkeyAction === action.value ? 'active' : ''}
                      aria-label={action.ariaLabel}
                      aria-pressed={selectedHotkeyAction === action.value}
                      onClick={(event) => {
                        event.stopPropagation()
                        setSelectedHotkeyAction(action.value)
                      }}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
                <input
                  className="message-computer-observation-type-input"
                  type="text"
                  aria-label={copy.textInputAria}
                  value={typeText}
                  onChange={(event) => setTypeText(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                />
                <input
                  className="message-computer-observation-type-input"
                  type="number"
                  min="0"
                  max="30000"
                  step="100"
                  aria-label={copy.waitDurationAria}
                  value={waitMsInput}
                  onChange={(event) => setWaitMsInput(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                />
                <div className="message-computer-observation-coordinate-actions">
                  <button
                    type="button"
                    className={
                      copiedPayload === 'coordinate'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'coordinate'
                        ? copy.selectedCoordinateCopied
                        : copy.copySelectedCoordinate
                    }
                    title={
                      copiedPayload === 'coordinate'
                        ? copy.selectedCoordinateCopied
                        : copy.copySelectedCoordinate
                    }
                    disabled={!selectedCoordinateText}
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, selectedCoordinateText, 'coordinate')
                    }}
                  >
                    {copiedPayload === 'coordinate' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Copy className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'move'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'move' ? copy.moveActionCopied : copy.copyMoveAction
                    }
                    title={copiedPayload === 'move' ? 'Move action copied' : 'Copy move action'}
                    disabled={!selectedMoveInputText}
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, selectedMoveInputText, 'move')
                    }}
                  >
                    {copiedPayload === 'move' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Move className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'drag-start'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'drag-start' ? 'Drag start set' : 'Set drag start'
                    }
                    title={copiedPayload === 'drag-start' ? 'Drag start set' : 'Set drag start'}
                    disabled={!selectedCoordinate}
                    onClick={(event) => handleSetDragCoordinate(event, 'start')}
                  >
                    {copiedPayload === 'drag-start' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Move className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'drag-end'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={copiedPayload === 'drag-end' ? 'Drag end set' : 'Set drag end'}
                    title={copiedPayload === 'drag-end' ? 'Drag end set' : 'Set drag end'}
                    disabled={!selectedCoordinate}
                    onClick={(event) => handleSetDragCoordinate(event, 'end')}
                  >
                    {copiedPayload === 'drag-end' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Move className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'drag'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'drag' ? 'Drag action copied' : 'Copy drag action'
                    }
                    title={copiedPayload === 'drag' ? 'Drag action copied' : 'Copy drag action'}
                    disabled={!selectedDragInputText}
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, selectedDragInputText, 'drag')
                    }}
                  >
                    {copiedPayload === 'drag' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Move className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'click'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'click' ? 'Click action copied' : 'Copy click action'
                    }
                    title={copiedPayload === 'click' ? 'Click action copied' : 'Copy click action'}
                    disabled={!selectedClickInputText}
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, selectedClickInputText, 'click')
                    }}
                  >
                    {copiedPayload === 'click' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MousePointerClick className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'scroll'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'scroll' ? 'Scroll action copied' : 'Copy scroll action'
                    }
                    title={
                      copiedPayload === 'scroll' ? 'Scroll action copied' : 'Copy scroll action'
                    }
                    disabled={!selectedScrollInputText}
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, selectedScrollInputText, 'scroll')
                    }}
                  >
                    {copiedPayload === 'scroll' ? (
                      <Check className="shell-icon" />
                    ) : selectedScrollAction === 'down' ? (
                      <ArrowDown className="shell-icon" />
                    ) : (
                      <ArrowUp className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'hotkey'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'hotkey' ? 'Hotkey action copied' : 'Copy hotkey action'
                    }
                    title={
                      copiedPayload === 'hotkey' ? 'Hotkey action copied' : 'Copy hotkey action'
                    }
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, selectedHotkeyInputText, 'hotkey')
                    }}
                  >
                    {copiedPayload === 'hotkey' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Keyboard className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'type'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'type' ? 'Text action copied' : 'Copy text action'
                    }
                    title={copiedPayload === 'type' ? 'Text action copied' : 'Copy text action'}
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, typeInputText, 'type')
                    }}
                  >
                    {copiedPayload === 'type' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Type className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'wait'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'wait' ? 'Wait action copied' : 'Copy wait action'
                    }
                    title={copiedPayload === 'wait' ? 'Wait action copied' : 'Copy wait action'}
                    onClick={(event) => {
                      void handleCopyObservationPayload(event, waitInputText, 'wait')
                    }}
                  >
                    {copiedPayload === 'wait' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Clock className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'insert-move'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'insert-move'
                        ? 'Move instruction inserted'
                        : 'Insert move instruction'
                    }
                    title={
                      copiedPayload === 'insert-move'
                        ? 'Move instruction inserted'
                        : 'Insert move instruction'
                    }
                    disabled={!selectedMoveInstructionText}
                    onClick={(event) =>
                      handleInsertObservationInstruction(
                        event,
                        selectedMoveInstructionText,
                        'insert-move',
                      )
                    }
                  >
                    {copiedPayload === 'insert-move' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'insert-drag'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'insert-drag'
                        ? 'Drag instruction inserted'
                        : 'Insert drag instruction'
                    }
                    title={
                      copiedPayload === 'insert-drag'
                        ? 'Drag instruction inserted'
                        : 'Insert drag instruction'
                    }
                    disabled={!selectedDragInstructionText}
                    onClick={(event) =>
                      handleInsertObservationInstruction(
                        event,
                        selectedDragInstructionText,
                        'insert-drag',
                      )
                    }
                  >
                    {copiedPayload === 'insert-drag' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'insert'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'insert'
                        ? 'Click instruction inserted'
                        : 'Insert click instruction'
                    }
                    title={
                      copiedPayload === 'insert'
                        ? 'Click instruction inserted'
                        : 'Insert click instruction'
                    }
                    disabled={!selectedClickInstructionText}
                    onClick={(event) =>
                      handleInsertObservationInstruction(
                        event,
                        selectedClickInstructionText,
                        'insert',
                      )
                    }
                  >
                    {copiedPayload === 'insert' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'insert-scroll'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'insert-scroll'
                        ? 'Scroll instruction inserted'
                        : 'Insert scroll instruction'
                    }
                    title={
                      copiedPayload === 'insert-scroll'
                        ? 'Scroll instruction inserted'
                        : 'Insert scroll instruction'
                    }
                    disabled={!selectedScrollInstructionText}
                    onClick={(event) =>
                      handleInsertObservationInstruction(
                        event,
                        selectedScrollInstructionText,
                        'insert-scroll',
                      )
                    }
                  >
                    {copiedPayload === 'insert-scroll' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'insert-hotkey'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'insert-hotkey'
                        ? 'Hotkey instruction inserted'
                        : 'Insert hotkey instruction'
                    }
                    title={
                      copiedPayload === 'insert-hotkey'
                        ? 'Hotkey instruction inserted'
                        : 'Insert hotkey instruction'
                    }
                    onClick={(event) =>
                      handleInsertObservationInstruction(
                        event,
                        selectedHotkeyInstructionText,
                        'insert-hotkey',
                      )
                    }
                  >
                    {copiedPayload === 'insert-hotkey' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'insert-type'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'insert-type'
                        ? 'Text instruction inserted'
                        : 'Insert text instruction'
                    }
                    title={
                      copiedPayload === 'insert-type'
                        ? 'Text instruction inserted'
                        : 'Insert text instruction'
                    }
                    onClick={(event) =>
                      handleInsertObservationInstruction(event, typeInstructionText, 'insert-type')
                    }
                  >
                    {copiedPayload === 'insert-type' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === 'insert-wait'
                        ? 'message-computer-observation-coordinate-copy-button copied'
                        : 'message-computer-observation-coordinate-copy-button'
                    }
                    aria-label={
                      copiedPayload === 'insert-wait'
                        ? 'Wait instruction inserted'
                        : 'Insert wait instruction'
                    }
                    title={
                      copiedPayload === 'insert-wait'
                        ? 'Wait instruction inserted'
                        : 'Insert wait instruction'
                    }
                    onClick={(event) =>
                      handleInsertObservationInstruction(event, waitInstructionText, 'insert-wait')
                    }
                  >
                    {copiedPayload === 'insert-wait' ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <dl className="message-computer-observation-grid">
        {observation.observationId ? (
          <>
            <dt>{copy.observation}</dt>
            <dd>{observation.observationId}</dd>
          </>
        ) : null}
        <dt>{copy.origin}</dt>
        <dd>{origin}</dd>
        <dt>{copy.coordinates}</dt>
        <dd>{observation.coordinateSystem ?? 'absolute-screen-pixels'}</dd>
        {foregroundWindow ? (
          <>
            <dt>{copy.foreground}</dt>
            <dd>{foregroundWindow}</dd>
          </>
        ) : null}
        {foregroundBounds ? (
          <>
            <dt>{copy.windowBounds}</dt>
            <dd>{foregroundBounds}</dd>
          </>
        ) : null}
        {cursor ? (
          <>
            <dt>{copy.cursorLabel}</dt>
            <dd>{cursor}</dd>
          </>
        ) : null}
        {selectedCoordinateText ? (
          <>
            <dt>{copy.selected}</dt>
            <dd>{selectedCoordinateText}</dd>
          </>
        ) : null}
        {observation.capturedAt ? (
          <>
            <dt>{copy.captured}</dt>
            <dd>{observation.capturedAt}</dd>
          </>
        ) : null}
        {observation.mimeType ? (
          <>
            <dt>{copy.typeMime}</dt>
            <dd>{observation.mimeType}</dd>
          </>
        ) : null}
      </dl>
      <div className="message-computer-observation-path">
        <span>{copy.screenshotFile}</span>
        <code>{observation.path}</code>
      </div>
    </div>
  )
}

function formatObservationForegroundWindow(
  foregroundWindow: NonNullable<ComputerObservationResult['foregroundWindow']>,
  untitledLabel = 'Untitled window',
): string {
  const title = foregroundWindow.title ?? untitledLabel
  const meta = [
    foregroundWindow.processName,
    foregroundWindow.pid !== undefined ? `pid ${foregroundWindow.pid}` : '',
    foregroundWindow.hwnd !== undefined ? `hwnd ${foregroundWindow.hwnd}` : '',
  ].filter(Boolean)
  return meta.length > 0 ? `${title} (${meta.join(', ')})` : title
}

function formatObservationBounds(bounds: ComputerObservationRect): string {
  return `${bounds.x}, ${bounds.y}, ${bounds.width} x ${bounds.height}`
}

function ComputerWindowListCard({ windowList }: { windowList: ComputerWindowListResult }) {
  const { locale } = useLocale()
  const copy = TOOL_CARD_COPY[locale] ?? TOOL_CARD_COPY.en
  const [copiedPayload, setCopiedPayload] = useState<string | null>(null)
  const visibleWindows = windowList.windows.slice(0, COMPUTER_WINDOW_LIST_PREVIEW_LIMIT)
  const summary = copy.visibleWindowSuffix(windowList.windows.length)

  useEffect(() => {
    if (!copiedPayload) return undefined
    const timeout = window.setTimeout(() => setCopiedPayload(null), 1600)
    return () => {
      window.clearTimeout(timeout)
    }
  }, [copiedPayload])

  const handleCopyWindowPayload = async (
    event: React.MouseEvent<HTMLButtonElement>,
    value: string | undefined,
    key: string,
  ) => {
    event.stopPropagation()
    if (!value || !navigator.clipboard?.writeText) return

    try {
      await navigator.clipboard.writeText(value)
      setCopiedPayload(key)
    } catch {
      setCopiedPayload(null)
    }
  }

  const handleInsertWindowInstruction = (
    event: React.MouseEvent<HTMLButtonElement>,
    value: string | undefined,
    key: string,
  ) => {
    event.stopPropagation()
    if (!value) return

    window.dispatchEvent(
      new CustomEvent('sepilot:insert-composer-text', {
        detail: { text: value },
      }),
    )
    setCopiedPayload(key)
  }

  return (
    <div className="message-computer-observation message-computer-action">
      <div className="message-computer-observation-head">
        <span>{copy.windowsListed}</span>
        <strong>{summary}</strong>
      </div>
      {visibleWindows.length > 0 ? (
        <div className="message-computer-window-list">
          {visibleWindows.map((windowEntry, index) => {
            const focusInputText = buildComputerWindowFocusInputText(windowEntry)
            const focusInstructionText = buildComputerWindowFocusInstructionText(windowEntry)
            const copyKey = `copy-window-${index}`
            const insertKey = `insert-window-${index}`
            const meta = formatComputerWindowMeta(windowEntry)
            return (
              <div
                key={`${windowEntry.hwnd ?? windowEntry.pid ?? windowEntry.title ?? index}:${index}`}
                className="message-computer-window-row"
              >
                <div className="message-computer-window-copy">
                  <div className="message-computer-window-title">
                    <strong>{formatComputerWindowTitle(windowEntry, copy.untitledWindow)}</strong>
                    {windowEntry.foreground ? (
                      <span className="message-computer-window-badge">{copy.foreground}</span>
                    ) : null}
                  </div>
                  {meta ? <span className="message-computer-window-meta">{meta}</span> : null}
                </div>
                <div className="message-computer-window-actions">
                  <button
                    type="button"
                    className={
                      copiedPayload === copyKey
                        ? 'message-computer-window-action copied'
                        : 'message-computer-window-action'
                    }
                    aria-label={
                      copiedPayload === copyKey ? copy.focusActionCopied : copy.copyFocusAction
                    }
                    title={
                      copiedPayload === copyKey ? copy.focusActionCopied : copy.copyFocusAction
                    }
                    onClick={(event) => {
                      void handleCopyWindowPayload(event, focusInputText, copyKey)
                    }}
                  >
                    {copiedPayload === copyKey ? (
                      <Check className="shell-icon" />
                    ) : (
                      <Copy className="shell-icon" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={
                      copiedPayload === insertKey
                        ? 'message-computer-window-action copied'
                        : 'message-computer-window-action'
                    }
                    aria-label={
                      copiedPayload === insertKey
                        ? copy.focusInstructionInserted
                        : copy.insertFocusInstruction
                    }
                    title={
                      copiedPayload === insertKey
                        ? copy.focusInstructionInserted
                        : copy.insertFocusInstruction
                    }
                    onClick={(event) =>
                      handleInsertWindowInstruction(event, focusInstructionText, insertKey)
                    }
                  >
                    {copiedPayload === insertKey ? (
                      <Check className="shell-icon" />
                    ) : (
                      <MessageSquarePlus className="shell-icon" />
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="message-computer-window-empty">{copy.noVisibleWindows}</div>
      )}
      {windowList.windows.length > visibleWindows.length ? (
        <div className="message-computer-window-empty">
          {copy.showingNofM(visibleWindows.length, windowList.windows.length)}
        </div>
      ) : null}
    </div>
  )
}

function AppMutationCard({ mutation, copy }: { mutation: AppMutationDisplay; copy: ToolCardCopy }) {
  const appLabel =
    [mutation.appTitle, mutation.appId].filter(Boolean).join(' · ') || copy.appMutationUnknownApp
  const title = mutation.failed
    ? copy.appMutationFailedResult
    : mutation.phase === 'result'
      ? mutation.dryRun
        ? copy.appMutationPreviewResult
        : mutation.written
          ? copy.appMutationWrittenResult
          : copy.appMutationPreviewResult
      : mutation.dryRun
        ? copy.appMutationPreviewRequest
        : copy.appMutationRequest
  const mode =
    mutation.phase === 'request'
      ? mutation.dryRun
        ? copy.appMutationDryRun
        : copy.appMutationApply
      : mutation.written
        ? copy.appMutationWritten
        : copy.appMutationNotWritten

  return (
    <div className="message-computer-observation message-app-mutation">
      <div className="message-computer-observation-head">
        <span>{title}</span>
        <strong>{`${appLabel} · ${copy.appMutationCountSuffix(mutation.changeCount)}`}</strong>
      </div>
      <dl className="message-computer-observation-grid">
        <dt>{copy.appMutationApp}</dt>
        <dd>{appLabel}</dd>
        <dt>{copy.appMutationMode}</dt>
        <dd>{mode}</dd>
      </dl>
      {mutation.rows.length > 0 ? (
        <div className="message-app-mutation-section">
          <span>{copy.appMutationChanges}</span>
          <div className="message-app-mutation-list">
            {mutation.rows.map((row, index) => (
              <div className="message-app-mutation-row" key={`${row.label}:${index}`}>
                <strong>{row.label}</strong>
                <span>{row.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {mutation.phase === 'result' || mutation.issues.length > 0 ? (
        <div className="message-app-mutation-section">
          <span>{copy.appMutationIssues}</span>
          {mutation.issues.length > 0 ? (
            <div className="message-app-mutation-list">
              {mutation.issues.map((issue, index) => (
                <div
                  className={`message-app-mutation-row issue ${issue.severity ?? 'warning'}`}
                  key={`${issue.code ?? issue.message}:${index}`}
                >
                  <strong>{issue.code ?? issue.severity ?? 'issue'}</strong>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="message-app-mutation-empty">{copy.appMutationNoIssues}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}

function ComputerActionCard({ action }: { action: ComputerActionResult }) {
  return (
    <div className="message-computer-observation message-computer-action">
      <div className="message-computer-observation-head">
        <span>{action.title}</span>
        <strong>{action.summary}</strong>
      </div>
      {action.fields.length > 0 ? (
        <dl className="message-computer-observation-grid">
          {action.fields.map((field) => (
            <React.Fragment key={`${field.label}:${field.value}`}>
              <dt>{field.label}</dt>
              <dd>{field.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

export function ToolMessageCard({ message, onApprovalDecision }: ToolMessageCardProps) {
  const { locale } = useLocale()
  const copy = TOOL_CARD_COPY[locale] ?? TOOL_CARD_COPY.en
  const computerObservation = parseComputerObservationResult(message)
  const computerWindowList = computerObservation ? null : parseComputerWindowListResult(message)
  const computerActionInput = computerObservation ? null : parseComputerActionInput(message)
  const computerAction = computerWindowList ? null : parseComputerActionResult(message)
  const appMutationInput = parseAppMutationInput(message, copy)
  const appMutationResult = parseAppMutationResult(message, copy)
  const canApproveComputerRun =
    message.toolNeedsApproval &&
    message.approvalState !== 'stale' &&
    message.toolName?.startsWith('computer.')

  return (
    <div className={`message-tool-card ${message.toolStatus ?? 'running'}`}>
      <div className="message-tool-head">
        <div className="message-tool-copy">
          <span className="message-tool-kicker">
            {message.toolNeedsApproval ? copy.approvalRequested : copy.toolActivity}
          </span>
          <strong>{message.toolName ?? copy.toolFallback}</strong>
          {message.toolMeta && <span className="message-tool-meta">{message.toolMeta}</span>}
        </div>
        <span className={`message-tool-badge ${message.toolStatus ?? 'running'}`}>
          {toolStatusLabel(message)}
        </span>
      </div>

      {appMutationInput ? (
        <AppMutationCard mutation={appMutationInput} copy={copy} />
      ) : computerActionInput ? (
        <ComputerActionCard action={computerActionInput} />
      ) : (
        message.content && <pre className="message-tool-code">{message.content}</pre>
      )}

      {message.toolNeedsApproval && (
        <div className="message-tool-note">
          <div className="message-tool-note-copy">
            {approvalNoteCopy(message.approvalState, message.resumeAvailable)}
          </div>
          {message.approvalRequestId && (
            <div className="message-tool-actions">
              <button
                className="message-tool-action message-tool-action-secondary"
                onClick={() =>
                  void onApprovalDecision(
                    message.approvalRequestId!,
                    message.id,
                    false,
                    message.approvalState,
                    message.resumeAvailable,
                    undefined,
                    message.sessionId,
                  )
                }
              >
                {message.approvalState === 'stale' ? copy.decline : copy.reject}
              </button>
              {canApproveComputerRun && (
                <button
                  className="message-tool-action message-tool-action-primary"
                  onClick={() =>
                    void onApprovalDecision(
                      message.approvalRequestId!,
                      message.id,
                      true,
                      message.approvalState,
                      message.resumeAvailable,
                      'run',
                      message.sessionId,
                    )
                  }
                >
                  {copy.approveComputerRun}
                </button>
              )}
              <button
                className="message-tool-action message-tool-action-primary"
                onClick={() =>
                  void onApprovalDecision(
                    message.approvalRequestId!,
                    message.id,
                    true,
                    message.approvalState,
                    message.resumeAvailable,
                    undefined,
                    message.sessionId,
                  )
                }
              >
                {message.approvalState === 'stale'
                  ? message.resumeAvailable
                    ? copy.resume
                    : copy.continueLabel
                  : copy.approve}
              </button>
            </div>
          )}
        </div>
      )}

      {message.toolResult && (
        <div className={`message-tool-result ${message.toolStatus ?? 'running'}`}>
          <span className="message-tool-result-label">{copy.result}</span>
          {computerObservation ? (
            <ComputerObservationCard observation={computerObservation} />
          ) : computerWindowList ? (
            <ComputerWindowListCard windowList={computerWindowList} />
          ) : appMutationResult ? (
            <AppMutationCard mutation={appMutationResult} copy={copy} />
          ) : computerAction ? (
            <ComputerActionCard action={computerAction} />
          ) : (
            <pre className="message-tool-code">{message.toolResult}</pre>
          )}
        </div>
      )}
    </div>
  )
}
