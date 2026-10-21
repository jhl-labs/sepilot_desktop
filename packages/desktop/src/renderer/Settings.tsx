import React, { useState, useEffect } from 'react'
import type {
  DaemonConfig,
  DaemonConfigUpdateInput,
  DaemonProviderInfo,
} from '@sepilotd/api-client'
import { useLocale, type SupportedLocale } from './useLocale'

const SETTINGS_COPY = {
  en: {
    sectionGeneralLabel: 'General',
    sectionGeneralTitle: 'Workspace chrome and identity',
    sectionGeneralSummary: 'Control appearance, device naming, and the desktop runtime identity.',
    sectionAgentLabel: 'Agent',
    sectionAgentTitle: 'Default provider and behavior',
    sectionAgentSummary: 'Set the defaults used by new chat sessions before any explicit override.',
    sectionProvidersLabel: 'Providers',
    sectionProvidersTitle: 'Configured model backends',
    sectionProvidersSummary: 'Inspect available models and embedding providers wired into the daemon.',
    sectionHealthLabel: 'Health',
    sectionHealthTitle: 'Operational export',
    sectionHealthSummary: 'Export the current daemon health snapshot and readiness state as Markdown.',
    appearance: 'Appearance',
    appearanceCopy: 'Control the desktop theme and device identity shown to the daemon and companion surfaces.',
    theme: 'Theme',
    switchToLight: 'Switch to Light',
    switchToDark: 'Switch to Dark',
    name: 'Name',
    id: 'ID',
    role: 'Role',
    daemon: 'Daemon',
    agentTitle: 'Agent',
    agentSubtitle: 'Default provider and behavior',
    agentCopy: 'Set the runtime defaults used when new chat surfaces start without an explicit session override.',
    autonomy: 'Autonomy',
    readonly: 'Read Only',
    supervised: 'Supervised',
    autonomous: 'Autonomous',
    thinkingLevelLabel: 'Thinking Level',
    defaultProviderLabel: 'Default Provider',
    defaultModelLabel: 'Default Model',
    chooseProvider: 'Choose provider',
    chooseModel: 'Choose model',
    chooseProviderFirst: 'Choose provider first',
    defaultProviderAria: 'Default provider',
    defaultModelAria: 'Default model',
    healthReport: 'Health Report',
    healthReportTitle: 'Operational export',
    healthReportCopy: 'Export the current daemon, readiness, and gateway-watch state as a Markdown report.',
    diagnosticBundle: 'Diagnostic Bundle',
    diagnosticBundleCopy: 'Save a redacted incident bundle with desktop logs, trace IDs, and runtime metadata.',
    copyMarkdown: 'Copy Markdown',
    copying: 'Copying...',
    saveMd: 'Save .md',
    savingMd: 'Saving...',
    saveDiagnostics: 'Save Diagnostics',
    savingDiagnostics: 'Saving diagnostics...',
    clipboardApiUnavailable: 'Clipboard API unavailable',
    healthCopied: 'Health report copied to clipboard.',
    healthCopyFailed: 'Failed to copy health report.',
    healthSavedPrefix: (path: string) => `Saved health report to ${path}`,
    diagnosticsSavedPrefix: (path: string) => `Saved diagnostic bundle to ${path}`,
    saveCanceled: 'Save canceled.',
    healthSaveFailed: 'Failed to save health report.',
    diagnosticsSaveFailed: 'Failed to save diagnostic bundle.',
    llmProviders: 'LLM Providers',
    configuredBackends: 'Configured model backends',
    configuredSuffix: (n: number) => `${n} configured`,
    providersCopy: 'Inspect the models and embedding backends available to new sessions and memory flows.',
    noProviders: 'No providers configured',
    modelsSuffix: (n: number) => `${n} models`,
    modelsLabel: 'Models',
    embeddingsLabel: 'Embeddings',
    unsupported: 'unsupported',
    workspaceSettings: 'Workspace Settings',
    settingsTitle: 'Settings',
    configVersionPrefix: 'Config v',
    pageSummary: 'Tune desktop defaults, device identity, agent behavior, and operational exports from a single runtime panel.',
    provider: 'Provider',
    unset: 'Unset',
    dark: 'Dark',
    light: 'Light',
    saving: 'Saving...',
    saved: 'Saved!',
    error: 'Error',
    saveChanges: 'Save Changes',
  },
  ko: {
    sectionGeneralLabel: '일반',
    sectionGeneralTitle: '워크스페이스 크롬과 ID',
    sectionGeneralSummary: '외관, 디바이스 이름, 데스크톱 런타임 ID를 제어합니다.',
    sectionAgentLabel: '에이전트',
    sectionAgentTitle: '기본 provider와 동작',
    sectionAgentSummary: '새 채팅 세션이 명시적 재정의 없이 시작할 때 사용할 기본값을 설정합니다.',
    sectionProvidersLabel: 'Provider',
    sectionProvidersTitle: '구성된 모델 백엔드',
    sectionProvidersSummary: 'daemon에 연결된 사용 가능한 모델과 임베딩 provider를 확인합니다.',
    sectionHealthLabel: '상태',
    sectionHealthTitle: '운영 내보내기',
    sectionHealthSummary: '현재 daemon 상태 스냅샷과 준비 상태를 Markdown으로 내보냅니다.',
    appearance: '외관',
    appearanceCopy: 'daemon과 동반 표면에 표시되는 데스크톱 테마와 디바이스 ID를 제어합니다.',
    theme: '테마',
    switchToLight: '라이트로 전환',
    switchToDark: '다크로 전환',
    name: '이름',
    id: 'ID',
    role: '역할',
    daemon: 'Daemon',
    agentTitle: '에이전트',
    agentSubtitle: '기본 provider와 동작',
    agentCopy: '명시적 세션 재정의 없이 새 채팅 표면이 시작될 때 사용할 런타임 기본값을 설정합니다.',
    autonomy: '자율성',
    readonly: '읽기 전용',
    supervised: '감독됨',
    autonomous: '자율',
    thinkingLevelLabel: 'Thinking 레벨',
    defaultProviderLabel: '기본 Provider',
    defaultModelLabel: '기본 모델',
    chooseProvider: 'Provider 선택',
    chooseModel: '모델 선택',
    chooseProviderFirst: 'Provider를 먼저 선택하세요',
    defaultProviderAria: '기본 provider',
    defaultModelAria: '기본 모델',
    healthReport: '상태 리포트',
    healthReportTitle: '운영 내보내기',
    healthReportCopy: '현재 daemon, 준비 상태, gateway-watch 상태를 Markdown 리포트로 내보냅니다.',
    diagnosticBundle: '진단 번들',
    diagnosticBundleCopy: '데스크톱 로그, 추적 ID, 런타임 메타데이터를 redaction된 장애 리포트 번들로 저장합니다.',
    copyMarkdown: 'Markdown 복사',
    copying: '복사 중...',
    saveMd: '.md 저장',
    savingMd: '저장 중...',
    saveDiagnostics: '진단 번들 저장',
    savingDiagnostics: '진단 저장 중...',
    clipboardApiUnavailable: '클립보드 API를 사용할 수 없습니다',
    healthCopied: '상태 리포트를 클립보드에 복사했습니다.',
    healthCopyFailed: '상태 리포트 복사에 실패했습니다.',
    healthSavedPrefix: (path: string) => `상태 리포트를 ${path}에 저장했습니다`,
    diagnosticsSavedPrefix: (path: string) => `진단 번들을 ${path}에 저장했습니다`,
    saveCanceled: '저장이 취소되었습니다.',
    healthSaveFailed: '상태 리포트 저장에 실패했습니다.',
    diagnosticsSaveFailed: '진단 번들 저장에 실패했습니다.',
    llmProviders: 'LLM Provider',
    configuredBackends: '구성된 모델 백엔드',
    configuredSuffix: (n: number) => `${n}개 구성됨`,
    providersCopy: '새 세션과 메모리 흐름에서 사용 가능한 모델과 임베딩 백엔드를 확인합니다.',
    noProviders: '구성된 provider가 없습니다',
    modelsSuffix: (n: number) => `모델 ${n}개`,
    modelsLabel: '모델',
    embeddingsLabel: '임베딩',
    unsupported: '지원 안 함',
    workspaceSettings: '워크스페이스 설정',
    settingsTitle: '설정',
    configVersionPrefix: '구성 버전 v',
    pageSummary: '데스크톱 기본값, 디바이스 ID, 에이전트 동작, 운영 내보내기를 단일 런타임 패널에서 조정합니다.',
    provider: 'Provider',
    unset: '미설정',
    dark: '다크',
    light: '라이트',
    saving: '저장 중...',
    saved: '저장됨!',
    error: '오류',
    saveChanges: '변경 저장',
  },
} as const

type SettingsCopy = (typeof SETTINGS_COPY)[SupportedLocale]

interface SettingsProps {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
  activeSection?: DesktopSettingsSection
  embedded?: boolean
}

const autonomyOptions = ['readonly', 'supervised', 'autonomous'] as const
const thinkingLevelOptions = ['off', 'low', 'medium', 'high', 'max'] as const

export type DesktopSettingsSection = 'general' | 'agent' | 'providers' | 'health'

function buildSettingsSectionMeta(copy: SettingsCopy): Record<
  DesktopSettingsSection,
  { label: string, title: string, summary: string }
> {
  return {
    general: {
      label: copy.sectionGeneralLabel,
      title: copy.sectionGeneralTitle,
      summary: copy.sectionGeneralSummary,
    },
    agent: {
      label: copy.sectionAgentLabel,
      title: copy.sectionAgentTitle,
      summary: copy.sectionAgentSummary,
    },
    providers: {
      label: copy.sectionProvidersLabel,
      title: copy.sectionProvidersTitle,
      summary: copy.sectionProvidersSummary,
    },
    health: {
      label: copy.sectionHealthLabel,
      title: copy.sectionHealthTitle,
      summary: copy.sectionHealthSummary,
    },
  }
}

export function Settings({
  theme,
  onToggleTheme,
  activeSection,
  embedded = false,
}: SettingsProps) {
  const { locale } = useLocale()
  const copy = SETTINGS_COPY[locale] ?? SETTINGS_COPY.en
  const sectionMeta = buildSettingsSectionMeta(copy)
  const [config, setConfig] = useState<DaemonConfig | null>(null)
  const [providers, setProviders] = useState<DaemonProviderInfo[]>([])
  const [autonomy, setAutonomy] = useState<DaemonConfigUpdateInput['agent.autonomy']>('supervised')
  const [thinkingLevel, setThinkingLevel] = useState<DaemonConfigUpdateInput['agent.thinkingLevel']>('medium')
  const [defaultProvider, setDefaultProvider] = useState('')
  const [defaultModel, setDefaultModel] = useState('')
  const [deviceName, setDeviceName] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>(
    'idle',
  )
  const [healthReportPending, setHealthReportPending] =
    useState<'copy' | 'save' | 'diagnostics' | null>(null)
  const [healthReportStatus, setHealthReportStatus] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.sepilot.config().catch(() => null),
      window.sepilot.providers().catch(() => [] as DaemonProviderInfo[]),
    ])
      .then(([nextConfig, nextProviders]) => {
        setProviders(nextProviders)
        if (!nextConfig) {
          return
        }
        setConfig(nextConfig)
        setAutonomy(nextConfig.agent?.autonomy ?? 'supervised')
        setThinkingLevel(nextConfig.agent?.thinkingLevel ?? 'medium')
        setDefaultProvider(nextConfig.agent?.defaultProvider ?? '')
        setDefaultModel(nextConfig.agent?.defaultModel ?? '')
        setDeviceName(nextConfig.device?.name ?? '')
      })
      .catch(() => {})
  }, [])

  const availableDefaultModels =
    providers.find((provider) => provider.id === defaultProvider)?.models ?? []

  const handleSave = async () => {
    setSaving(true)
    setSaveStatus('idle')
    try {
      await window.sepilot.updateConfig({
        'agent.autonomy': autonomy,
        'agent.thinkingLevel': thinkingLevel,
        'agent.defaultProvider': defaultProvider,
        'agent.defaultModel': defaultModel,
        'device.name': deviceName,
      })
      setSaveStatus('success')
      const nextConfig = await window.sepilot.config()
      setConfig(nextConfig)
      setDefaultProvider(nextConfig.agent?.defaultProvider ?? defaultProvider)
      setDefaultModel(nextConfig.agent?.defaultModel ?? defaultModel)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveStatus('idle'), 3000)
    }
  }

  const handleCopyHealthReport = async () => {
    setHealthReportPending('copy')
    setHealthReportStatus(null)

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error(copy.clipboardApiUnavailable)
      }
      const report = await window.sepilot.healthReport('markdown') as string
      await navigator.clipboard.writeText(report)
      setHealthReportStatus(copy.healthCopied)
    } catch {
      setHealthReportStatus(copy.healthCopyFailed)
    } finally {
      setHealthReportPending(null)
    }
  }

  const handleSaveHealthReport = async () => {
    setHealthReportPending('save')
    setHealthReportStatus(null)

    try {
      const report = await window.sepilot.healthReport('markdown') as string
      const savedPath = await window.sepilot.saveHealthReport(report)
      setHealthReportStatus(
        savedPath
          ? copy.healthSavedPrefix(savedPath)
          : copy.saveCanceled,
      )
    } catch {
      setHealthReportStatus(copy.healthSaveFailed)
    } finally {
      setHealthReportPending(null)
    }
  }

  const handleSaveDiagnostics = async () => {
    setHealthReportPending('diagnostics')
    setHealthReportStatus(null)

    try {
      const saved = await window.sepilot.exportDiagnostics()
      setHealthReportStatus(
        saved
          ? copy.diagnosticsSavedPrefix(saved.path)
          : copy.saveCanceled,
      )
    } catch {
      setHealthReportStatus(copy.diagnosticsSaveFailed)
    } finally {
      setHealthReportPending(null)
    }
  }

  const activePanelMeta = sectionMeta[activeSection ?? 'general']

  const generalPanel = (
    <section className="card surface-panel settings-panel">
      <div className="surface-panel-header">
        <div>
          <div className="section-title">{copy.appearance}</div>
          <h3 className="surface-panel-title">{copy.sectionGeneralTitle}</h3>
        </div>
      </div>
      <p className="surface-panel-copy">
        {copy.appearanceCopy}
      </p>

      <div className="settings-control-list">
        <div className="info-row">
          <span className="info-row-label">{copy.theme}</span>
          <button
            className="btn btn-secondary btn-sm"
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? copy.switchToLight : copy.switchToDark}
          </button>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.name}</span>
          <input
            className="input settings-input"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
          />
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.id}</span>
          <span className="info-row-value">{config?.device.id ?? '\u2014'}</span>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.role}</span>
          <span className="info-row-value">{config?.device.role ?? '\u2014'}</span>
        </div>
        <div className="info-row">
          <span className="info-row-label">{copy.daemon}</span>
          <span className="info-row-value">
            {config ? `${config.daemon.host}:${config.daemon.port}` : '\u2014'}
          </span>
        </div>
      </div>
    </section>
  )

  const agentPanel = (
    <section className="card surface-panel settings-panel">
      <div className="surface-panel-header">
        <div>
          <div className="section-title">{copy.agentTitle}</div>
          <h3 className="surface-panel-title">{copy.agentSubtitle}</h3>
        </div>
      </div>
      <p className="surface-panel-copy">
        {copy.agentCopy}
      </p>

      <div className="settings-field-grid">
        <label className="settings-field">
          <span className="settings-field-label">{copy.autonomy}</span>
          <select
            className="input"
            value={autonomy}
            onChange={(e) => setAutonomy(e.target.value as DaemonConfigUpdateInput['agent.autonomy'])}
          >
            {autonomyOptions.map((option) => (
              <option key={option} value={option}>
                {option === 'readonly'
                  ? copy.readonly
                  : option === 'supervised'
                    ? copy.supervised
                    : option === 'autonomous'
                      ? copy.autonomous
                      : option}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-field-label">{copy.thinkingLevelLabel}</span>
          <select
            className="input"
            value={thinkingLevel}
            onChange={(e) => setThinkingLevel(e.target.value as DaemonConfigUpdateInput['agent.thinkingLevel'])}
          >
            {thinkingLevelOptions.map((l) => (
              <option key={l} value={l}>
                {l.charAt(0).toUpperCase() + l.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-field-label">{copy.defaultProviderLabel}</span>
          <select
            className="input"
            value={defaultProvider}
            onChange={(e) => {
              const nextProvider = e.target.value
              const nextModels =
                providers.find((provider) => provider.id === nextProvider)?.models ?? []
              setDefaultProvider(nextProvider)
              setDefaultModel(nextModels[0]?.id ?? '')
            }}
            aria-label={copy.defaultProviderAria}
          >
            <option value="">{copy.chooseProvider}</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field">
          <span className="settings-field-label">{copy.defaultModelLabel}</span>
          <select
            className="input"
            value={defaultModel}
            onChange={(e) => setDefaultModel(e.target.value)}
            aria-label={copy.defaultModelAria}
            disabled={!defaultProvider}
          >
            <option value="">
              {defaultProvider ? copy.chooseModel : copy.chooseProviderFirst}
            </option>
            {availableDefaultModels.map((model) => (
              <option key={model.id} value={model.id}>
                {model.id}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  )

  const healthPanel = (
    <section className="card surface-panel settings-panel">
      <div className="surface-panel-header">
        <div>
          <div className="section-title">{copy.healthReport}</div>
          <h3 className="surface-panel-title">{copy.healthReportTitle}</h3>
        </div>
      </div>
      <p className="surface-panel-copy">
        {copy.healthReportCopy}
      </p>

      <div className="settings-action-row">
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleCopyHealthReport}
          disabled={healthReportPending !== null}
        >
          {healthReportPending === 'copy' ? copy.copying : copy.copyMarkdown}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleSaveHealthReport}
          disabled={healthReportPending !== null}
        >
          {healthReportPending === 'save' ? copy.savingMd : copy.saveMd}
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={handleSaveDiagnostics}
          disabled={healthReportPending !== null}
        >
          {healthReportPending === 'diagnostics'
            ? copy.savingDiagnostics
            : copy.saveDiagnostics}
        </button>
      </div>

      <div className="mt-3">
        <div className="section-title">{copy.diagnosticBundle}</div>
        <p className="surface-panel-copy">{copy.diagnosticBundleCopy}</p>
      </div>

      {healthReportStatus && (
        <div className="settings-status-copy">{healthReportStatus}</div>
      )}
    </section>
  )

  const providersPanel = (
    <section className="card surface-panel settings-panel settings-panel-wide">
      <div className="surface-panel-header">
        <div>
          <div className="section-title">{copy.llmProviders}</div>
          <h3 className="surface-panel-title">{copy.configuredBackends}</h3>
        </div>
        <span className="tag">{copy.configuredSuffix(providers.length)}</span>
      </div>
      <p className="surface-panel-copy">
        {copy.providersCopy}
      </p>

      {providers.length === 0 && (
        <div className="surface-empty-inline">{copy.noProviders}</div>
      )}

      <div className="settings-provider-grid">
        {providers.map((p) => (
          <div key={p.id} className="settings-provider-card">
            <div className="settings-provider-header">
              <strong>
                {p.name} ({p.id})
              </strong>
              <span className="tag">{copy.modelsSuffix(p.models.length)}</span>
            </div>
            <div className="text-secondary mt-2" style={{ fontSize: 'var(--text-sm)' }}>
              {copy.modelsLabel}: {p.models.map((m) => m.id).join(', ')}
            </div>
            <div className="text-secondary mt-2" style={{ fontSize: 'var(--text-sm)' }}>
              {copy.embeddingsLabel}: {p.embeddingModelIds.join(', ') || copy.unsupported}
            </div>
          </div>
        ))}
      </div>
    </section>
  )

  const panelMap: Record<DesktopSettingsSection, React.ReactNode> = {
    general: generalPanel,
    agent: agentPanel,
    providers: providersPanel,
    health: healthPanel,
  }

  if (embedded) {
    return (
      <div className="settings-embedded-shell">
        <div className="settings-embedded-header">
          <span className="settings-dialog-kicker">{activePanelMeta.label}</span>
          <strong className="settings-embedded-title">{activePanelMeta.title}</strong>
          <span className="settings-embedded-summary">{activePanelMeta.summary}</span>
        </div>
        <div className="settings-embedded-actions">
          <div className="surface-page-chip">
            <span className="surface-page-chip-label">{copy.theme}</span>
            <strong>{theme === 'dark' ? copy.dark : copy.light}</strong>
          </div>
          <div className="surface-page-chip">
            <span className="surface-page-chip-label">{copy.provider}</span>
            <strong>{defaultProvider || copy.unset}</strong>
          </div>
          <button
            className={`btn ${
              saveStatus === 'success'
                ? 'btn-success'
                : saveStatus === 'error'
                  ? 'btn-danger'
                  : 'btn-primary'
            }`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? copy.saving
              : saveStatus === 'success'
                ? copy.saved
                : saveStatus === 'error'
                  ? copy.error
                  : copy.saveChanges}
          </button>
        </div>
        <div className="settings-embedded-content">
          {panelMap[activeSection ?? 'general']}
        </div>
      </div>
    )
  }

  return (
    <div className="page surface-page">
      <div className="surface-page-header">
        <div className="surface-page-copy">
          <span className="surface-page-kicker">{copy.workspaceSettings}</span>
          <div className="surface-page-title-row">
            <h2 className="page-title" style={{ marginBottom: 0 }}>
              {copy.settingsTitle}
            </h2>
            <span className="tag">{copy.configVersionPrefix}{config?.version ?? '\u2014'}</span>
          </div>
          <p className="surface-page-summary">
            {copy.pageSummary}
          </p>
        </div>

        <div className="surface-page-actions">
          <div className="surface-page-chip">
            <span className="surface-page-chip-label">{copy.theme}</span>
            <strong>{theme === 'dark' ? copy.dark : copy.light}</strong>
          </div>
          <div className="surface-page-chip">
            <span className="surface-page-chip-label">{copy.provider}</span>
            <strong>{defaultProvider || copy.unset}</strong>
          </div>
          <button
            className={`btn ${
              saveStatus === 'success'
                ? 'btn-success'
                : saveStatus === 'error'
                  ? 'btn-danger'
                  : 'btn-primary'
            }`}
            onClick={handleSave}
            disabled={saving}
          >
            {saving
              ? copy.saving
              : saveStatus === 'success'
                ? copy.saved
                : saveStatus === 'error'
                  ? copy.error
                  : copy.saveChanges}
          </button>
        </div>
      </div>

      <div className="settings-layout">
        {generalPanel}
        {agentPanel}
        {healthPanel}
        {providersPanel}
      </div>
    </div>
  )
}
