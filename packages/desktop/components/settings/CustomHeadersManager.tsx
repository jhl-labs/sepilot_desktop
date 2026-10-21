'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'custom-headers',
  section: 'models',
  label: 'Custom Headers',
  search: ['headers', 'http'],
  render: () => <CustomHeadersManager />,
})

export function CustomHeadersManager() {
  const [headers, setHeaders] = useState<Record<string, string>>({})
  const [k, setK] = useState('')
  const [v, setV] = useState('')

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex gap-2">
        <input
          className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm"
          placeholder="Header"
          value={k}
          onChange={(e) => setK(e.target.value)}
        />
        <input
          className="flex h-9 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm"
          placeholder="Value"
          value={v}
          onChange={(e) => setV(e.target.value)}
        />
        <Button
          size="sm"
          onClick={() => {
            if (!k.trim()) return
            setHeaders({ ...headers, [k]: v })
            setK('')
            setV('')
          }}
        >
          추가
        </Button>
      </div>
      <ul className="flex flex-col gap-1">
        {Object.entries(headers).map(([key, val]) => (
          <li
            key={key}
            className="flex items-center justify-between rounded-md border border-border p-2"
          >
            <span>
              <strong>{key}</strong>: {val}
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                const next = { ...headers }
                delete next[key]
                setHeaders(next)
              }}
            >
              제거
            </Button>
          </li>
        ))}
        {Object.keys(headers).length === 0 && (
          <li className="px-1 text-xs text-muted-foreground">
            사용자 지정 헤더가 없습니다.
          </li>
        )}
      </ul>
    </div>
  )
}
