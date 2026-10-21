'use client'
import { Button } from '@/components/ui/button'
import { useEscapeToClose } from '@/lib/hooks/use-escape-to-close'
import { useModalViewportLock } from '@/lib/hooks/use-modal-viewport-lock'

interface ShortcutEntry {
  combo: string
  description: string
}

interface ShortcutGroup {
  title: string
  entries: ShortcutEntry[]
}

const GROUPS: ShortcutGroup[] = [
  {
    title: '전역',
    entries: [
      { combo: 'Mod+K', description: '명령 팔레트 열기' },
      { combo: 'Mod+,', description: '설정 열기/닫기' },
      { combo: 'Mod+N', description: '새 대화' },
      { combo: 'Mod+Shift+T', description: '새 로컬 터미널' },
      { combo: 'Mod+/', description: '단축키 도움말' },
      { combo: '/', description: '입력창에 포커스' },
    ],
  },
  {
    title: '대화',
    entries: [
      { combo: 'Enter', description: '메시지 전송' },
      { combo: 'Shift+Enter', description: '줄바꿈' },
      { combo: 'Esc', description: '응답 생성 중단' },
      { combo: '/', description: '슬래시 명령 팔레트 (입력창 안에서)' },
      { combo: '@', description: '파일 멘션' },
      { combo: '#', description: '페르소나 멘션' },
    ],
  },
]

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  useEscapeToClose(open, () => onOpenChange(false))
  useModalViewportLock(open)

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="단축키"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex max-h-[calc(100dvh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="shrink-0 border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold">단축키</h2>
        </header>
        <div
          role="region"
          aria-label="단축키 목록"
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 py-4"
        >
          {GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </h3>
              <div className="flex flex-col gap-1.5">
                {group.entries.map((entry) => (
                  <div key={entry.combo} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{entry.description}</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium">
                      {entry.combo}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <footer className="flex shrink-0 justify-end border-t border-border bg-muted/20 px-6 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
        </footer>
      </div>
    </div>
  )
}
