import { parseInteractiveContent } from '@/lib/utils/interactive-parser';

describe('interactive-parser', () => {
  it('should return original markdown as a text segment when no interactive blocks exist', () => {
    const markdown = 'plain markdown\nwithout interactive blocks';

    const parsed = parseInteractiveContent(markdown);

    expect(parsed.segments).toEqual([
      {
        type: 'text',
        content: markdown,
      },
    ]);
  });

  it('should parse interactive-select block with text before and after', () => {
    const markdown = `before text
:::interactive-select
title: Choose action
options:
- Create file
- Edit file
:::
after text`;

    const parsed = parseInteractiveContent(markdown);

    expect(parsed.segments).toHaveLength(3);
    expect(parsed.segments[0]).toMatchObject({ type: 'text', content: 'before text\n' });
    expect(parsed.segments[1]).toEqual({
      type: 'interactive',
      content: {
        type: 'interactive-select',
        title: 'Choose action',
        options: ['Create file', 'Edit file'],
      },
    });
    expect(parsed.segments[2]).toMatchObject({ type: 'text', content: '\nafter text' });
  });

  it('should parse interactive-input and convert multiline variants', () => {
    const markdown = `:::interactive-input
title: Enter content
placeholder: your text
multiline: yes
:::`;

    const parsed = parseInteractiveContent(markdown);

    expect(parsed.segments).toEqual([
      {
        type: 'interactive',
        content: {
          type: 'interactive-input',
          title: 'Enter content',
          placeholder: 'your text',
          multiline: true,
        },
      },
    ]);
  });

  it('should parse tool-result block and coerce status/duration', () => {
    const markdown = `:::tool-result
toolName: shell
status: unknown
summary: done
details: command complete
duration: not-a-number
:::`;

    const parsed = parseInteractiveContent(markdown);

    expect(parsed.segments).toEqual([
      {
        type: 'interactive',
        content: {
          type: 'tool-result',
          toolName: 'shell',
          status: 'success',
          summary: 'done',
          details: 'command complete',
          duration: undefined,
        },
      },
    ]);
  });

  it('should parse tool-approval with multiple tool calls and fallbacks for invalid JSON/missing id', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1234567890);

    const markdown = `:::tool-approval
messageId: msg-1
toolCall: first|read_file
arguments:
{"path":"/tmp/a"}
toolCall: |run_command
arguments:
{invalid-json}
:::`;

    const parsed = parseInteractiveContent(markdown);

    expect(parsed.segments).toEqual([
      {
        type: 'interactive',
        content: {
          type: 'tool-approval',
          messageId: 'msg-1',
          toolCalls: [
            {
              id: 'first',
              name: 'read_file',
              arguments: { path: '/tmp/a' },
            },
            {
              id: 'tool-1234567890',
              name: 'run_command',
              arguments: {},
            },
          ],
        },
      },
    ]);

    nowSpy.mockRestore();
  });
});
