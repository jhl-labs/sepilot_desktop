'use client'
import { useRef, useState, type ChangeEvent } from 'react'
import { Download, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useShellStore } from '@/lib/store/shell-store'
import { registerSettingsTab } from './registry'

registerSettingsTab({
  key: 'shell',
  section: 'tools',
  label: 'Shell',
  search: ['shell', 'terminal', 'ssh', 'putty', 'termius', 'profile', 'backup', 'restore'],
  buildFeature: 'shell',
  render: () => <ShellSettingsTab />,
})

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function ShellSettingsTab() {
  const preferences = useShellStore((state) => state.preferences)
  const profiles = useShellStore((state) => state.profiles)
  const groups = useShellStore((state) => state.groups)
  const snippets = useShellStore((state) => state.snippets)
  const tabs = useShellStore((state) => state.tabs)
  const activity = useShellStore((state) => state.activity)
  const commandHistory = useShellStore((state) => state.commandHistory)
  const setPreferences = useShellStore((state) => state.setPreferences)
  const exportLibrary = useShellStore((state) => state.exportLibrary)
  const importLibrary = useShellStore((state) => state.importLibrary)
  const importSshConfig = useShellStore((state) => state.importSshConfig)
  const inputRef = useRef<HTMLInputElement>(null)
  const sshConfigInputRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)

  function exportShellLibrary() {
    downloadJson(`sepilotd-shell-${new Date().toISOString().slice(0, 10)}.json`, exportLibrary())
    setStatus('Shell backup exported.')
  }

  async function importShellLibraryFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const ok = importLibrary(await file.text())
    setStatus(ok ? 'Shell backup imported.' : 'Shell backup import failed.')
  }

  function applySshConfig(content: string) {
    const count = importSshConfig(content)
    setStatus(count > 0 ? `${count} SSH profile(s) imported.` : 'No new SSH profiles found.')
  }

  async function importDefaultSshConfig() {
    const content = await window.sepilot?.shell.readSshConfig?.()
    if (!content) {
      setStatus('~/.ssh/config was not found or could not be read.')
      return
    }
    applySshConfig(content)
  }

  async function importSshConfigFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    applySshConfig(await file.text())
  }

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      <div className="rounded-md border p-3">
        <div className="mb-3">
          <h4 className="text-sm font-semibold">Terminal Control</h4>
          <p className="text-xs text-muted-foreground">
            터미널 입력, 붙여넣기 안전장치, 탭 복원, reconnect 기본값을 관리합니다.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.copyOnSelect}
              onChange={(event) => setPreferences({ copyOnSelect: event.target.checked })}
            />
            Copy on select
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.confirmPaste}
              onChange={(event) => setPreferences({ confirmPaste: event.target.checked })}
            />
            Confirm multi-line paste
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.bracketedPaste}
              onChange={(event) => setPreferences({ bracketedPaste: event.target.checked })}
            />
            Bracketed paste
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.warnDestructiveCommands}
              onChange={(event) =>
                setPreferences({ warnDestructiveCommands: event.target.checked })
              }
            />
            Warn destructive commands
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={preferences.restoreTabs}
              onChange={(event) => setPreferences({ restoreTabs: event.target.checked })}
            />
            Restore terminal tabs on launch
          </label>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="grid gap-1.5">
            Reconnect
            <select
              className="h-8 rounded-md border bg-background px-2 text-xs"
              value={preferences.reconnectMode}
              onChange={(event) =>
                setPreferences({
                  reconnectMode: event.target.value as typeof preferences.reconnectMode,
                })
              }
            >
              <option value="never">Never</option>
              <option value="on-exit">On exit</option>
              <option value="always">Always</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            Delay ms
            <Input
              type="number"
              min={250}
              max={60000}
              value={preferences.reconnectDelayMs}
              onChange={(event) =>
                setPreferences({ reconnectDelayMs: Number.parseInt(event.target.value, 10) })
              }
            />
          </label>
          <label className="grid gap-1.5">
            Scrollback
            <Input
              type="number"
              min={1000}
              max={100000}
              value={preferences.scrollback}
              onChange={(event) =>
                setPreferences({ scrollback: Number.parseInt(event.target.value, 10) })
              }
            />
          </label>
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold">Profiles & Backup</h4>
            <p className="text-xs text-muted-foreground">
              Shell 백업은 host, path, 옵션, 스니펫만 포함하고 비밀번호나 개인키 본문은 포함하지
              않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => void importDefaultSshConfig()}
              disabled={!(typeof window !== 'undefined' && window.sepilot?.shell.readSshConfig)}
            >
              <Download className="h-3.5 w-3.5" />
              SSH Config
            </Button>
            <Button size="sm" variant="outline" onClick={() => sshConfigInputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              File
            </Button>
            <Button size="sm" variant="outline" onClick={exportShellLibrary}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              Import
            </Button>
          </div>
        </div>
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          <div className="rounded-md border px-3 py-2">
            <div className="text-base font-semibold text-foreground">{profiles.length}</div>
            Profiles
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-base font-semibold text-foreground">{groups.length}</div>
            Groups
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-base font-semibold text-foreground">{snippets.length}</div>
            Snippets
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-base font-semibold text-foreground">{tabs.length}</div>
            Open tabs
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-base font-semibold text-foreground">{activity.length}</div>
            Activity
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-base font-semibold text-foreground">{commandHistory.length}</div>
            Commands
          </div>
        </div>
        {status ? <p className="mt-3 text-xs text-muted-foreground">{status}</p> : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => void importShellLibraryFile(event)}
      />
      <input
        ref={sshConfigInputRef}
        type="file"
        className="hidden"
        onChange={(event) => void importSshConfigFile(event)}
      />
    </div>
  )
}
