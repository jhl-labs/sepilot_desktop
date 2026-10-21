import { useMemo } from 'react'
import type {
  DaemonSessionDetail,
  ActivityItem,
  GatewayTicketWatchRevalidateHealth,
  Message,
} from '@sepilotd/api-client'
import { computeChatMetrics } from '@sepilotd/api-client'

interface UseChatMetricsParams {
  messages: Message[]
  activities: ActivityItem[]
  sessionDetail: DaemonSessionDetail | null
  selectedProvider: string
  selectedModel: string
  gatewayWatchHealth?: GatewayTicketWatchRevalidateHealth | null
}

export function useChatMetrics({
  messages,
  activities,
  sessionDetail,
  selectedProvider,
  selectedModel,
  gatewayWatchHealth = null,
}: UseChatMetricsParams) {
  return useMemo(
    () => computeChatMetrics({
      messages,
      activities,
      sessionDetail,
      selectedProvider,
      selectedModel,
      gatewayWatchHealth,
    }),
    [activities, gatewayWatchHealth, messages, selectedModel, selectedProvider, sessionDetail],
  )
}
