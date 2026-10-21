import React from 'react'
import { Bot, Brain, FolderOpen, Layers3, Send, Sparkles, Square, UserRound } from 'lucide-react'
import type { DesktopChatComposerModel } from './desktop-chat'
import { ChatStatusBar } from './ChatStatusBar'
import { useLocale } from './useLocale'
import { getDesktopComposerShortcutHint } from './composerShortcuts'

const COMPOSER_COPY = {
  en: {
    auto: 'Auto',
    instant: 'Instant',
    balanced: 'Balanced',
    deep: 'Deep',
    max: 'Max',
    defaultLabel: 'Default',
    none: 'None',
    noProject: 'No project',
    workingDirSummary: 'Use the daemon default workspace for repository-aware runs.',
    daemonDefaultWorkspace: 'Daemon default workspace',
    mode: 'Mode',
    bot: 'Bot',
    autoRouting: 'Auto · route each request',
    directOnly: 'direct only',
    provider: 'Provider',
    model: 'Model',
    thinking: 'Thinking',
    budget: 'Budget',
    persona: 'Persona',
    project: 'Project',
    workingDir: 'Working dir',
    workingDirectoryLabel: 'Working directory',
    maxTokens: 'Max tokens',
    responseControls: 'Response controls',
    thinkingAndRouting: 'Thinking and routing',
    workspaceBindings: 'Workspace bindings',
    contextAndDelivery: 'Context and delivery',
    advancedRouting: 'Advanced routing',
    advancedBindings: 'Advanced bindings',
    quickModeAria: 'Quick mode controls',
    quickThinkingAria: 'Quick thinking controls',
    quickBudgetAria: 'Quick response budget controls',
    quickPersonaAria: 'Quick persona controls',
    quickProjectAria: 'Quick project controls',
    responseBudget: 'Response budget',
    agentModeAria: 'Agent mode',
    botAria: 'Role bot for this turn',
    providerAria: 'Provider',
    modelAria: 'Model',
    thinkingLevelAria: 'Thinking level',
    maxTokensAria: 'Max tokens',
    personaAria: 'Persona',
    projectAria: 'Project',
    workingDirectoryAria: 'Working directory',
    chooseFolder: 'Choose folder',
    chooseFolderAria: 'Choose working directory',
    clear: 'Clear',
    clearAria: 'Clear working directory',
    runState: 'Run state',
    streaming: 'Streaming',
    tokensSuffix: (n: number) => `${n} tokens`,
    dropHint: 'Drop files or paste context into the composer.',
    composerPlaceholder: 'Message sepilotd...',
    composerAria: 'Chat message input',
    delivery: 'Delivery',
    stop: 'Stop',
    send: 'Send',
    stopAria: 'Stop active run',
    sendAria: 'Send message',
    shortcutHints: 'Enter send | Shift+Enter newline | Esc stop active run | Ctrl+N new | Ctrl+B workspace | Drop files',
    queuedHint: (count: number) => `queued (${count}) — sends when the current turn ends`,
    shortcutHelp: 'Enter opens keyboard help.',
    shortcutShellUnsupported: '! shell shortcuts run in the CLI TUI. Use sepilot in a terminal for local commands.',
    shortcutMemoryOpen: 'Enter opens the memory workspace.',
    shortcutMemorySearch: 'Enter opens memory search for this query.',
    shortcutMemoryCommand: 'Enter opens memory for this command.',
    shortcutMemorySave: 'Enter saves this as memory.',
    shortcutContext: '@path attachments are available in CLI TUI; drop or paste files here.',
  },
  ko: {
    auto: '자동',
    instant: '즉시',
    balanced: '균형',
    deep: '깊이',
    max: '최대',
    defaultLabel: '기본',
    none: '없음',
    noProject: '프로젝트 없음',
    workingDirSummary: '저장소 인식 실행을 위해 daemon 기본 워크스페이스를 사용합니다.',
    daemonDefaultWorkspace: 'Daemon 기본 워크스페이스',
    mode: '모드',
    bot: '봇',
    autoRouting: '자동 · 요청별 라우팅',
    directOnly: '직접 선택만',
    provider: 'Provider',
    model: '모델',
    thinking: 'Thinking',
    budget: '예산',
    persona: '페르소나',
    project: '프로젝트',
    workingDir: '작업 디렉토리',
    workingDirectoryLabel: '작업 디렉토리',
    maxTokens: '최대 토큰',
    responseControls: '응답 제어',
    thinkingAndRouting: 'Thinking과 라우팅',
    workspaceBindings: '워크스페이스 바인딩',
    contextAndDelivery: '컨텍스트와 전달',
    advancedRouting: '고급 라우팅',
    advancedBindings: '고급 바인딩',
    quickModeAria: '빠른 모드 제어',
    quickThinkingAria: '빠른 Thinking 제어',
    quickBudgetAria: '빠른 응답 예산 제어',
    quickPersonaAria: '빠른 페르소나 제어',
    quickProjectAria: '빠른 프로젝트 제어',
    responseBudget: '응답 예산',
    agentModeAria: '에이전트 모드',
    botAria: '이번 턴에 사용할 role bot',
    providerAria: 'Provider',
    modelAria: '모델',
    thinkingLevelAria: 'Thinking 레벨',
    maxTokensAria: '최대 토큰',
    personaAria: '페르소나',
    projectAria: '프로젝트',
    workingDirectoryAria: '작업 디렉토리',
    chooseFolder: '폴더 선택',
    chooseFolderAria: '작업 디렉토리 선택',
    clear: '지우기',
    clearAria: '작업 디렉토리 지우기',
    runState: '실행 상태',
    streaming: '스트리밍 중',
    tokensSuffix: (n: number) => `${n} 토큰`,
    dropHint: '컴포저에 파일을 드롭하거나 컨텍스트를 붙여넣으세요.',
    composerPlaceholder: 'sepilotd에 메시지 입력...',
    composerAria: '채팅 메시지 입력',
    delivery: '전달',
    stop: '중지',
    send: '전송',
    stopAria: '활성 실행 중지',
    sendAria: '메시지 전송',
    shortcutHints: 'Enter 전송 | Shift+Enter 줄바꿈 | Esc 실행 중지 | Ctrl+N 새로 만들기 | Ctrl+B 워크스페이스 | 파일 드롭',
    queuedHint: (count: number) => `대기 중 (${count}) — 현재 턴이 끝나면 전송됩니다`,
    shortcutHelp: 'Enter로 키보드 도움말을 엽니다.',
    shortcutShellUnsupported: '! 셸 단축키는 CLI TUI에서 실행됩니다. 로컬 명령은 터미널에서 sepilot을 사용하세요.',
    shortcutMemoryOpen: 'Enter로 메모리 워크스페이스를 엽니다.',
    shortcutMemorySearch: 'Enter로 이 쿼리의 메모리 검색을 엽니다.',
    shortcutMemoryCommand: 'Enter로 이 메모리 명령을 엽니다.',
    shortcutMemorySave: 'Enter로 이 내용을 메모리에 저장합니다.',
    shortcutContext: '@path 첨부는 CLI TUI에서 사용할 수 있습니다. 여기서는 파일을 드롭하거나 붙여넣으세요.',
  },
} as const

export function ChatComposer({ model }: { model: DesktopChatComposerModel }) {
  const { locale } = useLocale()
  const copy = COMPOSER_COPY[locale] ?? COMPOSER_COPY.en
  const quickThinkingOptions = [
    { value: 'off', label: copy.instant },
    { value: 'medium', label: copy.balanced },
    { value: 'high', label: copy.deep },
    { value: 'max', label: copy.max },
  ]
  const quickBudgetOptions = [
    { value: '', label: copy.defaultLabel },
    { value: '1024', label: '1k' },
    { value: '4096', label: '4k' },
    { value: '8192', label: '8k' },
  ]
  const quickPersonaOptions = createQuickOptions(
    model.personas.map((persona) => ({
      value: persona.id,
      label: persona.name,
    })),
    model.selectedPersona,
  )
  const quickProjectOptions = createQuickOptions(
    [
      { value: '', label: copy.none },
      ...model.projects.map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    model.selectedProjectId,
  )
  const workingDirectorySummary =
    model.workingDirectory || copy.workingDirSummary
  const queuedCount = model.queuedPromptCount ?? 0
  const showStopButton = model.loading && !model.input.trim()
  const shortcutHint = getDesktopComposerShortcutHint(model.input, {
    help: copy.shortcutHelp,
    shellUnsupported: copy.shortcutShellUnsupported,
    memoryOpen: copy.shortcutMemoryOpen,
    memorySearch: copy.shortcutMemorySearch,
    memoryCommand: copy.shortcutMemoryCommand,
    memorySave: copy.shortcutMemorySave,
    context: copy.shortcutContext,
  })
  const routingSummaryPills = [
    { label: copy.bot, value: model.botLabel, icon: Bot, active: true },
    { label: copy.mode, value: model.modeLabel, icon: Bot, active: model.selectedMode !== 'auto' },
    { label: copy.provider, value: model.providerLabel, icon: Sparkles, active: false },
    { label: copy.model, value: model.modelLabel, icon: Layers3, active: false },
    { label: copy.thinking, value: model.thinkingLabel, icon: Brain, active: false },
    { label: copy.budget, value: model.maxTokensLabel, icon: Layers3, active: false },
  ]
  const workspaceSummaryPills = [
    { label: copy.persona, value: model.personaLabel, icon: UserRound, active: true },
    {
      label: copy.project,
      value: model.projectLabel,
      icon: Layers3,
      active: Boolean(model.selectedProjectName),
    },
    {
      label: copy.workingDir,
      value: model.workingDirectoryLabel,
      icon: FolderOpen,
      active: Boolean(model.workingDirectory),
    },
  ]

  return (
    <div className="chat-input-area">
      <div className="chat-input-column">
        <div className="chat-toolbar-shell">
          <div className="chat-toolbar-stack">
            <section className="chat-toolbar-deck">
              <div className="chat-toolbar-deck-header">
                <div className="chat-toolbar-group">
                  <span className="chat-toolbar-label">{copy.responseControls}</span>
                  <strong className="chat-toolbar-deck-title">{copy.thinkingAndRouting}</strong>
                </div>
                <div className="chat-toolbar-pills">
                  {routingSummaryPills.map((pill) => {
                    const Icon = pill.icon
                    return (
                      <span
                        key={pill.label}
                        className={`chat-toolbar-pill ${pill.active ? 'active' : ''}`}
                      >
                        <Icon className="shell-icon" />
                        <span>
                          {pill.label} {pill.value}
                        </span>
                      </span>
                    )
                  })}
                </div>
              </div>

              <div className="chat-toolbar-quick-row">
                <div className="chat-toolbar-quick-group">
                  <span className="chat-toolbar-heading">
                    <Bot className="shell-icon" />
                    <span className="chat-toolbar-control-label">{copy.bot}</span>
                  </span>
                  <select
                    className="select chat-toolbar-select"
                    value={model.selectedBot}
                    onChange={(event) => model.onBotChange(event.target.value)}
                    aria-label={copy.botAria}
                  >
                    <option value="">{copy.autoRouting}</option>
                    {model.bots.map((bot) => (
                      <option key={bot.id} value={bot.id} title={bot.description}>
                        {bot.name}{bot.routable ? '' : ` · ${copy.directOnly}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="chat-toolbar-quick-group">
                  <span className="chat-toolbar-heading">
                    <Brain className="shell-icon" />
                    <span className="chat-toolbar-control-label">{copy.thinking}</span>
                  </span>
                  <div
                    className="chat-toolbar-segmented"
                    role="toolbar"
                    aria-label={copy.quickThinkingAria}
                  >
                    {quickThinkingOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`chat-toolbar-segment ${model.thinkingLevel === option.value ? 'active' : ''}`}
                        onClick={() => model.onThinkingLevelChange(option.value)}
                        aria-pressed={model.thinkingLevel === option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chat-toolbar-quick-group">
                  <span className="chat-toolbar-heading">
                    <Layers3 className="shell-icon" />
                    <span className="chat-toolbar-control-label">{copy.responseBudget}</span>
                  </span>
                  <div
                    className="chat-toolbar-segmented"
                    role="toolbar"
                    aria-label={copy.quickBudgetAria}
                  >
                    {quickBudgetOptions.map((option) => (
                      <button
                        key={option.value || 'default'}
                        type="button"
                        className={`chat-toolbar-segment ${model.maxTokensInput === option.value ? 'active' : ''}`}
                        onClick={() => model.onMaxTokensChange(option.value)}
                        aria-pressed={model.maxTokensInput === option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <details className="chat-toolbar-details">
                <summary className="chat-toolbar-details-summary">
                  <span className="chat-toolbar-details-summary-copy">
                    <Layers3 className="shell-icon" />
                    {copy.advancedRouting}
                  </span>
                </summary>
                <div className="chat-toolbar-control-grid chat-toolbar-control-grid-primary">
                  <label className="chat-toolbar-control">
                    <span className="chat-toolbar-heading">
                      <Bot className="shell-icon" />
                      <span className="chat-toolbar-control-label">{copy.mode}</span>
                    </span>
                    <select
                      className="select chat-toolbar-select"
                      value={model.selectedMode}
                      onChange={(event) => model.onModeChange(event.target.value)}
                      aria-label={copy.agentModeAria}
                    >
                      <option value="auto">{copy.auto}</option>
                      {model.agents
                        .filter((agent) => agent.id !== 'auto')
                        .map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="chat-toolbar-control">
                    <span className="chat-toolbar-control-label">{copy.provider}</span>
                    <select
                      className="select chat-toolbar-select"
                      value={model.selectedProvider}
                      onChange={(event) => model.onProviderChange(event.target.value)}
                      aria-label={copy.providerAria}
                    >
                      <option value="">{copy.auto}</option>
                      {model.providers.map((provider) => (
                        <option key={provider.id} value={provider.id}>
                          {provider.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="chat-toolbar-control">
                    <span className="chat-toolbar-control-label">{copy.model}</span>
                    <select
                      className="select chat-toolbar-select"
                      value={model.selectedModel}
                      onChange={(event) => model.onModelChange(event.target.value)}
                      aria-label={copy.modelAria}
                    >
                      <option value="">{copy.defaultLabel}</option>
                      {model.availableModels.map((availableModel) => (
                        <option key={availableModel} value={availableModel}>
                          {availableModel}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="chat-toolbar-control">
                    <span className="chat-toolbar-control-label">{copy.thinking}</span>
                    <select
                      className="select chat-toolbar-select"
                      value={model.thinkingLevel}
                      onChange={(event) => model.onThinkingLevelChange(event.target.value)}
                      aria-label={copy.thinkingLevelAria}
                    >
                      {['off', 'low', 'medium', 'high', 'max'].map((level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="chat-toolbar-control">
                    <span className="chat-toolbar-control-label">{copy.maxTokens}</span>
                    <input
                      className="input chat-toolbar-input"
                      type="number"
                      min="1"
                      step="1"
                      value={model.maxTokensInput}
                      onChange={(event) => model.onMaxTokensChange(event.target.value)}
                      placeholder={copy.defaultLabel}
                      inputMode="numeric"
                      aria-label={copy.maxTokensAria}
                    />
                  </label>
                </div>
              </details>
            </section>

            <section className="chat-toolbar-deck">
              <div className="chat-toolbar-deck-header">
                <div className="chat-toolbar-group">
                  <span className="chat-toolbar-label">{copy.workspaceBindings}</span>
                  <strong className="chat-toolbar-deck-title">{copy.contextAndDelivery}</strong>
                </div>
                <div className="chat-toolbar-toggle-row">
                  {workspaceSummaryPills.map((pill) => {
                    const Icon = pill.icon
                    return (
                      <span
                        key={pill.label}
                        className={`chat-toolbar-toggle ${pill.active ? 'active' : ''}`}
                      >
                        <Icon className="shell-icon" />
                        <span>
                          {pill.label} {pill.value}
                        </span>
                      </span>
                    )
                  })}
                </div>
              </div>

              <div className="chat-toolbar-quick-row">
                {quickPersonaOptions.length > 0 && (
                  <div className="chat-toolbar-quick-group">
                    <span className="chat-toolbar-heading">
                      <UserRound className="shell-icon" />
                      <span className="chat-toolbar-control-label">{copy.persona}</span>
                    </span>
                    <div
                      className="chat-toolbar-segmented"
                      role="toolbar"
                      aria-label={copy.quickPersonaAria}
                    >
                      {quickPersonaOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`chat-toolbar-segment ${model.selectedPersona === option.value ? 'active' : ''}`}
                          onClick={() => model.onPersonaChange(option.value)}
                          aria-pressed={model.selectedPersona === option.value}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="chat-toolbar-quick-group">
                  <span className="chat-toolbar-heading">
                    <Layers3 className="shell-icon" />
                    <span className="chat-toolbar-control-label">{copy.project}</span>
                  </span>
                  <div
                    className="chat-toolbar-segmented"
                    role="toolbar"
                    aria-label={copy.quickProjectAria}
                  >
                    {quickProjectOptions.map((option) => (
                      <button
                        key={option.value || 'none'}
                        type="button"
                        className={`chat-toolbar-segment ${model.selectedProjectId === option.value ? 'active' : ''}`}
                        onClick={() => model.onProjectChange(option.value)}
                        aria-pressed={model.selectedProjectId === option.value}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="chat-toolbar-working-card">
                  <div className="chat-toolbar-working-copy">
                    <span className="chat-toolbar-control-label">{copy.workingDirectoryLabel}</span>
                    <strong className="chat-toolbar-working-title">
                      {model.workingDirectoryLabel}
                    </strong>
                    <span className="chat-toolbar-working-path" title={workingDirectorySummary}>
                      {workingDirectorySummary}
                    </span>
                  </div>
                  <div className="chat-toolbar-working-actions">
                    <button
                      type="button"
                      className="chat-toolbar-action-button"
                      onClick={() => void model.onPickWorkingDirectory()}
                      aria-label={copy.chooseFolderAria}
                    >
                      <FolderOpen className="shell-icon" />
                      <span>{copy.chooseFolder}</span>
                    </button>
                    {model.workingDirectory && (
                      <button
                        type="button"
                        className="chat-toolbar-action-button secondary"
                        onClick={() => model.onClearWorkingDirectory()}
                        aria-label={copy.clearAria}
                      >
                        {copy.clear}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <details className="chat-toolbar-details">
                <summary className="chat-toolbar-details-summary">
                  <span className="chat-toolbar-details-summary-copy">
                    <FolderOpen className="shell-icon" />
                    {copy.advancedBindings}
                  </span>
                </summary>
                <div className="chat-toolbar-control-grid chat-toolbar-control-grid-secondary">
                  {model.personas.length > 0 && (
                    <label className="chat-toolbar-control">
                      <span className="chat-toolbar-heading">
                        <UserRound className="shell-icon" />
                        <span className="chat-toolbar-control-label">{copy.persona}</span>
                      </span>
                      <select
                        className="select chat-toolbar-select"
                        value={model.selectedPersona}
                        onChange={(event) => model.onPersonaChange(event.target.value)}
                        aria-label={copy.personaAria}
                      >
                        {model.personas.map((persona) => (
                          <option key={persona.id} value={persona.id} title={persona.description}>
                            {persona.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  {model.projects.length > 0 && (
                    <label className="chat-toolbar-control">
                      <span className="chat-toolbar-heading">
                        <Layers3 className="shell-icon" />
                        <span className="chat-toolbar-control-label">{copy.project}</span>
                      </span>
                      <select
                        className="select chat-toolbar-select"
                        value={model.selectedProjectId}
                        onChange={(event) => model.onProjectChange(event.target.value)}
                        aria-label={copy.projectAria}
                      >
                        <option value="">{copy.noProject}</option>
                        {model.projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="chat-toolbar-control chat-toolbar-control-span-full">
                    <span className="chat-toolbar-control-label">{copy.workingDirectoryLabel}</span>
                    <input
                      className="input chat-toolbar-input"
                      value={model.workingDirectory}
                      onChange={(event) => model.onWorkingDirectoryChange(event.target.value)}
                      placeholder={copy.daemonDefaultWorkspace}
                      aria-label={copy.workingDirectoryAria}
                    />
                  </label>
                </div>
              </details>
            </section>
          </div>

          <div className="chat-toolbar-meta-panel">
            <span className="chat-toolbar-meta-label">{copy.runState}</span>
            <span className={`chat-toolbar-state ${model.agentState}`}>
              {model.loading ? (model.statusText ?? copy.streaming) : model.agentState}
            </span>
            {model.tokenCount !== undefined && (
              <span className="chat-toolbar-token">{copy.tokensSuffix(model.tokenCount)}</span>
            )}
            <span className="chat-toolbar-meta-hint">
              {copy.dropHint}
            </span>
          </div>
        </div>
        <div className="chat-input-shell">
          <div className="chat-input-row">
            <textarea
              ref={model.inputRef}
              className="chat-input"
              value={model.input}
              onChange={(event) => model.onInputChange(event.target.value)}
              onKeyDown={model.onKeyDown}
              onPaste={model.onPaste}
              placeholder={copy.composerPlaceholder}
              rows={1}
              aria-label={copy.composerAria}
            />
            <div className="chat-input-actions">
              <div className="chat-input-caption">
                <span className="chat-input-caption-label">{copy.delivery}</span>
                <strong>{model.modeLabel}</strong>
                <span className="chat-input-caption-meta">
                  {model.selectedProjectName ?? copy.noProject}
                </span>
              </div>
              <button
                type="button"
                className={`chat-send-btn ${showStopButton ? 'stop' : ''}`}
                onClick={() => {
                  if (showStopButton) {
                    model.onCancelRun()
                    return
                  }
                  void model.onSend()
                }}
                disabled={!model.loading && !model.input.trim()}
                aria-label={showStopButton ? copy.stopAria : copy.sendAria}
              >
                {showStopButton ? (
                  <>
                    <Square className="chat-send-btn-icon" />
                    <span>{copy.stop}</span>
                  </>
                ) : (
                  <>
                    <Send className="chat-send-btn-icon" />
                    <span>{copy.send}</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div className="chat-hints">
            <span className="chat-hints-text">
              {queuedCount > 0 ? copy.queuedHint(queuedCount) : (shortcutHint ?? copy.shortcutHints)}
            </span>
          </div>
        </div>
        <div className="chat-status-shell">
          <ChatStatusBar
            selectedMode={model.selectedMode}
            selectedProvider={model.selectedProvider}
            selectedModel={model.selectedModel}
            thinkingLevel={model.thinkingLevel}
            selectedPersona={model.selectedPersona}
            selectedProjectName={model.selectedProjectName}
            workingDirectoryLabel={model.workingDirectoryLabel}
            maxTokensLabel={model.maxTokensLabel}
            loading={model.loading}
            statusText={model.statusText}
            agentState={model.agentState}
            tokenCount={model.tokenCount}
          />
        </div>
      </div>
    </div>
  )
}

function createQuickOptions(
  options: Array<{ value: string; label: string }>,
  selectedValue: string,
): Array<{ value: string; label: string }> {
  if (options.length <= 3) {
    return options
  }

  const nextOptions = options.slice(0, 3)
  if (selectedValue && !nextOptions.some((option) => option.value === selectedValue)) {
    const selectedOption = options.find((option) => option.value === selectedValue)
    if (selectedOption) {
      nextOptions.push(selectedOption)
    }
  }

  return nextOptions
}
