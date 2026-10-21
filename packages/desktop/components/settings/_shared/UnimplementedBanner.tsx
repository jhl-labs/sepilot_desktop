export function UnimplementedBanner({ what }: { what: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      현재 daemon에 <strong>{what}</strong> capability endpoint가 없어 이 화면을 표시할 수 없습니다.
      daemon 측 sub-spec이 연결되면 활성화됩니다.
    </div>
  )
}
