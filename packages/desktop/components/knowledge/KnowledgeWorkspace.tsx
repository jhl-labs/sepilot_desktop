'use client'

import * as React from 'react'
import { DocsGitPanel } from './DocsGitPanel'
import {
  BookOpenText,
  FilePenLine,
  FolderSync,
  FileText,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { desktopSettingsFeatures } from '@/lib/feature-profile'
import { cn } from '@/lib/utils/cn'

export type KnowledgeSection = 'authored' | 'reference' | 'personal' | 'durable' | 'team'

export interface KnowledgeWorkspaceProps {
  section: KnowledgeSection
  onSectionChange: (section: KnowledgeSection) => void
  children: React.ReactNode
}

interface SectionDefinition {
  section: KnowledgeSection
  label: string
  description: string
  icon: LucideIcon
}

const SECTIONS: readonly SectionDefinition[] = [
  {
    section: 'authored',
    label: '문서',
    description: '새 문서 작성부터 AI 편집까지 한 곳에서',
    icon: FilePenLine,
  },
  {
    section: 'durable',
    label: 'Wiki',
    description: '대화와 문서에서 쌓은 지식을 찾고 관리합니다',
    icon: BookOpenText,
  },
  {
    section: 'reference',
    label: '자료 연결',
    description: '기존 파일과 팀 자료를 연결하고 관리합니다',
    icon: FolderSync,
  },
]
const SOURCES = [
  {
    section: 'reference' as const,
    label: '폴더·웹 자료',
    description: '로컬 폴더와 HTTPS 웹 자료를 연결해 검색합니다',
    icon: FolderSync,
  },
  {
    section: 'personal' as const,
    label: '개인 Markdown',
    description: '이 기기의 Markdown 자료를 관리합니다',
    icon: FileText,
  },
  ...(desktopSettingsFeatures['team-docs']
    ? [
        {
          section: 'team' as const,
          label: '팀 저장소',
          description: '연결한 팀 저장소의 자료를 동기화합니다',
          icon: Users,
        },
      ]
    : []),
]

export function KnowledgeWorkspace({
  section,
  onSectionChange,
  children,
}: KnowledgeWorkspaceProps) {
  const [gitOpen, setGitOpen] = React.useState(false)
  const [syncRevision, setSyncRevision] = React.useState(0)
  const sourceSection = SOURCES.some((item) => item.section === section)
  const activeSection = sourceSection ? 'reference' : section
  const lastSource = React.useRef<KnowledgeSection>('reference')
  if (sourceSection) lastSource.current = section
  const active = SECTIONS.find((item) => item.section === activeSection) ?? SECTIONS[0]!
  const instanceId = React.useId()
  const panelId = `${instanceId}-panel`
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([])

  function activateTab(index: number): void {
    const next = SECTIONS[index]
    if (!next) return
    onSectionChange(next.section === 'reference' ? lastSource.current : next.section)
    tabRefs.current[index]?.focus({ preventScroll: true })
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number): void {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % SECTIONS.length
    else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + SECTIONS.length) % SECTIONS.length
    } else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = SECTIONS.length - 1
    else return

    event.preventDefault()
    activateTab(nextIndex)
  }

  return (
    <section
      aria-label="지식 작업 공간"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background"
    >
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-muted/15 px-3 py-2">
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <BookOpenText className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold leading-4 tracking-tight">Docs</h1>
            <p className="whitespace-nowrap text-[10px] leading-4 text-muted-foreground">
              작성하고, 연결하고, 지식으로 활용하세요
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="지식 자료 유형"
          aria-orientation="horizontal"
          className="ml-auto flex max-w-full min-w-0 flex-1 items-stretch justify-end gap-1 overflow-x-auto overscroll-x-contain rounded-lg [scrollbar-gutter:stable]"
        >
          {SECTIONS.map((item, index) => {
            const selected = item.section === activeSection
            const Icon = item.icon
            const tabId = `${instanceId}-${item.section}-tab`
            return (
              <button
                key={item.section}
                ref={(element) => {
                  tabRefs.current[index] = element
                }}
                id={tabId}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                onClick={() =>
                  onSectionChange(item.section === 'reference' ? lastSource.current : item.section)
                }
                onKeyDown={(event) => handleTabKeyDown(event, index)}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring motion-reduce:transition-none',
                  selected
                    ? 'border-primary/50 bg-primary/10 text-foreground shadow-sm'
                    : 'border-transparent text-muted-foreground hover:border-border hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('h-4 w-4 shrink-0', selected && 'text-primary')}
                  aria-hidden="true"
                />
                <span className="min-w-0 whitespace-nowrap">
                  <span className="block text-xs font-semibold leading-4">{item.label}</span>
                </span>
              </button>
            )
          })}
        </div>
      </header>

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        {sourceSection ? (
          <>
            <label htmlFor={`${instanceId}-source`} className="text-xs font-medium">
              자료 위치
            </label>
            <select
              id={`${instanceId}-source`}
              value={section}
              onChange={(event) => onSectionChange(event.target.value as KnowledgeSection)}
              className="rounded-md border bg-background px-2 py-1 text-xs"
            >
              {SOURCES.map((item) => (
                <option key={item.section} value={item.section}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {SOURCES.find((item) => item.section === section)?.description}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{active.description}</p>
        )}
        <button
          type="button"
          aria-expanded={gitOpen}
          onClick={() => setGitOpen(v => !v)}
          className="ml-auto rounded px-2 py-1 text-xs hover:bg-accent"
        >
          Git 동기화
        </button>
      </div>
      {gitOpen && <DocsGitPanel onSynced={() => setSyncRevision(v => v + 1)} />}
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${instanceId}-${activeSection}-tab`}
        tabIndex={0}
        className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <React.Fragment key={syncRevision}>{children}</React.Fragment>
      </div>
    </section>
  )
}
