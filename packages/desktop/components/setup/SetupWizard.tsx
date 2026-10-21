'use client'

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cpu,
  FolderKanban,
  Gauge,
  Rocket,
  Sparkles,
  X,
  type LucideProps,
} from 'lucide-react'
import { Welcome } from './steps/Welcome'
import { LLMProvider } from './steps/LLMProvider'
import { Workspace } from './steps/Workspace'
import { Done } from './steps/Done'
import { Button } from '@/components/ui/button'

interface SetupStep {
  key: string
  label: string
  title: string
  description: string
  icon: ComponentType<LucideProps>
  render(context: SetupStepContext): ReactNode
}

interface SetupStepContext {
  onLlmPendingChange(pending: boolean): void
}

const STEPS: SetupStep[] = [
  {
    key: 'welcome',
    label: '시작',
    title: 'SE Pilot을 내 작업 환경에 맞춰볼까요?',
    description: '복잡한 설정은 건너뛰고, 지금 필요한 두 가지만 확인합니다.',
    icon: Gauge,
    render: () => <Welcome />,
  },
  {
    key: 'llm',
    label: 'AI 모델',
    title: '대화에 사용할 기본 모델을 선택하세요',
    description: '새 Provider를 직접 연결하거나, 준비된 모델을 확인해 기본값으로 사용합니다.',
    icon: Cpu,
    render: ({ onLlmPendingChange }) => <LLMProvider onPendingChange={onLlmPendingChange} />,
  },
  {
    key: 'workspace',
    label: '작업 폴더',
    title: '주로 작업할 폴더를 정하세요',
    description: 'SE Pilot이 파일을 찾고 명령을 실행할 기본 위치입니다.',
    icon: FolderKanban,
    render: () => <Workspace />,
  },
  {
    key: 'done',
    label: '완료',
    title: '이제 SE Pilot과 시작할 준비가 됐어요',
    description: '선택한 내용을 확인하고 첫 대화를 시작하세요.',
    icon: Rocket,
    render: () => <Done />,
  },
]

export function SetupWizard({ onComplete }: { onComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [llmPending, setLlmPending] = useState(false)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const step = STEPS[stepIndex] ?? STEPS[0]
  const isLast = stepIndex === STEPS.length - 1

  useEffect(() => {
    if (stepIndex > 0) stepHeadingRef.current?.focus({ preventScroll: true })
  }, [stepIndex])

  return (
    <main
      className="relative flex min-h-full w-full items-center justify-center overflow-y-auto bg-background px-4 py-5 sm:px-6 sm:py-8 lg:px-10"
      aria-labelledby="setup-wizard-title"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(79,70,229,0.11),transparent_30%),radial-gradient(circle_at_86%_82%,rgba(20,184,166,0.08),transparent_28%)]"
      />

      <div className="relative grid w-full max-w-6xl overflow-hidden rounded-2xl border border-border/70 bg-background shadow-[0_28px_90px_rgba(2,8,23,0.18)] lg:min-h-[640px] lg:grid-cols-[320px_minmax(0,1fr)]">
        <button
          type="button"
          onClick={onComplete}
          disabled={llmPending}
          className="absolute right-4 top-4 z-20 inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-background/90 px-3 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 lg:right-5 lg:top-5"
          aria-label="시작 설정을 나중에 진행"
        >
          나중에 설정
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        <aside className="relative overflow-hidden bg-[#07111f] px-6 py-7 text-slate-50 sm:px-8 lg:flex lg:flex-col lg:px-8 lg:py-9">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-70 [background-image:radial-gradient(rgba(148,163,184,0.16)_1px,transparent_1px)] [background-size:22px_22px]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-28 -right-24 h-64 w-64 rounded-full bg-teal-400/10 blur-3xl"
          />

          <div className="relative">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/15 bg-white/10 shadow-inner shadow-white/5">
                <Sparkles className="h-4.5 w-4.5 text-teal-300" aria-hidden="true" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">SE Pilot</p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-400">첫 실행 설정</p>
              </div>
            </div>

            <div className="mt-7 max-w-xs lg:mt-12">
              <p className="font-mono text-[10px] font-semibold tracking-[0.2em] text-teal-300">
                준비 경로 · 4단계
              </p>
              <h1
                id="setup-wizard-title"
                className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.035em] sm:text-[28px]"
              >
                함께 일할 준비를
                <br className="hidden lg:block" /> 3분 안에 마쳐요.
              </h1>
              <p className="mt-3 text-sm leading-6 text-slate-400">
                모델과 작업 폴더만 정하면 바로 대화를 시작할 수 있습니다.
              </p>
            </div>
          </div>

          <nav className="relative mt-7 lg:mt-10" aria-label="시작 설정 진행 단계">
            <ol className="grid grid-cols-4 gap-2 lg:block lg:space-y-1">
              {STEPS.map((item, index) => {
                const Icon = item.icon
                const isActive = index === stepIndex
                const isComplete = index < stepIndex
                return (
                  <li
                    key={item.key}
                    className="relative min-w-0 lg:pb-5"
                    aria-current={isActive ? 'step' : undefined}
                  >
                    {index < STEPS.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className={`absolute left-5 top-9 hidden h-[calc(100%-1.25rem)] w-px lg:block ${
                          isComplete ? 'bg-teal-300/70' : 'bg-white/12'
                        }`}
                      />
                    ) : null}
                    <div
                      className={`flex min-w-0 flex-col items-center gap-2 rounded-xl px-1.5 py-2 text-center transition-colors lg:flex-row lg:items-start lg:gap-3 lg:px-2 lg:text-left ${
                        isActive ? 'bg-white/[0.08]' : ''
                      }`}
                    >
                      <span
                        className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-full border transition-colors ${
                          isComplete
                            ? 'border-teal-300/50 bg-teal-300 text-slate-950'
                            : isActive
                              ? 'border-indigo-300/70 bg-indigo-400 text-white shadow-[0_0_0_5px_rgba(99,102,241,0.14)]'
                              : 'border-white/15 bg-slate-900/80 text-slate-500'
                        }`}
                      >
                        {isComplete ? (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                      <span className="min-w-0 lg:pt-0.5">
                        <span
                          className={`block truncate text-[11px] font-semibold sm:text-xs lg:text-sm ${
                            isActive || isComplete ? 'text-white' : 'text-slate-500'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span
                          className={`mt-0.5 hidden text-[11px] lg:block ${
                            isActive
                              ? 'text-indigo-200'
                              : isComplete
                                ? 'text-teal-300/80'
                                : 'text-slate-600'
                          }`}
                        >
                          {isActive ? '진행 중' : isComplete ? '완료' : '예정'}
                        </span>
                      </span>
                    </div>
                  </li>
                )
              })}
            </ol>
          </nav>

          <div className="relative mt-auto hidden border-t border-white/10 pt-5 lg:block">
            <p className="text-xs leading-5 text-slate-500">
              설정은 로컬 실행 환경에 저장되며, 앱 설정에서 언제든 바꿀 수 있습니다.
            </p>
          </div>
        </aside>

        <section className="flex min-w-0 flex-col px-5 pb-5 pt-16 sm:px-8 sm:pb-7 sm:pt-16 lg:px-12 lg:pb-9 lg:pt-10">
          <header className="border-b border-border/60 pb-6 pr-24 lg:pr-20">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-primary">
                {String(stepIndex + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
              </span>
              <span className="h-px flex-1 bg-border/70" aria-hidden="true" />
              <span className="text-xs font-medium text-muted-foreground">{step.label}</span>
            </div>
            <h2
              ref={stepHeadingRef}
              tabIndex={-1}
              className="mt-5 max-w-2xl text-2xl font-semibold leading-tight tracking-[-0.035em] outline-none sm:text-[30px]"
            >
              {step.title}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {step.description}
            </p>

            <div className="mt-5 flex gap-1.5" aria-hidden="true">
              {STEPS.map((item, index) => (
                <span
                  key={item.key}
                  data-setup-progress={index <= stepIndex ? 'complete' : 'pending'}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === stepIndex
                      ? 'w-10 bg-primary'
                      : index < stepIndex
                        ? 'w-5 bg-teal-500/70'
                        : 'w-5 bg-border'
                  }`}
                />
              ))}
            </div>
          </header>

          <div
            key={step.key}
            className="flex-1 py-7 sm:py-8"
            aria-live="polite"
            aria-busy={llmPending}
          >
            {step.render({ onLlmPendingChange: setLlmPending })}
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-border/60 pt-5">
            <Button
              variant="ghost"
              className="h-11 rounded-xl px-3 text-muted-foreground hover:text-foreground"
              disabled={stepIndex === 0 || llmPending}
              onClick={() => setStepIndex((value) => value - 1)}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              이전
            </Button>

            {isLast ? (
              <Button
                className="h-11 rounded-xl bg-indigo-600 px-5 text-white shadow-[0_12px_28px_rgba(79,70,229,0.24)] hover:bg-indigo-500"
                onClick={onComplete}
                disabled={llmPending}
              >
                <Rocket className="h-4 w-4" aria-hidden="true" />
                SE Pilot 시작하기
              </Button>
            ) : (
              <Button
                className="h-11 rounded-xl bg-indigo-600 px-5 text-white shadow-[0_12px_28px_rgba(79,70,229,0.24)] hover:bg-indigo-500"
                onClick={() => setStepIndex((value) => value + 1)}
                disabled={llmPending}
              >
                다음
                <span className="hidden text-white/70 sm:inline">
                  · {STEPS[stepIndex + 1]?.label}
                </span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </footer>
        </section>
      </div>
    </main>
  )
}
