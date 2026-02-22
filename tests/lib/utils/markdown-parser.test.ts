import {
  buildHeadingHierarchy,
  extractMarkdownTitle,
  parseMarkdown,
  type MarkdownHeading,
} from '@/lib/utils/markdown-parser';

describe('markdown-parser', () => {
  describe('parseMarkdown', () => {
    it('should parse headings, links, and tags with line numbers', () => {
      const markdown = [
        '# Main Title',
        'Text with #todo and [[Wiki Page|Display]].',
        'See [Guide](docs/guide.md), [site](https://example.com), and [asset](../file.txt).',
        '## Section A',
        'Another [[Second Page]] link and #feature tag.',
      ].join('\n');

      const parsed = parseMarkdown(markdown);

      expect(parsed.headings).toEqual([
        { level: 1, text: 'Main Title', line: 1 },
        { level: 2, text: 'Section A', line: 4 },
      ]);

      expect(parsed.links).toEqual([
        { type: 'wiki', target: 'Wiki Page', text: 'Display', line: 2 },
        { type: 'markdown', target: 'docs/guide.md', text: 'Guide', line: 3 },
        { type: 'markdown', target: '../file.txt', text: 'asset', line: 3 },
        { type: 'wiki', target: 'Second Page', text: undefined, line: 5 },
      ]);

      expect(parsed.tags).toEqual([
        { tag: 'todo', line: 2 },
        { tag: 'feature', line: 5 },
      ]);
    });

    it('should not extract tags from heading lines', () => {
      const markdown = '# heading-with-tag #ignored\nregular #kept';

      const parsed = parseMarkdown(markdown);

      expect(parsed.tags).toEqual([{ tag: 'kept', line: 2 }]);
    });

    it('should parse multiple links in a single line', () => {
      const markdown = '[[A]] [[B|Bee]] [C](c.md) [D](d.md)';

      const parsed = parseMarkdown(markdown);

      expect(parsed.links).toEqual([
        { type: 'wiki', target: 'A', text: undefined, line: 1 },
        { type: 'wiki', target: 'B', text: 'Bee', line: 1 },
        { type: 'markdown', target: 'c.md', text: 'C', line: 1 },
        { type: 'markdown', target: 'd.md', text: 'D', line: 1 },
      ]);
    });
  });

  describe('extractMarkdownTitle', () => {
    it('should return first H1 title if present', () => {
      const content = 'intro\n# Chosen Title\n## Subtitle';
      expect(extractMarkdownTitle(content, 'fallback.md')).toBe('Chosen Title');
    });

    it('should fallback to filename without .md extension', () => {
      const content = '## No H1 here';
      expect(extractMarkdownTitle(content, 'notes.md')).toBe('notes');
    });

    it('should keep filename unchanged when extension is not .md', () => {
      const content = 'plain text only';
      expect(extractMarkdownTitle(content, 'README')).toBe('README');
    });
  });

  describe('buildHeadingHierarchy', () => {
    it('should build nested hierarchy from flat headings', () => {
      const headings: MarkdownHeading[] = [
        { level: 1, text: 'H1', line: 1 },
        { level: 2, text: 'H2-A', line: 2 },
        { level: 3, text: 'H3-A', line: 3 },
        { level: 2, text: 'H2-B', line: 4 },
        { level: 1, text: 'H1-B', line: 5 },
      ];

      const tree = buildHeadingHierarchy(headings);

      expect(tree).toHaveLength(2);
      expect(tree[0].heading.text).toBe('H1');
      expect(tree[0].children.map((n) => n.heading.text)).toEqual(['H2-A', 'H2-B']);
      expect(tree[0].children[0].children.map((n) => n.heading.text)).toEqual(['H3-A']);
      expect(tree[1].heading.text).toBe('H1-B');
    });

    it('should return empty hierarchy for empty input', () => {
      expect(buildHeadingHierarchy([])).toEqual([]);
    });
  });
});
