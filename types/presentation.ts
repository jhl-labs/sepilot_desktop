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
