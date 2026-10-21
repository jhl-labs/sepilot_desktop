import type {
  DesktopSmartHomeDevice,
  DesktopSmartHomeDeviceCommandInput,
  DesktopSmartHomeDeviceCommandResult,
  DesktopSmartHomeProviderStatus,
  DesktopSmartHomeStatus,
  DesktopSmartHomeSyncInput,
  DesktopSmartHomeSyncResult,
} from '@sepilotd/api-client'
import { ApiHttpClient } from '@sepilotd/api-client'
import { loadDesktopSettings } from './desktop-settings'

const SMARTTHINGS_API_ORIGIN = 'https://api.smartthings.com/v1'
const SMARTTHINGS_TIMEOUT_MS = 15_000
const GOOGLE_HOME_DESKTOP_MESSAGE =
  'Google Home Home APIs are available through Android/iOS SDKs; direct Electron desktop device control is not exposed by the public API surface yet.'

interface SmartThingsDeviceRecord {
  deviceId?: string
  name?: string
  label?: string
  manufacturerName?: string
  deviceManufacturerCode?: string
  type?: string
  locationId?: string
  roomId?: string
  components?: Array<{
    id?: string
    capabilities?: Array<{ id?: string }>
  }>
  [key: string]: unknown
}

interface SmartThingsRoomRecord {
  roomId?: string
  name?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function cleanText(value: unknown, maxLength = 240): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function numeric(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function bool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  const raw = cleanText(value, 24).toLowerCase()
  if (['on', 'true', 'locked', 'open'].includes(raw)) return true
  if (['off', 'false', 'unlocked', 'closed'].includes(raw)) return false
  return null
}

function settingsStatus(): DesktopSmartHomeStatus {
  const settings = loadDesktopSettings()
  const smartThings: DesktopSmartHomeProviderStatus = {
    provider: 'SmartThings',
    configured: Boolean(settings.smartThingsAccessToken),
    connected: Boolean(settings.smartThingsAccessToken),
    available: true,
    locationId: settings.smartThingsLocationId,
    message: settings.smartThingsAccessToken
      ? 'SmartThings Devices API token is configured.'
      : 'SmartThings Personal Access Token is required for device sync and control.',
  }
  const googleHomeConfigured = Boolean(
    settings.googleHomeProjectId ||
      (settings.googleHomeOAuthClientId && settings.googleHomeOAuthClientSecret),
  )
  const googleHome: DesktopSmartHomeProviderStatus = {
    provider: 'Google Home',
    configured: googleHomeConfigured,
    connected: false,
    available: false,
    projectId: settings.googleHomeProjectId,
    message: GOOGLE_HOME_DESKTOP_MESSAGE,
  }
  return { smartThings, googleHome }
}

export function getDesktopSmartHomeStatus(): DesktopSmartHomeStatus {
  return settingsStatus()
}

async function smartThingsFetch<T>(
  token: string,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const client = new ApiHttpClient({
    baseUrl: SMARTTHINGS_API_ORIGIN,
    token,
    defaultHeaders: {
      Accept: 'application/json',
    },
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), SMARTTHINGS_TIMEOUT_MS)
  try {
    const response = await client.fetch(path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: options.body === undefined ? undefined : options.body,
      signal: controller.signal,
    })
    if (response.status === 204) return undefined as T
    const text = await response.text()
    if (!response.ok) {
      let detail = text.trim()
      try {
        const parsed = JSON.parse(text) as { message?: unknown; error?: unknown }
        detail = cleanText(parsed.message, 400) || cleanText(parsed.error, 400) || detail
      } catch {
      }
      throw new Error(`SmartThings API ${response.status}: ${detail || response.statusText}`)
    }
    return (text ? JSON.parse(text) : undefined) as T
  } finally {
    clearTimeout(timeout)
  }
}

function itemArray<T>(value: unknown): T[] {
  if (!isRecord(value) || !Array.isArray(value.items)) return []
  return value.items.filter(isRecord) as T[]
}

function componentId(device: SmartThingsDeviceRecord): string {
  const components = Array.isArray(device.components) ? device.components : []
  return cleanText(components.find((component) => component.id === 'main')?.id) || cleanText(components[0]?.id) || 'main'
}

function capabilities(device: SmartThingsDeviceRecord): string[] {
  const components = Array.isArray(device.components) ? device.components : []
  const caps = new Set<string>()
  for (const component of components) {
    for (const capability of Array.isArray(component.capabilities) ? component.capabilities : []) {
      const id = cleanText(capability.id, 120)
      if (id) caps.add(id)
    }
  }
  return [...caps]
}

function attr(status: unknown, component: string, capability: string, attribute?: string): unknown {
  const components = isRecord(status) ? status.components : undefined
  const componentStatus = isRecord(components) ? components[component] ?? components.main : undefined
  const capabilityStatus = isRecord(componentStatus) ? componentStatus[capability] : undefined
  if (!isRecord(capabilityStatus)) return undefined
  const preferred = attribute ?? capability
  const direct = capabilityStatus[preferred]
  if (isRecord(direct) && 'value' in direct) return direct.value
  for (const value of Object.values(capabilityStatus)) {
    if (isRecord(value) && 'value' in value) return value.value
  }
  return undefined
}

function inferType(caps: string[], name: string): string {
  const lowerName = name.toLowerCase()
  const has = (capability: string) => caps.includes(capability)
  if (has('lock')) return '도어락'
  if (has('colorControl') || has('colorTemperature') || lowerName.includes('light') || lowerName.includes('lamp')) {
    return '조명'
  }
  if (has('airConditionerMode') || lowerName.includes('air conditioner')) return '에어컨'
  if (has('thermostatHeatingSetpoint') || has('thermostatMode')) return '난방'
  if (has('airQualitySensor') || has('dustSensor') || lowerName.includes('purifier')) return '공기청정기'
  if (has('windowShade')) return '커튼'
  if (has('videoStream') || lowerName.includes('camera')) return 'CCTV'
  if (has('audioVolume') || has('mediaPlayback')) return '스피커'
  if (
    has('temperatureMeasurement') ||
    has('relativeHumidityMeasurement') ||
    has('motionSensor') ||
    has('contactSensor') ||
    has('waterSensor') ||
    has('illuminanceMeasurement')
  ) {
    return '센서'
  }
  if (has('switch')) return '플러그'
  return '기타'
}

function roomNameFor(device: SmartThingsDeviceRecord, rooms: Map<string, string>): string {
  const roomId = cleanText(device.roomId, 160)
  return (roomId && rooms.get(roomId)) || '기타'
}

function healthOffline(status: unknown): boolean {
  const health = cleanText(attr(status, 'main', 'healthCheck', 'DeviceWatch-DeviceStatus'), 40)
  return ['offline', 'unhealthy'].includes(health.toLowerCase())
}

function normalizeSmartThingsDevice(
  device: SmartThingsDeviceRecord,
  status: unknown,
  rooms: Map<string, string>,
): DesktopSmartHomeDevice {
  const id = cleanText(device.deviceId, 160) || cleanText(device.id, 160)
  const name = cleanText(device.label) || cleanText(device.name) || 'SmartThings device'
  const caps = capabilities(device)
  const component = componentId(device)
  const type = inferType(caps, name)
  const locked = cleanText(attr(status, component, 'lock', 'lock'), 40)
  const switchValue = cleanText(attr(status, component, 'switch', 'switch'), 40)
  const shade = cleanText(attr(status, component, 'windowShade', 'windowShade'), 40)
  const offline = healthOffline(status)
  const powerValue = bool(switchValue)
  const brightness = numeric(attr(status, component, 'switchLevel', 'level'))
  const battery = numeric(attr(status, component, 'battery', 'battery'))
  const temp =
    numeric(attr(status, component, 'temperatureMeasurement', 'temperature')) ??
    numeric(attr(status, component, 'relativeHumidityMeasurement', 'humidity')) ??
    numeric(attr(status, component, 'illuminanceMeasurement', 'illuminance'))
  const targetTemp =
    numeric(attr(status, component, 'thermostatCoolingSetpoint', 'coolingSetpoint')) ??
    numeric(attr(status, component, 'thermostatHeatingSetpoint', 'heatingSetpoint'))
  const mode =
    cleanText(attr(status, component, 'thermostatMode', 'thermostatMode'), 80) ||
    cleanText(attr(status, component, 'airConditionerMode', 'airConditionerMode'), 80) ||
    shade
  const deviceStatus = offline
    ? 'offline'
    : type === '도어락'
      ? locked || 'locked'
      : switchValue
        ? switchValue.toUpperCase()
        : shade
          ? shade
          : 'ON'

  return {
    id: id ? `st-${id}` : `st-${Date.now().toString(36)}`,
    externalId: id,
    provider: 'SmartThings',
    name,
    room: roomNameFor(device, rooms),
    type,
    brand: cleanText(device.manufacturerName) || cleanText(device.deviceManufacturerCode) || 'SmartThings',
    status: deviceStatus,
    power: type === '센서' ? true : (type === '도어락' ? locked !== 'unlocked' : powerValue ?? !offline),
    ...(brightness == null ? {} : { brightness: Math.max(1, Math.min(100, Math.round(brightness))) }),
    ...(targetTemp == null ? {} : { targetTemp }),
    ...(temp == null ? {} : { currentValue: temp }),
    ...(temp == null ? {} : { unit: type === '센서' ? '℃' : '' }),
    battery,
    mode,
    lastSeen: Date.now(),
    componentId: component,
    capabilities: caps,
    metadata: {
      locationId: cleanText(device.locationId, 160) || undefined,
      roomId: cleanText(device.roomId, 160) || undefined,
      rawType: cleanText(device.type, 120) || undefined,
    },
  }
}

async function loadSmartThingsRooms(
  token: string,
  devices: SmartThingsDeviceRecord[],
): Promise<Map<string, string>> {
  const locationIds = new Set<string>()
  for (const device of devices) {
    const locationId = cleanText(device.locationId, 160)
    if (locationId) locationIds.add(locationId)
  }
  const rooms = new Map<string, string>()
  await Promise.all(
    [...locationIds].map(async (locationId) => {
      try {
        const response = await smartThingsFetch<unknown>(
          token,
          `/locations/${encodeURIComponent(locationId)}/rooms`,
        )
        for (const room of itemArray<SmartThingsRoomRecord>(response)) {
          const id = cleanText(room.roomId, 160)
          const name = cleanText(room.name, 120)
          if (id && name) rooms.set(id, name)
        }
      } catch {
      }
    }),
  )
  return rooms
}

async function loadSmartThingsDevices(token: string, locationId: string | null): Promise<{
  devices: DesktopSmartHomeDevice[]
  warnings: string[]
}> {
  const query = locationId ? `?locationId=${encodeURIComponent(locationId)}` : ''
  const response = await smartThingsFetch<unknown>(token, `/devices${query}`)
  const rawDevices = itemArray<SmartThingsDeviceRecord>(response).filter((device) => {
    if (!locationId) return true
    return cleanText(device.locationId, 160) === locationId
  })
  const rooms = await loadSmartThingsRooms(token, rawDevices)
  const warnings: string[] = []
  const normalized = await Promise.all(
    rawDevices.map(async (device) => {
      const id = cleanText(device.deviceId, 160)
      try {
        const status = id
          ? await smartThingsFetch<unknown>(token, `/devices/${encodeURIComponent(id)}/status`)
          : {}
        return normalizeSmartThingsDevice(device, status, rooms)
      } catch (err) {
        warnings.push(
          `${cleanText(device.label) || cleanText(device.name) || id || 'device'} status failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
        return normalizeSmartThingsDevice(device, {}, rooms)
      }
    }),
  )
  return { devices: normalized, warnings }
}

function selectedProvider(value: unknown): 'SmartThings' | 'Google Home' {
  return cleanText(value, 80) === 'Google Home' ? 'Google Home' : 'SmartThings'
}

export async function syncDesktopSmartHomeDevices(
  input: DesktopSmartHomeSyncInput | unknown,
): Promise<DesktopSmartHomeSyncResult> {
  const record = isRecord(input) ? input : {}
  const provider = selectedProvider(record.provider)
  const status = settingsStatus()
  const syncedAt = Date.now()
  if (provider === 'Google Home') {
    return {
      ok: false,
      provider,
      devices: [],
      status,
      syncedAt,
      warnings: [GOOGLE_HOME_DESKTOP_MESSAGE],
    }
  }

  const settings = loadDesktopSettings()
  if (!settings.smartThingsAccessToken) {
    return {
      ok: false,
      provider,
      devices: [],
      status,
      syncedAt,
      warnings: ['SmartThings Personal Access Token is not configured.'],
    }
  }

  const result = await loadSmartThingsDevices(
    settings.smartThingsAccessToken,
    settings.smartThingsLocationId,
  )
  return {
    ok: true,
    provider,
    devices: result.devices,
    status: settingsStatus(),
    syncedAt,
    warnings: result.warnings,
  }
}

function smartThingsCommands(input: DesktopSmartHomeDeviceCommandInput): Array<{
  component: string
  capability: string
  command: string
  arguments?: unknown[]
}> {
  const component = cleanText(input.componentId, 80) || 'main'
  const action = cleanText(input.action, 80)
  if (action === 'power') {
    const on = Boolean(bool(input.value))
    return [{ component, capability: 'switch', command: on ? 'on' : 'off' }]
  }
  if (action === 'brightness') {
    const level = Math.max(1, Math.min(100, Math.round(numeric(input.value) ?? 1)))
    return [
      { component, capability: 'switch', command: 'on' },
      { component, capability: 'switchLevel', command: 'setLevel', arguments: [level] },
    ]
  }
  if (action === 'lock') {
    const locked = Boolean(bool(input.value))
    return [{ component, capability: 'lock', command: locked ? 'lock' : 'unlock' }]
  }
  if (action === 'targetTemp') {
    const value = numeric(input.value)
    if (value == null) throw new Error('Target temperature must be a number.')
    const type = cleanText(input.device?.type, 80)
    const cooling = type === '에어컨'
    return [
      {
        component,
        capability: cooling ? 'thermostatCoolingSetpoint' : 'thermostatHeatingSetpoint',
        command: cooling ? 'setCoolingSetpoint' : 'setHeatingSetpoint',
        arguments: [value],
      },
    ]
  }
  throw new Error(`Unsupported SmartThings command action: ${action || '(empty)'}`)
}

function fallbackSmartThingsDevice(
  input: DesktopSmartHomeDeviceCommandInput,
): DesktopSmartHomeDevice | undefined {
  const device = input.device
  if (!device) return undefined
  const externalId = cleanText(input.deviceId, 160)
  return {
    id: cleanText(device.id, 160) || (externalId ? `st-${externalId}` : `st-${Date.now().toString(36)}`),
    externalId,
    provider: 'SmartThings',
    name: cleanText(device.name) || 'SmartThings device',
    room: cleanText(device.room, 120) || '기타',
    type: cleanText(device.type, 80) || '기타',
    brand: cleanText(device.brand, 120) || 'SmartThings',
    status: cleanText(device.status, 80) || 'ON',
    power: Boolean(device.power),
    brightness: numeric(device.brightness) ?? undefined,
    targetTemp: numeric(device.targetTemp) ?? undefined,
    currentValue: numeric(device.currentValue) ?? undefined,
    unit: cleanText(device.unit, 20) || undefined,
    battery: device.battery == null ? null : numeric(device.battery),
    mode: cleanText(device.mode, 80) || undefined,
    lastSeen: Date.now(),
    componentId: cleanText(input.componentId, 80) || cleanText(device.componentId, 80) || 'main',
    capabilities: Array.isArray(device.capabilities)
      ? device.capabilities.map((capability) => cleanText(capability, 120)).filter(Boolean)
      : undefined,
  }
}

export async function commandDesktopSmartHomeDevice(
  rawInput: DesktopSmartHomeDeviceCommandInput | unknown,
): Promise<DesktopSmartHomeDeviceCommandResult> {
  if (!isRecord(rawInput)) throw new Error('smart home command input must be an object')
  const input = rawInput as unknown as DesktopSmartHomeDeviceCommandInput
  const provider = selectedProvider(input.provider)
  if (provider === 'Google Home') {
    throw new Error(GOOGLE_HOME_DESKTOP_MESSAGE)
  }
  const settings = loadDesktopSettings()
  if (!settings.smartThingsAccessToken) {
    throw new Error('SmartThings Personal Access Token is not configured.')
  }
  const deviceId = cleanText(input.deviceId, 160)
  if (!deviceId) throw new Error('SmartThings deviceId is required.')
  const commands = smartThingsCommands(input)
  await smartThingsFetch(settings.smartThingsAccessToken, `/devices/${encodeURIComponent(deviceId)}/commands`, {
    method: 'POST',
    body: { commands },
  })

  let device = fallbackSmartThingsDevice(input)
  try {
    const status = await smartThingsFetch<unknown>(
      settings.smartThingsAccessToken,
      `/devices/${encodeURIComponent(deviceId)}/status`,
    )
    const fallback = fallbackSmartThingsDevice(input)
    if (fallback) {
      const roomId = cleanText(fallback.metadata?.roomId, 160)
      const rooms = new Map<string, string>()
      if (roomId) rooms.set(roomId, fallback.room)
      device = normalizeSmartThingsDevice(
        {
          deviceId,
          label: fallback.name,
          manufacturerName: fallback.brand,
          roomId,
          components: [
            {
              id: fallback.componentId ?? 'main',
              capabilities: (fallback.capabilities ?? []).map((id) => ({ id })),
            },
          ],
        },
        status,
        rooms,
      )
    }
  } catch {
  }

  return {
    ok: true,
    provider,
    device,
    acceptedAt: Date.now(),
    message: 'SmartThings command accepted.',
  }
}
