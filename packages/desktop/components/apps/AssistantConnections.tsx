'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { getDesktopApi } from '@/lib/electron/bridge'
import { desktopSettingsFeatures } from '@/lib/feature-profile'

export function AssistantConnections({ calendarId, onOpenCalendar }: {
  calendarId?: string
  onOpenCalendar: () => void
}) {
  const [message, setMessage] = useState('Google 캘린더 연결 확인 중…')
  const [configure, setConfigure] = useState(false)
  const generation = useRef(0)
  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const version = ++generation.current
      const calendar = getDesktopApi()?.calendar
      if (!desktopSettingsFeatures.google || !calendar) {
        setMessage('현재 실행 환경에서는 Google 연결을 사용할 수 없습니다. 저장된 앱 데이터만 참고합니다.')
        setConfigure(false)
        return
      }
      try {
        const status = await calendar.status(calendarId)
        if (cancelled || version !== generation.current) return
        setConfigure(!status.configured)
        setMessage(!status.configured
          ? 'Google 계정 연결 설정이 필요합니다. 현재 일정은 저장된 앱 데이터입니다.'
          : !status.connected
            ? 'Google 계정이 연결되지 않았습니다. 캘린더 앱에서 연결하세요.'
            : !calendarId || !status.selectedCalendarIds?.length
              ? 'Google 계정 연결됨 · 캘린더 앱에서 사용할 캘린더를 선택하세요.'
              : status.lastAutoSyncStatus === 'error'
                ? 'Google 캘린더 동기화 실패 · 앱에서 연결 상태를 확인하세요.'
                : status.lastAutoSyncAt
                  ? `Google 캘린더 · 마지막 자동 동기화 ${new Date(status.lastAutoSyncAt).toLocaleString()}`
                  : 'Google 계정 연결됨 · 캘린더 앱에서 최신 일정 동기화를 확인하세요.')
      } catch {
        if (!cancelled && version === generation.current) { setConfigure(false); setMessage('Google 연결을 확인하지 못했습니다. 외부 일정의 최신 상태는 확인되지 않았습니다.') }
      }
    }
    void refresh()
    window.addEventListener('focus', refresh)
    return () => { cancelled = true; window.removeEventListener('focus', refresh) }
  }, [calendarId])
  return (
    <section aria-label="비서 연결 상태" className="rounded-xl border p-4">
      <h2 className="text-sm font-semibold">비서 연결 상태</h2>
      <p role="status" className="mt-2 text-xs text-muted-foreground">{message}</p>
      <p className="mt-2 text-xs text-muted-foreground">예약 실행에는 데몬이 실행 중이어야 합니다. 기기가 잠들거나 꺼져 있으면 알림이 늦거나 누락될 수 있습니다.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={configure ? () => window.dispatchEvent(new CustomEvent('sepilot:open-settings-tab', { detail: 'google' })) : onOpenCalendar}>{configure ? 'Google 연결 설정' : '캘린더에서 확인'}</Button>
        <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('sepilot:open-settings-tab', { detail: 'mcp' }))}>이메일 등 서비스 연결</Button>
      </div>
    </section>
  )
}
