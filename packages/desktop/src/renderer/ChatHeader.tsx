import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { DesktopChatHeaderModel } from './desktop-chat'
import { useLocale } from './useLocale'

const CHAT_HEADER_COPY = {
  en: {
    eyebrow: 'Conversation',
    mode: 'Mode',
    provider: 'Provider',
    model: 'Model',
    thinking: 'Thinking',
    persona: 'Persona',
    project: 'Project',
  },
  ko: {
    eyebrow: '대화',
    mode: '모드',
    provider: 'Provider',
    model: '모델',
    thinking: 'Thinking',
    persona: '페르소나',
    project: '프로젝트',
  },
} as const

interface DropdownOption {
  value: string
  label: string
}

interface PillDropdownProps {
  label: string
  value: string
  displayValue: string
  options: DropdownOption[]
  onSelect: (value: string) => void
}

function PillDropdown({
  label,
  value,
  displayValue,
  options,
  onSelect,
}: PillDropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (options.length === 0) {
    return (
      <span className="chat-header-pill">
        {label} {displayValue}
      </span>
    )
  }

  return (
    <div className="chat-header-pill-wrapper" ref={ref}>
      <button
        type="button"
        className="chat-header-pill chat-header-pill-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="chat-header-pill-label">{label}</span>
        <span className="chat-header-pill-value">{displayValue}</span>
        <ChevronDown
          className={`chat-header-pill-chevron ${open ? 'open' : ''}`}
          size={12}
        />
      </button>
      {open && (
        <div className="chat-header-pill-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`chat-header-pill-option ${
                option.value === value ? 'selected' : ''
              }`}
              onClick={() => {
                onSelect(option.value)
                setOpen(false)
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ChatHeader({
  model,
}: {
  model: DesktopChatHeaderModel
}) {
  const { locale } = useLocale()
  const copy = CHAT_HEADER_COPY[locale] ?? CHAT_HEADER_COPY.en

  const modeOptions: DropdownOption[] = model.agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
  }))

  const providerOptions: DropdownOption[] = model.providers.map((provider) => ({
    value: provider.id,
    label: provider.name,
  }))

  const modelOptions: DropdownOption[] = model.availableModels.map((modelId) => ({
    value: modelId,
    label: modelId,
  }))

  const thinkingLabels =
    locale === 'ko'
      ? { auto: '자동', instant: '즉시', balanced: '균형', deep: '깊이', max: '최대' }
      : { auto: 'Auto', instant: 'Instant', balanced: 'Balanced', deep: 'Deep', max: 'Max' }
  const thinkingOptions: DropdownOption[] = [
    { value: 'auto', label: thinkingLabels.auto },
    { value: 'instant', label: thinkingLabels.instant },
    { value: 'balanced', label: thinkingLabels.balanced },
    { value: 'deep', label: thinkingLabels.deep },
    { value: 'max', label: thinkingLabels.max },
  ]

  const personaOptions: DropdownOption[] = model.personas.map((persona) => ({
    value: persona.id,
    label: persona.name,
  }))

  const projectOptions: DropdownOption[] = model.projects.map((project) => ({
    value: project.id,
    label: project.name,
  }))

  return (
    <div className="chat-header">
      <div className="chat-header-inner">
        <div className="chat-header-overview">
          <div className="chat-header-copy">
            <span className="chat-header-eyebrow">{copy.eyebrow}</span>
            <strong className="chat-header-title">{model.sessionLabel}</strong>
            <span className="chat-header-session">{model.sessionMeta}</span>
          </div>
        </div>

        <div className="chat-header-summary">
          <PillDropdown
            label={copy.mode}
            value={model.selectedMode}
            displayValue={model.modeLabel}
            options={modeOptions}
            onSelect={model.onModeChange}
          />
          <PillDropdown
            label={copy.provider}
            value={model.selectedProvider}
            displayValue={model.providerLabel}
            options={providerOptions}
            onSelect={model.onProviderChange}
          />
          <PillDropdown
            label={copy.model}
            value={model.selectedModel}
            displayValue={model.modelLabel}
            options={modelOptions}
            onSelect={model.onModelChange}
          />
          <PillDropdown
            label={copy.thinking}
            value={model.thinkingLevel}
            displayValue={model.thinkingLabel}
            options={thinkingOptions}
            onSelect={model.onThinkingLevelChange}
          />
          <PillDropdown
            label={copy.persona}
            value={model.selectedPersona}
            displayValue={model.personaLabel}
            options={personaOptions}
            onSelect={model.onPersonaChange}
          />
          <PillDropdown
            label={copy.project}
            value={model.selectedProjectId}
            displayValue={model.projectLabel}
            options={projectOptions}
            onSelect={model.onProjectChange}
          />
        </div>
      </div>
    </div>
  )
}
