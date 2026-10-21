import { CapabilityUnavailableError, getJson, makeHttp } from './_http'
import type { Transport } from '@/lib/transport/transport-adapter'

interface BootInfoEnvKnob {
  name: string
  effective: string | null
  fromEnv: boolean
  default: string | null
  purpose: string
}

interface BootInfoPathEntry {
  label: string
  path: string
}

export interface BootInfo {
  daemon: {
    version: string
    nodeVersion: string
    pid: number
    platform: string
    uptimeSeconds: number
    startedAt: string
  }
  paths: {
    home: string
    entries: BootInfoPathEntry[]
  }
  env: BootInfoEnvKnob[]
}

export interface SystemApi {
  bootInfo: () => Promise<BootInfo>
}

export async function createSystemApi(transport: Transport): Promise<SystemApi> {
  const http = await makeHttp(transport)
  return {
    bootInfo: () =>
      getJson<BootInfo>(http, '/system/boot-info', 'system-boot-info'),
  }
}

export { CapabilityUnavailableError }
