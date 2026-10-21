import type { ChatModeMeta } from './chat-modes'
import type { ChatModeTranslator } from './chat-modes'

export interface AssistantModeSupport {
  access: 'execute' | 'read' | 'handoff' | 'configured'
  label: string
  description: string
}

export function assistantModeSupport(
  mode: Pick<ChatModeMeta, 'daemonId' | 'category'>,
  translate?: ChatModeTranslator,
): AssistantModeSupport {
  const localize = (key: string, fallback: AssistantModeSupport): AssistantModeSupport =>
    translate ? {
      ...fallback,
      label: translate(`chatModes.support.${key}.label`),
      description: translate(`chatModes.support.${key}.description`),
    } : fallback
  if (mode.category === 'external') return localize('external', {
    access: 'handoff', label: 'Apps 연결 별도',
    description: '외부 CLI에는 SEPilot의 Apps·Memory·Tasks 도구가 자동으로 연결되지 않습니다. 비서 작업은 Auto에서 진행하세요.',
  })
  switch (mode.daemonId) {
    case 'codebase-scout': return localize('codebaseScout', {
      access: 'read', label: '작업 폴더 읽기 전용',
      description: '선택한 작업 폴더의 파일·의존성·아키텍처만 분석합니다. 파일 수정이나 명령 실행은 지원하지 않습니다.',
    })
    case 'chat-only': return localize('chatOnly', {
      access: 'read', label: 'RAG·지식 읽기 전용',
      description: '대화와 저장된 지식 조회만 가능합니다. 저장·수정·실행·자동 모드 전환은 지원하지 않습니다.',
    })
    case 'instant': return localize('instant', {
      access: 'handoff', label: '필요 시 작업 모드로 전환',
      description: '대화와 기억 조회로 시작하고, Apps·파일 등 다른 도구가 필요하면 실행 모드로 전환할 수 있습니다. 전환해도 현재 권한과 승인 정책은 유지됩니다. 작업 실행 없이 대화만 하려면 Chat Only를 선택하세요.',
    })
    case 'writing': return localize('writing', {
      access: 'handoff', label: '현재 문서 편집 전용',
      description: '글쓰기는 현재 문서 도구만 사용합니다. Apps·Memory·Tasks를 연결하는 작업은 Auto에서 진행하세요.',
    })
    case 'persona-panel': return localize('personaPanel', {
      access: 'handoff', label: '비서 실행은 Auto',
      description: '다중 관점의 논의 결과는 Apps에 자동 반영되지 않습니다. 비서 작업은 다중 관점 구성을 해제하고 Auto에서 진행하세요.',
    })
    case 'researcher':
    case 'deep-web-research':
    case 'reviewer': return localize('read', {
      access: 'read', label: 'Apps·Memory·Tasks 조회',
      description: '저장된 개인 정보를 근거로 조회·분석합니다. 일정·할 일 수정이나 작업 예약은 Auto에서 진행하세요.',
    })
    case 'auto':
    case 'react':
    case 'enhanced':
    case 'sequential-thinking':
    case 'tree-of-thought':
    case 'deep-thinking':
    case 'coder':
    case 'deep-coder':
    case 'cowork':
    case 'computer-use':
    case 'browser-agent':
    case 'editor-agent':
    case 'terminal-agent': return localize('execute', {
      access: 'execute', label: 'Apps·Memory·Tasks 연계',
      description: '일정·할 일을 확인하고, 기억을 반영해 수정하거나 후속 작업을 예약할 수 있습니다. 앱 접근 설정과 도구 승인 정책이 적용됩니다.',
    })
    default: return localize('configured', {
      access: 'configured', label: 'Agent 도구 설정에 따름',
      description: '사용자 Agent의 도구·실행 설정에 따라 Apps 연계 범위가 달라집니다.',
    })
  }
}
