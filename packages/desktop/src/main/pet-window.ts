import { BrowserWindow, Menu, screen } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { configurePetWindowLayer, petWindowPlatformOptions } from './pet-window-platform'

export interface PetWindowPayload {
  enabled: boolean
  image?: string
  size?: number
  motion?: boolean
}
export function validatePetWindowPayload(value: unknown): PetWindowPayload {
  if (!value || typeof value !== 'object') throw new Error('Invalid pet payload')
  const v = value as Record<string, unknown>
  if (v.enabled === false) return { enabled: false }
  if (
    v.enabled !== true ||
    typeof v.image !== 'string' ||
    v.image.length > 400_000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(v.image)
  )
    throw new Error('Invalid pet image')
  if (typeof v.size !== 'number' || !Number.isFinite(v.size) || v.size < 64 || v.size > 144)
    throw new Error('Invalid pet size')
  return { enabled: true, image: v.image, size: Math.round(v.size), motion: v.motion === true }
}
export function installPetDrag(doc: Document, navigate: (url: string) => void): void {
  const pet = doc.getElementById('pet-body')
  if (!pet) return
  let start: { x: number; y: number } | null = null
  let moved = false
  let suppressClick = false
  pet.addEventListener('dragstart', event => event.preventDefault())
  pet.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    start = { x: event.screenX, y: event.screenY }
    moved = false
    suppressClick = false
    pet.setPointerCapture(event.pointerId)
  })
  pet.addEventListener('pointermove', event => {
    if (!start) return
    const dx = event.screenX - start.x, dy = event.screenY - start.y
    if (!moved && Math.hypot(dx, dy) < 5) return
    moved = true
    navigate(`sepilot-pet:drag?x=${dx}&y=${dy}`)
  })
  const end = () => {
    if (!start) return
    if (moved) {
      navigate('sepilot-pet:drag-end')
      suppressClick = true
    }
    start = null
  }
  pet.addEventListener('pointerup', end)
  pet.addEventListener('pointercancel', end)
  pet.addEventListener('lostpointercapture', end)
  pet.addEventListener('click', event => {
    if (suppressClick) {
      suppressClick = false
      event.preventDefault()
      event.stopPropagation()
    }
  })
}
const PET_DRAG_SCRIPT = `(${installPetDrag.toString()})(document, url => { window.location.href = url })`

export function petWindowHtml(pet: PetWindowPayload): string {
  const scriptHash = createHash('sha256').update(PET_DRAG_SCRIPT).digest('base64')
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'"><style>
  *{box-sizing:border-box}html,body{margin:0;background:transparent;overflow:hidden}body{padding:6px;font-family:system-ui;color:#fff}
  #pet-body{display:block;cursor:grab;touch-action:none;user-select:none}#pet-body:active{cursor:grabbing}
  img{display:block;width:100%;height:${pet.size}px;object-fit:contain;animation:${pet.motion ? 'breathe 4s ease-in-out infinite' : 'none'};transform-origin:bottom center}
  nav{height:22px;display:flex;align-items:center;justify-content:space-between;border-radius:8px;background:#1e293bbf;padding:0 6px;-webkit-app-region:drag;font-size:11px}a{color:white;text-decoration:none;-webkit-app-region:no-drag;padding:2px 4px}a:focus-visible{outline:2px solid #93c5fd}
  @keyframes breathe{50%{transform:scaleY(.97)}}@media(prefers-reduced-motion:reduce){img{animation:none}}
  </style></head><body><a id="pet-body" draggable="false" href="sepilot-pet:chat" aria-label="한 번 클릭: 진행 상황, 두 번 클릭: 대화"><img draggable="false" alt="Sepilot pet" src="${pet.image}"></a><nav><span>⠿</span><a href="sepilot-pet:studio" aria-label="펫 스튜디오">⚙</a></nav><script>${PET_DRAG_SCRIPT}</script></body></html>`
}
export function petSpeechHtml(text: string, streaming = false): string {
  const escaped = text.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>
  :root{color-scheme:light dark}*{box-sizing:border-box}body{margin:0;padding:6px;background:transparent;font:12px/1.65 system-ui}
  main{background:#f8fafc;color:#1e293b;border:1px solid #94a3b8;border-radius:16px;padding:12px;box-shadow:0 3px 8px #0002;height:248px;overflow-y:auto;scrollbar-width:thin;scrollbar-gutter:stable;overflow-wrap:anywhere;white-space:pre-wrap}
  main[data-streaming=true]{height:auto;min-height:60px;display:flex;align-items:center;gap:10px} .typing{display:inline-flex;gap:4px}.typing i{width:5px;height:5px;border-radius:50%;background:currentColor;animation:typing 1.2s ease-in-out infinite}.typing i:nth-child(2){animation-delay:.16s}.typing i:nth-child(3){animation-delay:.32s}@keyframes typing{0%,70%,100%{opacity:.3;transform:translateY(0)}35%{opacity:1;transform:translateY(-4px)}}@media(prefers-reduced-motion:reduce){.typing i{animation:none;opacity:.65}}
  @media(prefers-color-scheme:dark){main{background:#253044;color:#f1f5f9;border-color:#64748b}}
  </style></head><body><main role="status" tabindex="0" aria-label="펫 메시지 · 마우스를 올리면 유지됩니다" data-streaming="${streaming}">${streaming ? '<span aria-label="응답 작성 중" class="typing"><i></i><i></i><i></i></span><span>응답을 준비하고 있어요</span>' : escaped}</main></body></html>`
}

export const PET_STREAM_STALE_MS = 90_000

interface PetSpeechItem {
  updatedAt: number
  stale?: boolean
  id: string
  text: string
  sessionId: string | null
  streaming: boolean
}
export class PetWindow {
  private window: BrowserWindow | null = null
  private speech: BrowserWindow | null = null
  private inputWindow: BrowserWindow | null = null
  private conversationId: string | null = null
  private deferredUpdate: { value: unknown; boundsFile: string } | null = null
  private dragOrigin: { x: number; y: number } | null = null
  private clickTimer: ReturnType<typeof setTimeout> | null = null
  private hoverTimer: ReturnType<typeof setInterval> | null = null
  private hovered = false
  private deferredSpeech = false
  private renderedStreaming = false
  private renderedStale = false
  private isSpeechHovered() {
    if (!this.speech || this.speech.isDestroyed()) return false
    const point = screen.getCursorScreenPoint(), bounds = this.speech.getBounds()
    return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height
  }
  private armSpeechTimer(win: BrowserWindow) {
    if (this.speechTimer) clearTimeout(this.speechTimer)
    if (this.currentSpeech?.streaming) { this.speechTimer = null; return }
    this.speechTimer = setTimeout(() => {
      if (this.isSpeechHovered()) { this.armSpeechTimer(win); return }
      this.finishSpeech(win)
    }, this.currentSpeech?.streaming ? 15000 : 8000)
  }
  private pollHover = () => {
    const item = this.currentSpeech
    if (item?.streaming && Date.now() - item.updatedAt >= PET_STREAM_STALE_MS) {
      item.streaming = false
      item.stale = true
      item.text = '진행 상태 갱신이 잠시 끊겼어요. 작업이 끝났다는 뜻은 아니에요. 펫을 클릭해 상태를 다시 확인해 주세요.'
      void this.renderCurrentSpeech()
    }
    const hovered = this.isSpeechHovered()
    if (hovered === this.hovered) return
    this.hovered = hovered
    if (hovered) {
      if (this.speechTimer) clearTimeout(this.speechTimer)
      this.speechTimer = null
    } else if (this.speech) {
      if (this.deferredSpeech) { this.deferredSpeech = false; void this.renderCurrentSpeech() }
      else this.armSpeechTimer(this.speech)
    }
  }
  private speechTimer: ReturnType<typeof setTimeout> | null = null
  private speechQueue: PetSpeechItem[] = []
  private currentSpeech: PetSpeechItem | null = null
  private speechRevision = 0
  private readonly spoken = new Set<string>()
  private speechDelivery: Promise<boolean> = Promise.resolve(false)
  async notify(value: unknown): Promise<boolean> {
    if (this.speech || this.speechQueue.length) return false
    if (!this.say(value)) return false
    return this.speechDelivery
  }
  say(value: unknown): boolean {
    if (!value || typeof value !== 'object') throw new Error('Invalid pet speech')
    const { id, text, sessionId, streaming } = value as Record<string, unknown>
    if (
      typeof id !== 'string' ||
      !id ||
      id.length > 256 ||
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 100_000
    )
      throw new Error('Invalid pet speech')
    if (!this.window || this.window.isDestroyed()) return false
    const existing = this.currentSpeech?.id === id
      ? this.currentSpeech
      : this.speechQueue.find((item) => item.id === id)
    if (existing) {
      if (!existing.streaming && !existing.stale) return false
      existing.updatedAt = Date.now()
      existing.stale = false
      if (existing.text === text.trim() && existing.streaming === (streaming === true)) return true
      existing.text = text.trim()
      existing.streaming = streaming === true
      if (existing === this.currentSpeech) this.speechDelivery = this.renderCurrentSpeech()
      return true
    }
    if (this.spoken.has(id)) return false
    this.spoken.add(id)
    if (this.spoken.size > 256) this.spoken.delete(this.spoken.values().next().value!)
    this.speechQueue.push({
      updatedAt: Date.now(),
      id,
      text: text.trim(),
      sessionId: typeof sessionId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(sessionId) ? sessionId : null,
      streaming: streaming === true,
    })
    if (this.speechQueue.length > 5) this.speechQueue.shift()
    this.speechDelivery = this.showNextSpeech()
    return true
  }
  private positionSpeech = () => {
    if (!this.window || !this.speech || this.speech.isDestroyed()) return
    const bounds = this.window.getBounds(),
      area = screen.getDisplayMatching(bounds).workArea
    const { width, height } = this.speech.getBounds()
    const y = bounds.y >= area.y + height ? bounds.y - height : bounds.y + bounds.height
    this.speech.setPosition(
      Math.round(
        Math.max(
          area.x,
          Math.min(bounds.x + bounds.width / 2 - width / 2, area.x + area.width - width),
        ),
      ),
      Math.round(Math.max(area.y, Math.min(y, area.y + area.height - height))),
    )
  }
  private clearSpeech() {
    if (this.hoverTimer) clearInterval(this.hoverTimer)
    this.hoverTimer = null
    this.hovered = false
    this.deferredSpeech = false
    if (this.speechTimer) clearTimeout(this.speechTimer)
    this.speechTimer = null
    this.speechQueue = []
    this.currentSpeech = null
    ++this.speechRevision
    if (this.speech && !this.speech.isDestroyed()) this.speech.destroy()
    this.speech = null
  }
  private async showNextSpeech(): Promise<boolean> {
    if (this.speech || !this.window || this.window.isDestroyed()) return false
    const item = this.speechQueue.shift()
    if (!item) return false
    this.currentSpeech = item
    const win = new BrowserWindow({
      width: 360,
      height: 260,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      focusable: false,
      hasShadow: false,
      show: false,
      title: 'Sepilot Pet Message',
      ...petWindowPlatformOptions(process.platform),
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        javascript: false,
        partition: 'sepilot-pet',
      },
    })
    this.speech = win
    configurePetWindowLayer(win, process.platform)
    win.setIgnoreMouseEvents(false)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    this.positionSpeech()
    return this.renderCurrentSpeech()
  }
  private finishSpeech(win: BrowserWindow) {
    if (this.speech !== win) return
    if (this.currentSpeech?.stale) this.spoken.delete(this.currentSpeech.id)
    if (!win.isDestroyed()) win.destroy()
    this.clearSpeechTimers()
    this.speech = null
    this.currentSpeech = null
    void this.showNextSpeech()
  }
  private clearSpeechTimers() {
    if (this.hoverTimer) clearInterval(this.hoverTimer)
    if (this.speechTimer) clearTimeout(this.speechTimer)
    this.hoverTimer = null
    this.speechTimer = null
    this.hovered = false
    this.deferredSpeech = false
  }
  private async renderCurrentSpeech(): Promise<boolean> {
    const win = this.speech
    const item = this.currentSpeech
    if (!win || win.isDestroyed() || !item) return false
    if (this.hovered && this.isSpeechHovered() && !this.renderedStreaming && !this.renderedStale) { this.deferredSpeech = true; return true }
    const revision = ++this.speechRevision
    if (this.speechTimer) clearTimeout(this.speechTimer)
    this.speechTimer = null
    win.setSize(360, item.streaming ? 72 : 260)
    this.positionSpeech()
    let loadTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(petSpeechHtml(item.text, item.streaming))}`),
        new Promise<never>((_, reject) => {
          loadTimer = setTimeout(() => reject(new Error('Pet speech load timed out')), 3000)
        }),
      ])
      if (this.speech !== win || win.isDestroyed() || revision !== this.speechRevision) return false
      win.showInactive()
      this.renderedStreaming = item.streaming
      this.renderedStale = item.stale === true
      this.conversationId = item.sessionId
      this.armSpeechTimer(win)
      if (!this.hoverTimer) this.hoverTimer = setInterval(this.pollHover, 200)
      return true
    } catch {
      if (revision === this.speechRevision) this.finishSpeech(win)
      return false
    } finally {
      if (loadTimer) clearTimeout(loadTimer)
    }
  }
  private revision = 0
  private signature = ''
  private boundsFile = ''
  constructor(private readonly action: (action: string) => void) {}
  private async toggleInput() {
    if (this.inputWindow && !this.inputWindow.isDestroyed()) {
      this.inputWindow.show()
      return
    }
    if (!this.window) return
    const sessionId = this.conversationId
    const bounds = this.window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const win = new BrowserWindow({
      width: 400, height: 194,
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - 400)),
      y: Math.max(area.y, Math.min(bounds.y + bounds.height, area.y + area.height - 194)),
      frame: false, alwaysOnTop: true, skipTaskbar: true, resizable: false,
      show: false, title: 'Sepilot Pet Input',
      transparent: true, backgroundColor: '#00000000', hasShadow: false,
      ...petWindowPlatformOptions(process.platform),
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true, partition: 'sepilot-pet' },
    })
    this.inputWindow = win
    configurePetWindowLayer(win, process.platform)
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event, target) => {
      event.preventDefault()
      const url = new URL(target)
      if (url.origin !== 'https://sepilot-pet.invalid') return
      if (url.pathname === '/close') {
        win.destroy()
        if (this.inputWindow === win) this.inputWindow = null
        return
      }
      if (url.pathname !== '/send') return
      const text = url.searchParams.get('message')?.trim()
      if (!text || text.length > 2000) return
      const mode = url.searchParams.get('mode') ?? 'continue'
      if (mode !== 'continue' && mode !== 'web-search') return
      if (mode === 'continue' && !sessionId) return
      this.action(`message:${JSON.stringify(mode === 'web-search' ? { text, mode } : { sessionId, text })}`)
      win.destroy()
      if (this.inputWindow === win) this.inputWindow = null
    })
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(petInputHtml(Boolean(sessionId)))}`)
    if (!win.isDestroyed()) win.show()
  }
  private clamp() {
    const win = this.window
    if (!win || win.isDestroyed()) return
    const bounds = win.getBounds(),
      area = screen.getDisplayMatching(bounds).workArea
    win.setPosition(
      Math.round(Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width))),
      Math.round(Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height))),
    )
  }
  private readonly displayChanged = () => {
    this.clamp()
    this.positionSpeech()
  }
  async update(value: unknown, boundsFile: string) {
    const pet = validatePetWindowPayload(value)
    if (!pet.enabled) {
      this.close()
      return
    }
    if (this.dragOrigin) { this.deferredUpdate = { value, boundsFile }; return }
    const signature = JSON.stringify(pet)
    if (signature === this.signature && this.window && !this.window.isDestroyed()) return
    this.signature = signature
    this.boundsFile = boundsFile
    const revision = ++this.revision
    const width = pet.size! + 12,
      height = pet.size! + 34
    if (!this.window || this.window.isDestroyed()) {
      const area = screen.getPrimaryDisplay().workArea
      let x = area.x + area.width - width - 24,
        y = area.y + area.height - height - 80
      try {
        const saved = JSON.parse(readFileSync(boundsFile, 'utf8'))
        if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
          x = Math.round(saved.x)
          y = Math.round(saved.y)
        }
      } catch {
      }
      const win = new BrowserWindow({
        width,
        height,
        x,
        y,
        frame: false,
        transparent: true,
        backgroundColor: '#00000000',
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        maximizable: false,
        minimizable: false,
        hasShadow: false,
        show: false,
        title: 'Sepilot Pet',
        ...petWindowPlatformOptions(process.platform),
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          javascript: true,
          partition: 'sepilot-pet',
        },
      })
      this.window = win
      configurePetWindowLayer(win, process.platform)
      win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      win.webContents.on('will-navigate', (event, url) => {
        event.preventDefault()
        if (url.startsWith('sepilot-pet:drag?')) {
          const parsed = new URL(url)
          const dx = Number(parsed.searchParams.get('x')), dy = Number(parsed.searchParams.get('y'))
          if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 100000 || Math.abs(dy) > 100000) return
          if (this.clickTimer) clearTimeout(this.clickTimer)
          this.clickTimer = null
          this.dragOrigin ??= { ...win.getBounds() }
          win.setPosition(Math.round(this.dragOrigin.x + dx), Math.round(this.dragOrigin.y + dy))
          this.clamp()
          this.positionSpeech()
          return
        }
        if (url === 'sepilot-pet:drag-end') {
          this.dragOrigin = null
          const deferred = this.deferredUpdate
          this.deferredUpdate = null
          if (deferred) void this.update(deferred.value, deferred.boundsFile).catch(() => {})
          return
        }
        if (url === 'sepilot-pet:chat') {
          if (this.clickTimer) {
            clearTimeout(this.clickTimer)
            this.clickTimer = null
            void this.toggleInput()
          } else {
            this.clickTimer = setTimeout(() => { this.clickTimer = null; this.action('status') }, 400)
          }
        }
        if (url === 'sepilot-pet:studio') this.action('studio')
      })
      win.webContents.on('context-menu', () => {
        if (this.clickTimer) clearTimeout(this.clickTimer)
        this.clickTimer = null
        Menu.buildFromTemplate([
          { label: '진행 상황 확인', click: () => this.action('status') },
          {
            label: '다음 일정 물어보기',
            click: () => this.action(`message:${JSON.stringify({
              text: '$task Tasks에 등록된 앞으로 실행할 일정을 조회해서 가장 가까운 순서로 최대 5개 알려줘. 작업 이름, 다음 실행 시각과 시간대, 반복 여부를 포함해줘. 실행 중인 작업은 예정 일정과 구분하고, 예정된 일정이 없으면 없다고 알려줘. 조회만 하고 작업을 생성·수정·실행하지 마.',
            })}`),
          },
          { label: '펫과 대화하기', click: () => { void this.toggleInput() } },
          { label: 'Sepilot 메인 창 열기', click: () => this.action('show-main') },
          { type: 'separator' },
          { label: '펫 스튜디오 열기', click: () => this.action('studio') },
          {
            label: '위치 초기화',
            click: () => {
              const area = screen.getPrimaryDisplay().workArea
              const bounds = win.getBounds()
              win.setPosition(
                area.x + area.width - bounds.width - 24,
                area.y + area.height - bounds.height - 80,
              )
              this.clamp()
            },
          },
          {
            label: '펫 숨기기',
            click: () => {
              this.close()
              this.action('hide')
            },
          },
        ]).popup({ window: win })
      })
      win.on('move', this.positionSpeech)
      win.on('moved', () => {
        if (win.isDestroyed()) return
        const { x: px, y: py } = win.getBounds()
        try {
          writeFileSync(this.boundsFile, JSON.stringify({ x: px, y: py }))
        } catch {
        }
      })
      win.on('closed', () => {
        if (this.window === win) {
          this.clearSpeech()
          this.window = null
        }
        screen.removeListener('display-removed', this.displayChanged)
        screen.removeListener('display-metrics-changed', this.displayChanged)
      })
      screen.on('display-removed', this.displayChanged)
      screen.on('display-metrics-changed', this.displayChanged)
    }
    const win = this.window
    win.setSize(width, height)
    this.clamp()
    this.positionSpeech()
    try {
      await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(petWindowHtml(pet))}`)
      if (this.revision === revision && !win.isDestroyed()) win.showInactive()
    } catch (error) {
      if (this.revision === revision) {
        this.close()
        throw error
      }
    }
  }
  close() {
    this.deferredUpdate = null
    this.dragOrigin = null
    if (this.clickTimer) clearTimeout(this.clickTimer)
    this.clickTimer = null
    this.conversationId = null
    if (this.inputWindow && !this.inputWindow.isDestroyed()) this.inputWindow.destroy()
    this.inputWindow = null
    this.clearSpeech()
    ++this.revision
    this.signature = ''
    if (this.window && !this.window.isDestroyed()) this.window.destroy()
    this.window = null
  }
}

export function installPetInputImeSubmit(
  doc: Document,
  schedule: (callback: () => void) => unknown = (callback) => setTimeout(callback, 0),
): void {
  const input = doc.getElementById('message') as HTMLInputElement | null
  const form = input?.form
  if (!input || !form) return
  let queued = false
  let submitted = false
  input.addEventListener('keydown', (event) => {
    if (
      event.key === 'Enter'
      && !event.shiftKey
      && (event.isComposing || event.keyCode === 229)
    ) queued = true
  })
  input.addEventListener('compositionend', () => {
    if (!queued) return
    queued = false
    schedule(() => {
      if (submitted || !input.value.trim()) return
      submitted = true
      form.requestSubmit()
    })
  })
  form.addEventListener('submit', () => { submitted = true })
}

export const PET_INPUT_IME_SCRIPT = `(${installPetInputImeSubmit.toString()})(document)`

export function petInputHtml(hasConversation = true): string {
  const scriptHash = createHash('sha256').update(PET_INPUT_IME_SCRIPT).digest('base64')
  return `<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; form-action https://sepilot-pet.invalid"><style>
  :root{color-scheme:light dark;--text:#243047;--muted:#637089;--line:rgba(94,116,148,.22);--panel:rgba(246,249,255,.86);--field:rgba(255,255,255,.76);--accent:#4564b0;--hover:rgba(77,106,168,.1);--focus:rgba(91,126,204,.2)}
  *{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;background:transparent;overflow:hidden}body{padding:10px;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--text)}
  .panel{height:100%;padding:14px;border-radius:20px;border:1px solid var(--line);background:linear-gradient(125deg,rgba(148,175,225,.13),transparent 65%),var(--panel);box-shadow:0 4px 10px rgba(15,23,42,.13),inset 0 1px 0 rgba(255,255,255,.32);backdrop-filter:blur(24px) saturate(125%);-webkit-backdrop-filter:blur(24px) saturate(125%)}
  header{display:flex;align-items:center;gap:9px;margin-bottom:13px;-webkit-app-region:drag}svg{display:block;flex-shrink:0}header .icon{display:grid;place-items:center;width:30px;height:30px;border-radius:10px;background:var(--hover);color:var(--accent);border:1px solid var(--line)}
  .heading{flex:1;min-width:0}.eyebrow{font-size:10px;font-weight:650;letter-spacing:.12em;color:var(--muted)}label{display:block;font-size:12px;font-weight:600;letter-spacing:-.02em}
  .close{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;color:var(--muted);text-decoration:none;-webkit-app-region:no-drag}
  form{margin:0}.composer{display:flex;align-items:center;gap:8px;min-height:49px;padding:6px 7px 6px 13px;border:1px solid var(--line);border-radius:13px;background:var(--field);box-shadow:inset 0 1px 2px rgba(30,41,59,.025);transition:border-color .16s,box-shadow .16s}
  .composer:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--focus)}input{flex:1;min-width:0;width:100%;border:0;outline:0;padding:5px 0;background:transparent;color:var(--text);font:inherit;caret-color:var(--accent)}input::placeholder{color:var(--muted);opacity:.85}
  button{display:grid;place-items:center;flex-shrink:0;width:34px;height:34px;padding:0;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:var(--accent);color:white;box-shadow:0 2px 5px rgba(35,56,103,.18);cursor:pointer}
  select{max-width:235px;padding:5px;border:1px solid var(--line);border-radius:7px;background:var(--field);color:var(--text);font:inherit}select:focus-visible{outline:2px solid var(--accent)}
  .hint{display:flex;align-items:center;justify-content:space-between;margin-top:11px;font-size:10px;color:var(--muted)}kbd{font:inherit;border:1px solid var(--line);border-radius:4px;padding:1px 4px;margin-right:3px;background:var(--field)}
  button,.close{transition:background .16s,transform .16s}button:hover{filter:brightness(1.1);transform:translateY(-1px)}button:active{transform:translateY(0) scale(.95)}.close:hover{background:var(--hover);color:var(--text)}button:focus-visible,.close:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
  @media(prefers-color-scheme:dark){:root{--text:#e5eaf5;--muted:#a2aec4;--line:rgba(167,186,219,.22);--panel:rgba(26,34,50,.88);--field:rgba(12,19,33,.46);--accent:#7395df;--hover:rgba(147,173,224,.12);--focus:rgba(132,165,235,.17)}.panel{box-shadow:0 4px 10px rgba(0,0,0,.24),inset 0 1px 0 rgba(219,230,255,.08)}button{color:#101b32}}
  @media(prefers-reduced-transparency:reduce){:root{--panel:#f5f8fd;--field:#fff}.panel{backdrop-filter:none;-webkit-backdrop-filter:none}@media(prefers-color-scheme:dark){:root{--panel:#202a3c;--field:#141e30}}}
  @media(prefers-reduced-motion:reduce){button,.close,.composer{transition:none}button:hover,button:active{transform:none}}
  </style></head><body><main class="panel"><header><span class="icon" aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5a8 8 0 0 1-8 8H5l-3 2v-10a9 9 0 0 1 18 0Z"/><path d="M8 10h8M8 14h5"/></svg></span><div class="heading"><div class="eyebrow">SEPILOT COMPANION</div><label for="message">펫에게 요청하기</label></div><a class="close" href="https://sepilot-pet.invalid/close" aria-label="입력창 닫기" title="닫기"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></a></header><form action="https://sepilot-pet.invalid/send" method="get"><div class="composer"><input id="message" name="message" aria-label="펫에게 보낼 메시지" maxlength="2000" required autofocus autocomplete="off" placeholder="궁금한 점이나 부탁할 일을 적어주세요…"><button type="submit" aria-label="보내기" title="보내기"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6"/></svg></button></div><div class="hint"><select name="mode" aria-label="요청 모드"><option value="continue" ${hasConversation ? 'selected' : 'disabled'}>방금 대화 이어하기</option><option value="web-search" ${hasConversation ? '' : 'selected'}>웹 검색 요청하기 · 새 대화</option></select><span><kbd>Enter ↵</kbd> 보내기</span></div></form></main><script>${PET_INPUT_IME_SCRIPT}</script></body></html>`
}
