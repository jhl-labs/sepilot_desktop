export function StreamingResponseIndicator({ label = '응답 생성 중' }: { label?: string }) {
  return (
    <span role="status" aria-label={label} data-ui="streaming-response-indicator" className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className="flex h-3 items-center gap-1">
        {[0, 1, 2].map((index) => (
          <span key={index} className="h-1.5 w-1.5 rounded-full bg-primary/65 opacity-50 shadow-[0_0_0_1px_hsl(var(--primary)/0.08)] motion-safe:animate-pulse motion-reduce:opacity-70" style={{ animationDelay: `${index * 180}ms`, animationDuration: '1.2s' }} />
        ))}
      </span>
    </span>
  )
}
