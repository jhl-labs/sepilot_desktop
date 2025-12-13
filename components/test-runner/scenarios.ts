export interface TestStep {
  id: string;
  type: 'action' | 'input' | 'wait' | 'assertion';
  description: string;
  // Action related
  action?: 'click' | 'type' | 'submit' | 'scroll';
  selector?: string;
  value?: string;
  // Input related
  inputValue?: string; // For mock chat input
  // Assertion related
  expected?: string | RegExp;
  assertionType?: 'contains' | 'equals' | 'visible' | 'exists';
  // Wait related
  timeout?: number;
}

export interface TestScenario {
  id: string;
  title: string;
  description: string;
  category: 'core' | 'llm' | 'multimodal' | 'ui';
  steps: TestStep[];
}

export const TEST_SCENARIOS: TestScenario[] = [
  {
    id: 'basic-chat',
    title: 'Basic Chat Interaction',
    description: 'Verifies that a simple message can be sent and an response is received.',
    category: 'llm',
    steps: [
      {
        id: 's1',
        type: 'input',
        description: 'Type "Hello" into chat input',
        inputValue: 'Hello, are you working?',
      },
      {
        id: 's2',
        type: 'action',
        description: 'Click send button',
        action: 'submit',
      },
      {
        id: 's3',
        type: 'wait',
        description: 'Wait for response',
        timeout: 10000,
      },
      {
        id: 's4',
        type: 'assertion',
        description: 'Check if response contains greeting',
        assertionType: 'exists', // Just check if any response bubble exists from AI
      },
    ],
  },
  {
    id: 'image-generation',
    title: 'Image Generation Test',
    description: 'Requests an image generation and checks if an image is rendered.',
    category: 'multimodal',
    steps: [
      {
        id: 's1',
        type: 'input',
        description: 'Request image generation',
        inputValue: 'Generate an image of a cute robot cat.',
      },
      {
        id: 's2',
        type: 'action',
        description: 'Send request',
        action: 'submit',
      },
      {
        id: 's3',
        type: 'wait',
        description: 'Wait for image generation',
        timeout: 30000, // Image gen takes longer
      },
      {
        id: 's4',
        type: 'assertion',
        description: 'Verify image element presence',
        assertionType: 'contains',
        expected: 'img', // Simplistic check, real impl needs better selector logic
      },
    ],
  },
];
