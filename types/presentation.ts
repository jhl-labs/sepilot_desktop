export type PresentationExportFormat = 'pptx' | 'pdf' | 'html';

export interface PresentationSlide {
  id: string;
  title: string;
  subtitle?: string; // 부제목 추가
  description?: string;
  bullets?: string[];
  imagePrompt?: string;
  imageUrl?: string;
  imageData?: string; // base64 data URL for inline use
  notes?: string;

  // 디자인 시스템
  accentColor?: string; // 메인 강조 색상
  backgroundColor?: string; // 배경색 (그라데이션 지원)
  textColor?: string; // 텍스트 색상 (dark/light)
  layout?:
    | 'title-body'
    | 'two-column'
    | 'timeline'
    | 'grid'
    | 'hero'
    | 'split-image'
    | 'quote'
    | 'stats';
  vibe?: string; // e.g., "dark neon tech", "minimal white", "warm organic"

  // 타이포그래피
  titleFont?: string; // 제목 폰트 (e.g., "Sora Bold", "Playfair Display")
  bodyFont?: string; // 본문 폰트 (e.g., "Inter Regular", "Source Sans Pro")
  titleSize?: 'small' | 'medium' | 'large' | 'xl'; // 제목 크기
  textAlign?: 'left' | 'center' | 'right'; // 텍스트 정렬

  // 고급 콘텐츠 슬롯
  slots?: {
    // 차트 데이터
    chart?: {
      type: 'bar' | 'line' | 'pie' | 'area' | 'donut' | 'radar';
      title?: string;
      data?: {
        labels: string[];
        values: number[];
        colors?: string[];
      };
      description?: string;
    };

    // 테이블 데이터
    table?: {
      headers: string[];
      rows: string[][];
      caption?: string;
      highlightColumn?: number; // 강조할 열 인덱스
    };

    // 통계/숫자 강조
    stats?: {
      value: string; // e.g., "95%", "1.2M", "$50K"
      label: string; // e.g., "Customer Satisfaction", "Active Users"
      icon?: string; // 아이콘 이름 또는 emoji
    }[];

    // 인용구
    quote?: {
      text: string;
      author?: string;
      role?: string;
    };

    // 타임라인
    timeline?: {
      steps: Array<{
        title: string;
        description?: string;
        date?: string;
      }>;
      orientation?: 'horizontal' | 'vertical';
    };

    // 이미지 배치
    images?: {
      urls: string[];
      layout: 'single' | 'grid' | 'collage';
      captions?: string[];
    };
  };

  // 애니메이션/전환
  transition?: 'fade' | 'slide' | 'zoom' | 'none';
  emphasis?: 'title' | 'visual' | 'data' | 'balanced'; // 어디에 초점을 둘지
}

export interface PresentationExportState {
  format: PresentationExportFormat;
  status: 'idle' | 'preparing' | 'working' | 'ready' | 'error';
  error?: string;
  filePath?: string;
  progressMessage?: string;
}

/**
 * PPT 생성 워크플로우 단계
 */
export type PresentationWorkflowStep =
  | 'briefing' // 주제, 목적, 청중 파악
  | 'design-master' // 디자인 마스터 설정 (색상, 폰트, 분위기)
  | 'structure' // 슬라이드 구조 계획 (개수, 제목, 레이아웃)
  | 'slide-creation' // 슬라이드별 내용 작성
  | 'review' // 검토 및 수정
  | 'complete'; // 완료

/**
 * 브리핑 정보
 */
export interface PresentationBrief {
  topic: string; // 주제
  purpose?: string; // 목적 (설득/정보전달/교육 등)
  audience?: string; // 청중 (임원/개발자/학생 등)
  slideCount?: number; // 슬라이드 수
  duration?: number; // 발표 시간 (분)
  language?: 'ko' | 'en' | 'ja' | 'zh'; // 언어
  additionalNotes?: string; // 추가 요청사항
}

/**
 * 디자인 마스터 (모든 슬라이드에 적용되는 디자인 시스템)
 */
export interface PresentationDesignMaster {
  name?: string; // 디자인 테마 이름 (e.g., "Dark Tech", "Minimal White")
  vibe: string; // 분위기 (e.g., "professional", "creative", "bold")

  // 색상 시스템
  palette: {
    primary: string; // 메인 색상
    secondary?: string; // 보조 색상
    accent: string; // 강조 색상
    background: string; // 배경색
    text: string; // 텍스트 색상
  };

  // 타이포그래피
  fonts: {
    title: string; // 제목 폰트
    body: string; // 본문 폰트
    titleSize: 'small' | 'medium' | 'large' | 'xl';
  };

  // 레이아웃 선호도
  layoutPreferences?: {
    preferredLayouts?: Array<PresentationSlide['layout']>; // 선호하는 레이아웃
    avoidLayouts?: Array<PresentationSlide['layout']>; // 피할 레이아웃
    imageStyle?: 'minimal' | 'abundant' | 'balanced'; // 이미지 사용 스타일
  };
}

/**
 * 슬라이드 구조 계획
 */
export interface PresentationStructure {
  totalSlides: number;
  outline: Array<{
    index: number; // 슬라이드 번호
    title: string; // 제목
    layout: PresentationSlide['layout']; // 레이아웃
    contentType?: 'text' | 'image' | 'chart' | 'mixed'; // 콘텐츠 유형
    keyPoints?: string[]; // 핵심 포인트 (간략)
  }>;
}

/**
 * PPT Agent 대화 상태 (전체 워크플로우 추적)
 */
export interface PresentationAgentState {
  // 현재 단계
  currentStep: PresentationWorkflowStep;

  // 각 단계별 데이터
  brief?: PresentationBrief;
  designMaster?: PresentationDesignMaster;
  designOptions?: PresentationDesignMaster[]; // AI가 제안한 디자인 옵션들
  structure?: PresentationStructure;

  // 슬라이드 작성 진행 상황
  currentSlideIndex?: number; // 현재 작업 중인 슬라이드 인덱스
  completedSlideIndices: number[]; // 완료된 슬라이드 인덱스

  // 생성된 슬라이드
  slides: PresentationSlide[];

  // 설정
  webSearchEnabled?: boolean; // 웹검색 사용 여부 (기본: false)
  ragEnabled?: boolean; // RAG 사용 여부 (Personal Docs / Team Docs) (기본: false)

  // 메타데이터
  createdAt: number;
  updatedAt: number;
}
