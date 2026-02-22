import type { Message } from '@/types';
import type { SkillContextInjectionResult } from '@/types/skill';

const mockInjectSkills = jest.fn<
  Promise<SkillContextInjectionResult>,
  [string, string, string[] | undefined]
>();
const mockGetMessagesFromResult = jest.fn<Message[], [SkillContextInjectionResult]>();
const mockEmitStreamingChunk = jest.fn<void, [string, string | undefined]>();

jest.mock('@/lib/domains/agent/skills-injector', () => ({
  skillsInjector: {
    injectSkills: (...args: [string, string, string[] | undefined]) => mockInjectSkills(...args),
    getMessagesFromResult: (result: SkillContextInjectionResult) =>
      mockGetMessagesFromResult(result),
  },
}));

jest.mock('@/lib/domains/llm/streaming-callback', () => ({
  emitStreamingChunk: (...args: [string, string | undefined]) => mockEmitStreamingChunk(...args),
}));

import { BaseGraph, type BaseState } from '@/lib/domains/agent/base/base-graph';

class DummyGraph extends BaseGraph<BaseState> {
  protected createStateAnnotation(): any {
    return {};
  }

  protected buildNodes(workflow: any): any {
    return workflow;
  }

  protected buildEdges(workflow: any): any {
    return workflow;
  }
}

function createUserMessage(content: string): Message {
  return {
    id: `user-${Date.now()}`,
    role: 'user',
    content,
    created_at: Date.now(),
  };
}

function createSkillSystemMessage(idSuffix: string): Message {
  return {
    id: `system-skill-${idSuffix}`,
    role: 'system',
    content: 'Injected skill prompt',
    created_at: Date.now(),
  };
}

describe('BaseGraph skill injection guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('skips injection when skill system message already exists', async () => {
    const graph = new DummyGraph();
    const initialState: BaseState = {
      conversationId: 'conv-1',
      messages: [createUserMessage('help me'), createSkillSystemMessage('existing')],
    };

    const prepareStateWithSkills = (graph as any).prepareStateWithSkills.bind(graph);
    const result = await prepareStateWithSkills(initialState);

    expect(result).toBe(initialState);
    expect(mockInjectSkills).not.toHaveBeenCalled();
    expect(mockEmitStreamingChunk).not.toHaveBeenCalled();
  });

  it('injects skills only once when there is a user query', async () => {
    const graph = new DummyGraph();
    const injectedMessage = createSkillSystemMessage('new');

    mockInjectSkills.mockResolvedValue({
      injectedSkills: ['skill.new'],
      systemPrompts: ['prompt'],
      totalTokens: 123,
      skippedSkills: [],
    });
    mockGetMessagesFromResult.mockReturnValue([injectedMessage]);

    const initialState: BaseState = {
      conversationId: 'conv-2',
      messages: [createUserMessage('please refactor this function')],
    };

    const prepareStateWithSkills = (graph as any).prepareStateWithSkills.bind(graph);
    const result = await prepareStateWithSkills(initialState);

    expect(mockInjectSkills).toHaveBeenCalledWith('please refactor this function', 'conv-2');
    expect(result.messages).toEqual([...initialState.messages, injectedMessage]);
    // emitStreamingChunk is no longer called during skill injection
    // (activation message is now emitted by graph-factory.ts instead)
    expect(mockEmitStreamingChunk).not.toHaveBeenCalled();
  });

  it('continues without skills when injector throws', async () => {
    const graph = new DummyGraph();

    mockInjectSkills.mockRejectedValue(new Error('inject failed'));

    const initialState: BaseState = {
      conversationId: 'conv-3',
      messages: [createUserMessage('write tests')],
    };

    const prepareStateWithSkills = (graph as any).prepareStateWithSkills.bind(graph);
    const result = await prepareStateWithSkills(initialState);

    expect(result).toBe(initialState);
    expect(mockEmitStreamingChunk).not.toHaveBeenCalled();
  });
});
