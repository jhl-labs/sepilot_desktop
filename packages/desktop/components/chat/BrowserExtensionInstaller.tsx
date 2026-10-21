'use client'

import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { invokeDesktop } from '@/lib/electron/bridge'

type SetupResult =
  | { method: 'store'; browser: 'chrome' | 'edge'; storeUrl: string; browserOpened: boolean }
  | {
      method: 'unpacked'
      browser: 'chrome' | 'edge'
      directory: string
      browserOpened: boolean
      folderOpened: boolean
    }

export function BrowserExtensionInstaller() {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SetupResult | null>(null)
  const [error, setError] = useState('')
  const install = async (browser: 'chrome' | 'edge') => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const prepared = await invokeDesktop<SetupResult>('sepilot:browser/install-extension', {
        browser,
      })
      if (!prepared)
        throw new Error(
          '설치 도우미는 SEPilot Desktop에서 사용할 수 있습니다. 업데이트 후 Desktop을 다시 시작하세요.',
        )
      setResult(prepared)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 rounded border border-border bg-background p-3">
      <p className="font-medium">브라우저 확장 설치</p>
      <div className="flex flex-wrap gap-2">
        {(['chrome', 'edge'] as const).map((browser) => (
          <button
            key={browser}
            type="button"
            disabled={busy}
            className="flex items-center gap-1 rounded border px-3 py-2 disabled:opacity-50"
            onClick={() => void install(browser)}
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            {browser === 'chrome' ? 'Chrome' : 'Edge'}에 설치
          </button>
        ))}
      </div>
      <p className="text-muted-foreground">
        설치를 준비하고 브라우저의 설치 화면을 엽니다. 마지막 추가 확인은 브라우저에서 진행합니다.
      </p>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {result?.method === 'store' && (
        <p role="status">
          스토어를 열었습니다. 브라우저에서 확장 추가를 확인한 뒤 이 대화로 돌아오세요.
        </p>
      )}
      {result?.method === 'unpacked' && (
        <div role="status" className="space-y-2">
          <p className="font-medium">설치 파일 준비 완료 · 폴더 경로를 클립보드에 복사했습니다.</p>
          <p>현재는 스토어 등록 전 버전입니다. 확장 관리 화면에서 다음 단계를 완료하세요.</p>
          {!result.browserOpened && (
            <p>
              브라우저를 자동으로 찾지 못했습니다. {result.browser}://extensions/ 를 직접 여세요.
            </p>
          )}
          <ol className="ml-5 list-decimal space-y-1">
            <li>개발자 모드를 켭니다.</li>
            <li>“압축해제된 확장 프로그램을 로드합니다”를 선택합니다.</li>
            <li>
              아래 폴더를 선택합니다. macOS에서는 ⌘⇧G를 누른 뒤 복사된 경로를 붙여넣을 수 있습니다.
            </li>
          </ol>
          <input
            aria-label="확장 설치 폴더"
            className="w-full rounded border bg-muted p-2"
            readOnly
            value={result.directory}
            onFocus={(event) => event.target.select()}
          />
          <p>추가가 완료되면 아래에서 연결 토큰을 만들고 공유할 탭에서 확장 아이콘을 누르세요.</p>
        </div>
      )}
    </div>
  )
}
