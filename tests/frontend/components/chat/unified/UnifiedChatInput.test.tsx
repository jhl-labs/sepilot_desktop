import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { UnifiedChatInput } from '@/components/chat/unified/UnifiedChatInput';
import type { ChatConfig, ChatMode } from '@/components/chat/unified/types';
import type { Persona } from '@/types/persona';
import { useChatStore } from '@/lib/store/chat-store';

jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: jest.fn(),
}));

jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

jest.mock('@/components/chat/unified/hooks/useConfigLoader', () => ({
  useConfigLoader: jest.fn(() => ({
    llmConfig: null,
    updateLLMConfig: jest.fn(),
  })),
}));

jest.mock('@/components/chat/unified/plugins/ImageAttachmentPlugin', () => ({
  ImageAttachmentPlugin: () => null,
}));

jest.mock('@/components/chat/unified/plugins/FileAttachmentPlugin', () => ({
  FileAttachmentPlugin: () => null,
}));

jest.mock('@/components/chat/unified/plugins/SlashCommandPlugin', () => ({
  SlashCommandPlugin: () => null,
}));

jest.mock('@/components/chat/unified/plugins/PersonaPlugin', () => ({
  PersonaPlugin: () => null,
}));

jest.mock('@/components/chat/unified/plugins/ToolApprovalPlugin', () => ({
  ToolApprovalPlugin: () => null,
}));

jest.mock('@/components/chat/unified/components/LLMStatusBar', () => ({
  LLMStatusBar: () => null,
}));

jest.mock('@/components/chat/unified/components/ImageGenerationProgressBar', () => ({
  ImageGenerationProgressBar: () => null,
}));

jest.mock('@/components/chat/unified/components/ApprovalHistoryTimeline', () => ({
  ApprovalHistoryTimeline: () => null,
}));

describe('UnifiedChatInput Slash Command Behavior', () => {
  const mockSetThinkingMode = jest.fn();
  const mockSetInputTrustLevel = jest.fn();
  const mockSetEnableRAG = jest.fn();
  const mockSetEnableTools = jest.fn();
  const mockSetEnableImageGeneration = jest.fn();
  const mockSetActivePersona = jest.fn();
  const mockSetWorkingDirectory = jest.fn();
  const mockClearMessages = jest.fn();
  const mockToggleTool = jest.fn();
  const mockEnableAllTools = jest.fn();
  const mockDisableAllTools = jest.fn();
  const mockSetSelectedImageGenProvider = jest.fn();

  const defaultPersonas: Persona[] = [
    {
      id: 'assistant',
      name: 'Assistant',
      description: 'Default assistant',
      systemPrompt: 'You are helpful.',
      isBuiltin: false,
      created_at: Date.now(),
      updated_at: Date.now(),
    },
  ];

  const createDefaultConfig = (mode: ChatMode = 'main'): ChatConfig => ({
    mode,
    features: {
      enableImageUpload: false,
      enableFileUpload: false,
      enableToolApproval: false,
    },
    style: {
      compact: true,
    },
    dataSource: {
      messages: [],
      streamingState: null,
      addMessage: jest.fn(),
      updateMessage: jest.fn(),
      clearMessages: jest.fn(),
      startStreaming: jest.fn(),
      stopStreaming: jest.fn(),
    },
  });

  const setupStore = (overrides?: Partial<Record<string, unknown>>) => {
    (useChatStore as unknown as jest.Mock).mockReturnValue({
      thinkingMode: 'instant',
      setThinkingMode: mockSetThinkingMode,
      inputTrustLevel: 'trusted',
      setInputTrustLevel: mockSetInputTrustLevel,
      enableRAG: false,
      setEnableRAG: mockSetEnableRAG,
      enableTools: false,
      setEnableTools: mockSetEnableTools,
      enableImageGeneration: false,
      setEnableImageGeneration: mockSetEnableImageGeneration,
      enabledTools: new Set<string>(),
      toggleTool: mockToggleTool,
      enableAllTools: mockEnableAllTools,
      disableAllTools: mockDisableAllTools,
      personas: defaultPersonas,
      activePersonaId: null,
      setActivePersona: mockSetActivePersona,
      pendingToolApproval: null,
      messages: [],
      activeConversationId: null,
      imageGenerationProgress: new Map(),
      clearMessages: mockClearMessages,
      workingDirectory: null,
      setWorkingDirectory: mockSetWorkingDirectory,
      selectedImageGenProvider: null,
      setSelectedImageGenProvider: mockSetSelectedImageGenProvider,
      ...overrides,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    setupStore();
  });

  it('executes exact slash command with trailing spaces instead of sending text', async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn().mockResolvedValue(undefined);

    render(
      <UnifiedChatInput
        config={createDefaultConfig('main')}
        onSendMessage={onSendMessage}
        isStreaming={false}
      />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '/deep ');
    await user.keyboard('{Enter}');

    expect(mockSetThinkingMode).toHaveBeenCalledWith('deep');
    expect(onSendMessage).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('');
  });

  it('does not send unmatched /persona command on Enter', async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn().mockResolvedValue(undefined);

    render(
      <UnifiedChatInput
        config={createDefaultConfig('main')}
        onSendMessage={onSendMessage}
        isStreaming={false}
      />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '/persona unknown-persona');
    await user.keyboard('{Enter}');

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(mockSetActivePersona).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('/persona unknown-persona');
  });

  it('clears persona command input when Escape is pressed', async () => {
    const user = userEvent.setup();

    render(<UnifiedChatInput config={createDefaultConfig('main')} isStreaming={false} />);

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '/persona assist');
    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(textarea).toHaveValue('');
    });
  });

  it('sends slash-like text as normal message in non-main mode', async () => {
    const user = userEvent.setup();
    const onSendMessage = jest.fn().mockResolvedValue(undefined);

    render(
      <UnifiedChatInput
        config={createDefaultConfig('browser')}
        onSendMessage={onSendMessage}
        isStreaming={false}
      />
    );

    const textarea = screen.getByRole('textbox');
    await user.type(textarea, '/deep ');
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(onSendMessage).toHaveBeenCalledWith('/deep', undefined);
    });
    expect(mockSetThinkingMode).not.toHaveBeenCalled();
  });
});
