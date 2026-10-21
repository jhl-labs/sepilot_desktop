'use client'
import { ArrowRight, Code2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'code-snippets',
  section: 'memory',
  label: 'Code Snippets',
  search: ['snippets', 'code', 'gallery'],
  buildFeature: 'snippets',
  render: () => <CodeSnippetsSettingsTab />,
})

export function CodeSnippetsSettingsTab() {
  function openSnippetsView(): void {
    window.dispatchEvent(
      new CustomEvent('sepilot:open-view', { detail: 'snippets' }),
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-background p-2 text-foreground">
            <Code2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold">Code Snippets</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              스니펫 관리는 사이드바의 전용 갤러리에서 진행합니다 — 검색,
              태그·언어 필터, CRUD가 모두 그곳에 있습니다. 별도의 설정 항목은
              없습니다.
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <Button size="sm" onClick={openSnippetsView}>
                <ArrowRight className="mr-1 h-3.5 w-3.5" />
                Snippets 갤러리 열기
              </Button>
            </div>
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">
        다른 콘텐츠형 도메인(Skills, Wiki, Gallery)도 같은 방식으로 사이드바가
        주 사용처입니다. 이 탭들은 검색 진입점 + 안내용입니다.
      </p>
    </div>
  )
}
