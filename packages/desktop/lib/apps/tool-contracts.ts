import type {
  SepilotAppCapabilities,
  SepilotAppDataPolicy,
  SepilotAppDataSchema,
  SepilotAppHostRequestPermission,
} from '@sepilotd/api-client'

type ToolAvailability = 'enabled' | 'disabled'
type ToolSource = 'app-chat' | 'sandbox-sdk' | 'host-request'

export interface AppToolParameter {
  name: string
  type: string
  required?: boolean
  description: string
}

export interface AppToolContract {
  op: string
  label: string
  group: string
  source: ToolSource
  availability: ToolAvailability
  disabledReason?: string
  description: string
  input: AppToolParameter[]
  output: AppToolParameter[]
}

interface AppToolContractPage {
  kind: string
  dataPolicy?: SepilotAppDataPolicy
  capabilities?: SepilotAppCapabilities
  hostRequests?: SepilotAppHostRequestPermission[]
  dataSchema?: SepilotAppDataSchema
  permissions?: {
    storage?: boolean
  }
}

function capabilityEnabled(page: AppToolContractPage, key: keyof SepilotAppCapabilities): boolean {
  return page.capabilities?.[key] !== false
}

function storageEnabled(page: AppToolContractPage): boolean {
  return page.permissions?.storage !== false
}

function enabledContract(input: Omit<AppToolContract, 'availability'>): AppToolContract {
  return { ...input, availability: 'enabled' }
}

function capabilityContract(
  page: AppToolContractPage,
  key: keyof SepilotAppCapabilities,
  contract: Omit<AppToolContract, 'availability' | 'disabledReason'>,
): AppToolContract {
  if (capabilityEnabled(page, key)) return enabledContract(contract)
  return {
    ...contract,
    availability: 'disabled',
    disabledReason: `${String(key)} capability is disabled`,
  }
}

function appChatWriteEnabled(page: AppToolContractPage): boolean {
  return page.dataPolicy?.aiWritable !== false
}

function appChatReadEnabled(page: AppToolContractPage): boolean {
  return page.dataPolicy?.aiReadable !== false
}

function dataShapeSummary(schema: SepilotAppDataSchema | undefined): string {
  const fields = Object.keys(schema?.fields ?? {})
  const collections = Object.keys(schema?.collections ?? {})
  const timeSeries = Object.keys(schema?.timeSeries ?? {})
  const parts = [
    fields.length ? `fields: ${fields.join(', ')}` : '',
    collections.length ? `collections: ${collections.join(', ')}` : '',
    timeSeries.length ? `timeSeries: ${timeSeries.join(', ')}` : '',
  ].filter(Boolean)
  return parts.join(' · ') || 'app data object'
}

function genericHostContract(request: SepilotAppHostRequestPermission): AppToolContract {
  return enabledContract({
    op: request.op,
    label: request.op,
    group: '외부 연동',
    source: 'host-request',
    description: request.reason ?? '앱 manifest에 선언된 desktop host request입니다.',
    input: [{ name: 'input', type: 'object', description: '요청별 desktop bridge 입력값' }],
    output: [{ name: 'result', type: 'unknown', description: 'desktop bridge 응답값' }],
  })
}

function hostContractFor(request: SepilotAppHostRequestPermission): AppToolContract {
  if (request.op === 'vault.file.export') {
    return enabledContract({
      op: request.op,
      label: '암호화 금고 백업 파일 저장',
      group: '외부 연동',
      source: 'host-request',
      description: request.reason ?? '암호화된 금고 백업 JSON을 파일로 저장합니다.',
      input: [
        { name: 'title', type: 'string', description: '기본 파일 이름 힌트' },
        { name: 'body', type: 'string', required: true, description: '암호화 백업 JSON 문자열' },
      ],
      output: [
        { name: 'path', type: 'string', description: '저장된 파일 절대 경로' },
        { name: 'name', type: 'string', description: '저장된 파일 이름' },
        { name: 'mtimeMs', type: 'number', description: '파일 수정 시각' },
      ],
    })
  }
  if (request.op === 'vault.file.import') {
    return enabledContract({
      op: request.op,
      label: '암호화 금고 백업 파일 열기',
      group: '외부 연동',
      source: 'host-request',
      description: request.reason ?? '사용자가 고른 암호화 금고 백업 JSON 파일을 읽습니다.',
      input: [],
      output: [
        { name: 'path', type: 'string', description: '선택한 파일 절대 경로' },
        { name: 'name', type: 'string', description: '선택한 파일 이름' },
        { name: 'body', type: 'string', description: '암호화 백업 JSON 문자열' },
        { name: 'mtimeMs', type: 'number', description: '파일 수정 시각' },
      ],
    })
  }
  if (request.op.startsWith('notes.file.')) {
    return enabledContract({
      op: request.op,
      label: request.op,
      group: '외부 연동',
      source: 'host-request',
      description: request.reason ?? '노트 파일 브리지 요청입니다.',
      input: [
        { name: 'title', type: 'string', description: '파일 이름 또는 노트 제목 힌트' },
        { name: 'body', type: 'string', description: '텍스트/Markdown 본문' },
        { name: 'path', type: 'string', description: '연결된 파일 절대 경로' },
      ],
      output: [
        { name: 'path', type: 'string', description: '파일 절대 경로' },
        { name: 'title', type: 'string', description: '파일명 기반 노트 제목' },
        { name: 'body', type: 'string', description: '파일 본문' },
        { name: 'mtimeMs', type: 'number', description: '파일 수정 시각' },
      ],
    })
  }
  return genericHostContract(request)
}

export function buildAppToolContracts(page: AppToolContractPage): AppToolContract[] {
  const storageReason = 'storage permission is disabled'
  const contracts: AppToolContract[] = [
    appChatReadEnabled(page)
      ? enabledContract({
          op: 'appChat.context.read',
          label: 'AI 읽기 컨텍스트',
          group: 'App Chat Agent',
          source: 'app-chat',
          description: 'Agent prompt에 전달되는 현재 앱의 redacted data와 schema입니다.',
          input: [
            { name: 'dataPolicy', type: 'object', description: 'redaction/encryption 정책' },
            {
              name: 'dataSchema',
              type: 'object',
              description: dataShapeSummary(page.dataSchema),
            },
          ],
          output: [{ name: 'context', type: 'object', description: 'redacted app context' }],
        })
      : {
          op: 'appChat.context.read',
          label: 'AI 읽기 컨텍스트',
          group: 'App Chat Agent',
          source: 'app-chat',
          availability: 'disabled',
          disabledReason: 'aiReadable policy is disabled',
          description: '이 앱의 저장 데이터는 Agent prompt로 전달되지 않습니다.',
          input: [],
          output: [],
        },
    appChatWriteEnabled(page)
      ? enabledContract({
          op: 'appChat.mutations.apply',
          label: '구조화 데이터 변경',
          group: 'App Chat Agent',
          source: 'app-chat',
          description:
            'Agent가 JSON mutations를 반환하면 사용자 확인 후 앱 data.json에 적용합니다.',
          input: [
            {
              name: 'mutations',
              type: 'SepilotAppMutation[]',
              description: 'fields.set, collection.upsert/remove, timeSeries.append',
            },
          ],
          output: [
            { name: 'applied', type: 'string[]', description: '적용된 mutation 요약' },
            { name: 'issues', type: 'object[]', description: '검증 이슈' },
          ],
        })
      : {
          op: 'appChat.mutations.apply',
          label: '구조화 데이터 변경',
          group: 'App Chat Agent',
          source: 'app-chat',
          availability: 'disabled',
          disabledReason: 'aiWritable policy is disabled',
          description: '이 앱은 Agent가 저장 데이터를 변경할 수 없습니다.',
          input: [],
          output: [],
        },
    storageEnabled(page)
      ? enabledContract({
          op: 'data.get/set/patch/batch/remove',
          label: '앱 저장 데이터',
          group: 'Sandbox SDK',
          source: 'sandbox-sdk',
          description: '앱 iframe이 자기 data.json에 값을 읽고 씁니다.',
          input: [
            { name: 'path', type: 'string | string[]', description: 'data.json 내부 경로' },
            { name: 'value', type: 'unknown', description: '저장할 값' },
            {
              name: 'mutator',
              type: '(draft) => void | object',
              description: '여러 필드 변경을 한 번의 저장 이벤트로 묶는 data.batch 변경 함수',
            },
          ],
          output: [{ name: 'value', type: 'unknown', description: '읽거나 저장된 값' }],
        })
      : {
          op: 'data.get/set/patch/batch/remove',
          label: '앱 저장 데이터',
          group: 'Sandbox SDK',
          source: 'sandbox-sdk',
          availability: 'disabled',
          disabledReason: storageReason,
          description: 'storage permission이 꺼져 있어 data.json을 읽고 쓸 수 없습니다.',
          input: [],
          output: [],
        },
    capabilityContract(page, 'encryption', {
      op: 'crypto.status/encryptAesGcm/decryptAesGcm',
      label: 'AES-GCM 암호화',
      group: 'Sandbox SDK',
      source: 'sandbox-sdk',
      description: '암호 구문 기반 PBKDF2/AES-GCM envelope를 만들고 복호화합니다.',
      input: [
        { name: 'passphrase', type: 'string', required: true, description: '사용자 암호 구문' },
        { name: 'value', type: 'unknown', description: 'encryptAesGcm에 넣는 평문 값' },
        {
          name: 'vault',
          type: 'AesGcmEnvelope',
          description: 'decryptAesGcm에 넣는 암호화 envelope',
        },
      ],
      output: [
        { name: 'available', type: 'boolean', description: 'crypto.status 사용 가능 여부' },
        { name: 'salt/iv/cipher', type: 'string', description: 'encryptAesGcm 결과 envelope' },
        { name: 'value', type: 'unknown', description: 'decryptAesGcm 복호화 결과' },
      ],
    }),
    enabledContract({
      op: 'clipboard.readText/writeText/write',
      label: '클립보드',
      group: 'Sandbox SDK',
      source: 'sandbox-sdk',
      description: '명시적인 사용자 동작에서 텍스트/HTML/RTF를 읽거나 씁니다.',
      input: [{ name: 'text/html/rtf', type: 'string', description: '클립보드에 쓸 내용' }],
      output: [
        { name: 'text', type: 'string', description: 'readText 결과' },
        { name: 'ok', type: 'boolean', description: '쓰기 성공 여부' },
      ],
    }),
    capabilityContract(page, 'interAppRead', {
      op: 'apps.list/read/search',
      label: '앱 간 읽기',
      group: 'Sandbox SDK',
      source: 'sandbox-sdk',
      description: '다른 앱의 redacted context를 읽거나 검색합니다.',
      input: [
        { name: 'id', type: 'string', description: '읽을 앱 ID' },
        { name: 'query', type: 'string', description: '검색어' },
        { name: 'limit', type: 'number', description: '검색 결과 수' },
      ],
      output: [{ name: 'apps', type: 'ReadableApp[]', description: 'redacted app records' }],
    }),
    capabilityContract(page, 'agentTools', {
      op: 'agent.write',
      label: '쓰기 보조 Agent',
      group: 'Sandbox SDK',
      source: 'sandbox-sdk',
      description: '본문을 요약/개선/확장하는 writing assist를 호출합니다.',
      input: [
        { name: 'mode', type: 'string', description: 'summarize, rewrite, continue 등' },
        { name: 'body', type: 'string', required: true, description: '보조할 본문' },
      ],
      output: [{ name: 'text', type: 'string', description: 'Agent가 생성한 텍스트' }],
    }),
  ]

  if (capabilityEnabled(page, 'collections')) {
    contracts.push(
      enabledContract({
        op: 'collection(name).list/get/upsert/remove/clear',
        label: '컬렉션 테이블',
        group: 'Sandbox SDK',
        source: 'sandbox-sdk',
        description: dataShapeSummary({ collections: page.dataSchema?.collections }),
        input: [
          { name: 'name', type: 'string', required: true, description: '컬렉션 이름' },
          { name: 'item', type: 'object', description: 'upsert할 row' },
          { name: 'id', type: 'string', description: '조회/삭제할 row ID' },
        ],
        output: [{ name: 'rows/item', type: 'object | object[]', description: '컬렉션 데이터' }],
      }),
    )
  }
  if (capabilityEnabled(page, 'timeSeries')) {
    contracts.push(
      enabledContract({
        op: 'timeSeries(name).append/list/clear',
        label: '시계열 데이터',
        group: 'Sandbox SDK',
        source: 'sandbox-sdk',
        description: dataShapeSummary({ timeSeries: page.dataSchema?.timeSeries }),
        input: [
          { name: 'name', type: 'string', required: true, description: '시계열 이름' },
          { name: 'point', type: 'object', description: 'ts와 value를 포함하는 데이터 포인트' },
        ],
        output: [{ name: 'points', type: 'object[]', description: '시계열 포인트 목록' }],
      }),
    )
  }
  if (capabilityEnabled(page, 'scheduler')) {
    contracts.push(
      enabledContract({
        op: 'scheduler.list/upsert/run/pause/resume/remove',
        label: '스케줄러',
        group: 'Sandbox SDK',
        source: 'sandbox-sdk',
        description: '앱 범위의 daemon background job을 관리합니다.',
        input: [
          { name: 'id', type: 'string', description: '앱 범위 job ID' },
          {
            name: 'when/cron/runAt',
            type: 'string | number',
            description: '실행 시각 또는 반복식',
          },
          { name: 'instruction', type: 'string', description: 'job 실행 지시문' },
        ],
        output: [{ name: 'job', type: 'SchedulerJob', description: '저장된 job 정보' }],
      }),
    )
  }
  if (capabilityEnabled(page, 'notifications')) {
    contracts.push(
      enabledContract({
        op: 'notifications.list/publish/schedule',
        label: '알림',
        group: 'Sandbox SDK',
        source: 'sandbox-sdk',
        description: '앱 범위 desktop/daemon 알림을 발행하거나 예약합니다.',
        input: [
          { name: 'title', type: 'string', description: '알림 제목' },
          { name: 'body', type: 'string', description: '알림 본문' },
          { name: 'when/runAt', type: 'string | number', description: '예약 시각' },
        ],
        output: [
          { name: 'notification/job', type: 'object', description: '발행 알림 또는 예약 job' },
        ],
      }),
    )
  }
  if (capabilityEnabled(page, 'workflow')) {
    contracts.push(
      enabledContract({
        op: 'workflow.github.*',
        label: 'GitHub Projects 워크플로',
        group: 'Sandbox SDK',
        source: 'sandbox-sdk',
        description: 'GitHub Projects v2 상태, 프로젝트, draft issue, card 이동을 처리합니다.',
        input: [
          { name: 'owner/number', type: 'string | number', description: '프로젝트 참조' },
          { name: 'title/body/itemId/columnId', type: 'string', description: 'draft/card 입력값' },
        ],
        output: [{ name: 'result', type: 'object', description: 'GitHub Projects bridge 응답' }],
      }),
    )
  }

  return [...contracts, ...(page.hostRequests ?? []).map(hostContractFor)]
}

export function summarizeToolContracts(contracts: AppToolContract[]) {
  const enabled = contracts.filter((contract) => contract.availability === 'enabled').length
  return {
    total: contracts.length,
    enabled,
    disabled: contracts.length - enabled,
  }
}
