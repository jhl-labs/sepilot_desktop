import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_CHAT_OPTION_DEFAULTS,
  sanitizeChatOptions,
  type DaemonAgentDescriptor,
  type DaemonPersona,
  type DaemonProject,
  type DaemonProviderInfo,
  type DaemonRoleBot,
} from '@sepilotd/api-client'

interface UseChatCatalogParams {
  sessionId?: string
}

const CHAT_MAX_TOKENS_STORAGE_KEY = 'sepilot_desktop_chat_max_tokens'
const CHAT_WORKING_DIRECTORY_STORAGE_KEY = 'sepilot_desktop_chat_cwd'
const CHAT_BOT_STORAGE_KEY = 'sepilot_desktop_chat_bot'

const EXTERNAL_AGENT_DESCRIPTORS: readonly DaemonAgentDescriptor[] = [
  {
    id: 'external-claude',
    name: 'Claude CLI',
    description: 'Run the local claude CLI through the desktop Chat UI.',
    source: 'builtin',
  },
  {
    id: 'external-codex',
    name: 'Codex CLI',
    description: 'Run the local codex CLI through the desktop Chat UI.',
    source: 'builtin',
  },
  {
    id: 'external-gemini',
    name: 'Gemini CLI',
    description: 'Run the local gemini CLI through the desktop Chat UI.',
    source: 'builtin',
  },
  {
    id: 'external-opencode',
    name: 'OpenCode CLI',
    description: 'Run the local opencode CLI through the desktop Chat UI.',
    source: 'builtin',
  },
]

function mergeExternalAgentDescriptors(
  items: readonly DaemonAgentDescriptor[],
): DaemonAgentDescriptor[] {
  const seen = new Set(items.map((item) => item.id))
  return [
    ...items,
    ...EXTERNAL_AGENT_DESCRIPTORS.filter((item) => !seen.has(item.id)),
  ]
}

function normalizePositiveInteger(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined

  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined
  }

  return parsed
}

export function useChatCatalog({
  sessionId,
}: UseChatCatalogParams) {
  const [providers, setProviders] = useState<DaemonProviderInfo[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [thinkingLevel, setThinkingLevel] = useState('medium')
  const [personas, setPersonas] = useState<DaemonPersona[]>([])
  const [selectedPersona, setSelectedPersona] = useState('default')
  const [bots, setBots] = useState<DaemonRoleBot[]>([])
  const [selectedBot, setSelectedBot] = useState('')
  const [botsLoaded, setBotsLoaded] = useState(false)
  const [botPreferenceLoaded, setBotPreferenceLoaded] = useState(false)
  const [agents, setAgents] = useState<DaemonAgentDescriptor[]>([])
  const [selectedMode, setSelectedMode] = useState('auto')
  const [projects, setProjects] = useState<DaemonProject[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [maxTokensInput, setMaxTokensInput] = useState('')
  const [workingDirectory, setWorkingDirectory] = useState('')

  useEffect(() => {
    window.sepilot.providers().then(setProviders).catch(() => {})
    window.sepilot.personas().then(setPersonas).catch(() => {})
    window.sepilot.bots()
      .then((items) => {
        setBots(items)
        setBotsLoaded(true)
      })
      .catch(() => {})
    window.sepilot
      .agents()
      .then((items) => setAgents(mergeExternalAgentDescriptors(items)))
      .catch(() => setAgents([...EXTERNAL_AGENT_DESCRIPTORS]))
    window.sepilot.projects().then(setProjects).catch(() => {})
  }, [])

  useEffect(() => {
    setSelectedBot(window.localStorage.getItem(CHAT_BOT_STORAGE_KEY)?.trim() ?? '')
    setBotPreferenceLoaded(true)
  }, [])

  useEffect(() => {
    if (!botPreferenceLoaded) return
    if (selectedBot) {
      window.localStorage.setItem(CHAT_BOT_STORAGE_KEY, selectedBot)
      return
    }
    window.localStorage.removeItem(CHAT_BOT_STORAGE_KEY)
  }, [botPreferenceLoaded, selectedBot])

  useEffect(() => {
    if (botsLoaded && selectedBot && !bots.some((bot) => bot.id === selectedBot)) {
      setSelectedBot('')
    }
  }, [bots, botsLoaded, selectedBot])

  useEffect(() => {
    setMaxTokensInput(
      window.localStorage.getItem(CHAT_MAX_TOKENS_STORAGE_KEY)?.trim() ?? '',
    )
    setWorkingDirectory(
      window.localStorage.getItem(CHAT_WORKING_DIRECTORY_STORAGE_KEY)?.trim() ?? '',
    )
  }, [])

  useEffect(() => {
    if (maxTokensInput.trim()) {
      window.localStorage.setItem(CHAT_MAX_TOKENS_STORAGE_KEY, maxTokensInput.trim())
      return
    }

    window.localStorage.removeItem(CHAT_MAX_TOKENS_STORAGE_KEY)
  }, [maxTokensInput])

  useEffect(() => {
    if (workingDirectory.trim()) {
      window.localStorage.setItem(
        CHAT_WORKING_DIRECTORY_STORAGE_KEY,
        workingDirectory.trim(),
      )
      return
    }

    window.localStorage.removeItem(CHAT_WORKING_DIRECTORY_STORAGE_KEY)
  }, [workingDirectory])

  useEffect(() => {
    if (!sessionId) return

    const linkedProject = projects.find((project) =>
      project.sessionIds.includes(sessionId),
    )
    setSelectedProjectId(linkedProject?.id ?? '')
  }, [projects, sessionId])

  const availableModels =
    providers.find((provider) => provider.id === selectedProvider)?.models.map(
      (model) => model.id,
    ) ?? providers.flatMap((provider) => provider.models.map((model) => model.id))
  const maxTokens = useMemo(
    () => normalizePositiveInteger(maxTokensInput),
    [maxTokensInput],
  )

  const chatOptions = useMemo(
    () => sanitizeChatOptions(
      {
        model: selectedModel,
        provider: selectedProvider,
        mode: selectedMode,
        thinkingLevel,
        persona: selectedPersona,
        bot: selectedBot || undefined,
        projectId: selectedProjectId,
        maxTokens,
        cwd: workingDirectory,
      },
      DEFAULT_CHAT_OPTION_DEFAULTS,
    ),
    [
      selectedModel,
      selectedProvider,
      selectedMode,
      thinkingLevel,
      selectedPersona,
      selectedBot,
      selectedProjectId,
      maxTokens,
      workingDirectory,
    ],
  )

  const selectedProject = projects.find((project) => project.id === selectedProjectId)

  return {
    providers,
    selectedProvider,
    setSelectedProvider,
    selectedModel,
    setSelectedModel,
    thinkingLevel,
    setThinkingLevel,
    personas,
    selectedPersona,
    setSelectedPersona,
    bots,
    selectedBot,
    setSelectedBot,
    agents,
    selectedMode,
    setSelectedMode,
    projects,
    setProjects,
    selectedProjectId,
    setSelectedProjectId,
    maxTokensInput,
    setMaxTokensInput,
    maxTokens,
    workingDirectory,
    setWorkingDirectory,
    availableModels,
    selectedProject,
    chatOptions,
  }
}
