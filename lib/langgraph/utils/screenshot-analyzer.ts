/**
 * Screenshot Analyzer - Vision-based DOM 요소 인식
 *
 * 최신 Browser Agent 기술 적용:
 * - Set-of-Mark (SoM) visual prompting으로 요소 라벨링
 * - Bounding box 기반 좌표 추출
 * - LLM Vision 모델을 사용한 요소 인식
 * - Hybrid DOM + Vision 접근법
 */

import type { SemanticElement } from './dom-analyzer';

/**
 * 스크린샷에 표시될 시각적 마커 정보
 */
export interface VisualMarker {
  id: string; // ai-element-N
  label: string; // 화면에 표시될 짧은 라벨 (A, B, C... 또는 1, 2, 3...)
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  element: SemanticElement; // 원본 요소 정보
}

/**
 * 주석이 달린 스크린샷 정보
 */
export interface AnnotatedScreenshot {
  imageBuffer: Buffer; // PNG 이미지 데이터
  markers: VisualMarker[]; // 화면에 표시된 마커들
  viewportWidth: number;
  viewportHeight: number;
  timestamp: number;
}

/**
 * Vision 분석 결과
 */
export interface VisionAnalysisResult {
  description: string; // LLM이 생성한 페이지 설명
  identifiedElements: Array<{
    markerId: string; // 마커 ID (A, B, C...)
    elementId: string; // ai-element-N
    purpose: string; // LLM이 추론한 요소의 목적
    confidence: 'high' | 'medium' | 'low';
  }>;
  suggestions: string[]; // LLM이 제안하는 다음 액션
}

/**
 * 좌표 기반 클릭 정보
 */
export interface CoordinateClick {
  x: number;
  y: number;
  elementId?: string; // 해당 좌표의 요소 ID (있는 경우)
  screenX: number; // 스크린 좌표
  screenY: number;
}

/**
 * Set-of-Mark 라벨 생성 전략
 */
type LabelStrategy = 'alphabet' | 'numeric' | 'alphanumeric';

/**
 * 마커 라벨 생성 (A, B, C... → AA, AB, AC...)
 */
function generateLabel(index: number, strategy: LabelStrategy = 'alphanumeric'): string {
  if (strategy === 'numeric') {
    return String(index + 1);
  }

  // 알파벳 (A-Z, AA-AZ, BA-BZ...)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  let num = index;

  do {
    result = alphabet[num % 26] + result;
    num = Math.floor(num / 26) - 1;
  } while (num >= 0);

  return result;
}

/**
 * 요소의 시각적 중요도 계산 (화면에 마커를 표시할 우선순위)
 */
function calculateVisualPriority(element: SemanticElement): number {
  let priority = 0;

  // 인터랙티브 요소 우선
  if (element.isInteractive) {priority += 10;}

  // Role 기반 우선순위
  const rolePriority: Record<string, number> = {
    button: 9,
    link: 7,
    textbox: 8,
    searchbox: 8,
    combobox: 7,
    checkbox: 6,
    radio: 6,
  };
  priority += rolePriority[element.role] || 0;

  // 레이블이 있으면 가산점
  if (element.label) {priority += 5;}

  // 크기 고려 (너무 작거나 큰 요소는 감점)
  const area = (element.boundingBox?.width || 0) * (element.boundingBox?.height || 0);
  if (area < 100) {priority -= 5;} // 너무 작음
  if (area > 100000) {priority -= 3;} // 너무 큼 (섹션일 가능성)

  // 가시성
  if (!element.isVisible) {priority -= 100;}

  return priority;
}

/**
 * 요소들을 시각적 우선순위로 정렬하고 마커 생성
 */
export function createVisualMarkers(
  elements: SemanticElement[],
  options: {
    maxMarkers?: number;
    labelStrategy?: LabelStrategy;
    minPriority?: number;
  } = {}
): VisualMarker[] {
  const { maxMarkers = 50, labelStrategy = 'alphanumeric', minPriority = 0 } = options;

  // 우선순위 계산 및 정렬
  const prioritizedElements = elements
    .map((element) => ({
      element,
      priority: calculateVisualPriority(element),
    }))
    .filter(({ priority }) => priority >= minPriority)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxMarkers);

  // 마커 생성
  return prioritizedElements.map(({ element }, index) => ({
    id: element.id,
    label: generateLabel(index, labelStrategy),
    boundingBox: element.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
    element,
  }));
}

/**
 * 스크린샷에 마커 오버레이 그리기 (HTML Canvas API 사용)
 *
 * Note: Electron renderer 프로세스에서 실행되어야 함
 * Main 프로세스에서는 executeJavaScript를 통해 호출
 */
export function generateMarkerOverlayScript(markers: VisualMarker[]): string {
  return `
    (function() {
      // 기존 오버레이 제거
      const existingOverlay = document.getElementById('ai-marker-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
      }

      // 오버레이 캔버스 생성
      const overlay = document.createElement('div');
      overlay.id = 'ai-marker-overlay';
      overlay.style.cssText = \`
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 999999;
      \`;

      // 각 마커 추가
      const markers = ${JSON.stringify(markers)};

      markers.forEach(marker => {
        const box = marker.boundingBox;

        // 바운딩 박스
        const rect = document.createElement('div');
        rect.style.cssText = \`
          position: absolute;
          left: \${box.x}px;
          top: \${box.y}px;
          width: \${box.width}px;
          height: \${box.height}px;
          border: 2px solid #FF6B6B;
          background: rgba(255, 107, 107, 0.1);
          box-sizing: border-box;
        \`;

        // 라벨 (좌상단)
        const label = document.createElement('div');
        label.textContent = marker.label;
        label.style.cssText = \`
          position: absolute;
          left: \${box.x}px;
          top: \${Math.max(0, box.y - 24)}px;
          background: #FF6B6B;
          color: white;
          padding: 2px 6px;
          border-radius: 3px;
          font-family: monospace;
          font-size: 14px;
          font-weight: bold;
          line-height: 20px;
        \`;

        overlay.appendChild(rect);
        overlay.appendChild(label);
      });

      document.body.appendChild(overlay);

      return {
        markerCount: markers.length,
        overlayId: 'ai-marker-overlay',
      };
    })();
  `;
}

/**
 * 마커 오버레이 제거
 */
export function removeMarkerOverlayScript(): string {
  return `
    (function() {
      const overlay = document.getElementById('ai-marker-overlay');
      if (overlay) {
        overlay.remove();
        return { removed: true };
      }
      return { removed: false };
    })();
  `;
}

/**
 * Vision 모델을 위한 프롬프트 생성
 */
export function generateVisionPrompt(
  markers: VisualMarker[],
  userQuery?: string
): string {
  const markerDescriptions = markers
    .map(
      (m) =>
        `[${m.label}] ${m.element.role}: "${m.element.label}"${m.element.placeholder ? ` (placeholder: "${m.element.placeholder}")` : ''}`
    )
    .join('\n');

  const basePrompt = `You are analyzing a screenshot of a web page with labeled interactive elements.

# Labeled Elements

${markerDescriptions}

# Task

Analyze the screenshot and:
1. Describe what you see on the page (layout, content, purpose)
2. Identify which elements are most relevant for user interactions
3. Suggest the most likely next actions a user might want to perform

${userQuery ? `\n# User Query\n\nThe user asks: "${userQuery}"\n\nProvide specific guidance on which elements to use.` : ''}

Respond in JSON format:
{
  "description": "Brief description of the page",
  "identifiedElements": [
    {
      "markerId": "A",
      "elementId": "ai-element-0",
      "purpose": "What this element does",
      "confidence": "high|medium|low"
    }
  ],
  "suggestions": ["Action suggestion 1", "Action suggestion 2"]
}`;

  return basePrompt;
}

/**
 * 좌표를 요소 ID로 변환 (가장 가까운 요소 찾기)
 */
export function coordinateToElement(
  x: number,
  y: number,
  elements: SemanticElement[]
): SemanticElement | null {
  // 좌표를 포함하는 요소 찾기
  const containingElements = elements.filter((el) => {
    const box = el.boundingBox;
    if (!box) {return false;}

    return (
      x >= box.x &&
      x <= box.x + box.width &&
      y >= box.y &&
      y <= box.y + box.height
    );
  });

  if (containingElements.length === 0) {
    return null;
  }

  // 가장 작은 요소 선택 (가장 구체적인 요소)
  return containingElements.reduce((smallest, current) => {
    const smallestArea =
      (smallest.boundingBox?.width || 0) * (smallest.boundingBox?.height || 0);
    const currentArea =
      (current.boundingBox?.width || 0) * (current.boundingBox?.height || 0);

    return currentArea < smallestArea ? current : smallest;
  });
}

/**
 * 요소 중심점 좌표 계산
 */
export function getElementCenter(element: SemanticElement): { x: number; y: number } | null {
  const box = element.boundingBox;
  if (!box) {return null;}

  return {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2,
  };
}

/**
 * 마커 라벨로 요소 찾기
 */
export function findElementByMarkerLabel(
  label: string,
  markers: VisualMarker[]
): SemanticElement | null {
  const marker = markers.find((m) => m.label === label);
  return marker ? marker.element : null;
}

/**
 * 스크린샷 메타데이터 생성 (LLM에 전달할 컨텍스트)
 */
export function generateScreenshotContext(
  markers: VisualMarker[],
  viewportWidth: number,
  viewportHeight: number
): string {
  const context = [
    `Screenshot Context:`,
    `- Viewport: ${viewportWidth}x${viewportHeight}`,
    `- Labeled elements: ${markers.length}`,
    ``,
    `Element List:`,
  ];

  markers.forEach((marker) => {
    const el = marker.element;
    const box = marker.boundingBox;
    context.push(
      `  [${marker.label}] ${el.role} "${el.label}" at (${Math.round(box.x)}, ${Math.round(box.y)}) size ${Math.round(box.width)}x${Math.round(box.height)}`
    );
  });

  return context.join('\n');
}

/**
 * Export utilities
 */
export const ScreenshotAnalyzer = {
  createVisualMarkers,
  generateMarkerOverlayScript,
  removeMarkerOverlayScript,
  generateVisionPrompt,
  coordinateToElement,
  getElementCenter,
  findElementByMarkerLabel,
  generateScreenshotContext,
};
