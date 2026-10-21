import type {
  KnowledgeBudgetState,
  KnowledgeLifecycleState,
  KnowledgeVerification,
  KnowledgeVerificationInput,
  PersonalKnowledge,
  PersonalKnowledgeWrite,
  PersonalKnowledgeCapture,
  PersonalKnowledgeSuggestion,
  PersonalKnowledgeReview,
  KnowledgeActivityPage,
  KnowledgeChatUpdateMode,
  KnowledgeContentProposal,
  KnowledgeMaintenanceState,
  KnowledgeActivityDetail,
} from '@sepilotd/api-client/daemon/types'
import type { Transport } from '@/lib/transport/transport-adapter'
import { getJson, makeHttp, sendJson } from './_http'

export async function createKnowledgeApi(transport: Transport) {
  const http = await makeHttp(transport)
  const capability = 'personal-knowledge'
  return {
    lifecycle: () => getJson<KnowledgeLifecycleState>(http, '/knowledge/lifecycle', capability),
    setBudget: (limit: number) =>
      sendJson<KnowledgeBudgetState>(http, 'POST', '/knowledge/budget', { limit }, capability),
    verify: (input: KnowledgeVerificationInput) =>
      sendJson<KnowledgeVerification>(http, 'POST', '/knowledge/verify', input, capability),
    restore: (snapshot: PersonalKnowledge, expectedRevision: number | null) =>
      sendJson<PersonalKnowledge>(
        http,
        'POST',
        '/knowledge/restore',
        { snapshot, expectedRevision },
        capability,
      ),
    maintenance: () =>
      getJson<KnowledgeMaintenanceState>(http, '/knowledge/maintenance', capability),
    setChatUpdateMode: (mode: KnowledgeChatUpdateMode) =>
      sendJson<KnowledgeMaintenanceState>(
        http,
        'POST',
        '/knowledge/maintenance',
        { mode },
        capability,
      ),
    decideContentProposal: (id: string, decision: 'accept' | 'reject') =>
      sendJson<KnowledgeContentProposal>(
        http,
        'POST',
        `/knowledge/proposals/${encodeURIComponent(id)}`,
        { decision },
        capability,
      ),
    activity: (before?: number) =>
      getJson<KnowledgeActivityPage>(
        http,
        `/knowledge/activity${before ? `?before=${before}` : ''}`,
        capability,
      ),
    activityDetail: (id: string) =>
      getJson<KnowledgeActivityDetail>(
        http,
        `/knowledge/activity/${encodeURIComponent(id)}`,
        capability,
      ),
    dismissSuggestion: (id: string, expectedRevision: number) =>
      sendJson<PersonalKnowledgeReview>(
        http,
        'POST',
        '/knowledge/review/dismiss',
        { id, expectedRevision },
        capability,
      ),
    review: () => getJson<PersonalKnowledgeReview>(http, '/knowledge/review', capability),
    setAutoOrganize: (autoOrganize: boolean) =>
      sendJson<PersonalKnowledgeReview>(
        http,
        'POST',
        '/knowledge/review',
        { autoOrganize },
        capability,
      ),
    list: () => getJson<PersonalKnowledge[]>(http, '/knowledge', capability),
    save: (input: PersonalKnowledgeWrite) =>
      sendJson<PersonalKnowledge>(http, 'POST', '/knowledge', input, capability),
    capture: (input: PersonalKnowledgeCapture, extract = true) =>
      sendJson<PersonalKnowledge[]>(
        http,
        'POST',
        '/knowledge/capture',
        { source: input, extract },
        capability,
      ),
    organize: () =>
      sendJson<PersonalKnowledgeSuggestion[]>(http, 'POST', '/knowledge/organize', {}, capability),
    history: (id: string) =>
      getJson<PersonalKnowledge[]>(
        http,
        `/knowledge/${encodeURIComponent(id)}/history`,
        capability,
      ),
    export: () => getJson<unknown>(http, '/knowledge/export', capability),
  }
}
