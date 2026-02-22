jest.mock('@sepilot/extension-terminal/agents/terminal-agent-graph', () => ({}), { virtual: true });

import { GraphFactory } from '@/lib/domains/agent/factory/graph-factory';
import type { StreamEvent } from '@/lib/domains/agent/types';
import type { Message } from '@/types';

type ProcessGraphStream = (stream: AsyncIterableIterator<unknown>) => AsyncGenerator<StreamEvent>;

function getProcessGraphStream(): ProcessGraphStream {
  const factory = GraphFactory as unknown as { processGraphStream: ProcessGraphStream };
  return factory.processGraphStream.bind(GraphFactory);
}

async function collectEvents(stream: AsyncGenerator<StreamEvent>): Promise<StreamEvent[]> {
  const events: StreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

describe('GraphFactory.processGraphStream', () => {
  const assistantMessage: Message = {
    id: 'msg-1',
    role: 'assistant',
    content: 'hello',
    created_at: 1,
  };

  it('normalizes BaseGraph message/complete events to StreamEvent contract', async () => {
    async function* source(): AsyncGenerator<unknown> {
      yield { type: 'message', message: assistantMessage };
      yield { type: 'complete', state: { ok: true } };
    }

    const processGraphStream = getProcessGraphStream();
    const events = await collectEvents(processGraphStream(source()));

    expect(events).toEqual([
      {
        type: 'node',
        node: 'generate',
        data: {
          messages: [assistantMessage],
        },
      },
      { type: 'completion' },
      { type: 'end' },
    ]);
  });

  it('passes through already-normalized node events', async () => {
    const nodeEvent: StreamEvent = {
      type: 'node',
      node: 'tools',
      data: { toolResults: [{ toolName: 'file_read' }] },
    };

    async function* source(): AsyncGenerator<unknown> {
      yield nodeEvent;
    }

    const processGraphStream = getProcessGraphStream();
    const events = await collectEvents(processGraphStream(source()));

    expect(events).toEqual([nodeEvent, { type: 'end' }]);
  });

  it('converts legacy node-map output into node events', async () => {
    async function* source(): AsyncGenerator<unknown> {
      yield {
        plan: {
          queries: ['langgraph'],
          iteration: 1,
        },
      };
    }

    const processGraphStream = getProcessGraphStream();
    const events = await collectEvents(processGraphStream(source()));

    expect(events).toEqual([
      {
        type: 'node',
        node: 'plan',
        data: {
          queries: ['langgraph'],
          iteration: 1,
        },
      },
      { type: 'end' },
    ]);
  });

  it('emits error event once when source yields error and then throws', async () => {
    async function* source(): AsyncGenerator<unknown> {
      yield { type: 'error', error: 'boom' };
      throw new Error('boom');
    }

    const processGraphStream = getProcessGraphStream();
    const events = await collectEvents(processGraphStream(source()));
    const errorEvents = events.filter((event) => event.type === 'error');

    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0]?.error).toBe('boom');
  });
});
