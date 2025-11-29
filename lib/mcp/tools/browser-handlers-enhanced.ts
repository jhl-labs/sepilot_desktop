/**
 * Enhanced Browser Tool Handlers
 *
 * Accessibility Tree 기반 의미론적 DOM 분석을 사용한 개선된 브라우저 도구
 */

import { getActiveBrowserView } from '../../../electron/ipc/handlers/browser-control';
import type { SemanticElement, DOMAnalysis } from '../../langgraph/utils/dom-analyzer';
import { filterRelevantElements, searchElements, generatePageSummary } from '../../langgraph/utils/dom-analyzer';

/**
 * 브라우저에서 접근성 트리 기반 DOM 분석 실행
 */
export async function analyzePage(browserView: any): Promise<DOMAnalysis> {
  const result = await browserView.webContents.executeJavaScript(`
    (function() {
      // Utility: Get computed styles for visibility check
      function isElementVisible(element) {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        return style.display !== 'none' &&
               style.visibility !== 'hidden' &&
               style.opacity !== '0' &&
               element.offsetWidth > 0 &&
               element.offsetHeight > 0;
      }

      // Utility: Get accessible label for an element
      function getAccessibleLabel(element) {
        // 1. aria-label
        if (element.getAttribute('aria-label')) {
          return element.getAttribute('aria-label');
        }

        // 2. aria-labelledby
        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy) {
          const labelElement = document.getElementById(labelledBy);
          if (labelElement) {
            return labelElement.textContent.trim();
          }
        }

        // 3. Associated label element
        if (element.id) {
          const label = document.querySelector(\`label[for="\${element.id}"]\`);
          if (label) {
            return label.textContent.trim();
          }
        }

        // 4. Parent label
        const parentLabel = element.closest('label');
        if (parentLabel) {
          return parentLabel.textContent.trim();
        }

        // 5. placeholder
        if (element.placeholder) {
          return element.placeholder;
        }

        // 6. title
        if (element.title) {
          return element.title;
        }

        // 7. alt (for images)
        if (element.alt) {
          return element.alt;
        }

        // 8. value (for submit buttons)
        if (element.tagName === 'INPUT' &&
            (element.type === 'submit' || element.type === 'button') &&
            element.value) {
          return element.value;
        }

        // 9. text content
        const text = element.textContent?.trim();
        if (text && text.length < 100) {
          return text;
        }

        // 10. name attribute
        if (element.name) {
          return element.name;
        }

        return '';
      }

      // Utility: Get role for element
      function getRole(element) {
        // Explicit role
        if (element.getAttribute('role')) {
          return element.getAttribute('role');
        }

        // Implicit roles
        const tag = element.tagName.toLowerCase();
        switch (tag) {
          case 'button': return 'button';
          case 'a': return element.href ? 'link' : 'generic';
          case 'input':
            const type = element.type?.toLowerCase() || 'text';
            if (type === 'button' || type === 'submit' || type === 'reset') return 'button';
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            if (type === 'search') return 'searchbox';
            return 'textbox';
          case 'textarea': return 'textbox';
          case 'select': return 'combobox';
          case 'h1': case 'h2': case 'h3': case 'h4': case 'h5': case 'h6': return 'heading';
          case 'nav': return 'navigation';
          case 'main': return 'main';
          case 'article': return 'article';
          case 'section': return 'section';
          case 'aside': return 'complementary';
          case 'form': return 'form';
          default: return 'generic';
        }
      }

      // Utility: Check if element is interactive
      function isInteractive(element) {
        const tag = element.tagName.toLowerCase();
        const interactiveTags = ['button', 'a', 'input', 'textarea', 'select'];

        if (interactiveTags.includes(tag)) return true;

        const role = getRole(element);
        const interactiveRoles = [
          'button', 'link', 'textbox', 'searchbox', 'combobox',
          'checkbox', 'radio', 'switch', 'slider', 'menuitem', 'tab'
        ];

        if (interactiveRoles.includes(role)) return true;

        // Has click handler
        if (element.onclick || element.getAttribute('data-action')) return true;

        // Is clickable (cursor: pointer)
        const style = window.getComputedStyle(element);
        if (style.cursor === 'pointer') return true;

        return false;
      }

      // Utility: Get XPath for element
      function getXPath(element) {
        if (element.id) {
          return \`//*[@id="\${element.id}"]\`;
        }

        const parts = [];
        while (element && element.nodeType === Node.ELEMENT_NODE) {
          let index = 0;
          let sibling = element.previousSibling;
          while (sibling) {
            if (sibling.nodeType === Node.ELEMENT_NODE &&
                sibling.nodeName === element.nodeName) {
              index++;
            }
            sibling = sibling.previousSibling;
          }

          const tagName = element.nodeName.toLowerCase();
          const pathIndex = index > 0 ? \`[\${index + 1}]\` : '';
          parts.unshift(\`\${tagName}\${pathIndex}\`);

          element = element.parentNode;
        }

        return parts.length ? '/' + parts.join('/') : '';
      }

      // Utility: Get CSS selectors
      function getSelectors(element) {
        const selectors = [];

        // ID selector (most specific)
        if (element.id) {
          selectors.push(\`#\${element.id}\`);
        }

        // Class selectors
        if (element.className) {
          const classes = Array.from(element.classList).join('.');
          if (classes) {
            selectors.push(\`\${element.tagName.toLowerCase()}.\${classes}\`);
          }
        }

        // Name selector
        if (element.name) {
          selectors.push(\`\${element.tagName.toLowerCase()}[name="\${element.name}"]\`);
        }

        // Type selector (for inputs)
        if (element.type) {
          selectors.push(\`\${element.tagName.toLowerCase()}[type="\${element.type}"]\`);
        }

        return selectors;
      }

      // Get context information
      function getContext(element) {
        const parts = [];

        // Parent context
        const parent = element.parentElement;
        if (parent) {
          const parentRole = getRole(parent);
          const parentLabel = getAccessibleLabel(parent);
          if (parentRole !== 'generic' || parentLabel) {
            parts.push(\`Parent: \${parentRole} "\${parentLabel.substring(0, 30)}"\`);
          }
        }

        // Sibling context (max 3)
        const siblings = Array.from(element.parentElement?.children || [])
          .filter(el => el !== element && isElementVisible(el))
          .slice(0, 3)
          .map(el => getAccessibleLabel(el).substring(0, 20))
          .filter(text => text);

        if (siblings.length > 0) {
          parts.push(\`Siblings: \${siblings.join(', ')}\`);
        }

        return parts.join(' | ');
      }

      // Main analysis
      const elements = [];
      const allElements = document.querySelectorAll('*');
      let elementIndex = 0;

      for (const element of allElements) {
        // Skip non-visible elements for now (we'll filter later)
        if (!isElementVisible(element)) continue;

        const role = getRole(element);
        const label = getAccessibleLabel(element);
        const interactive = isInteractive(element);

        // Skip generic elements without labels unless they're interactive
        if (role === 'generic' && !label && !interactive) continue;

        const elementId = \`ai-element-\${elementIndex++}\`;

        // Store element reference for later use
        element.setAttribute('data-ai-id', elementId);

        const rect = element.getBoundingClientRect();

        elements.push({
          id: elementId,
          role: role,
          label: label || '',
          value: element.value || undefined,
          placeholder: element.placeholder || undefined,
          tag: element.tagName.toLowerCase(),
          type: element.type || undefined,
          href: element.href || undefined,
          isInteractive: interactive,
          isVisible: isElementVisible(element),
          context: getContext(element),
          xpath: getXPath(element),
          selectors: getSelectors(element),
          boundingBox: {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          },
        });
      }

      // Page structure analysis
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .map(h => ({
          level: parseInt(h.tagName.charAt(1)),
          text: h.textContent.trim().substring(0, 100),
        }));

      const forms = Array.from(document.querySelectorAll('form'))
        .map(form => ({
          id: form.id || undefined,
          action: form.action || undefined,
          method: form.method || undefined,
        }));

      const sections = Array.from(document.querySelectorAll('nav, main, article, section, aside'))
        .map(section => ({
          name: section.tagName.toLowerCase(),
          role: getRole(section),
        }));

      return {
        elements,
        pageStructure: {
          title: document.title,
          url: window.location.href,
          headings,
          forms,
          sections,
        },
      };
    })();
  `);

  // Categorize interactive elements
  const interactiveElements = {
    buttons: result.elements.filter((el: SemanticElement) => el.role === 'button'),
    links: result.elements.filter((el: SemanticElement) => el.role === 'link'),
    inputs: result.elements.filter((el: SemanticElement) =>
      el.role === 'textbox' || el.role === 'searchbox'
    ),
    selects: result.elements.filter((el: SemanticElement) => el.role === 'combobox'),
    textareas: result.elements.filter((el: SemanticElement) =>
      el.tag === 'textarea'
    ),
  };

  const analysis: DOMAnalysis = {
    elements: result.elements,
    pageStructure: result.pageStructure,
    interactiveElements,
    summary: '',
  };

  // Generate summary
  analysis.summary = generatePageSummary(analysis);

  return analysis;
}

/**
 * Enhanced: Get interactive elements with semantic analysis
 */
export async function handleBrowserGetInteractiveElementsEnhanced(): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  console.warn('[BrowserTools] Analyzing page with accessibility tree...');

  const analysis = await analyzePage(browserView);

  // Filter to most relevant interactive elements
  const relevantElements = filterRelevantElements(analysis.elements, {
    maxElements: 50,
    includeHidden: false,
  });

  // Format for LLM
  const output = {
    summary: analysis.summary,
    interactive_elements: relevantElements.map(el => ({
      id: el.id,
      role: el.role,
      label: el.label,
      placeholder: el.placeholder,
      context: el.context,
      tag: el.tag,
      type: el.type,
      href: el.href,
    })),
    categories: {
      buttons: analysis.interactiveElements.buttons.length,
      links: analysis.interactiveElements.links.length,
      inputs: analysis.interactiveElements.inputs.length,
      selects: analysis.interactiveElements.selects.length,
      textareas: analysis.interactiveElements.textareas.length,
    },
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Enhanced: Search for elements by natural language query
 */
export async function handleBrowserSearchElements(query: string): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  console.log(`[BrowserTools] Searching for elements matching: "${query}"`);

  const analysis = await analyzePage(browserView);
  const results = searchElements(analysis.elements, query, { fuzzy: true });

  // Take top 10 results
  const topResults = results.slice(0, 10);

  return JSON.stringify({
    query,
    results_count: results.length,
    top_matches: topResults.map(el => ({
      id: el.id,
      role: el.role,
      label: el.label,
      context: el.context,
      relevance: 'high', // Could implement scoring in the future
    })),
  }, null, 2);
}

/**
 * Enhanced: Get page content with semantic structure
 */
export async function handleBrowserGetPageContentEnhanced(): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  console.warn('[BrowserTools] Getting page content with semantic structure...');

  const analysis = await analyzePage(browserView);

  // Get main text content (from article, main, or body)
  const mainContent = await browserView.webContents.executeJavaScript(`
    (function() {
      // Try to find main content area
      const mainArea = document.querySelector('main, article, [role="main"]') || document.body;
      return mainArea.innerText.substring(0, 5000); // Limit to 5000 chars
    })();
  `);

  const output = {
    url: analysis.pageStructure.url,
    title: analysis.pageStructure.title,
    summary: analysis.summary,
    headings: analysis.pageStructure.headings.slice(0, 10),
    main_content_preview: mainContent.substring(0, 1000),
    structure: {
      forms: analysis.pageStructure.forms.length,
      interactive_elements: analysis.elements.filter(el => el.isInteractive).length,
      sections: analysis.pageStructure.sections,
    },
  };

  return JSON.stringify(output, null, 2);
}

/**
 * Click element with better error handling and verification
 */
export async function handleBrowserClickElementEnhanced(elementId: string): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab.');
  }

  console.log(`[BrowserTools] Clicking element: ${elementId}`);

  const result = await browserView.webContents.executeJavaScript(`
    (function() {
      const element = document.querySelector('[data-ai-id="${elementId}"]');
      if (!element) {
        return { success: false, error: 'Element not found. It may have been removed or the page may have changed.' };
      }

      // Check if element is still visible
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') {
        return { success: false, error: 'Element is not visible.' };
      }

      // Check if element is disabled
      if (element.disabled) {
        return { success: false, error: 'Element is disabled.' };
      }

      try {
        // Scroll into view if needed
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Wait a bit for scroll
        setTimeout(() => {
          element.click();
        }, 100);

        return {
          success: true,
          element: {
            tag: element.tagName.toLowerCase(),
            label: element.textContent?.trim().substring(0, 50) || element.value || 'unlabeled',
            href: element.href,
          },
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    })();
  `);

  if (!result.success) {
    throw new Error(result.error);
  }

  return `Clicked ${result.element.tag}: "${result.element.label}"${result.element.href ? ` (navigating to: ${result.element.href})` : ''}`;
}

/**
 * Type text with better verification
 */
export async function handleBrowserTypeTextEnhanced(
  elementId: string,
  text: string
): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab.');
  }

  console.log(`[BrowserTools] Typing into element: ${elementId}`);

  const result = await browserView.webContents.executeJavaScript(`
    (function() {
      const element = document.querySelector('[data-ai-id="${elementId}"]');
      if (!element) {
        return { success: false, error: 'Element not found.' };
      }

      // Check if element is an input
      const tag = element.tagName.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea') {
        return { success: false, error: 'Element is not an input field.' };
      }

      // Check if element is disabled
      if (element.disabled) {
        return { success: false, error: 'Input field is disabled.' };
      }

      // Check if element is readonly
      if (element.readOnly) {
        return { success: false, error: 'Input field is read-only.' };
      }

      try {
        // Focus the element
        element.focus();

        // Clear existing value
        element.value = '';

        // Type the text
        element.value = ${JSON.stringify(text)};

        // Trigger input and change events
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));

        return {
          success: true,
          element: {
            tag: tag,
            label: element.placeholder || element.name || 'unlabeled',
            value: element.value.substring(0, 50),
          },
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    })();
  `);

  if (!result.success) {
    throw new Error(result.error);
  }

  return `Typed into ${result.element.tag} "${result.element.label}": "${result.element.value}"${text.length > 50 ? '...' : ''}`;
}
