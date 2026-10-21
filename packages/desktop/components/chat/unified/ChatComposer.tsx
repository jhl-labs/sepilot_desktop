'use client'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowUp,
  Braces,
  ListChecks,
  Layers,
  LoaderCircle,
  Mic,
  MicOff,
  Paperclip,
  Square,
  Volume2,
  VolumeX,
  Wrench,
  X,
  WandSparkles,
} from 'lucide-react'
import { useChatStore } from '@/lib/store/chat-store'
import { MAX_CLI_IMAGE_BYTES } from '@/lib/chat/cli-chat-contract'
import { supportsChatAttachments, chatBackend } from '@/lib/chat/chat-backends'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { useSettingsStore } from '@/lib/store/settings-store'
import { useSessionStore } from '@/lib/store/session-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'
import {
  filterSlashCommands,
  type SlashCommandPaletteItem,
  type SlashDispatchResult,
} from '@/lib/chat/slash-commands'
import { getChatModePlaceholder, localizeChatModes } from '@/lib/chat/chat-modes'
import { SlashCommandPalette } from '@/components/chat/SlashCommandPalette'
import { DollarPalette } from '@/components/chat/DollarPalette'
import { dollarChoices, type DollarChoice } from '@/lib/chat/dollar-choices'
import { useDollarSkills } from '@/lib/hooks/use-dollar-skills'
import { useDollarApps } from '@/lib/hooks/use-dollar-apps'
import { isAppReferencePosition } from '@sepilotd/api-client'
import { detectSigilTokenAtCaret } from '@/lib/chat/sigil-token'
import { MentionPalette } from '@/components/chat/MentionPalette'
import { PersonaPalette } from '@/components/chat/PersonaPalette'
import { ChatModeToolbar } from '@/components/chat/ChatModeToolbar'
import { useProviderCatalog } from '@/lib/hooks/use-provider-catalog'
import { usePromptTemplates } from '@/lib/hooks/use-prompt-templates'
import { useMentionSearch } from '@/lib/hooks/use-mention-search'
import { usePersonaSearch } from '@/lib/hooks/use-persona-search'
import { useOptionalTransport } from '@/components/providers/transport-provider'
import type { Persona } from '@/lib/store/persona-store'
import { isBrowserPreviewTransport } from '@/lib/utils/runtime-feedback'
import { explainChatStreamError } from '@/lib/utils/friendly-error'
import { toast } from 'sonner'
import { createFilesApi, type FileSearchMatch } from '@/lib/api/files'
import { useChatAttachmentsStore } from '@/lib/store/chat-attachments-store'
import { isSafeInlineImageMimeType } from '@/lib/utils/image-mime'
import { useSkillsStore } from '@/lib/store/skills-store'
import { useTranslation } from 'react-i18next'
import { useImeEnterSubmit } from '@/lib/hooks/use-ime-enter-submit'

const COMPOSER_IDLE_HEIGHT = 38
const COMPOSER_ACTIVE_HEIGHT = 42
const COMPOSER_MAX_HEIGHT = 160
const COMPOSER_PANEL_MIN_HEIGHT = 80
const COMPOSER_PANEL_ATTACHMENT_MIN_HEIGHT = 132
const COMPOSER_PANEL_MAX_HEIGHT = 720
const COMPOSER_PANEL_HEIGHT_STORAGE_KEY = 'sepilot:chat:composer-panel-height:v1'
const COMPOSER_PANEL_KEYBOARD_STEP = 16

function getComposerPanelMaxHeight(minimum: number): number {
  if (typeof window === 'undefined') return COMPOSER_PANEL_MAX_HEIGHT
  return Math.max(
    minimum,
    Math.min(COMPOSER_PANEL_MAX_HEIGHT, Math.floor(window.innerHeight * 0.7)),
  )
}

function clampComposerPanelHeight(value: number, minimum: number): number {
  return Math.min(getComposerPanelMaxHeight(minimum), Math.max(minimum, Math.round(value)))
}

function resizeComposerTextarea(
  node: HTMLTextAreaElement | null,
  active: boolean,
  manualPanelHeight: number | null,
): void {
  if (!node) return
  if (manualPanelHeight != null) {
    node.style.height = 'auto'
    node.style.minHeight = `${COMPOSER_IDLE_HEIGHT}px`
    node.style.maxHeight = 'none'
    node.style.flex = '1 1 0%'
    node.style.overflowY = 'auto'
    return
  }
  node.style.minHeight = ''
  node.style.maxHeight = ''
  node.style.flex = ''
  const minimum = active ? COMPOSER_ACTIVE_HEIGHT : COMPOSER_IDLE_HEIGHT
  node.style.height = 'auto'
  const contentHeight = node.value ? node.scrollHeight : 0
  node.style.height = `${Math.max(minimum, Math.min(contentHeight, COMPOSER_MAX_HEIGHT))}px`
  node.style.overflowY = contentHeight > COMPOSER_MAX_HEIGHT ? 'auto' : 'hidden'
}

function useVisualViewportBottomInset(): number {
  const [inset, setInset] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const viewport = window.visualViewport
    const update = () => {
      const overlap = window.innerHeight - viewport.height - viewport.offsetTop
      setInset(Math.max(0, Math.round(overlap)))
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    window.addEventListener('orientationchange', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      window.removeEventListener('orientationchange', update)
    }
  }, [])
  return inset
}

export function ChatComposer({
  onSend,
  onSteer,
  onStop,
  onSlashCommand,
  onOpenSnippets,
  onOpenSkills,
  voiceCaptureMode,
  voiceProcessing = false,
  autoSpeak = false,
  onStartVoiceCapture,
  onStopVoiceCapture,
  onAutoSpeakChange,
  onSendBackground,
}: {
  onSend: (text: string) => void
  onSendBackground?: (text: string) => void
  onSteer?: (text: string) => void
  onStop?: () => void
  onSlashCommand?: (input: string) => SlashDispatchResult
  onOpenSnippets?: () => void
  onOpenSkills?: () => void
  voiceCaptureMode?: 'conversation' | 'meeting_notes' | null
  voiceProcessing?: boolean
  autoSpeak?: boolean
  onStartVoiceCapture?: (mode: 'conversation' | 'meeting_notes') => void
  onStopVoiceCapture?: () => void
  onAutoSpeakChange?: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const composer = useChatStore((s) => s.composer)
  const setComposer = useChatStore((s) => s.setComposer)
  const pending = useChatStore((s) => s.pending)
  const defaultWorkingDir = useSettingsStore((s) => s.general.workingDir)
  const activeSession = useSessionStore((s) =>
    s.sessions.find((session) => session.id === s.activeId),
  )
  const workingDir = activeSession ? (activeSession.cwd ?? null) : (defaultWorkingDir ?? null)
  const backendId = useChatModeStore((s) => s.backend)
  const daemonFeatures = chatBackend(backendId).daemonFeatures
  const chatMode = useChatModeStore((s) => s.mode)
  const chatModes = useChatModeStore((s) => s.catalog)
  const presentedChatModes = useMemo(
    () => localizeChatModes(chatModes.filter((entry) => entry.category !== 'external'), (key) => t(key)),
    [chatModes, t],
  )
  const sessionPanelSize = activeSession?.personaIds?.length ?? 0
  const panelRosterMissing = daemonFeatures && chatMode === 'persona-panel' && sessionPanelSize < 2
  const [local, setLocal] = useState(composer)
  const [activeIndex, setActiveIndex] = useState(0)
  const [mentionState, setMentionState] = useState<{
    query: string
    start: number
    end: number
  } | null>(null)
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0)
  const [dollarState, setDollarState] = useState<{ start: number; end: number; query: string } | null>(null)
  const [dollarIndex, setDollarIndex] = useState(0)
  const [personaState, setPersonaState] = useState<{
    query: string
    start: number
    end: number
  } | null>(null)
  const [personaActiveIndex, setPersonaActiveIndex] = useState(0)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [continuousVoice, setContinuousVoice] = useState(false)
  const [backgroundMode, setBackgroundMode] = useState(false)
  const backgroundAvailable = daemonFeatures && Boolean(onSendBackground)
  const sendInBackground = backgroundAvailable && backgroundMode
  const [focused, setFocused] = useState(false)
  const [manualPanelHeight, setManualPanelHeight] = useState<number | null>(null)
  const [panelMaxHeight, setPanelMaxHeight] = useState(COMPOSER_PANEL_MAX_HEIGHT)
  const composerPanelRef = useRef<HTMLDivElement>(null)
  const manualPanelHeightRef = useRef<number | null>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const imeEnter = useImeEnterSubmit((value) => commit(value))
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const transport = useOptionalTransport()
  const attachments = useChatAttachmentsStore((s) => s.attachments)
  const addAttachments = useChatAttachmentsStore((s) => s.add)
  const removeAttachment = useChatAttachmentsStore((s) => s.remove)
  const clearAttachments = useChatAttachmentsStore((s) => s.clear)
  const selectedSkillIds = useSkillsStore((s) => s.selectedIds)
  const skillItems = useSkillsStore((s) => s.items)
  const removeSelectedSkill = useSkillsStore((s) => s.removeSelected)
  const dollarActive = dollarState !== null
  const { loading: skillsLoading, error: skillsError } = useDollarSkills(dollarActive)
  const { items: appItems, loading: appsLoading, error: appsError } = useDollarApps(dollarActive)
  const dollarItems = useMemo(
    () => dollarChoices(dollarState?.query ?? '', skillItems, appItems),
    [dollarState?.query, skillItems, appItems],
  )
  const dollarOpen = dollarActive && (
    dollarItems.length > 0 || skillsLoading || appsLoading || skillsError !== null || appsError !== null
    || dollarState.query.startsWith('skill:') || dollarState.query.startsWith('app:')
  )
  useEffect(() => {
    setDollarIndex(0)
  }, [dollarState?.query])
  useEffect(() => {
    setDollarIndex(index => Math.min(index, Math.max(0, dollarItems.length - 1)))
  }, [dollarItems.length])
  const keyboardInset = useVisualViewportBottomInset()
  const panelMinHeight =
    attachments.length > 0 ? COMPOSER_PANEL_ATTACHMENT_MIN_HEIGHT : COMPOSER_PANEL_MIN_HEIGHT

  const setManualPanelHeightInMemory = useCallback((next: number | null): void => {
    manualPanelHeightRef.current = next
    setManualPanelHeight(next)
  }, [])

  const persistManualPanelHeight = useCallback(
    (next: number | null): void => {
      setManualPanelHeightInMemory(next)
      try {
        if (next == null) {
          window.sessionStorage.removeItem(COMPOSER_PANEL_HEIGHT_STORAGE_KEY)
        } else {
          window.sessionStorage.setItem(COMPOSER_PANEL_HEIGHT_STORAGE_KEY, String(next))
        }
      } catch {
      }
    },
    [setManualPanelHeightInMemory],
  )

  function currentPanelHeight(): number {
    if (manualPanelHeightRef.current != null) return manualPanelHeightRef.current
    const measured = composerPanelRef.current?.getBoundingClientRect().height ?? 0
    return clampComposerPanelHeight(measured || panelMinHeight, panelMinHeight)
  }

  function adjustPanelHeight(delta: number): void {
    persistManualPanelHeight(clampComposerPanelHeight(currentPanelHeight() + delta, panelMinHeight))
  }

  function beginPanelResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return
    event.preventDefault()
    dragCleanupRef.current?.()
    const handle = event.currentTarget
    const pointerId = event.pointerId
    const startY = event.clientY
    const startHeight = currentPanelHeight()
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    let pendingHeight: number | null = null
    let animationFrame: number | null = null
    let finished = false
    let captured = false

    try {
      handle.setPointerCapture?.(pointerId)
      captured = true
    } catch {
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      pendingHeight = clampComposerPanelHeight(
        startHeight + startY - moveEvent.clientY,
        panelMinHeight,
      )
      if (animationFrame != null) return
      animationFrame = -1
      const frameId = window.requestAnimationFrame(() => {
        animationFrame = null
        if (pendingHeight != null) setManualPanelHeightInMemory(pendingHeight)
      })
      if (animationFrame != null) animationFrame = frameId
    }
    const finish = () => {
      if (finished) return
      finished = true
      if (animationFrame != null) window.cancelAnimationFrame(animationFrame)
      if (pendingHeight != null) setManualPanelHeightInMemory(pendingHeight)
      const finalHeight = pendingHeight ?? manualPanelHeightRef.current ?? startHeight
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', finish)
      document.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      handle.removeEventListener('lostpointercapture', finish)
      if (captured) {
        try {
          handle.releasePointerCapture?.(pointerId)
        } catch {
        }
      }
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      dragCleanupRef.current = null
      persistManualPanelHeight(finalHeight)
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', finish)
    document.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
    handle.addEventListener('lostpointercapture', finish)
    dragCleanupRef.current = finish
  }

  function handlePanelResizeKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      adjustPanelHeight(COMPOSER_PANEL_KEYBOARD_STEP)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      adjustPanelHeight(-COMPOSER_PANEL_KEYBOARD_STEP)
    } else if (event.key === 'Home') {
      event.preventDefault()
      persistManualPanelHeight(null)
    }
  }

  useEffect(() => {
    const updateBounds = () => {
      const nextMax = getComposerPanelMaxHeight(panelMinHeight)
      setPanelMaxHeight(nextMax)
      const current = manualPanelHeightRef.current
      if (current != null) {
        const clamped = clampComposerPanelHeight(current, panelMinHeight)
        if (clamped !== current) persistManualPanelHeight(clamped)
      }
    }

    updateBounds()
    window.addEventListener('resize', updateBounds)
    return () => window.removeEventListener('resize', updateBounds)
  }, [panelMinHeight, persistManualPanelHeight])

  useEffect(() => {
    try {
      const stored = Number.parseFloat(
        window.sessionStorage.getItem(COMPOSER_PANEL_HEIGHT_STORAGE_KEY) ?? '',
      )
      if (Number.isFinite(stored)) {
        persistManualPanelHeight(clampComposerPanelHeight(stored, panelMinHeight))
      }
    } catch {
    }
  }, [panelMinHeight, persistManualPanelHeight])

  useEffect(
    () => () => {
      dragCleanupRef.current?.()
    },
    [],
  )

  async function uploadFiles(files: File[]): Promise<void> {
    if (!supportsChatAttachments(backendId, files.map((file) => file.type))) { toast.error(t('chatBackend.imagesOnly')); return }
    if (!daemonFeatures && (attachments.length + files.length > 8 || files.some((file) => file.size > MAX_CLI_IMAGE_BYTES))) { toast.error(t('chatBackend.imagesOnly')); return }
    if (!transport || files.length === 0) return
    setUploading(true)
    try {
      if (await isBrowserPreviewTransport(transport)) {
        toast.error('브라우저 미리보기에서는 파일 업로드가 제한됩니다.')
        return
      }
      const api = await createFilesApi(transport)
      const uploaded = await api.upload(files)
      const decorated = uploaded.map((entry) => {
        const matched = files.find((f) => f.name === entry.filename && f.size === entry.size)
        const previewUrl =
          matched && isSafeInlineImageMimeType(entry.mimeType)
            ? URL.createObjectURL(matched)
            : undefined
        return { ...entry, previewUrl }
      })
      addAttachments(decorated)
      toast.success(`${uploaded.length}개 파일을 첨부했습니다.`)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error(friendly.title, { description: friendly.description })
    } finally {
      setUploading(false)
    }
  }

  async function discardAttachment(id: string): Promise<void> {
    removeAttachment(id)
    if (!transport) return
    try {
      const api = await createFilesApi(transport)
      await api.remove(id)
    } catch (error) {
      const friendly = explainChatStreamError(error)
      toast.error('첨부 파일 원본을 삭제하지 못했습니다.', {
        description: friendly.description,
      })
    }
  }

  function onPaste(e: ClipboardEvent<HTMLTextAreaElement>): void {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const f = item.getAsFile()
        if (f) files.push(f)
      }
    }
    if (files.length === 0) return
    e.preventDefault()
    void uploadFiles(files)
  }

  function onDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer?.files ?? [])
    if (files.length > 0) void uploadFiles(files)
  }

  useEffect(() => {
    setLocal(composer)
  }, [composer])

  const providers = useProviderCatalog()
  const promptTemplates = usePromptTemplates()
  const paletteItems = useMemo<SlashCommandPaletteItem[]>(() => {
    if (!daemonFeatures || mentionState || personaState || dollarState) return []
    if (!local.startsWith('/')) return []
    if (local.includes('\n')) return []
    return filterSlashCommands(local, { modes: presentedChatModes, providers, promptTemplates })
  }, [daemonFeatures, presentedChatModes, local, providers, promptTemplates, mentionState, personaState, dollarState])

  const paletteOpen = paletteItems.length > 0

  const mentionResult = useMentionSearch({
    cwd: workingDir,
    query: mentionState ? mentionState.query : null,
    limit: 10,
  })
  const mentionOpen = mentionState != null
  const mentionItems = mentionResult.matches

  const personaResult = usePersonaSearch(personaState ? personaState.query : null)
  const personaOpen = personaState != null
  const personaItems = personaResult.matches

  useEffect(() => {
    if (activeIndex >= paletteItems.length) {
      setActiveIndex(paletteItems.length === 0 ? 0 : paletteItems.length - 1)
    }
  }, [paletteItems.length, activeIndex])

  useEffect(() => {
    if (mentionActiveIndex >= mentionItems.length) {
      setMentionActiveIndex(mentionItems.length === 0 ? 0 : mentionItems.length - 1)
    }
  }, [mentionItems.length, mentionActiveIndex])

  function refreshMentionFromInput(value: string): void {
    const node = ref.current
    if (!node) return
    const caret = node.selectionStart ?? value.length
    const mention = detectSigilTokenAtCaret(value, caret, '@')
    setMentionState(daemonFeatures ? mention : null)
    if (mention == null) setMentionActiveIndex(0)
    const dollar = detectSigilTokenAtCaret(value, caret, '$')
    setDollarState(daemonFeatures && dollar && isAppReferencePosition(value, dollar.start) ? dollar : null)
    const persona = detectSigilTokenAtCaret(value, caret, '#')
    setPersonaState(daemonFeatures ? persona : null)
    if (persona == null) setPersonaActiveIndex(0)
  }

  function commit(valueOverride?: unknown): void {
    if (!supportsChatAttachments(backendId, attachments.map((file) => file.mimeType))) { toast.error(t('chatBackend.imagesOnly')); return }
    const enteredText = (typeof valueOverride === 'string' ? valueOverride : local).trim()
    if (!enteredText && attachments.length === 0) return
    const text = enteredText || '첨부 파일을 분석해 주세요.'
    if (pending) {
      if (!daemonFeatures || !onSteer || !enteredText) return
      setComposer('')
      setLocal('')
      setFocused(false)
      setActiveIndex(0)
      setMentionState(null)
      setDollarState(null)
      setPersonaState(null)
      onSteer(enteredText)
      return
    }
    if (panelRosterMissing) {
      toast.error('다중 관점에는 페르소나가 2명 이상 필요합니다.', {
        description: '모드 툴바의 "대화 페르소나"에서 이 대화에 참여할 페르소나를 구성하세요.',
      })
      return
    }
    if (daemonFeatures && text.startsWith('/') && onSlashCommand) {
      const result = onSlashCommand(text)
      if (result === 'handled') {
        setComposer('')
        setLocal('')
        setFocused(false)
        setActiveIndex(0)
        setMentionState(null)
        setDollarState(null)
        setPersonaState(null)
        return
      }
    }
    setComposer('')
    setLocal('')
    setFocused(false)
    setActiveIndex(0)
    setMentionState(null)
    setDollarState(null)
    setPersonaState(null)
    clearAttachments()
    if (sendInBackground && onSendBackground) {
      onSendBackground(text)
      return
    }
    onSend(text)
  }

  function applyPaletteSelection(item: SlashCommandPaletteItem): void {
    setLocal(item.insertValue)
    setComposer(item.insertValue)
    setActiveIndex(0)
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      node.focus()
      node.setSelectionRange(item.insertValue.length, item.insertValue.length)
    })
  }

  function applyDollarChoice(item: DollarChoice): void {
    if (!dollarState) return
    if (item.kind === 'skill') {
      const store = useSkillsStore.getState()
      if (!item.skillId || !store.items.some(
        skill => skill.enabled && (skill.id ?? skill.name) === item.skillId,
      )) return
      if (!store.selectedIds.includes(item.skillId)) store.toggleSelected(item.skillId)
    }
    const insert = item.kind === 'wiki' ? '$wiki ' : item.kind === 'app' && item.appReference ? `${item.appReference} ` : ''
    const next = local.slice(0, dollarState.start) + insert + local.slice(dollarState.end)
    const cursor = dollarState.start + insert.length
    setLocal(next)
    setComposer(next)
    setDollarState(null)
    requestAnimationFrame(() => {
      ref.current?.focus()
      ref.current?.setSelectionRange(cursor, cursor)
    })
  }

  function applyMentionSelection(item: FileSearchMatch): void {
    if (!mentionState) return
    const insert = `@${item.path}`
    const next = local.slice(0, mentionState.start) + insert + ' ' + local.slice(mentionState.end)
    setLocal(next)
    setComposer(next)
    setMentionState(null)
    setDollarState(null)
    setMentionActiveIndex(0)
    const cursorAt = mentionState.start + insert.length + 1
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      node.focus()
      node.setSelectionRange(cursorAt, cursorAt)
    })
  }

  function applyPersonaSelection(persona: Persona): void {
    if (!personaState) return
    const insert = `#${persona.name}`
    const next = local.slice(0, personaState.start) + insert + ' ' + local.slice(personaState.end)
    setLocal(next)
    setComposer(next)
    setPersonaState(null)
    setPersonaActiveIndex(0)
    const cursorAt = personaState.start + insert.length + 1
    requestAnimationFrame(() => {
      const node = ref.current
      if (!node) return
      node.focus()
      node.setSelectionRange(cursorAt, cursorAt)
    })
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>): void {
    if (imeEnter.handleKeyDown(e)) return

    if (dollarOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setDollarIndex(index => dollarItems.length
          ? (index + (e.key === 'ArrowDown' ? 1 : -1) + dollarItems.length) % dollarItems.length
          : 0)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const item = dollarItems[dollarIndex]
        if (item) applyDollarChoice(item)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDollarState(null)
        return
      }
    }
    if (personaOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setPersonaActiveIndex((i) =>
          personaItems.length === 0 ? 0 : (i + 1) % personaItems.length,
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setPersonaActiveIndex((i) =>
          personaItems.length === 0 ? 0 : (i - 1 + personaItems.length) % personaItems.length,
        )
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        const item = personaItems[personaActiveIndex]
        if (item) {
          e.preventDefault()
          applyPersonaSelection(item)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setPersonaState(null)
        setPersonaActiveIndex(0)
        return
      }
    }

    if (mentionOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionActiveIndex((i) =>
          mentionItems.length === 0 ? 0 : (i + 1) % mentionItems.length,
        )
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionActiveIndex((i) =>
          mentionItems.length === 0 ? 0 : (i - 1 + mentionItems.length) % mentionItems.length,
        )
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        const item = mentionItems[mentionActiveIndex]
        if (item) {
          e.preventDefault()
          applyMentionSelection(item)
          return
        }
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setMentionState(null)
        setDollarState(null)
        setMentionActiveIndex(0)
        return
      }
    }

    if (paletteOpen) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((i) => (i + 1) % paletteItems.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => (i - 1 + paletteItems.length) % paletteItems.length)
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        const item = paletteItems[activeIndex]
        if (item) applyPaletteSelection(item)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const item = paletteItems[activeIndex]
        if (item) applyPaletteSelection(item)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setLocal('')
        setComposer('')
        setActiveIndex(0)
        return
      }
    }

    if (e.key === 'Escape' && pending) {
      e.preventDefault()
      onStop?.()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (pending && !onSteer) return
      commit()
    }
  }

  useEffect(() => {
    resizeComposerTextarea(ref.current, focused || local.length > 0, manualPanelHeight)
  }, [focused, local, manualPanelHeight])

  useEffect(() => {
    if (keyboardInset <= 0 || document.activeElement !== ref.current) return
    const id = window.setTimeout(() => {
      ref.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }, 40)
    return () => window.clearTimeout(id)
  }, [keyboardInset])

  useEffect(() => {
    function onAuto(e: Event) {
      const detail = (e as CustomEvent<{ userMessage: string }>).detail
      if (!detail?.userMessage) return
      if (panelRosterMissing) {
        toast.error('다중 관점에는 페르소나가 2명 이상 필요합니다.', {
          description: '모드 툴바의 "대화 페르소나"에서 이 대화에 참여할 페르소나를 구성하세요.',
        })
        return
      }
      onSend(detail.userMessage)
    }
    function onFocus() {
      ref.current?.focus()
      const length = ref.current?.value.length ?? 0
      ref.current?.setSelectionRange(length, length)
    }
    window.addEventListener('sepilot:auto-send-message', onAuto as EventListener)
    window.addEventListener('sepilot:focus-composer', onFocus)
    return () => {
      window.removeEventListener('sepilot:auto-send-message', onAuto as EventListener)
      window.removeEventListener('sepilot:focus-composer', onFocus)
    }
  }, [onSend, panelRosterMissing])

  const canSend =
    !pending && !panelRosterMissing && (local.trim().length > 0 || attachments.length > 0)
  const canSteer = daemonFeatures && pending && Boolean(onSteer) && local.trim().length > 0
  const voiceControlsAvailable = Boolean(onStartVoiceCapture && onStopVoiceCapture)
  const continuousVoiceActive = voiceCaptureMode === 'meeting_notes' || continuousVoice
  const voiceStatusText =
    voiceCaptureMode === 'meeting_notes'
      ? '연속 입력 중 · 60초마다 정리'
      : voiceCaptureMode === 'conversation'
        ? autoSpeak
          ? '음성 대화 중 · 다시 누르면 전송'
          : '음성 입력 중 · 다시 누르면 전송'
        : continuousVoice
          ? '연속 입력 준비됨'
          : null

  function toggleVoiceCapture(): void {
    if (!onStartVoiceCapture || !onStopVoiceCapture) return
    if (voiceCaptureMode) {
      onStopVoiceCapture()
      return
    }
    onStartVoiceCapture(continuousVoice ? 'meeting_notes' : 'conversation')
  }

  function toggleContinuousVoice(): void {
    const next = !continuousVoice
    setContinuousVoice(next)
    if (next && autoSpeak) onAutoSpeakChange?.(false)
  }

  return (
    <div
      ref={composerPanelRef}
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={cn(
        'relative flex flex-col overflow-visible rounded-lg border bg-card shadow-sm transition-colors',
        'focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20',
        dragOver && 'border-primary/70 bg-primary/[0.04]',
      )}
      style={{
        height: manualPanelHeight ?? undefined,
        marginBottom: keyboardInset > 0 ? Math.min(keyboardInset + 8, 360) : undefined,
        scrollMarginBottom: keyboardInset > 0 ? keyboardInset + 24 : undefined,
      }}
    >
      <div
        role="separator"
        aria-label="메시지 입력창 높이 조절"
        aria-orientation="horizontal"
        aria-valuemin={panelMinHeight}
        aria-valuemax={panelMaxHeight}
        aria-valuenow={manualPanelHeight ?? panelMinHeight}
        aria-valuetext={
          manualPanelHeight == null ? '자동 높이' : `${manualPanelHeight}픽셀, 수동 높이`
        }
        tabIndex={0}
        title="드래그해 입력창 높이 조절 · 더블 클릭 또는 Home으로 자동 높이"
        onPointerDown={beginPanelResize}
        onDoubleClick={() => persistManualPanelHeight(null)}
        onKeyDown={handlePanelResizeKey}
        className="group absolute inset-x-0 -top-1.5 z-10 flex h-3 touch-none select-none cursor-row-resize items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="h-0.5 w-12 rounded-full bg-border transition-colors group-hover:bg-primary/60 group-focus-visible:bg-primary" />
      </div>
      {dragOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-primary/[0.06] text-xs text-primary">
          파일을 놓으면 첨부됩니다
        </div>
      ) : null}
      {attachments.length > 0 ? (
        <div
          className="flex max-h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-border/40 px-2 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="첨부 파일"
        >
          {attachments.map((a) =>
            a.previewUrl ? (
              <div
                key={a.id}
                className="group relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                title={`${a.filename} · ${(a.size / 1024).toFixed(1)} KB`}
              >
                <img src={a.previewUrl} alt={a.filename} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => void discardAttachment(a.id)}
                  aria-label={`${a.filename} 첨부 제거`}
                  className="absolute right-0.5 top-0.5 rounded-full bg-background/85 p-0.5 shadow transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <span
                key={a.id}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-foreground"
                title={`${a.filename} · ${(a.size / 1024).toFixed(1)} KB`}
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[200px] truncate">{a.filename}</span>
                <button
                  type="button"
                  onClick={() => void discardAttachment(a.id)}
                  aria-label={`${a.filename} 첨부 제거`}
                  className="rounded-full p-0.5 hover:bg-background"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ),
          )}
        </div>
      ) : null}
      {daemonFeatures && selectedSkillIds.length > 0 ? (
        <div
          className="flex max-h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 px-2 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          aria-label="채팅에 적용할 스킬"
        >
          <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <WandSparkles className="h-3 w-3" />
            Skills
          </span>
          {selectedSkillIds.map((id) => {
            const skill = skillItems.find((item) => (item.id ?? item.name) === id)
            return (
              <span
                key={id}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[10px] text-foreground"
                title={`이 채팅 요청에 ${id} 스킬 적용`}
              >
                <span className="max-w-36 truncate">{skill?.name ?? id}</span>
                <button
                  type="button"
                  onClick={() => removeSelectedSkill(id)}
                  aria-label={`${skill?.name ?? id} 스킬 적용 해제`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )
          })}
        </div>
      ) : null}
      {dollarOpen ? (
        <DollarPalette
          anchorRef={composerPanelRef}
          items={dollarItems}
          activeIndex={dollarIndex}
          selectedIds={selectedSkillIds}
          loading={skillsLoading || appsLoading}
          error={[skillsError, appsError].filter(Boolean).join(' ') || null}
          onSelect={applyDollarChoice}
          onActiveIndexChange={setDollarIndex}
        />
      ) : personaOpen ? (
        <PersonaPalette
          anchorRef={composerPanelRef}
          items={personaItems}
          loading={personaResult.loading}
          activeIndex={personaActiveIndex}
          onSelect={applyPersonaSelection}
          onActiveIndexChange={setPersonaActiveIndex}
        />
      ) : mentionOpen ? (
        <MentionPalette
          anchorRef={composerPanelRef}
          items={mentionItems}
          loading={mentionResult.loading}
          activeIndex={mentionActiveIndex}
          onSelect={applyMentionSelection}
          onActiveIndexChange={setMentionActiveIndex}
        />
      ) : paletteOpen ? (
        <SlashCommandPalette
          anchorRef={composerPanelRef}
          items={paletteItems}
          activeIndex={activeIndex}
          onSelect={applyPaletteSelection}
          onActiveIndexChange={setActiveIndex}
        />
      ) : null}
      <textarea
        ref={ref}
        value={local}
        onChange={(e) => {
          setLocal(e.target.value)
          setComposer(e.target.value)
          refreshMentionFromInput(e.target.value)
        }}
        onKeyUp={(event) => {
          if (event.key !== 'Escape') refreshMentionFromInput(local)
        }}
        onClick={() => refreshMentionFromInput(local)}
        onKeyDown={onKey}
        onCompositionStart={imeEnter.handleCompositionStart}
        onCompositionEnd={imeEnter.handleCompositionEnd}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={
          pending && onSteer && daemonFeatures
            ? '진행 중인 작업에 추가 지시…'
            : !daemonFeatures ? t('chatBackend.prompt') : getChatModePlaceholder(chatMode, presentedChatModes)
        }
        aria-label="채팅 메시지 입력"
        aria-describedby="chat-composer-help"
        className="min-h-[38px] max-h-40 w-full resize-none bg-transparent px-3 py-2 text-[13px] leading-5 text-foreground outline-none placeholder:text-muted-foreground"
        rows={1}
      />

      <span id="chat-composer-help" className="sr-only">
        Enter로 전송하고 Shift+Enter로 줄을 바꿉니다. 슬래시를 입력하면 명령을 찾을 수 있습니다.
      </span>

      {}
      <div
        className="flex min-h-8 shrink-0 items-center gap-1 border-t border-border/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
        data-testid="composer-command-rail"
      >
        <input
          type="file"
          multiple
          ref={fileInputRef}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) void uploadFiles(files)
            e.target.value = ''
          }}
          className="hidden"
        />
        {onOpenSnippets ? (
          <button
            type="button"
            onClick={onOpenSnippets}
            aria-label="스니펫 열기"
            title="스니펫 열기"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent disabled:opacity-50"
          >
            <Braces className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        {onOpenSkills ? (
          <button
            type="button"
            disabled={!daemonFeatures}
            onClick={onOpenSkills}
            aria-label="스킬 열기"
            title="스킬 열기"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent disabled:opacity-50"
          >
            <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading || !supportsChatAttachments(backendId)}
          aria-label="파일 첨부"
          title="파일 첨부 (paste/drag도 가능)"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent disabled:opacity-50"
        >
          {uploading ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Paperclip className="h-3.5 w-3.5" />
          )}
        </button>
        {voiceControlsAvailable ? (
          <>
            <button
              type="button"
              onClick={toggleVoiceCapture}
              disabled={voiceProcessing && !voiceCaptureMode}
              aria-label={voiceCaptureMode ? '음성 입력 중지' : '음성 입력 시작'}
              title={
                voiceCaptureMode
                  ? '음성 입력 중지'
                  : continuousVoice
                    ? '연속 입력 시작'
                    : autoSpeak
                      ? '음성 대화 시작'
                      : '음성 입력'
              }
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent disabled:opacity-50',
                voiceCaptureMode && 'bg-primary/10 text-primary',
              )}
            >
              {voiceCaptureMode ? (
                <MicOff className="h-3.5 w-3.5" />
              ) : voiceProcessing ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mic className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={toggleContinuousVoice}
              disabled={voiceProcessing || Boolean(voiceCaptureMode)}
              aria-pressed={continuousVoiceActive}
              aria-label={continuousVoiceActive ? '연속 입력 끄기' : '연속 입력 켜기'}
              title="연속 입력"
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent disabled:opacity-50 max-[580px]:hidden',
                continuousVoiceActive && 'bg-primary/10 text-primary',
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
            </button>
            {onAutoSpeakChange ? (
              <button
                type="button"
                onClick={() => onAutoSpeakChange(!autoSpeak)}
                disabled={continuousVoiceActive}
                aria-pressed={autoSpeak}
                aria-label={autoSpeak ? '응답 자동 낭독 끄기' : '응답 자동 낭독 켜기'}
                title={
                  continuousVoiceActive
                    ? '연속 입력에서는 자동 낭독을 사용하지 않습니다.'
                    : autoSpeak
                      ? '응답 자동 낭독 켜짐'
                      : '응답 자동 낭독 꺼짐'
                }
                className={cn(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-accent disabled:opacity-50 max-[580px]:hidden',
                  autoSpeak && 'bg-primary/10 text-primary',
                )}
              >
                {autoSpeak ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5" />
                )}
              </button>
            ) : null}
          </>
        ) : null}
        <div className="relative z-20 min-w-0 max-w-full flex-1 overflow-visible">
          <ChatModeToolbar />
        </div>
        {panelRosterMissing ? (
          <span className="max-w-32 shrink-0 truncate text-amber-700 dark:text-amber-300">
            대화 페르소나 필요
          </span>
        ) : pending ? (
          <span className="inline-flex shrink-0 items-center gap-1" role="status">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            <span className="max-[520px]:sr-only">응답 중 · 추가 지시 가능</span>
          </span>
        ) : voiceStatusText ? (
          <span className="max-w-36 shrink-0 truncate opacity-80" role="status">
            {voiceStatusText}
          </span>
        ) : voiceProcessing ? (
          <span className="inline-flex shrink-0 items-center gap-1" role="status">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            <span className="max-[520px]:sr-only">음성 처리 중</span>
          </span>
        ) : null}
        <div className="relative z-30 shrink-0 bg-card pl-0.5">
          {pending && onSteer ? (
            <Button
              size="icon"
              aria-label="진행 중인 작업에 추가 지시"
              title="입력한 내용을 현재 작업에 추가 지시로 전송"
              className="mr-1 h-7 w-7 rounded-lg"
              disabled={!canSteer}
              onClick={commit}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          ) : null}
          {!pending && backgroundAvailable ? (
            <button
              type="button"
              aria-pressed={backgroundMode}
              aria-label={t('backgroundWork.composer.toggle')}
              title={t('backgroundWork.composer.toggleTitle')}
              data-testid="composer-background-toggle"
              onClick={() => setBackgroundMode((current) => !current)}
              className={cn(
                'mr-1 inline-grid h-7 w-7 place-items-center rounded-md align-middle hover:bg-accent',
                backgroundMode && 'bg-primary/10 text-primary',
              )}
            >
              <Layers className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <Button
            size="icon"
            aria-label={pending ? '중단' : sendInBackground ? t('backgroundWork.composer.send') : '전송'}
            title={
              pending
                ? '응답 중단'
                : panelRosterMissing
                  ? '다중 관점에는 페르소나가 2명 이상 필요합니다.'
                  : sendInBackground
                    ? t('backgroundWork.composer.send')
                    : '전송'
            }
            className="h-7 w-7 rounded-lg"
            disabled={pending ? !onStop : !canSend}
            onClick={pending ? onStop : commit}
          >
            {pending ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
