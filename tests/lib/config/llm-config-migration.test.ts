jest.mock('nanoid', () => ({ nanoid: () => 'test-nanoid' }));

import { convertV2ToV1 } from '@/lib/domains/config/llm-config-migration';
import { LLMConfigV2 } from '@/types';

describe('convertV2ToV1 - customHeaders inheritance', () => {
  it('모델에서 상속 헤더를 제거하면 변환 시 해당 헤더가 제외된다', () => {
    const configV2: LLMConfigV2 = {
      version: 2,
      connections: [
        {
          id: 'conn-1',
          name: 'Main',
          provider: 'openai',
          baseURL: 'https://example.com',
          apiKey: 'sk-12345678901234567890',
          customHeaders: {
            'X-From-Connection': 'keep',
            'X-Remove-Me': 'remove',
          },
          enabled: true,
        },
      ],
      models: [
        {
          id: 'model-1',
          connectionId: 'conn-1',
          modelId: 'gpt-4o',
          tags: ['base'],
          customHeaders: {
            'X-Remove-Me': null,
            'X-Model-Only': 'model',
          },
        },
      ],
      defaultTemperature: 0.7,
      defaultMaxTokens: 2000,
      activeBaseModelId: 'model-1',
    };

    const configV1 = convertV2ToV1(configV2);

    expect(configV1.customHeaders).toEqual({
      'X-From-Connection': 'keep',
      'X-Model-Only': 'model',
    });
  });
});
