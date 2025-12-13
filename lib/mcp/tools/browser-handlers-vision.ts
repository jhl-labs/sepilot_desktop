import { logger } from '@/lib/utils/logger';
/**
 * Vision-Enhanced Browser Tool Handlers
 *
 * 최신 Browser Agent 기술 적용:
 * - Set-of-Mark (SoM) visual prompting
 * - Bounding box 기반 좌표 추출
 * - Hybrid DOM + Vision 접근법
 * - LLM Vision 모델 통합
 */

import { getActiveBrowserView } from '../../../electron/ipc/handlers/browser-control';
import {
  createVisualMarkers,
  generateMarkerOverlayScript,
  removeMarkerOverlayScript,
  generateVisionPrompt,
  coordinateToElement,
  getElementCenter,
  findElementByMarkerLabel,
  generateScreenshotContext,
} from '../../langgraph/utils/screenshot-analyzer';
import { analyzePage } from './browser-handlers-enhanced';
import { generateId } from '@/lib/utils';
import { LLMService } from '@/lib/llm/service';
import { Message } from '@/types';

interface AnnotatedMarker {
  label: string;
  id: string;
  role: string;
  elementLabel: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface AnnotatedScreenshotData {
  screenshot: {
    base64: string;
    mimeType: string;
    width: number;
    height: number;
  };
  markers: AnnotatedMarker[];
  context: string;
  totalElements: number;
  markedElements: number;
}

/**
 * 주석이 달린 스크린샷 캡처 (Set-of-Mark 오버레이 포함)
 */
export async function handleBrowserCaptureAnnotatedScreenshot(
  options: {
    maxMarkers?: number;
    includeOverlay?: boolean;
  } = {}
): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  const { maxMarkers = 30, includeOverlay = true } = options;

  logger.warn('[BrowserVision] Capturing annotated screenshot...');

  // 1. DOM 분석 (기존 accessibility tree 기반)
  const analysis = await analyzePage(browserView);

  // 2. 시각적 마커 생성 (우선순위 기반)
  const markers = createVisualMarkers(analysis.elements, {
    maxMarkers,
    labelStrategy: 'alphanumeric',
    minPriority: 5, // 낮은 우선순위 요소 제외
  });

  logger.info('[BrowserVision] Created visual markers', { count: markers.length });

  // 3. 마커 오버레이 그리기 (선택적)
  if (includeOverlay) {
    const overlayScript = generateMarkerOverlayScript(markers);
    await browserView.webContents.executeJavaScript(overlayScript);

    // 오버레이가 렌더링될 시간 대기
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // 4. 스크린샷 캡처
  const screenshot = await browserView.webContents.capturePage();
  const imageBuffer = screenshot.toPNG();

  // 5. 오버레이 제거 (선택적)
  if (includeOverlay) {
    const removeScript = removeMarkerOverlayScript();
    await browserView.webContents.executeJavaScript(removeScript);
  }

  // 6. 뷰포트 크기 가져오기
  const viewportSize = await browserView.webContents.executeJavaScript(`
    ({ width: window.innerWidth, height: window.innerHeight })
  `);

  // 7. 컨텍스트 생성
  const context = generateScreenshotContext(markers, viewportSize.width, viewportSize.height);

  // 8. 결과 반환 (이미지는 base64로 인코딩)
  const result = {
    screenshot: {
      base64: imageBuffer.toString('base64'),
      mimeType: 'image/png',
      width: viewportSize.width,
      height: viewportSize.height,
    },
    markers: markers.map((m) => ({
      label: m.label,
      id: m.id,
      role: m.element.role,
      elementLabel: m.element.label,
      boundingBox: m.boundingBox,
    })),
    context,
    totalElements: analysis.elements.length,
    markedElements: markers.length,
  };

  return JSON.stringify(result, null, 2);
}

/**
 * 좌표 기반 클릭 (Pixel counting 방식)
 */
export async function handleBrowserClickCoordinate(x: number, y: number): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab.');
  }

  logger.info('[BrowserVision] Clicking at coordinate', { x, y });

  // 1. DOM 분석으로 해당 좌표의 요소 찾기
  const analysis = await analyzePage(browserView);
  const targetElement = coordinateToElement(x, y, analysis.elements);

  if (!targetElement) {
    // 요소를 찾지 못했어도 좌표 클릭 시도
    logger.warn('[BrowserVision] No element found at coordinate; attempting blind click', { x, y });
  }

  // 2. 좌표 클릭 실행
  const result = await browserView.webContents.executeJavaScript(`
    (function() {
      const x = ${x};
      const y = ${y};

      // 해당 좌표의 요소 찾기
      const element = document.elementFromPoint(x, y);

      if (!element) {
        return { success: false, error: 'No element found at coordinates' };
      }

      // 요소 정보 수집
      const elementInfo = {
        tag: element.tagName.toLowerCase(),
        id: element.id,
        className: element.className,
        text: element.textContent?.trim().substring(0, 50),
      };

      // 클릭 이벤트 생성 및 디스패치
      const clickEvent = new MouseEvent('click', {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
      });

      element.dispatchEvent(clickEvent);

      return {
        success: true,
        element: elementInfo,
        coordinates: { x, y },
      };
    })();
  `);

  if (!result.success) {
    throw new Error(result.error);
  }

  return `Clicked at (${x}, ${y}) → ${result.element.tag}${result.element.text ? `: "${result.element.text}"` : ''}${targetElement ? ` (matched element: ${targetElement.id})` : ''}`;
}

/**
 * 마커 라벨로 요소 클릭 (Set-of-Mark 방식)
 */
export async function handleBrowserClickMarker(markerLabel: string): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab.');
  }

  logger.info('[BrowserVision] Clicking marker', { markerLabel });

  // 1. DOM 분석 및 마커 생성
  const analysis = await analyzePage(browserView);
  const markers = createVisualMarkers(analysis.elements, {
    maxMarkers: 50,
    labelStrategy: 'alphanumeric',
  });

  // 2. 마커로 요소 찾기
  const targetElement = findElementByMarkerLabel(markerLabel, markers);

  if (!targetElement) {
    throw new Error(
      `Marker "${markerLabel}" not found. Available markers: ${markers.map((m) => m.label).join(', ')}`
    );
  }

  // 3. 요소 중심점 계산
  const center = getElementCenter(targetElement);

  if (!center) {
    throw new Error(`Cannot calculate center point for marker "${markerLabel}"`);
  }

  // 4. 좌표 클릭 실행
  return await handleBrowserClickCoordinate(center.x, center.y);
}

/**
 * Vision 모델을 사용한 페이지 분석 (향후 구현)
 *
 * Note: 실제 LLM Vision API 호출이 필요
 * 현재는 구조만 제공
 */
export async function handleBrowserAnalyzeWithVision(userQuery?: string): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab.');
  }

  logger.warn('[BrowserVision] Analyzing page with vision model...');

  // 1. 주석이 달린 스크린샷 캡처
  const annotatedResult = await handleBrowserCaptureAnnotatedScreenshot({
    maxMarkers: 30,
    includeOverlay: true,
  });

  const annotated = JSON.parse(annotatedResult) as AnnotatedScreenshotData;

  // 2. Vision 프롬프트 생성
  const visionPrompt = generateVisionPrompt(
    annotated.markers.map((marker) => ({
      id: marker.id,
      label: marker.label,
      boundingBox: marker.boundingBox,
      element: {
        id: marker.id,
        role: marker.role,
        label: marker.elementLabel,
        placeholder: '',
        tag: '',
        isInteractive: true,
        isVisible: true,
        context: '',
        xpath: '',
        selectors: [],
      },
    })),
    userQuery
  );

  // 3. LLM Vision API 호출
  const message: Message = {
    id: generateId(),
    role: 'user',
    content: visionPrompt,
    created_at: Date.now(),
    images: [
      {
        id: generateId(),
        filename: 'screenshot.png',
        mimeType: 'image/png',
        base64: annotated.screenshot.base64,
      },
    ],
  };

  try {
    logger.info('[BrowserVision] Sending request to LLM Service');
    const response = await LLMService.chat([message]);

    return JSON.stringify(
      {
        analysis: response.content,
        screenshot_captured: true,
        markers_count: annotated.markers.length,
        context: annotated.context,
      },
      null,
      2
    );
  } catch (error) {
    logger.error('[BrowserVision] LLM analysis failed:', error);
    throw new Error(
      `Vision analysis failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * 요소의 정확한 클릭 가능 좌표 찾기 (Hybrid 접근)
 */
export async function handleBrowserGetClickableCoordinate(elementId: string): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab.');
  }

  logger.info('[BrowserVision] Getting clickable coordinate', { elementId });

  const result = await browserView.webContents.executeJavaScript(`
    (function() {
      const element = document.querySelector('[data-ai-id="${elementId}"]');
      if (!element) {
        return { success: false, error: 'Element not found' };
      }

      const rect = element.getBoundingClientRect();

      // 중심점 계산
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;

      // 실제 클릭 가능 지점 확인 (요소가 가려졌을 수 있음)
      const elementAtCenter = document.elementFromPoint(centerX, centerY);
      const isClickable = elementAtCenter === element || element.contains(elementAtCenter);

      return {
        success: true,
        coordinates: {
          x: Math.round(centerX),
          y: Math.round(centerY),
          isClickable,
        },
        boundingBox: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        element: {
          tag: element.tagName.toLowerCase(),
          label: element.textContent?.trim().substring(0, 50),
        },
      };
    })();
  `);

  if (!result.success) {
    throw new Error(result.error);
  }

  if (!result.coordinates.isClickable) {
    logger.warn('[BrowserVision] Element center point may be obscured', { elementId });
  }

  return JSON.stringify(result, null, 2);
}

/**
 * Export for use in builtin-tools
 */
export {
  handleBrowserCaptureAnnotatedScreenshot as captureAnnotatedScreenshot,
  handleBrowserClickCoordinate as clickCoordinate,
  handleBrowserClickMarker as clickMarker,
  handleBrowserAnalyzeWithVision as analyzeWithVision,
  handleBrowserGetClickableCoordinate as getClickableCoordinate,
};
