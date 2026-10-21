'use client'
import { ArrowRight, FileText, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { desktopSettingsFeatures } from '@/lib/feature-profile'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'docs',
  section: 'memory',
  label: 'Docs',
  search: ['docs', 'personal', 'team', 'github', 'knowledge', 'documents', '문서'],
  render: () => <DocsSettingsTab />,
})

function openKnowledgeView(view: 'personal-docs' | 'team-docs'): void {
  window.dispatchEvent(new CustomEvent('sepilot:open-view', { detail: view }))
}

export function DocsSettingsTab() {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-background p-2 text-foreground">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold">개인 문서</h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              이 기기에만 저장되는 마크다운 문서입니다. 작성과 관리는 지식
              작업 공간의 &quot;개인 문서&quot; 탭에서 진행합니다.
            </p>
            <div className="mt-2.5">
              <Button size="sm" onClick={() => openKnowledgeView('personal-docs')}>
                <ArrowRight className="mr-1 h-3.5 w-3.5" />
                지식에서 열기
              </Button>
            </div>
          </div>
        </div>
      </div>

      {desktopSettingsFeatures['team-docs'] ? (
        <div className="rounded-md border border-border bg-muted/30 p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-background p-2 text-foreground">
              <Users className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold">팀 문서</h4>
              <p className="mt-0.5 text-xs text-muted-foreground">
                GitHub/GHES 저장소를 연결해 동기화합니다. 연결 등록과 문서
                열람은 지식 작업 공간의 &quot;팀 문서&quot; 탭에 있습니다.
              </p>
              <div className="mt-2.5">
                <Button size="sm" onClick={() => openKnowledgeView('team-docs')}>
                  <ArrowRight className="mr-1 h-3.5 w-3.5" />
                  지식에서 열기
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
