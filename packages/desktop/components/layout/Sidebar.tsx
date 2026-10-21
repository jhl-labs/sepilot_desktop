'use client'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ChevronDown, LoaderCircle, Plus, Trash2, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getDesktopAppInfo, getDesktopPlatform } from '@/lib/electron/bridge'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'
import { cn } from '@/lib/utils/cn'
import styles from './SidebarBrand.module.css'
import { APP_TITLE_BAR_HEIGHT_PX } from './app-shell-metrics'

const SIDEBAR_WIDTH_KEY = 'sepilotd.desktop.sidebar.width'
const SIDEBAR_WIDTH_MIN = 200
const SIDEBAR_WIDTH_MAX = 1200
const SIDEBAR_WIDTH_DEFAULT = 260
const FLOATING_MENU_GAP = 4
const FLOATING_MENU_GUTTER = 8

interface FloatingMenuPosition {
  top: number
  left: number
  maxHeight: number
  ready: boolean
}

export interface SidebarOption {
  id: string
  label: string
  icon?: LucideIcon
}

export function Sidebar({
  children,
  title = 'Chat',
  options = [],
  activeOption,
  onSelectOption,
  onBackToChat,
  onNewConversation,
  headerActions,
  onDeleteAll,
  newConversationBusy = false,
  deleteAllBusy = false,
  canDeleteAll = true,
  newActionLabel = '새 대화',
  newActionAriaLabel = 'new conversation',
  deleteAllActionLabel = '전체 대화 삭제',
  deleteAllActionAriaLabel = 'delete all conversations',
  deleteAllDialogTitle = '전체 대화 삭제',
  deleteAllDialogDescription = '모든 대화를 삭제합니다. 이 작업은 되돌릴 수 없습니다.',
}: {
  children: ReactNode
  title?: string
  options?: SidebarOption[]
  activeOption?: string
  onSelectOption?: (id: string) => void
  onBackToChat?: () => void
  onNewConversation?: () => void
  headerActions?: ReactNode
  onDeleteAll?: () => void | Promise<void>
  newConversationBusy?: boolean
  deleteAllBusy?: boolean
  canDeleteAll?: boolean
  newActionLabel?: string
  newActionAriaLabel?: string
  deleteAllActionLabel?: string
  deleteAllActionAriaLabel?: string
  deleteAllDialogTitle?: string
  deleteAllDialogDescription?: string
}) {
  const [width, setWidth] = useState(SIDEBAR_WIDTH_DEFAULT)
  const [resizing, setResizing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<FloatingMenuPosition | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isMacTitleBar, setIsMacTitleBar] = useState(false)
  const [appVersionLabel, setAppVersionLabel] = useState<string | null>(null)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(SIDEBAR_WIDTH_DEFAULT)
  const menuTriggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useModalViewportLock(deleteDialogOpen)

  useEffect(() => {
    if (getDesktopPlatform() !== 'darwin') return
    setIsMacTitleBar(true)
    getDesktopAppInfo().then((info) => {
      if (info) setAppVersionLabel(info.version)
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const saved = Number.parseInt(window.localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? '', 10)
    if (Number.isFinite(saved)) {
      setWidth(Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, saved)))
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width))
  }, [width])

  useEffect(() => {
    if (!resizing) return

    const onMouseMove = (event: MouseEvent) => {
      const delta = event.clientX - dragStartX.current
      const nextWidth = Math.min(
        SIDEBAR_WIDTH_MAX,
        Math.max(SIDEBAR_WIDTH_MIN, dragStartWidth.current + delta),
      )
      setWidth(nextWidth)
    }

    const onMouseUp = () => setResizing(false)

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [resizing])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (
        !menuTriggerRef.current?.contains(target)
        && !menuRef.current?.contains(target)
      ) {
        setMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen])

  useLayoutEffect(() => {
    if (!menuOpen) {
      setMenuPosition(null)
      return
    }

    const updateMenuPosition = () => {
      const trigger = menuTriggerRef.current
      const menu = menuRef.current
      if (!trigger || !menu) return

      const triggerRect = trigger.getBoundingClientRect()
      const menuRect = menu.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const viewportMenuHeight = Math.max(0, viewportHeight - FLOATING_MENU_GUTTER * 2)
      const naturalMenuHeight = Math.min(
        Math.max(menu.scrollHeight, menuRect.height),
        viewportMenuHeight,
      )
      const availableBelow = Math.max(
        0,
        viewportHeight - FLOATING_MENU_GUTTER - triggerRect.bottom - FLOATING_MENU_GAP,
      )
      const availableAbove = Math.max(
        0,
        triggerRect.top - FLOATING_MENU_GAP - FLOATING_MENU_GUTTER,
      )
      const placeBelow =
        naturalMenuHeight <= availableBelow
        || (naturalMenuHeight > availableAbove && availableBelow >= availableAbove)
      const maxHeight = Math.min(
        naturalMenuHeight,
        placeBelow ? availableBelow : availableAbove,
      )
      const top = placeBelow
        ? triggerRect.bottom + FLOATING_MENU_GAP
        : Math.max(FLOATING_MENU_GUTTER, triggerRect.top - FLOATING_MENU_GAP - maxHeight)
      const maxLeft = Math.max(
        FLOATING_MENU_GUTTER,
        viewportWidth - menuRect.width - FLOATING_MENU_GUTTER,
      )
      const left = Math.min(
        Math.max(FLOATING_MENU_GUTTER, triggerRect.left),
        maxLeft,
      )

      setMenuPosition({ top, left, maxHeight, ready: true })
    }

    updateMenuPosition()
    window.addEventListener('resize', updateMenuPosition)
    window.addEventListener('scroll', updateMenuPosition, true)
    return () => {
      window.removeEventListener('resize', updateMenuPosition)
      window.removeEventListener('scroll', updateMenuPosition, true)
    }
  }, [menuOpen, options.length])

  function handleResizeStart(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault()
    dragStartX.current = event.clientX
    dragStartWidth.current = width
    setResizing(true)
  }

  const selectedLabel = options.find((option) => option.id === activeOption)?.label ?? title

  return (
    <>
      <aside
        role="complementary"
        className={cn(
          'workspace-sidebar relative flex h-full shrink-0 flex-col border-r',
          resizing && 'select-none',
        )}
        style={{ width }}
      >
        {isMacTitleBar ? (
          <div
            className={cn(styles.bar, 'flex shrink-0 items-center justify-end pl-[78px] pr-3 [-webkit-app-region:drag]')}
            style={{ height: APP_TITLE_BAR_HEIGHT_PX }}
          >
            {appVersionLabel ? (
              <span
                className={styles.brand}
                title={`sepilot v${appVersionLabel}`}
              >
                <span className={styles.wordmark}>sepilot</span>
                <span className={styles.version}>v{appVersionLabel}</span>
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="relative flex min-w-0 flex-1 items-center gap-1">
            {onBackToChat ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={onBackToChat}
                title="대화로 돌아가기"
                aria-label="대화로 돌아가기"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <button
              ref={menuTriggerRef}
              type="button"
              className="inline-flex max-w-full items-center gap-1 text-base font-semibold tracking-tight transition-colors hover:text-primary"
              data-testid="mode-selector"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => {
                if (options.length > 0) {
                  setMenuOpen((value) => !value)
                }
              }}
            >
              <span className="truncate">{selectedLabel}</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
            </button>
          </div>

          <div className="flex shrink-0 items-center gap-0.5 [&>button]:h-8 [&>button]:w-8 [&>button>svg]:h-4 [&>button>svg]:w-4">
            {onNewConversation ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={onNewConversation}
                title={newActionLabel}
                aria-label={newActionAriaLabel}
                disabled={newConversationBusy}
              >
                {newConversationBusy ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Plus className="h-5 w-5" />
                )}
              </Button>
            ) : null}
            {headerActions}
            {onDeleteAll ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setDeleteDialogOpen(true)}
                title={deleteAllActionLabel}
                aria-label={deleteAllActionAriaLabel}
                disabled={!canDeleteAll || deleteAllBusy}
              >
                {deleteAllBusy ? (
                  <LoaderCircle className="h-5 w-5 animate-spin" />
                ) : (
                  <Trash2 className="h-5 w-5" />
                )}
              </Button>
            ) : null}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">{children}</div>

        <div
          aria-hidden="true"
          className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize"
          onMouseDown={handleResizeStart}
        >
          <div className="h-full w-full bg-transparent transition-colors hover:bg-accent/20" />
        </div>
      </aside>

      {menuOpen && options.length > 0 && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="화면 선택"
              data-testid="mode-selector-menu"
              className="fixed z-[60] min-w-[180px] max-w-[calc(100vw-1rem)] overflow-x-auto overflow-y-auto overscroll-contain rounded-md border bg-popover p-1 text-popover-foreground shadow-lg [scrollbar-gutter:stable]"
              style={{
                top: menuPosition?.top ?? FLOATING_MENU_GUTTER,
                left: menuPosition?.left ?? FLOATING_MENU_GUTTER,
                maxHeight: menuPosition?.maxHeight,
                visibility: menuPosition?.ready ? 'visible' : 'hidden',
              }}
            >
              {options.map((option) => {
                const Icon = option.icon
                const selected = option.id === activeOption
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitem"
                    className={cn(
                      'flex min-h-8 w-full items-center gap-2 whitespace-nowrap rounded-sm px-2 py-1 text-left text-[13px] transition-colors hover:bg-accent hover:text-accent-foreground',
                      selected && 'bg-accent text-accent-foreground',
                    )}
                    onClick={() => {
                      onSelectOption?.(option.id)
                      setMenuOpen(false)
                    }}
                  >
                    {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
                    {option.label}
                  </button>
                )
              })}
            </div>,
            document.body,
          )
        : null}

      {deleteDialogOpen && onDeleteAll ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
          onClick={() => {
            if (!deleteAllBusy) setDeleteDialogOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={deleteAllDialogTitle}
            className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border bg-background shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="shrink-0 border-b px-4 py-3">
              <h2 className="text-base font-semibold">{deleteAllDialogTitle}</h2>
            </header>
            <div
              data-testid="sidebar-delete-dialog-body"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3"
            >
              <p className="break-words text-sm text-muted-foreground">
                {deleteAllDialogDescription}
              </p>
            </div>
            <footer
              data-testid="sidebar-delete-dialog-footer"
              className="flex shrink-0 items-center justify-end gap-2 border-t px-4 py-3"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteDialogOpen(false)}
                disabled={deleteAllBusy}
              >
                취소
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  void Promise.resolve(onDeleteAll()).then(() => {
                    setDeleteDialogOpen(false)
                  })
                }}
                disabled={deleteAllBusy}
              >
                {deleteAllBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    삭제 중…
                  </span>
                ) : (
                  '삭제'
                )}
              </Button>
            </footer>
          </div>
        </div>
      ) : null}
    </>
  )
}
