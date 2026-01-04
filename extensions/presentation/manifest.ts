/**
 * Presentation Extension Manifest
 *
 * SEPilot Extension System에서 사용되는 확장 기능 정의 파일입니다.
 * 새 extension을 만들 때 이 파일을 참고하세요.
 */

export interface ExtensionManifest {
  /** 확장 기능 고유 식별자 */
  id: string;
  /** 표시 이름 */
  name: string;
  /** 설명 */
  description: string;
  /** 버전 (semver) */
  version: string;
  /** 작성자 */
  author: string;
  /** 아이콘 (lucide-react 아이콘 이름) */
  icon: string;
  /** 이 extension이 활성화할 모드 */
  mode: string;
  /** 사이드바에 표시할지 여부 */
  showInSidebar: boolean;
  /** 의존성 */
  dependencies?: string[];
  /** 설정 스키마 (옵션) */
  settingsSchema?: Record<string, unknown>;
}

/**
 * Presentation Extension Manifest
 */
export const manifest: ExtensionManifest = {
  id: 'presentation',
  name: 'AI Presentation Designer',
  description:
    'AI 기반 프레젠테이션 생성 도구. 대화형 인터페이스로 PPT/PDF/HTML 슬라이드를 디자인하고 내보낼 수 있습니다.',
  version: '1.0.0',
  author: 'SEPilot Team',
  icon: 'Presentation',
  mode: 'presentation',
  showInSidebar: true,
  dependencies: [],
  settingsSchema: {
    webSearchEnabled: {
      type: 'boolean',
      default: false,
      description: '웹검색을 통한 최신 정보 활용',
    },
    ragEnabled: {
      type: 'boolean',
      default: false,
      description: 'RAG(Personal/Team Docs) 활용',
    },
    defaultSlideCount: {
      type: 'number',
      default: 8,
      description: '기본 슬라이드 수',
    },
    defaultLanguage: {
      type: 'string',
      enum: ['ko', 'en', 'ja', 'zh'],
      default: 'ko',
      description: '기본 언어',
    },
  },
};

export default manifest;
