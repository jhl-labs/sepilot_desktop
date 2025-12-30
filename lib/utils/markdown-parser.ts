/**
 * Markdown Parser Utilities
 *
 * Parses markdown content to extract:
 * - Headings (# ## ###)
 * - Wiki-style links ([[link]])
 * - Markdown links ([text](link.md))
 * - Tags (#tag)
 */

export interface MarkdownHeading {
  level: number; // 1-6
  text: string;
  line: number;
}

export interface MarkdownLink {
  type: 'wiki' | 'markdown';
  target: string; // file path or link
  text?: string; // display text for markdown links
  line: number;
}

export interface MarkdownTag {
  tag: string;
  line: number;
}

export interface ParsedMarkdown {
  headings: MarkdownHeading[];
  links: MarkdownLink[];
  tags: MarkdownTag[];
}

/**
 * Parse markdown content to extract headings, links, and tags
 */
export function parseMarkdown(content: string): ParsedMarkdown {
  const lines = content.split('\n');
  const headings: MarkdownHeading[] = [];
  const links: MarkdownLink[] = [];
  const tags: MarkdownTag[] = [];

  lines.forEach((line, index) => {
    // Extract headings (# ## ### ...)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      headings.push({
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
        line: index + 1,
      });
    }

    // Extract wiki-style links [[link]] or [[link|text]]
    const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let wikiMatch;
    while ((wikiMatch = wikiLinkRegex.exec(line)) !== null) {
      links.push({
        type: 'wiki',
        target: wikiMatch[1].trim(),
        text: wikiMatch[2]?.trim(),
        line: index + 1,
      });
    }

    // Extract markdown links [text](link)
    const mdLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    let mdMatch;
    while ((mdMatch = mdLinkRegex.exec(line)) !== null) {
      // Only include .md files or relative paths (exclude http/https)
      const target = mdMatch[2].trim();
      if (!target.startsWith('http://') && !target.startsWith('https://')) {
        links.push({
          type: 'markdown',
          target,
          text: mdMatch[1].trim(),
          line: index + 1,
        });
      }
    }

    // Extract tags #tag (not in code blocks or comments)
    const tagRegex = /#([a-zA-Z0-9_-]+)/g;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(line)) !== null) {
      // Avoid extracting from headings
      if (!line.trim().startsWith('#')) {
        tags.push({
          tag: tagMatch[1],
          line: index + 1,
        });
      }
    }
  });

  return { headings, links, tags };
}

/**
 * Extract title from markdown content (first H1 or filename)
 */
export function extractMarkdownTitle(content: string, filename: string): string {
  const lines = content.split('\n');

  for (const line of lines) {
    const h1Match = line.match(/^#\s+(.+)$/);
    if (h1Match) {
      return h1Match[1].trim();
    }
  }

  // Fallback to filename without extension
  return filename.replace(/\.md$/, '');
}

/**
 * Build a hierarchy of headings
 */
export interface HeadingNode {
  heading: MarkdownHeading;
  children: HeadingNode[];
}

export function buildHeadingHierarchy(headings: MarkdownHeading[]): HeadingNode[] {
  const root: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  headings.forEach((heading) => {
    const node: HeadingNode = { heading, children: [] };

    // Find parent based on level
    while (stack.length > 0 && stack[stack.length - 1].heading.level >= heading.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  });

  return root;
}
