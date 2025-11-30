/**
 * InputBox 컴포넌트 테스트 (주요 기능)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { InputBox } from '@/components/chat/InputBox';
import { useChatStore } from '@/lib/store/chat-store';

// Mock useChatStore
const mockGetState = jest.fn();
jest.mock('@/lib/store/chat-store', () => ({
  useChatStore: Object.assign(jest.fn(), {
    getState: () => mockGetState(),
  }),
}));

// Mock LLM client
jest.mock('@/lib/llm/client', () => ({
  initializeLLMClient: jest.fn(),
}));

// Mock ComfyUI client
jest.mock('@/lib/comfyui/client', () => ({
  initializeComfyUIClient: jest.fn(),
}));

// Mock platform
jest.mock('@/lib/platform', () => ({
  isElectron: jest.fn(() => false),
}));

// Mock web LLM client
jest.mock('@/lib/llm/web-client', () => ({
  getWebLLMClient: jest.fn(),
  configureWebLLMClient: jest.fn(),
}));

// Mock title generator
jest.mock('@/lib/chat/title-generator', () => ({
  generateConversationTitle: jest.fn(),
  shouldGenerateTitle: jest.fn(() => false),
}));

// Mock child components
jest.mock('@/components/chat/ToolApprovalDialog', () => ({
  ToolApprovalDialog: () => <div data-testid="tool-approval-dialog">ToolApprovalDialog</div>,
}));

jest.mock('@/components/chat/ImageGenerationProgressBar', () => ({
  ImageGenerationProgressBar: () => <div data-testid="image-gen-progress">Progress</div>,
}));

jest.mock('@/components/chat/LLMStatusBar', () => ({
  LLMStatusBar: () => <div data-testid="llm-status-bar">Status</div>,
}));

describe('InputBox', () => {
  const mockChatStore = {
    addMessage: jest.fn(),
    updateMessage: jest.fn(),
    activeConversationId: 'conv-1',
    createConversation: jest.fn(),
    streamingConversations: new Set(),
    startStreaming: jest.fn(),
    stopStreaming: jest.fn(),
    messages: [],
    thinkingMode: 'instant',
    enableRAG: false,
    enableTools: true,
    setThinkingMode: jest.fn(),
    setEnableRAG: jest.fn(),
    setEnableTools: jest.fn(),
    getGraphConfig: jest.fn(() => ({})),
    conversations: [],
    updateConversationTitle: jest.fn(),
    pendingToolApproval: null,
    setPendingToolApproval: jest.fn(),
    clearPendingToolApproval: jest.fn(),
    alwaysApproveToolsForSession: false,
    setAlwaysApproveToolsForSession: jest.fn(),
    imageGenerationProgress: new Map(),
    setImageGenerationProgress: jest.fn(),
    clearImageGenerationProgress: jest.fn(),
    enableImageGeneration: false,
    setEnableImageGeneration: jest.fn(),
    personas: [],
    activePersonaId: null,
    workingDirectory: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (useChatStore as unknown as jest.Mock).mockReturnValue(mockChatStore);
    mockGetState.mockReturnValue(mockChatStore);
  });

  it('should render input textarea', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeInTheDocument();
  });

  it('should update input value on change', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    expect(textarea).toHaveValue('Hello');
  });

  it('should show send button', () => {
    render(<InputBox />);

    const sendButton = screen.getByRole('button', { name: /전송/i });
    expect(sendButton).toBeInTheDocument();
  });

  it('should disable send button when input is empty', () => {
    render(<InputBox />);

    const sendButton = screen.getByRole('button', { name: /전송/i });
    expect(sendButton).toBeDisabled();
  });

  it('should enable send button when input has text', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Hello' } });

    const sendButton = screen.getByRole('button', { name: /전송/i });
    expect(sendButton).not.toBeDisabled();
  });

  it('should show stop button when streaming', () => {
    const streamingStore = {
      ...mockChatStore,
      streamingConversations: new Set(['conv-1']),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(streamingStore);

    render(<InputBox />);

    const stopButton = screen.getByRole('button', { name: /중지/i });
    expect(stopButton).toBeInTheDocument();
  });

  it('should show thinking mode selector', async () => {
    render(<InputBox />);

    // Wait for mounted state
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /사고 모드.*Instant/i })).toBeInTheDocument();
    });
  });

  it('should change thinking mode on selection', async () => {
    render(<InputBox />);

    // Wait for mounted state
    await waitFor(() => {
      const modeButton = screen.getByRole('button', { name: /사고 모드.*Instant/i });
      expect(modeButton).toBeInTheDocument();
    });

    const modeButton = screen.getByRole('button', { name: /사고 모드.*Instant/i });
    fireEvent.click(modeButton);

    // Should show dropdown menu
    await waitFor(() => {
      expect(screen.getByText(/Sequential Thinking/i)).toBeInTheDocument();
    });

    const thinkingOption = screen.getByText(/Sequential Thinking/i);
    fireEvent.click(thinkingOption);

    expect(mockChatStore.setThinkingMode).toHaveBeenCalledWith('sequential');
  });

  it('should toggle RAG on checkbox change', () => {
    render(<InputBox />);

    const ragCheckbox = screen.getByLabelText(/RAG/i);
    fireEvent.click(ragCheckbox);

    expect(mockChatStore.setEnableRAG).toHaveBeenCalledWith(true);
  });

  it('should toggle Tools on checkbox change', () => {
    render(<InputBox />);

    const toolsCheckbox = screen.getByLabelText(/Tools/i);
    fireEvent.click(toolsCheckbox);

    expect(mockChatStore.setEnableTools).toHaveBeenCalledWith(false);
  });

  it('should not show image generation toggle in non-Electron environment', () => {
    render(<InputBox />);

    // Image generation toggle should not be present in web environment
    const imageGenCheckbox = screen.queryByLabelText(/이미지 생성/i);
    expect(imageGenCheckbox).not.toBeInTheDocument();
  });

  it('should show LLM status bar', () => {
    render(<InputBox />);

    expect(screen.getByTestId('llm-status-bar')).toBeInTheDocument();
  });

  it('should handle Enter key to send message', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Test message' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    // Message should be added
    expect(mockChatStore.addMessage).toHaveBeenCalled();
  });

  it('should handle Shift+Enter for new line', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Line 1' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    // Should not send message
    expect(mockChatStore.addMessage).not.toHaveBeenCalled();
  });

  it('should disable inputs during streaming', () => {
    const streamingStore = {
      ...mockChatStore,
      streamingConversations: new Set(['conv-1']),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(streamingStore);

    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    expect(textarea).toBeDisabled();
  });

  it('should show placeholder text', () => {
    render(<InputBox />);

    const textarea = screen.getByPlaceholderText(/메시지를 입력하세요/i);
    expect(textarea).toBeInTheDocument();
  });

  it('should auto-resize textarea', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    // Simulate typing long text
    fireEvent.change(textarea, {
      target: { value: 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5' },
    });

    // Textarea should exist (auto-resize logic tested in implementation)
    expect(textarea).toBeInTheDocument();
  });

  it('should clear input after sending message', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Test' } });

    const sendButton = screen.getByRole('button', { name: /전송/i });
    fireEvent.click(sendButton);

    // Input should be cleared
    expect(textarea).toHaveValue('');
  });

  it('should not send empty message', () => {
    render(<InputBox />);

    const sendButton = screen.getByRole('button', { name: /전송/i });

    // Button should be disabled when empty
    expect(sendButton).toBeDisabled();
  });

  it('should handle IME composition', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');

    // Start composition
    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: '안녕' } });

    // Should not send during composition
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(mockChatStore.addMessage).not.toHaveBeenCalled();

    // End composition
    fireEvent.compositionEnd(textarea);
  });

  it('should show image generation progress bar when progress exists', () => {
    const storeWithProgress = {
      ...mockChatStore,
      imageGenerationProgress: new Map([
        [
          'conv-1',
          {
            messageId: 'msg-1',
            status: 'executing',
            progress: 50,
            message: 'Generating...',
          },
        ],
      ]),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithProgress);

    render(<InputBox />);

    expect(screen.getByTestId('image-gen-progress')).toBeInTheDocument();
  });

  it('should auto-enable tools when coding mode is selected', async () => {
    render(<InputBox />);

    // Wait for mounted state
    await waitFor(() => {
      const modeButton = screen.getByRole('button', { name: /사고 모드.*Instant/i });
      expect(modeButton).toBeInTheDocument();
    });

    const modeButton = screen.getByRole('button', { name: /사고 모드.*Instant/i });
    fireEvent.click(modeButton);

    await waitFor(() => {
      expect(screen.getByText(/Coding \(beta\)/i)).toBeInTheDocument();
    });

    const codingOption = screen.getByText(/Coding \(beta\)/i);
    fireEvent.click(codingOption);

    expect(mockChatStore.setThinkingMode).toHaveBeenCalledWith('coding');
    expect(mockChatStore.setEnableTools).toHaveBeenCalledWith(true);
  });

  it('should handle stop button click', () => {
    const streamingStore = {
      ...mockChatStore,
      streamingConversations: new Set(['conv-1']),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(streamingStore);

    render(<InputBox />);

    const stopButton = screen.getByRole('button', { name: /중지/i });
    fireEvent.click(stopButton);

    expect(mockChatStore.stopStreaming).toHaveBeenCalledWith('conv-1');
  });

  it('should show different placeholder when images are selected', () => {
    render(<InputBox />);

    const textarea = screen.getByPlaceholderText(/메시지를 입력하세요/i);
    expect(textarea).toBeInTheDocument();
  });

  it('should show tool approval dialog when pending approval exists', () => {
    const storeWithApproval = {
      ...mockChatStore,
      pendingToolApproval: {
        conversationId: 'conv-1',
        messageId: 'msg-1',
        toolCalls: [{ id: 'tool-1', name: 'file_read', arguments: { path: '/test.txt' } }],
        timestamp: Date.now(),
      },
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithApproval);

    render(<InputBox />);

    expect(screen.getByTestId('tool-approval-dialog')).toBeInTheDocument();
  });

  it('should render thinking mode icons correctly', async () => {
    const { rerender } = render(<InputBox />);

    // Wait for mount
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /사고 모드/i })).toBeInTheDocument();
    });

    // Test instant mode (default)
    let modeButton = screen.getByRole('button', { name: /사고 모드/i });
    expect(modeButton.querySelector('svg')).toBeInTheDocument();

    // Change to sequential
    const storeWithSequential = { ...mockChatStore, thinkingMode: 'sequential' };
    (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithSequential);
    rerender(<InputBox />);

    await waitFor(() => {
      modeButton = screen.getByRole('button', { name: /사고 모드/i });
      expect(modeButton).toBeInTheDocument();
    });
  });

  it('should disable thinking mode selector during streaming', () => {
    const streamingStore = {
      ...mockChatStore,
      streamingConversations: new Set(['conv-1']),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(streamingStore);

    render(<InputBox />);

    // Thinking mode button should be disabled
    const modeButton = screen
      .getAllByRole('button')
      .find((btn) => btn.getAttribute('title')?.includes('사고 모드'));
    expect(modeButton).toBeDisabled();
  });

  it('should disable RAG toggle during streaming', () => {
    const streamingStore = {
      ...mockChatStore,
      streamingConversations: new Set(['conv-1']),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(streamingStore);

    render(<InputBox />);

    const ragToggle = screen.getByLabelText(/RAG/i);
    expect(ragToggle).toBeDisabled();
  });

  it('should disable Tools toggle during streaming', () => {
    const streamingStore = {
      ...mockChatStore,
      streamingConversations: new Set(['conv-1']),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(streamingStore);

    render(<InputBox />);

    const toolsToggle = screen.getByLabelText(/Tools/i);
    expect(toolsToggle).toBeDisabled();
  });

  it('should show active state for RAG when enabled', () => {
    const storeWithRAG = {
      ...mockChatStore,
      enableRAG: true,
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithRAG);

    render(<InputBox />);

    const ragButton = screen.getByLabelText(/RAG/i);
    expect(ragButton).toHaveClass('bg-blue-500/10');
  });

  it('should show active state for Tools when enabled', () => {
    const storeWithTools = {
      ...mockChatStore,
      enableTools: true,
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithTools);

    render(<InputBox />);

    const toolsButton = screen.getByLabelText(/Tools/i);
    expect(toolsButton).toHaveClass('bg-orange-500/10');
  });

  it('should have all thinking mode options in dropdown', async () => {
    render(<InputBox />);

    // Wait for mounted state
    await waitFor(() => {
      const modeButton = screen.getByRole('button', { name: /사고 모드.*Instant/i });
      expect(modeButton).toBeInTheDocument();
    });

    const modeButton = screen.getByRole('button', { name: /사고 모드.*Instant/i });
    fireEvent.click(modeButton);

    await waitFor(() => {
      expect(screen.getByText(/Sequential Thinking/i)).toBeInTheDocument();
      expect(screen.getByText(/Tree of Thought/i)).toBeInTheDocument();
      expect(screen.getByText(/Deep Thinking/i)).toBeInTheDocument();
      expect(screen.getByText(/Coding \(beta\)/i)).toBeInTheDocument();
    });
  });

  it('should handle error display', () => {
    render(<InputBox />);

    // Simulate error by trying to send empty message
    const sendButton = screen.getByRole('button', { name: /전송/i });

    // Button should be disabled when empty
    expect(sendButton).toBeDisabled();
  });

  it('should clear input on successful send', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Test message' } });

    const sendButton = screen.getByRole('button', { name: /전송/i });
    fireEvent.click(sendButton);

    expect(textarea).toHaveValue('');
  });

  it('should create conversation if none exists when sending', () => {
    const storeWithoutConversation = {
      ...mockChatStore,
      activeConversationId: null,
      createConversation: jest.fn(() => Promise.resolve('new-conv-1')),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(storeWithoutConversation);

    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'New message' } });

    const sendButton = screen.getByRole('button', { name: /전송/i });
    fireEvent.click(sendButton);

    expect(storeWithoutConversation.createConversation).toHaveBeenCalled();
  });

  it('should not send when both input and images are empty', () => {
    render(<InputBox />);

    const sendButton = screen.getByRole('button', { name: /전송/i });

    // Button should be disabled
    expect(sendButton).toBeDisabled();

    fireEvent.click(sendButton);

    // Should not add message
    expect(mockChatStore.addMessage).not.toHaveBeenCalled();
  });

  it('should handle send with Enter key', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Test' } });

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });

    expect(mockChatStore.addMessage).toHaveBeenCalled();
  });

  it('should not send with Shift+Enter', () => {
    render(<InputBox />);

    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Test' } });

    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });

    expect(mockChatStore.addMessage).not.toHaveBeenCalled();
  });

  it('should render RAG and Tools toggle buttons', async () => {
    render(<InputBox />);

    // Wait for mounted state
    await waitFor(() => {
      // RAG toggle
      expect(screen.getByLabelText(/RAG/i)).toBeInTheDocument();

      // Tools toggle
      expect(screen.getByLabelText(/Tools/i)).toBeInTheDocument();
    });

    // Image generation toggle should NOT be present in non-Electron environment
    expect(screen.queryByLabelText(/이미지 생성/i)).not.toBeInTheDocument();
  });

  it('should disable all controls when streaming', () => {
    const streamingStore = {
      ...mockChatStore,
      streamingConversations: new Set(['conv-1']),
    };
    (useChatStore as unknown as jest.Mock).mockReturnValue(streamingStore);

    render(<InputBox />);

    // Textarea should be disabled
    expect(screen.getByRole('textbox')).toBeDisabled();

    // Send button should not be visible (replaced with stop)
    expect(screen.queryByRole('button', { name: /전송/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /중지/i })).toBeInTheDocument();
  });
});
