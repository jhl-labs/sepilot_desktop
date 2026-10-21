import React, { useEffect, useState } from 'react'
import {
  Activity,
  Bot,
  Languages,
  Search,
  Settings2,
} from 'lucide-react'
import { Settings, type DesktopSettingsSection } from './Settings'
import { useLocale } from './useLocale'
import { useModalViewportLock } from '../../lib/hooks/use-modal-viewport-lock'

interface DesktopSettingsDialogProps {
  open: boolean
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  onClose: () => void
}

const SETTINGS_DIALOG_COPY = {
  en: {
    dialogAria: 'Settings',
    closeBarKicker: 'Workspace preferences',
    closeBarTitle: 'Settings',
    closeBarDetail: 'Align daemon defaults, providers, and export tooling without leaving the current workspace.',
    closeButton: 'Close',
    sectionsAria: 'Settings sections',
    sidebarKicker: 'Workspace',
    sidebarTitle: 'Settings',
    sidebarCopy: 'Mirror the private desktop pattern with a dedicated settings rail and focused section body.',
    searchPlaceholder: 'Search settings',
    searchAria: 'Search settings',
    noSearchMatch: 'No settings sections match this search.',
    groupWorkspace: 'Workspace',
    groupRuntime: 'Runtime',
    sectionGeneral: 'General',
    sectionGeneralDetail: 'Theme, device identity, and daemon endpoint context.',
    sectionAgent: 'Agent',
    sectionAgentDetail: 'Autonomy, thinking defaults, and startup routing.',
    sectionProviders: 'Providers',
    sectionProvidersDetail: 'Configured models and embedding backends.',
    sectionHealth: 'Health',
    sectionHealthDetail: 'Markdown export and runtime diagnostics handoff.',
  },
  ko: {
    dialogAria: '설정',
    closeBarKicker: '워크스페이스 환경 설정',
    closeBarTitle: '설정',
    closeBarDetail: '현재 워크스페이스를 떠나지 않고 daemon 기본값, provider, 내보내기 도구를 정렬합니다.',
    closeButton: '닫기',
    sectionsAria: '설정 섹션',
    sidebarKicker: '워크스페이스',
    sidebarTitle: '설정',
    sidebarCopy: '프라이빗 데스크톱 패턴을 따라 전용 설정 레일과 집중된 섹션 본문을 제공합니다.',
    searchPlaceholder: '설정 검색',
    searchAria: '설정 검색',
    noSearchMatch: '검색 결과에 해당하는 설정 섹션이 없습니다.',
    groupWorkspace: '워크스페이스',
    groupRuntime: '런타임',
    sectionGeneral: '일반',
    sectionGeneralDetail: '테마, 디바이스 ID, daemon 엔드포인트 컨텍스트.',
    sectionAgent: '에이전트',
    sectionAgentDetail: '자율성, thinking 기본값, 시작 라우팅.',
    sectionProviders: 'Provider',
    sectionProvidersDetail: '구성된 모델과 임베딩 백엔드.',
    sectionHealth: '상태',
    sectionHealthDetail: 'Markdown 내보내기와 런타임 진단 인계.',
  },
} as const

export function DesktopSettingsDialog({
  open,
  theme,
  onToggleTheme,
  onClose,
}: DesktopSettingsDialogProps) {
  const { locale } = useLocale()
  const copy = SETTINGS_DIALOG_COPY[locale] ?? SETTINGS_DIALOG_COPY.en
  const [activeSection, setActiveSection] = useState<DesktopSettingsSection>('general')
  const [searchQuery, setSearchQuery] = useState('')
  useModalViewportLock(open)

  const SETTINGS_SECTIONS: Array<{
    id: DesktopSettingsSection
    label: string
    detail: string
    icon: typeof Languages
  }> = [
    { id: 'general', label: copy.sectionGeneral, detail: copy.sectionGeneralDetail, icon: Languages },
    { id: 'agent', label: copy.sectionAgent, detail: copy.sectionAgentDetail, icon: Bot },
    { id: 'providers', label: copy.sectionProviders, detail: copy.sectionProvidersDetail, icon: Settings2 },
    { id: 'health', label: copy.sectionHealth, detail: copy.sectionHealthDetail, icon: Activity },
  ]
  const SETTINGS_GROUPS: Array<{
    id: string
    label: string
    sections: typeof SETTINGS_SECTIONS
  }> = [
    {
      id: 'workspace',
      label: copy.groupWorkspace,
      sections: SETTINGS_SECTIONS.filter((section) => ['general', 'health'].includes(section.id)),
    },
    {
      id: 'runtime',
      label: copy.groupRuntime,
      sections: SETTINGS_SECTIONS.filter((section) => ['agent', 'providers'].includes(section.id)),
    },
  ]

  useEffect(() => {
    if (!open) {
      return
    }

    setActiveSection('general')
    setSearchQuery('')

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) {
    return null
  }

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const filteredGroups = SETTINGS_GROUPS
    .map((group) => ({
      ...group,
      sections: group.sections.filter((section) =>
        !normalizedQuery
        || section.label.toLowerCase().includes(normalizedQuery)
        || section.detail.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.sections.length > 0)

  return (
    <div
      className="settings-dialog-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={copy.dialogAria}
    >
      <div className="settings-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="settings-dialog-closebar">
          <div className="settings-dialog-copy">
            <span className="settings-dialog-kicker">{copy.closeBarKicker}</span>
            <strong className="settings-dialog-title">{copy.closeBarTitle}</strong>
            <span className="settings-dialog-detail">
              {copy.closeBarDetail}
            </span>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            {copy.closeButton}
          </button>
        </div>
        <div className="settings-dialog-body">
          <div className="settings-dialog-shell">
            <aside className="settings-dialog-sidebar" aria-label={copy.sectionsAria}>
              <label className="settings-dialog-search">
                <Search className="shell-icon" aria-hidden="true" />
                <input
                  className="input settings-dialog-search-input"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={copy.searchPlaceholder}
                  aria-label={copy.searchAria}
                />
              </label>
              {filteredGroups.length === 0 ? (
                <div className="surface-empty-inline">{copy.noSearchMatch}</div>
              ) : (
                filteredGroups.map((group) => (
                  <section key={group.id} className="settings-dialog-group">
                    <span className="settings-dialog-group-label">{group.label}</span>
                    <nav className="settings-dialog-nav">
                      {group.sections.map((section) => (
                        <button
                          key={section.id}
                          type="button"
                          className={`settings-dialog-nav-item ${activeSection === section.id ? 'active' : ''}`}
                          onClick={() => setActiveSection(section.id)}
                          title={section.detail}
                          aria-current={activeSection === section.id ? 'page' : undefined}
                        >
                          <span className="settings-dialog-nav-icon" aria-hidden="true">
                            <section.icon className="shell-icon" />
                          </span>
                          <span className="settings-dialog-nav-label">{section.label}</span>
                          <span className="settings-dialog-nav-detail">{section.detail}</span>
                        </button>
                      ))}
                    </nav>
                  </section>
                ))
              )}
            </aside>
            <div className="settings-dialog-content">
              <Settings
                theme={theme}
                onToggleTheme={onToggleTheme}
                activeSection={activeSection}
                embedded
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
