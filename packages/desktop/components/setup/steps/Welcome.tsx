import { Bot, CheckCircle2, FolderKanban, ShieldCheck } from 'lucide-react'

const SETUP_ITEMS = [
  {
    icon: Bot,
    label: '대화에 쓸 AI 모델',
    description: '연결된 제공자 중 기본으로 사용할 모델을 고릅니다.',
  },
  {
    icon: FolderKanban,
    label: '파일 작업의 기준 위치',
    description: '자주 여는 프로젝트 폴더를 기본 작업 공간으로 정합니다.',
  },
]

export function Welcome() {
  return (
    <section className="space-y-5" aria-label="시작 설정 안내">
      <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.055] p-4">
        <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        </div>
        <div>
          <p className="text-sm font-semibold">필수 설정 없이도 바로 시작할 수 있어요</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            지금 선택하지 않은 항목은 기본값을 사용하며, 나중에 설정에서 변경할 수 있습니다.
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground">이번에 확인할 내용</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {SETUP_ITEMS.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.label}
                className="group rounded-xl border border-border/70 bg-muted/25 p-4 transition-colors hover:border-primary/20 hover:bg-muted/40"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg border border-border/70 bg-background text-foreground shadow-sm">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-semibold">{item.label}</p>
                <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.description}</p>
              </div>
            )
          })}
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" aria-hidden="true" />
        실행과 외부 변경은 설정된 승인 정책에 따라 처리됩니다.
      </div>
    </section>
  )
}
