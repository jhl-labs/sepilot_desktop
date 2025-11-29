/**
 * DOM Analyzer - Accessibility Tree 기반 의미론적 DOM 분석
 *
 * 최신 Browser Agent 기술 적용:
 * - Accessibility Tree 파싱으로 구조적 이해 향상
 * - 역할(role), 레이블(label), 상태(state) 기반 요소 분석
 * - 인터랙티브 요소 우선순위화 및 컨텍스트 제공
 */

export interface SemanticElement {
  id: string; // 고유 식별자 (ai-element-N)
  role: string; // 요소 역할 (button, link, textbox, etc.)
  label: string; // 요소 레이블 (버튼 텍스트, aria-label 등)
  value?: string; // 현재 값 (input의 경우)
  placeholder?: string; // placeholder 텍스트
  tag: string; // HTML 태그
  type?: string; // input type
  href?: string; // 링크 URL
  isInteractive: boolean; // 인터랙티브 여부
  isVisible: boolean; // 가시성 여부
  context: string; // 주변 컨텍스트 (부모, 형제 요소 정보)
  xpath: string; // XPath 선택자
  selectors: string[]; // CSS 선택자들
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface DOMAnalysis {
  elements: SemanticElement[];
  pageStructure: {
    title: string;
    url: string;
    headings: Array<{ level: number; text: string }>;
    forms: Array<{ id?: string; action?: string; method?: string }>;
    sections: Array<{ name: string; role?: string }>;
  };
  interactiveElements: {
    buttons: SemanticElement[];
    links: SemanticElement[];
    inputs: SemanticElement[];
    selects: SemanticElement[];
    textareas: SemanticElement[];
  };
  summary: string; // LLM을 위한 페이지 요약
}

/**
 * Accessibility Tree에서 role 추출 우선순위
 */
const ROLE_PRIORITY = {
  // Form controls (highest priority for interaction)
  button: 10,
  textbox: 10,
  searchbox: 10,
  combobox: 9,
  listbox: 9,
  checkbox: 9,
  radio: 9,
  switch: 9,
  slider: 8,

  // Navigation
  link: 7,
  menuitem: 7,
  tab: 7,

  // Structure
  heading: 6,
  article: 5,
  section: 5,
  navigation: 5,
  main: 5,
  complementary: 4,

  // Generic
  generic: 1,
  none: 0,
};

/**
 * HTML 태그에서 암시적 role 추출
 */
function getImplicitRole(tag: string, attributes: Record<string, string>): string {
  const tagLower = tag.toLowerCase();

  // Explicit role attribute
  if (attributes.role) {
    return attributes.role;
  }

  // Implicit roles
  switch (tagLower) {
    case 'button':
      return 'button';
    case 'a':
      return attributes.href ? 'link' : 'generic';
    case 'input': {
      const type = attributes.type?.toLowerCase() || 'text';
      if (type === 'button' || type === 'submit' || type === 'reset') {
        return 'button';
      }
      if (type === 'checkbox') {
        return 'checkbox';
      }
      if (type === 'radio') {
        return 'radio';
      }
      if (type === 'search') {
        return 'searchbox';
      }
      return 'textbox';
    }
    case 'textarea':
      return 'textbox';
    case 'select':
      return 'combobox';
    case 'h1': return 'heading';
    case 'h2': return 'heading';
    case 'h3': return 'heading';
    case 'h4': return 'heading';
    case 'h5': return 'heading';
    case 'h6': return 'heading';
    case 'nav':
      return 'navigation';
    case 'main':
      return 'main';
    case 'article':
      return 'article';
    case 'section':
      return 'section';
    case 'aside':
      return 'complementary';
    case 'form':
      return 'form';
    default:
      return 'generic';
  }
}

/**
 * 요소의 접근 가능한 레이블 계산 (ARIA 명세 기반)
 */
function getAccessibleLabel(
  tag: string,
  attributes: Record<string, string>,
  textContent: string
): string {
  // 1. aria-label (highest priority)
  if (attributes['aria-label']) {
    return attributes['aria-label'];
  }

  // 2. aria-labelledby
  if (attributes['aria-labelledby']) {
    // Note: 실제 구현에서는 ID로 요소를 찾아야 하지만,
    // 여기서는 간단히 ID만 반환
    return `[Labeled by: ${attributes['aria-labelledby']}]`;
  }

  // 3. label element (for form controls)
  if (attributes.id && attributes['data-label']) {
    return attributes['data-label'];
  }

  // 4. placeholder (for inputs)
  if (attributes.placeholder) {
    return attributes.placeholder;
  }

  // 5. title attribute
  if (attributes.title) {
    return attributes.title;
  }

  // 6. alt attribute (for images)
  if (attributes.alt) {
    return attributes.alt;
  }

  // 7. value (for buttons)
  if (tag.toLowerCase() === 'input' && attributes.type === 'submit' && attributes.value) {
    return attributes.value;
  }

  // 8. text content (cleaned)
  if (textContent) {
    return textContent.trim().substring(0, 100);
  }

  // 9. name attribute
  if (attributes.name) {
    return attributes.name;
  }

  return '';
}

/**
 * 요소가 인터랙티브한지 판단
 */
function isInteractive(role: string, tag: string, attributes: Record<string, string>): boolean {
  // Role-based
  const interactiveRoles = [
    'button', 'link', 'textbox', 'searchbox', 'combobox',
    'checkbox', 'radio', 'switch', 'slider', 'menuitem', 'tab'
  ];

  if (interactiveRoles.includes(role)) {
    return true;
  }

  // Tag-based
  const tagLower = tag.toLowerCase();
  if (['button', 'a', 'input', 'textarea', 'select'].includes(tagLower)) {
    return true;
  }

  // Has click handler
  if (attributes.onclick || attributes['data-action']) {
    return true;
  }

  return false;
}

/**
 * 주변 컨텍스트 생성 (부모, 형제 요소 정보)
 */
function buildContext(
  element: any,
  parentText: string,
  siblingTexts: string[]
): string {
  const parts: string[] = [];

  if (parentText) {
    parts.push(`Parent: ${parentText.substring(0, 50)}`);
  }

  if (siblingTexts.length > 0) {
    parts.push(`Siblings: ${siblingTexts.slice(0, 3).join(', ')}`);
  }

  return parts.join(' | ');
}

/**
 * 페이지 구조 요약 생성 (LLM을 위한 컨텍스트)
 */
export function generatePageSummary(analysis: DOMAnalysis): string {
  const { pageStructure, interactiveElements } = analysis;

  const parts: string[] = [];

  // Basic info
  parts.push(`Page: ${pageStructure.title}`);
  parts.push(`URL: ${pageStructure.url}`);

  // Headings (page structure)
  if (pageStructure.headings.length > 0) {
    const headingTexts = pageStructure.headings
      .slice(0, 5)
      .map(h => `H${h.level}: ${h.text}`)
      .join(', ');
    parts.push(`Headings: ${headingTexts}`);
  }

  // Interactive elements summary
  parts.push(`\nInteractive Elements:`);
  parts.push(`- ${interactiveElements.buttons.length} buttons`);
  parts.push(`- ${interactiveElements.links.length} links`);
  parts.push(`- ${interactiveElements.inputs.length} input fields`);
  parts.push(`- ${interactiveElements.selects.length} dropdowns`);
  parts.push(`- ${interactiveElements.textareas.length} text areas`);

  // Forms
  if (pageStructure.forms.length > 0) {
    parts.push(`\nForms: ${pageStructure.forms.length}`);
  }

  return parts.join('\n');
}

/**
 * 요소 필터링 - 우선순위 및 가시성 기반
 */
export function filterRelevantElements(
  elements: SemanticElement[],
  options: {
    maxElements?: number;
    includeHidden?: boolean;
    roleFilter?: string[];
  } = {}
): SemanticElement[] {
  const { maxElements = 50, includeHidden = false, roleFilter } = options;

  const filtered = elements.filter(el => {
    // 가시성 필터
    if (!includeHidden && !el.isVisible) {
      return false;
    }

    // Role 필터
    if (roleFilter && !roleFilter.includes(el.role)) {
      return false;
    }

    return true;
  });

  // 우선순위 정렬
  filtered.sort((a, b) => {
    const aPriority = ROLE_PRIORITY[a.role as keyof typeof ROLE_PRIORITY] || 0;
    const bPriority = ROLE_PRIORITY[b.role as keyof typeof ROLE_PRIORITY] || 0;

    if (aPriority !== bPriority) {
      return bPriority - aPriority;
    }

    // 인터랙티브 요소 우선
    if (a.isInteractive !== b.isInteractive) {
      return a.isInteractive ? -1 : 1;
    }

    // 레이블 길이 (짧은 것 우선)
    return a.label.length - b.label.length;
  });

  return filtered.slice(0, maxElements);
}

/**
 * 요소 검색 - 자연어 쿼리 매칭
 */
export function searchElements(
  elements: SemanticElement[],
  query: string,
  options: {
    fuzzy?: boolean;
    caseSensitive?: boolean;
  } = {}
): SemanticElement[] {
  const { fuzzy = true, caseSensitive = false } = options;

  const normalizedQuery = caseSensitive ? query : query.toLowerCase();

  return elements.filter(el => {
    const searchText = caseSensitive
      ? `${el.label} ${el.placeholder || ''} ${el.value || ''} ${el.context}`
      : `${el.label} ${el.placeholder || ''} ${el.value || ''} ${el.context}`.toLowerCase();

    if (fuzzy) {
      // 단어 단위 매칭
      const queryWords = normalizedQuery.split(/\s+/);
      return queryWords.some(word => searchText.includes(word));
    } else {
      // 정확한 매칭
      return searchText.includes(normalizedQuery);
    }
  });
}

/**
 * Export utilities
 */
export const DOMAnalyzer = {
  getImplicitRole,
  getAccessibleLabel,
  isInteractive,
  buildContext,
  generatePageSummary,
  filterRelevantElements,
  searchElements,
};
