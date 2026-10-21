'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { confirm } from '@/lib/utils/confirm'
import { useTranslation } from 'react-i18next'
import { useTransport } from '@/components/providers/transport-provider'
import { useTheme } from '@/components/providers/theme-provider'
import { getDesktopApi } from '@/lib/electron/bridge'
import { createSettingsApi } from '@/lib/api/settings'
import { useAppShellStore } from '@/lib/store/app-shell-store'
import { useChatModeStore } from '@/lib/store/chat-mode-store'
import { localizeChatModes } from '@/lib/chat/chat-modes'
import { newChatModeOptions, readDefaultNewChatMode, saveDefaultNewChatMode } from '@/lib/chat/new-chat-mode'
import { useSettingsStore } from '@/lib/store/settings-store'
import { recordSettingsSave } from '@/lib/store/settings-save-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { registerSettingsTab } from './registry'
import {
  SETTINGS_CONTROL_CLASS,
  SettingsSection,
  SettingsSectionHeader,
  SettingsStack,
} from './_shared/SettingsLayout'

registerSettingsTab({
  key: 'general',
  section: 'general',
  label: 'General',
  search: ['theme', 'language', 'locale', 'default', 'mode', 'auto', '기본', '모드'],
  render: () => <GeneralSettingsTab />,
})

export function GeneralSettingsTab() {
  const { t } = useTranslation()
  const transport = useTransport()
  const { theme, setTheme } = useTheme()
  const locale = useAppShellStore((s) => s.locale)
  const setLocale = useAppShellStore((s) => s.setLocale)
  const general = useSettingsStore((s) => s.general)
  const setGeneral = useSettingsStore((s) => s.setGeneral)
  const [workingDirInput, setWorkingDirInput] = useState(
    general.workingDir ?? '',
  )
  const canBrowseForDirectory = Boolean(getDesktopApi()?.selectDirectory)

  useEffect(() => {
    setWorkingDirInput(general.workingDir ?? '')
  }, [general.workingDir])

  async function persistGeneral(
    next: Partial<{
      theme: 'light' | 'dark' | 'system'
      locale: 'ko' | 'en'
      workingDir: string | null
    }>,
  ) {
    setGeneral(next)
    try {
      const api = await createSettingsApi(transport)
      await api.setGeneral(next)
      recordSettingsSave('general')
    } catch (error) {
      toast.error('일반 설정을 저장하지 못했습니다.', {
        description:
          error instanceof Error ? error.message : '알 수 없는 오류',
      })
    }
  }

  async function browseWorkingDirectory() {
    const nextDirectory = await getDesktopApi()?.selectDirectory(
      workingDirInput || general.workingDir || undefined,
    )
    if (typeof nextDirectory !== 'string') {
      return
    }
    setWorkingDirInput(nextDirectory)
    await persistGeneral({ workingDir: nextDirectory })
  }

  async function saveWorkingDirectory() {
    const normalized = workingDirInput.trim() || null
    setWorkingDirInput(normalized ?? '')
    await persistGeneral({ workingDir: normalized })
  }

  return (
    <SettingsStack>
      <SettingsSection>
        <SettingsSectionHeader
          title="Appearance"
          description="앱 테마와 표시 언어를 기본값으로 저장합니다."
        />
        <div className="grid gap-2 lg:grid-cols-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-2">
            <span className="text-xs font-medium">Theme</span>
            <div className="flex gap-1">
              {(['light', 'dark', 'system'] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={theme === v ? 'default' : 'outline'}
                  onClick={() => {
                    setTheme(v)
                    void persistGeneral({ theme: v })
                  }}
                >
                  {t(
                    `theme${v.charAt(0).toUpperCase()}${v.slice(1)}` as
                      | 'themeLight'
                      | 'themeDark'
                      | 'themeSystem',
                  )}
                </Button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/30 px-2.5 py-2">
            <span className="text-xs font-medium">Language</span>
            <div className="flex gap-1">
              {(['ko', 'en'] as const).map((v) => (
                <Button
                  key={v}
                  size="sm"
                  variant={locale === v ? 'default' : 'outline'}
                  onClick={() => {
                    setLocale(v)
                    void persistGeneral({ locale: v })
                  }}
                >
                  {t(v === 'ko' ? 'languageKo' : 'languageEn')}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection>
        <SettingsSectionHeader
          title="Workspace"
          description="새 대화에서 daemon이 사용할 기본 작업 디렉터리입니다."
        />
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <Input
            value={workingDirInput}
            onChange={(e) => setWorkingDirInput(e.target.value)}
            placeholder="daemon이 사용할 작업 디렉토리"
            className={`${SETTINGS_CONTROL_CLASS} min-w-0 font-mono`}
          />
          <Button size="sm" variant="outline" onClick={() => void saveWorkingDirectory()}>
            저장
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void browseWorkingDirectory()}
            disabled={!canBrowseForDirectory}
          >
            찾아보기
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setWorkingDirInput('')
              void persistGeneral({ workingDir: null })
            }}
          >
            초기화
          </Button>
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">
          비워두면 daemon 기본 작업 디렉토리를 사용합니다.
          {!canBrowseForDirectory
            ? ' 브라우저에서는 경로를 직접 입력해야 합니다.'
            : ''}
        </p>
      </SettingsSection>

      <NewChatModeSection />
      <ChatRenderingSection />
      <SetupReplaySection />
    </SettingsStack>
  )
}

const CHAT_WIDTH_KEY = 'sepilot_chat_message_width'
const CHAT_WIDTH_EVENT = 'sepilot:chat-width-changed'
const CHAT_WIDTH_MIN = 640
const CHAT_WIDTH_MAX = 1536
const CHAT_WIDTH_DEFAULT = 1024

function readStoredChatWidth(): number {
  if (typeof window === 'undefined') return CHAT_WIDTH_DEFAULT
  const raw = window.localStorage.getItem(CHAT_WIDTH_KEY)
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed)) return CHAT_WIDTH_DEFAULT
  return Math.min(Math.max(parsed, CHAT_WIDTH_MIN), CHAT_WIDTH_MAX)
}

function ChatRenderingSection() {
  const [width, setWidth] = useState<number>(() => readStoredChatWidth())

  function commit(next: number): void {
    setWidth(next)
    if (typeof window === 'undefined') return
    window.localStorage.setItem(CHAT_WIDTH_KEY, String(next))
    window.dispatchEvent(
      new CustomEvent(CHAT_WIDTH_EVENT, { detail: next }),
    )
  }

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Chat rendering"
        description="채팅 transcript의 최대 너비를 조절합니다."
      />
      <label className="flex flex-col gap-1.5 text-xs">
        <span className="flex items-center justify-between">
          <span>최대 너비</span>
          <span className="font-mono text-xs text-muted-foreground">
            {width}px
          </span>
        </span>
        <input
          type="range"
          min={CHAT_WIDTH_MIN}
          max={CHAT_WIDTH_MAX}
          step={32}
          value={width}
          onChange={(e) => commit(Number.parseInt(e.target.value, 10))}
          className="w-full accent-primary"
        />
        <span className="text-[11px] text-muted-foreground">
          현재는 localStorage에 저장됩니다. 데스크톱 셸이 다음 슬라이스에서
          이 값을 읽어 transcript max-w-* 클래스를 동적으로 적용합니다.
        </span>
      </label>
    </SettingsSection>
  )
}

const SETUP_KEY = 'sepilotd.setupCompleted'

function SetupReplaySection() {
  async function replay(): Promise<void> {
    if (typeof window === 'undefined') return
    if (!(await confirm('시작 설정을 다시 진행할까요?'))) return
    window.localStorage.removeItem(SETUP_KEY)
    window.location.reload()
  }
  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="시작 설정"
        description="AI 모델과 기본 작업 폴더를 정하는 첫 실행 설정을 다시 진행합니다."
        className="mb-0"
        action={
          <Button size="sm" variant="outline" onClick={replay}>
            시작 설정 다시 열기
          </Button>
        }
      />
    </SettingsSection>
  )
}

function NewChatModeSection() {
  const { t } = useTranslation()
  const catalog = useChatModeStore((state) => state.catalog)
  const [selected, setSelected] = useState(() => readDefaultNewChatMode(catalog))
  const options = localizeChatModes(newChatModeOptions(catalog), (key) => t(key))
  const displayed = options.some((mode) => mode.id === selected) ? selected : readDefaultNewChatMode(catalog)
  return <SettingsSection>
    <SettingsSectionHeader title={t('newChatMode.title')} description={t('newChatMode.description')} />
    <label className="flex flex-col gap-2 text-xs">
      <span>{t('newChatMode.label')}</span>
      <select className={SETTINGS_CONTROL_CLASS} value={displayed} onChange={(event) => {
        try {
          saveDefaultNewChatMode(event.target.value, catalog)
          setSelected(event.target.value)
          recordSettingsSave('general')
        } catch {
          toast.error(t('newChatMode.saveFailed'))
        }
      }}>
        {options.map((mode) => <option key={mode.id} value={mode.id}>{mode.label}</option>)}
      </select>
    </label>
  </SettingsSection>
}
