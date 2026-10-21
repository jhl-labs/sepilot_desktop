'use client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const examples = [
  '$task 목록 보여줘',
  '$task 내일 오전 9시에 프로젝트 변경 사항을 요약해줘',
  '$task 매주 월요일 오전 9시에 진행 상황을 보고해줘',
  '$task 이 자료를 지금 백그라운드로 분석해줘',
] as const

export function TaskChatHelp() {
  async function copy(example: string) {
    try {
      await navigator.clipboard.writeText(example)
      toast.success('예시를 복사했습니다. Chat에 붙여 넣고 수정해서 보내세요.')
    } catch {
      toast.error('복사하지 못했습니다. 예시를 직접 선택해 복사하세요.')
    }
  }
  return (
    <details className="rounded-xl border border-border px-4 py-3 text-sm">
      <summary className="cursor-pointer font-medium">Chat에서 Tasks 사용하기 · $task</summary>
      <p className="mt-3 text-xs text-muted-foreground">
        $task로 작업 관리를 명시하거나, “내일 알려줘”, “매주 확인해줘”처럼 요청하세요.
        일반 질문이나 날짜가 포함된 설명은 자동으로 예약하지 않습니다.
        실행 시점이나 대상 작업이 불분명하면 확인합니다.
      </p>
      <div className="mt-3 space-y-2">
        {examples.map(example => (
          <div key={example} className="flex items-center justify-between gap-3">
            <code className="text-xs">{example}</code>
            <Button size="sm" variant="outline" aria-label={`${example} 복사`} onClick={() => void copy(example)}>복사</Button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        변경·일시정지·재개·취소·결과 조회도 같은 방식으로 요청할 수 있습니다.
        등록된 작업 ID와 실행 시간을 확인하세요. 예시 복사만으로 작업이 생성되지는 않습니다.
      </p>
    </details>
  )
}
