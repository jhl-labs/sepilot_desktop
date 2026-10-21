'use client'
import { useState } from 'react'
import { parseExtensionManifest } from '@/lib/extensions/manifest'
import {
  TransportProvider,
  useTransport,
} from '@/components/providers/transport-provider'
import { createExtensionsApi } from '@/lib/api/extensions'
import { Button } from '@/components/ui/button'

const SAMPLE = JSON.stringify(
  {
    schemaVersion: 1,
    id: 'sample',
    name: '@sepilotd/sample',
    description: 'sample manifest',
    token: { scopes: ['inspect'] },
  },
  null,
  2,
)

function TestHostShell() {
  const transport = useTransport()
  const [text, setText] = useState(SAMPLE)
  const [parseErr, setParseErr] = useState<string | null>(null)
  const [installResult, setInstallResult] = useState<string | null>(null)

  function validate(): void {
    setParseErr(null)
    setInstallResult(null)
    try {
      parseExtensionManifest(JSON.parse(text))
      setInstallResult('매니페스트 유효')
    } catch (e) {
      setParseErr((e as Error).message)
    }
  }

  async function install(): Promise<void> {
    setInstallResult(null)
    setParseErr(null)
    try {
      const m = parseExtensionManifest(JSON.parse(text))
      const api = await createExtensionsApi(transport)
      const r = await api.install(m)
      setInstallResult(`installed: ${r.id}`)
    } catch (e) {
      setInstallResult(`error: ${(e as Error).message}`)
    }
  }

  return (
    <main className="flex h-screen flex-col gap-3 p-6">
      <h1 className="text-xl font-semibold">Test Extension Host</h1>
      <textarea
        className="min-h-[300px] w-full rounded-md border border-border bg-transparent p-2 font-mono text-xs"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {parseErr && <p className="text-xs text-red-500">{parseErr}</p>}
      {installResult && (
        <p className="text-xs text-muted-foreground">{installResult}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={validate}>
          매니페스트 검증
        </Button>
        <Button size="sm" onClick={() => void install()}>
          설치 시도
        </Button>
      </div>
    </main>
  )
}

export default function TestExtensionHostPage() {
  return (
    <TransportProvider>
      <TestHostShell />
    </TransportProvider>
  )
}
