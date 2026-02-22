/**
 * DOM Analyzer 유틸리티 테스트
 */

import {
  DOMAnalyzer,
  generatePageSummary,
  filterRelevantElements,
  searchElements,
  type DOMAnalysis,
  type SemanticElement,
} from '@/lib/domains/agent/utils/dom-analyzer';

describe('DOMAnalyzer', () => {
  describe('getImplicitRole', () => {
    it('should return explicit role when provided', () => {
      const result = DOMAnalyzer.getImplicitRole('div', { role: 'navigation' });
      expect(result).toBe('navigation');
    });

    it('should return button role for button tag', () => {
      const result = DOMAnalyzer.getImplicitRole('button', {});
      expect(result).toBe('button');
    });

    it('should return link role for anchor with href', () => {
      const result = DOMAnalyzer.getImplicitRole('a', { href: 'https://example.com' });
      expect(result).toBe('link');
    });

    it('should return generic role for anchor without href', () => {
      const result = DOMAnalyzer.getImplicitRole('a', {});
      expect(result).toBe('generic');
    });

    it('should return button role for submit input', () => {
      const result = DOMAnalyzer.getImplicitRole('input', { type: 'submit' });
      expect(result).toBe('button');
    });

    it('should return checkbox role for checkbox input', () => {
      const result = DOMAnalyzer.getImplicitRole('input', { type: 'checkbox' });
      expect(result).toBe('checkbox');
    });

    it('should return radio role for radio input', () => {
      const result = DOMAnalyzer.getImplicitRole('input', { type: 'radio' });
      expect(result).toBe('radio');
    });

    it('should return searchbox role for search input', () => {
      const result = DOMAnalyzer.getImplicitRole('input', { type: 'search' });
      expect(result).toBe('searchbox');
    });

    it('should return textbox role for text input', () => {
      const result = DOMAnalyzer.getImplicitRole('input', { type: 'text' });
      expect(result).toBe('textbox');
    });

    it('should return textbox role for textarea', () => {
      const result = DOMAnalyzer.getImplicitRole('textarea', {});
      expect(result).toBe('textbox');
    });

    it('should return combobox role for select', () => {
      const result = DOMAnalyzer.getImplicitRole('select', {});
      expect(result).toBe('combobox');
    });

    it('should return heading role for h1-h6', () => {
      expect(DOMAnalyzer.getImplicitRole('h1', {})).toBe('heading');
      expect(DOMAnalyzer.getImplicitRole('h2', {})).toBe('heading');
      expect(DOMAnalyzer.getImplicitRole('h3', {})).toBe('heading');
      expect(DOMAnalyzer.getImplicitRole('h4', {})).toBe('heading');
      expect(DOMAnalyzer.getImplicitRole('h5', {})).toBe('heading');
      expect(DOMAnalyzer.getImplicitRole('h6', {})).toBe('heading');
    });

    it('should return navigation role for nav', () => {
      const result = DOMAnalyzer.getImplicitRole('nav', {});
      expect(result).toBe('navigation');
    });

    it('should return main role for main', () => {
      const result = DOMAnalyzer.getImplicitRole('main', {});
      expect(result).toBe('main');
    });

    it('should return article role for article', () => {
      const result = DOMAnalyzer.getImplicitRole('article', {});
      expect(result).toBe('article');
    });

    it('should return section role for section', () => {
      const result = DOMAnalyzer.getImplicitRole('section', {});
      expect(result).toBe('section');
    });

    it('should return complementary role for aside', () => {
      const result = DOMAnalyzer.getImplicitRole('aside', {});
      expect(result).toBe('complementary');
    });

    it('should return form role for form', () => {
      const result = DOMAnalyzer.getImplicitRole('form', {});
      expect(result).toBe('form');
    });

    it('should return generic role for unknown tags', () => {
      const result = DOMAnalyzer.getImplicitRole('div', {});
      expect(result).toBe('generic');
    });
  });

  describe('getAccessibleLabel', () => {
    it('should prioritize aria-label', () => {
      const result = DOMAnalyzer.getAccessibleLabel(
        'button',
        { 'aria-label': 'Click me', placeholder: 'Other' },
        'Text content'
      );
      expect(result).toBe('Click me');
    });

    it('should use aria-labelledby when aria-label is not present', () => {
      const result = DOMAnalyzer.getAccessibleLabel(
        'button',
        { 'aria-labelledby': 'label-id' },
        'Text content'
      );
      expect(result).toBe('[Labeled by: label-id]');
    });

    it('should use data-label for form controls with id', () => {
      const result = DOMAnalyzer.getAccessibleLabel(
        'input',
        { id: 'input-1', 'data-label': 'Username' },
        ''
      );
      expect(result).toBe('Username');
    });

    it('should use placeholder for inputs', () => {
      const result = DOMAnalyzer.getAccessibleLabel('input', { placeholder: 'Enter text' }, '');
      expect(result).toBe('Enter text');
    });

    it('should use title attribute', () => {
      const result = DOMAnalyzer.getAccessibleLabel('div', { title: 'Tooltip text' }, '');
      expect(result).toBe('Tooltip text');
    });

    it('should use alt attribute for images', () => {
      const result = DOMAnalyzer.getAccessibleLabel('img', { alt: 'Image description' }, '');
      expect(result).toBe('Image description');
    });

    it('should use value for submit buttons', () => {
      const result = DOMAnalyzer.getAccessibleLabel(
        'input',
        { type: 'submit', value: 'Submit Form' },
        ''
      );
      expect(result).toBe('Submit Form');
    });

    it('should use text content when no other label is available', () => {
      const result = DOMAnalyzer.getAccessibleLabel('button', {}, 'Click here');
      expect(result).toBe('Click here');
    });

    it('should trim and limit text content to 100 characters', () => {
      const longText = 'a'.repeat(150);
      const result = DOMAnalyzer.getAccessibleLabel('div', {}, longText);
      expect(result).toHaveLength(100);
    });

    it('should use name attribute as fallback', () => {
      const result = DOMAnalyzer.getAccessibleLabel('input', { name: 'username' }, '');
      expect(result).toBe('username');
    });

    it('should return empty string when no label is found', () => {
      const result = DOMAnalyzer.getAccessibleLabel('div', {}, '');
      expect(result).toBe('');
    });
  });

  describe('isInteractive', () => {
    it('should return true for button role', () => {
      const result = DOMAnalyzer.isInteractive('button', 'button', {});
      expect(result).toBe(true);
    });

    it('should return true for link role', () => {
      const result = DOMAnalyzer.isInteractive('link', 'a', {});
      expect(result).toBe(true);
    });

    it('should return true for textbox role', () => {
      const result = DOMAnalyzer.isInteractive('textbox', 'input', {});
      expect(result).toBe(true);
    });

    it('should return true for interactive tags', () => {
      expect(DOMAnalyzer.isInteractive('generic', 'button', {})).toBe(true);
      expect(DOMAnalyzer.isInteractive('generic', 'a', {})).toBe(true);
      expect(DOMAnalyzer.isInteractive('generic', 'input', {})).toBe(true);
      expect(DOMAnalyzer.isInteractive('generic', 'textarea', {})).toBe(true);
      expect(DOMAnalyzer.isInteractive('generic', 'select', {})).toBe(true);
    });

    it('should return true for elements with onclick handler', () => {
      const result = DOMAnalyzer.isInteractive('generic', 'div', { onclick: 'handleClick()' });
      expect(result).toBe(true);
    });

    it('should return true for elements with data-action', () => {
      const result = DOMAnalyzer.isInteractive('generic', 'div', { 'data-action': 'click' });
      expect(result).toBe(true);
    });

    it('should return false for non-interactive elements', () => {
      const result = DOMAnalyzer.isInteractive('generic', 'div', {});
      expect(result).toBe(false);
    });
  });

  describe('buildContext', () => {
    it('should include parent text', () => {
      const result = DOMAnalyzer.buildContext({}, 'Parent heading', []);
      expect(result).toContain('Parent: Parent heading');
    });

    it('should include sibling texts', () => {
      const result = DOMAnalyzer.buildContext({}, '', ['Sibling 1', 'Sibling 2']);
      expect(result).toContain('Siblings: Sibling 1, Sibling 2');
    });

    it('should combine parent and sibling info', () => {
      const result = DOMAnalyzer.buildContext({}, 'Parent', ['Sibling 1', 'Sibling 2']);
      expect(result).toContain('Parent: Parent');
      expect(result).toContain('Siblings: Sibling 1, Sibling 2');
    });

    it('should limit sibling texts to 3', () => {
      const result = DOMAnalyzer.buildContext({}, '', [
        'Sibling 1',
        'Sibling 2',
        'Sibling 3',
        'Sibling 4',
      ]);
      expect(result).not.toContain('Sibling 4');
    });

    it('should truncate long parent text at 50 characters', () => {
      const longText = 'a'.repeat(100);
      const result = DOMAnalyzer.buildContext({}, longText, []);
      expect(result).toContain('Parent:');
      expect(result.length).toBeLessThan(100);
    });

    it('should return empty string when no context', () => {
      const result = DOMAnalyzer.buildContext({}, '', []);
      expect(result).toBe('');
    });
  });

  describe('generatePageSummary', () => {
    const mockAnalysis: DOMAnalysis = {
      elements: [],
      pageStructure: {
        title: 'Test Page',
        url: 'https://example.com',
        headings: [
          { level: 1, text: 'Main Heading' },
          { level: 2, text: 'Subheading 1' },
          { level: 2, text: 'Subheading 2' },
        ],
        forms: [{ id: 'form1', action: '/submit', method: 'POST' }],
        sections: [],
      },
      interactiveElements: {
        buttons: [{} as SemanticElement, {} as SemanticElement],
        links: [{} as SemanticElement],
        inputs: [{} as SemanticElement, {} as SemanticElement, {} as SemanticElement],
        selects: [],
        textareas: [{} as SemanticElement],
      },
      summary: '',
    };

    it('should include page title and URL', () => {
      const result = generatePageSummary(mockAnalysis);
      expect(result).toContain('Page: Test Page');
      expect(result).toContain('URL: https://example.com');
    });

    it('should include headings', () => {
      const result = generatePageSummary(mockAnalysis);
      expect(result).toContain('Headings:');
      expect(result).toContain('H1: Main Heading');
      expect(result).toContain('H2: Subheading 1');
    });

    it('should limit headings to 5', () => {
      const manyHeadings: DOMAnalysis = {
        ...mockAnalysis,
        pageStructure: {
          ...mockAnalysis.pageStructure,
          headings: Array.from({ length: 10 }, (_, i) => ({
            level: 2,
            text: `Heading ${i}`,
          })),
        },
      };
      const result = generatePageSummary(manyHeadings);
      expect(result).toContain('Heading 0');
      expect(result).toContain('Heading 4');
      expect(result).not.toContain('Heading 5');
    });

    it('should include interactive element counts', () => {
      const result = generatePageSummary(mockAnalysis);
      expect(result).toContain('2 buttons');
      expect(result).toContain('1 links');
      expect(result).toContain('3 input fields');
      expect(result).toContain('0 dropdowns');
      expect(result).toContain('1 text areas');
    });

    it('should include forms count', () => {
      const result = generatePageSummary(mockAnalysis);
      expect(result).toContain('Forms: 1');
    });

    it('should handle page with no headings', () => {
      const noHeadings: DOMAnalysis = {
        ...mockAnalysis,
        pageStructure: {
          ...mockAnalysis.pageStructure,
          headings: [],
        },
      };
      const result = generatePageSummary(noHeadings);
      expect(result).not.toContain('Headings:');
    });
  });

  describe('filterRelevantElements', () => {
    const mockElements: SemanticElement[] = [
      {
        id: '1',
        role: 'button',
        label: 'Submit',
        tag: 'button',
        isInteractive: true,
        isVisible: true,
        context: '',
        xpath: '',
        selectors: [],
      },
      {
        id: '2',
        role: 'textbox',
        label: 'Username',
        tag: 'input',
        isInteractive: true,
        isVisible: true,
        context: '',
        xpath: '',
        selectors: [],
      },
      {
        id: '3',
        role: 'generic',
        label: 'Container',
        tag: 'div',
        isInteractive: false,
        isVisible: true,
        context: '',
        xpath: '',
        selectors: [],
      },
      {
        id: '4',
        role: 'button',
        label: 'Hidden Button',
        tag: 'button',
        isInteractive: true,
        isVisible: false,
        context: '',
        xpath: '',
        selectors: [],
      },
    ];

    it('should filter out hidden elements by default', () => {
      const result = filterRelevantElements(mockElements);
      expect(result).toHaveLength(3);
      expect(result.find((el) => el.id === '4')).toBeUndefined();
    });

    it('should include hidden elements when includeHidden is true', () => {
      const result = filterRelevantElements(mockElements, { includeHidden: true });
      expect(result).toHaveLength(4);
    });

    it('should filter by role', () => {
      const result = filterRelevantElements(mockElements, { roleFilter: ['button'] });
      expect(result).toHaveLength(1);
      expect(result[0].role).toBe('button');
    });

    it('should limit results to maxElements', () => {
      const result = filterRelevantElements(mockElements, { maxElements: 2 });
      expect(result).toHaveLength(2);
    });

    it('should sort by role priority (button > textbox > generic)', () => {
      const result = filterRelevantElements(mockElements);
      expect(result[0].role).toBe('button');
      expect(result[1].role).toBe('textbox');
      expect(result[2].role).toBe('generic');
    });

    it('should prioritize interactive elements within same role priority', () => {
      const elements: SemanticElement[] = [
        {
          id: '1',
          role: 'generic',
          label: 'Non-interactive',
          tag: 'div',
          isInteractive: false,
          isVisible: true,
          context: '',
          xpath: '',
          selectors: [],
        },
        {
          id: '2',
          role: 'generic',
          label: 'Interactive',
          tag: 'div',
          isInteractive: true,
          isVisible: true,
          context: '',
          xpath: '',
          selectors: [],
        },
      ];
      const result = filterRelevantElements(elements);
      expect(result[0].id).toBe('2');
    });

    it('should prioritize shorter labels within same priority and interactivity', () => {
      const elements: SemanticElement[] = [
        {
          id: '1',
          role: 'button',
          label: 'Very long button label',
          tag: 'button',
          isInteractive: true,
          isVisible: true,
          context: '',
          xpath: '',
          selectors: [],
        },
        {
          id: '2',
          role: 'button',
          label: 'Short',
          tag: 'button',
          isInteractive: true,
          isVisible: true,
          context: '',
          xpath: '',
          selectors: [],
        },
      ];
      const result = filterRelevantElements(elements);
      expect(result[0].id).toBe('2');
    });
  });

  describe('searchElements', () => {
    const mockElements: SemanticElement[] = [
      {
        id: '1',
        role: 'button',
        label: 'Submit Form',
        tag: 'button',
        isInteractive: true,
        isVisible: true,
        context: 'Login form',
        xpath: '',
        selectors: [],
      },
      {
        id: '2',
        role: 'textbox',
        label: 'Username',
        placeholder: 'Enter your username',
        tag: 'input',
        isInteractive: true,
        isVisible: true,
        context: '',
        xpath: '',
        selectors: [],
      },
      {
        id: '3',
        role: 'textbox',
        label: 'Password',
        tag: 'input',
        value: 'secret',
        isInteractive: true,
        isVisible: true,
        context: '',
        xpath: '',
        selectors: [],
      },
    ];

    it('should find elements by label (case insensitive)', () => {
      const result = searchElements(mockElements, 'submit');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should find elements by placeholder', () => {
      const result = searchElements(mockElements, 'username');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('2');
    });

    it('should find elements by value', () => {
      const result = searchElements(mockElements, 'secret');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('3');
    });

    it('should find elements by context', () => {
      const result = searchElements(mockElements, 'login');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should support fuzzy matching by default', () => {
      const result = searchElements(mockElements, 'form');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should support exact matching when fuzzy is false', () => {
      const result = searchElements(mockElements, 'Submit Form', { fuzzy: false });
      expect(result).toHaveLength(1);
    });

    it('should be case insensitive by default', () => {
      const result = searchElements(mockElements, 'SUBMIT');
      expect(result).toHaveLength(1);
    });

    it('should support case sensitive search', () => {
      const result = searchElements(mockElements, 'SUBMIT', { caseSensitive: true });
      expect(result).toHaveLength(0);
    });

    it('should match multiple words in fuzzy mode', () => {
      const result = searchElements(mockElements, 'submit login');
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should return empty array when no matches', () => {
      const result = searchElements(mockElements, 'nonexistent');
      expect(result).toHaveLength(0);
    });
  });
});
