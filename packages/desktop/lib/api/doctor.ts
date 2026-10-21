import type { DaemonDoctorReport } from '@sepilotd/api-client'
import { getDesktopApi } from '@/lib/electron/bridge'
import type { Transport } from '@/lib/transport/transport-adapter'
import { CapabilityUnavailableError, getJson, makeHttp } from './_http'

export interface DoctorApi {
  report: () => Promise<DaemonDoctorReport>
}

export async function createDoctorApi(transport: Transport): Promise<DoctorApi> {
  const desktopApi = getDesktopApi()
  const http = await makeHttp(transport)

  return {
    report: async () => {
      if (desktopApi?.doctor) {
        return desktopApi.doctor()
      }
      return getJson<DaemonDoctorReport>(http, '/api/v1/doctor', 'doctor')
    },
  }
}

export { CapabilityUnavailableError }
