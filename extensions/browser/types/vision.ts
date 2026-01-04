/**
 * Vision-Based Browser Control Tools 타입 정의
 * Set-of-Mark (SoM), Coordinate Clicking, Vision Analysis
 */

import { BoundingBox, InteractiveElementRole } from './browser-control';

// =============================================================================
// Vision-Based Tools
// =============================================================================

/**
 * Marker Label (Set-of-Mark에서 사용)
 */
export type MarkerLabel =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S'
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'Z'
  | 'AA'
  | 'AB'
  | 'AC'
  | 'AD'
  | 'AE'
  | 'AF'
  | 'AG'
  | 'AH'
  | 'AI'
  | 'AJ';

/**
 * Marker 정보 (Set-of-Mark)
 */
export interface ElementMarker {
  /** Marker Label (A, B, C...) */
  label: MarkerLabel;

  /** Element ID */
  elementId: string;

  /** Element Role */
  role: InteractiveElementRole;

  /** Element Text/Label */
  text: string;

  /** Bounding Box */
  boundingBox: BoundingBox;

  /** Center Point (클릭 좌표) */
  centerPoint: {
    x: number;
    y: number;
  };

  /** Confidence Score (0-1) */
  confidence: number;

  /** 마커 색상 (디버깅용) */
  color?: string;
}

/**
 * browser_capture_annotated_screenshot 옵션
 */
export interface BrowserCaptureAnnotatedScreenshotOptions {
  /** 최대 마커 수 (기본값: 30) */
  max_markers?: number;

  /** 마커 오버레이 포함 여부 (기본값: true) */
  include_overlay?: boolean;

  /** 저장 경로 */
  savePath?: string;

  /** Base64 반환 여부 (기본값: true) */
  returnBase64?: boolean;

  /** 특정 role만 마킹 */
  filterByRole?: InteractiveElementRole[];

  /** 마커 폰트 크기 (기본값: 14) */
  markerFontSize?: number;

  /** 마커 배경 색상 (기본값: "rgba(255, 0, 0, 0.7)") */
  markerBackgroundColor?: string;
}

/**
 * Annotated Screenshot 결과 (Set-of-Mark)
 */
export interface AnnotatedScreenshotResult {
  /** 성공 여부 */
  success: boolean;

  /** 스크린샷 Base64 */
  screenshotBase64?: string;

  /** 스크린샷 저장 경로 */
  screenshotPath: string;

  /** 마커 목록 */
  markers: ElementMarker[];

  /** 총 마커 수 */
  totalMarkers: number;

  /** 스크린샷 크기 */
  dimensions: {
    width: number;
    height: number;
  };

  /** 캡처 시간 (ms) */
  captureTime: number;

  /** 파일 크기 (bytes) */
  fileSize?: number;

  /** 에러 메시지 */
  error?: string;
}

/**
 * browser_click_coordinate 옵션
 */
export interface BrowserClickCoordinateOptions {
  /** X 좌표 (픽셀) */
  x: number;

  /** Y 좌표 (픽셀) */
  y: number;

  /** 클릭 후 대기 시간 (ms) */
  waitAfterClick?: number;

  /** 클릭 버튼 (기본값: 'left') */
  button?: 'left' | 'right' | 'middle';

  /** 더블 클릭 여부 */
  doubleClick?: boolean;
}

/**
 * Coordinate Click 결과
 */
export interface CoordinateClickResult {
  /** 성공 여부 */
  success: boolean;

  /** 클릭한 좌표 */
  clickedCoordinates: {
    x: number;
    y: number;
  };

  /** 클릭된 요소 정보 */
  clickedElement?: {
    tagName: string;
    id?: string;
    className?: string;
    text?: string;
    role?: string;
  };

  /** 실제 클릭된 좌표 (요소 중심점으로 조정된 경우) */
  actualCoordinates?: {
    x: number;
    y: number;
  };

  /** 메시지 */
  message: string;

  /** 에러 */
  error?: string;
}

/**
 * browser_click_marker 옵션
 */
export interface BrowserClickMarkerOptions {
  /** Marker Label (A, B, C...) */
  marker_label: MarkerLabel;

  /** 클릭 후 대기 시간 (ms) */
  waitAfterClick?: number;
}

/**
 * Marker Click 결과
 */
export interface MarkerClickResult {
  /** 성공 여부 */
  success: boolean;

  /** 클릭한 마커 */
  markerLabel: MarkerLabel;

  /** 클릭한 요소 ID */
  elementId: string;

  /** 클릭한 좌표 */
  clickedCoordinates: {
    x: number;
    y: number;
  };

  /** 요소 정보 */
  elementInfo?: {
    role: string;
    label: string;
    text: string;
  };

  /** 메시지 */
  message: string;

  /** 에러 */
  error?: string;
}

/**
 * browser_get_clickable_coordinate 옵션
 */
export interface BrowserGetClickableCoordinateOptions {
  /** Element ID */
  element_id: string;

  /** 좌표 계산 방법 */
  method?: 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

/**
 * Clickable Coordinate 결과
 */
export interface ClickableCoordinateResult {
  /** 성공 여부 */
  success: boolean;

  /** Element ID */
  elementId: string;

  /** 클릭 가능한 좌표 */
  coordinates: {
    x: number;
    y: number;
  };

  /** Bounding Box */
  boundingBox: BoundingBox;

  /** 요소가 화면에 보이는지 */
  isVisible: boolean;

  /** 중심점이 실제로 클릭 가능한지 (가려지지 않았는지) */
  isClickable: boolean;

  /** 요소 정보 */
  elementInfo?: {
    role: string;
    label: string;
  };

  /** 메시지 */
  message: string;

  /** 에러 */
  error?: string;
}

/**
 * browser_analyze_with_vision 옵션
 */
export interface BrowserAnalyzeWithVisionOptions {
  /** 사용자 쿼리 */
  user_query: string;

  /** 사용할 Vision 모델 (기본값: 'gpt-4-vision') */
  visionModel?: 'gpt-4-vision' | 'claude-3-opus' | 'gemini-pro-vision';

  /** 스크린샷 포함 여부 (기본값: true) */
  includeScreenshot?: boolean;

  /** 마커 오버레이 포함 여부 (기본값: true) */
  includeMarkers?: boolean;

  /** 최대 마커 수 */
  maxMarkers?: number;

  /** 상세 분석 여부 */
  detailedAnalysis?: boolean;
}

/**
 * Vision Analysis 결과
 */
export interface VisionAnalysisResult {
  /** 성공 여부 */
  success: boolean;

  /** Vision 모델 응답 */
  analysis?: string;

  /** 제안된 액션들 */
  suggestedActions?: Array<{
    tool: string;
    arguments: Record<string, any>;
    reason: string;
    confidence: number;
  }>;

  /** 발견된 요소들 */
  identifiedElements?: Array<{
    markerLabel?: MarkerLabel;
    elementId?: string;
    description: string;
    role?: string;
    coordinates?: { x: number; y: number };
  }>;

  /** 페이지 레이아웃 분석 */
  layoutAnalysis?: {
    sections: Array<{
      name: string;
      description: string;
      location: 'top' | 'bottom' | 'left' | 'right' | 'center';
      importance: 'high' | 'medium' | 'low';
    }>;
  };

  /** 사용된 스크린샷 경로 */
  screenshotPath?: string;

  /** Vision API 호출 시간 (ms) */
  analysisTime?: number;

  /** 에러 메시지 */
  error?: string;

  /** 현재 상태 (구현 진행 중) */
  status?: 'implemented' | 'pending_vision_api_integration';
}

// =============================================================================
// Vision Tools Metadata
// =============================================================================

/**
 * Vision-Based Tools 정의
 */
export const VISION_TOOLS = {
  browser_capture_annotated_screenshot: {
    name: 'browser_capture_annotated_screenshot',
    description:
      'Set-of-Mark 방식으로 스크린샷을 캡처합니다. Interactive 요소 위에 A, B, C... 마커를 오버레이합니다.',
    parameters: {
      max_markers: {
        type: 'number',
        description: '최대 마커 수 (1-50)',
        required: false,
        default: 30,
      },
      include_overlay: {
        type: 'boolean',
        description: '마커 오버레이 포함 여부',
        required: false,
        default: true,
      },
      savePath: {
        type: 'string',
        description: '저장 경로',
        required: false,
      },
      returnBase64: {
        type: 'boolean',
        description: 'Base64 반환 여부',
        required: false,
        default: true,
      },
      filterByRole: {
        type: 'array',
        description: '특정 role만 마킹',
        required: false,
      },
      markerFontSize: {
        type: 'number',
        description: '마커 폰트 크기',
        required: false,
        default: 14,
      },
      markerBackgroundColor: {
        type: 'string',
        description: '마커 배경 색상',
        required: false,
        default: 'rgba(255, 0, 0, 0.7)',
      },
    },
    category: 'vision',
  },

  browser_click_coordinate: {
    name: 'browser_click_coordinate',
    description:
      '정확한 픽셀 좌표를 클릭합니다. DOM 기반 클릭이 실패하거나, Canvas/SVG 요소를 클릭할 때 유용.',
    parameters: {
      x: {
        type: 'number',
        description: 'X 좌표 (픽셀)',
        required: true,
      },
      y: {
        type: 'number',
        description: 'Y 좌표 (픽셀)',
        required: true,
      },
      waitAfterClick: {
        type: 'number',
        description: '클릭 후 대기 시간 (ms)',
        required: false,
        default: 500,
      },
      button: {
        type: 'string',
        description: '클릭 버튼 (left, right, middle)',
        required: false,
        default: 'left',
      },
      doubleClick: {
        type: 'boolean',
        description: '더블 클릭 여부',
        required: false,
        default: false,
      },
    },
    category: 'vision',
  },

  browser_click_marker: {
    name: 'browser_click_marker',
    description:
      'Annotated Screenshot의 마커 라벨(A, B, C...)로 요소를 클릭합니다. 먼저 browser_capture_annotated_screenshot 호출 필요.',
    parameters: {
      marker_label: {
        type: 'string',
        description: 'Marker Label (A, B, C...)',
        required: true,
      },
      waitAfterClick: {
        type: 'number',
        description: '클릭 후 대기 시간 (ms)',
        required: false,
        default: 500,
      },
    },
    category: 'vision',
  },

  browser_get_clickable_coordinate: {
    name: 'browser_get_clickable_coordinate',
    description:
      'Element ID를 받아 클릭 가능한 정확한 좌표를 반환합니다. 중심점이 가려지지 않았는지 검증.',
    parameters: {
      element_id: {
        type: 'string',
        description: 'Element ID',
        required: true,
      },
      method: {
        type: 'string',
        description: '좌표 계산 방법 (center, top-left, top-right, bottom-left, bottom-right)',
        required: false,
        default: 'center',
      },
    },
    category: 'vision',
  },

  browser_analyze_with_vision: {
    name: 'browser_analyze_with_vision',
    description:
      'Vision LLM으로 페이지를 분석합니다. Annotated Screenshot를 캡처하고 AI가 페이지 레이아웃과 제안 액션을 분석합니다. (Vision API 통합 대기 중)',
    parameters: {
      user_query: {
        type: 'string',
        description: '사용자 쿼리 (예: "Find the login button")',
        required: true,
      },
      visionModel: {
        type: 'string',
        description: '사용할 Vision 모델',
        required: false,
        default: 'gpt-4-vision',
      },
      includeScreenshot: {
        type: 'boolean',
        description: '스크린샷 포함 여부',
        required: false,
        default: true,
      },
      includeMarkers: {
        type: 'boolean',
        description: '마커 오버레이 포함',
        required: false,
        default: true,
      },
      maxMarkers: {
        type: 'number',
        description: '최대 마커 수',
        required: false,
        default: 30,
      },
      detailedAnalysis: {
        type: 'boolean',
        description: '상세 분석 여부',
        required: false,
        default: false,
      },
    },
    category: 'vision',
  },
} as const;

/**
 * Vision Tool 이름 타입
 */
export type VisionToolName = keyof typeof VISION_TOOLS;

/**
 * Vision Tools 목록 (배열)
 */
export const VISION_TOOLS_LIST = Object.values(VISION_TOOLS);
