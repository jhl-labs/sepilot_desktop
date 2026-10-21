import type { Transport } from '@/lib/transport/transport-adapter'

export type AutonomyLevel =
  | 'readonly'
  | 'accept-edits'
  | 'workspace-write'
  | 'supervised'
  | 'autonomous'

export const AUTONOMY_LEVELS: readonly AutonomyLevel[] = [
  'readonly',
  'accept-edits',
  'workspace-write',
  'supervised',
  'autonomous',
] as const

function isAutonomyLevel(value: unknown): value is AutonomyLevel {
  return (
    typeof value === 'string' &&
    (AUTONOMY_LEVELS as readonly string[]).includes(value)
  )
}

export interface AutonomyApi {
  get: () => Promise<AutonomyLevel | null>
  set: (level: AutonomyLevel) => Promise<void>
}

export async function createAutonomyApi(
  transport: Transport,
): Promise<AutonomyApi> {
  const cfg = await transport.getConfig()
  const headers = (): HeadersInit =>
    cfg.daemonToken
      ? {
          authorization: `Bearer ${cfg.daemonToken}`,
          'content-type': 'application/json',
        }
      : { 'content-type': 'application/json' }
  const u = (p: string) => `${cfg.daemonOrigin}${p}`

  return {
    async get() {
      const r = await fetch(u('/config'), { headers: headers() })
      if (!r.ok) {
        throw new Error(`autonomy.get failed (${r.status})`)
      }
      const body = (await r.json()) as {
        agent?: { autonomy?: unknown }
        data?: { agent?: { autonomy?: unknown } }
      }
      const value = body.data?.agent?.autonomy ?? body.agent?.autonomy ?? null
      return isAutonomyLevel(value) ? value : null
    },
    async set(level) {
      const r = await fetch(u('/config'), {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ 'agent.autonomy': level }),
      })
      if (!r.ok) {
        throw new Error(`autonomy.set failed (${r.status})`)
      }
    },
  }
}
