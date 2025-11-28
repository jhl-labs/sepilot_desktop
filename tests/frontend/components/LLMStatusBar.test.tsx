/**
 * LLMStatusBar 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LLMStatusBar, ToolInfo } from '@/components/chat/LLMStatusBar';
import { LLMConfig, Message } from '@/types';

const mockLLMConfig: LLMConfig = {
  provider: 'openai',
  model: 'gpt-4',
  apiKey: 'test-key',
  baseUrl: 'https://api.openai.com/v1',
  maxTokens: 2000,
  temperature: 0.7,
};

const mockTools: ToolInfo[] = [
  { name: 'file_read', description: 'Read file contents', serverName: 'builtin' },
  { name: 'file_write', description: 'Write file', serverName: 'builtin' },
  { name: 'web_search', description: 'Search the web', serverName: 'mcp-server' },
];

const mockMessages: Message[] = [
  { id: 'msg-1', role: 'user', content: 'Hello', created_at: Date.now() },
  { id: 'msg-2', role: 'assistant', content: 'Hi there!', created_at: Date.now() },
  { id: 'msg-3', role: 'user', content: 'How are you?', created_at: Date.now() },
];

describe('LLMStatusBar', () => {
  const defaultProps = {
    isStreaming: false,
    llmConfig: mockLLMConfig,
    messages: mockMessages,
    input: '',
    mounted: true,
    tools: mockTools,
  };

  it('should render model information', () => {
    render(<LLMStatusBar {...defaultProps} />);

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText(/max 2000/)).toBeInTheDocument();
    expect(screen.getByText(/temp 0.7/)).toBeInTheDocument();
  });

  it('should show streaming status', () => {
    render(<LLMStatusBar {...defaultProps} isStreaming={true} />);

    expect(screen.getByText(/응답 생성 중/)).toBeInTheDocument();
  });

  it('should show tool count', () => {
    render(<LLMStatusBar {...defaultProps} />);

    expect(screen.getByText('3 tools')).toBeInTheDocument();
  });

  it('should open tools popover on click', async () => {
    render(<LLMStatusBar {...defaultProps} />);

    const toolsButton = screen.getByText('3 tools').parentElement;
    fireEvent.click(toolsButton!);

    await waitFor(() => {
      expect(screen.getByText('사용 가능한 툴 (3개)')).toBeInTheDocument();
    });

    expect(screen.getByText('file_read')).toBeInTheDocument();
    expect(screen.getByText('Read file contents')).toBeInTheDocument();
  });

  it('should show context usage', () => {
    render(<LLMStatusBar {...defaultProps} />);

    // Context usage should be displayed
    const contextText = screen.getByTitle(/컨텍스트 사용량/);
    expect(contextText).toBeInTheDocument();
  });

  it('should allow editing max tokens', async () => {
    const onConfigUpdate = jest.fn();
    render(<LLMStatusBar {...defaultProps} onConfigUpdate={onConfigUpdate} />);

    // Click on max tokens to edit
    const maxTokensElement = screen.getByText(/max 2000/);
    fireEvent.click(maxTokensElement);

    // Input should appear
    const input = screen.getByDisplayValue('2000');
    expect(input).toBeInTheDocument();

    // Change value
    fireEvent.change(input, { target: { value: '3000' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onConfigUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 3000,
        })
      );
    });
  });

  it('should allow editing temperature', async () => {
    const onConfigUpdate = jest.fn();
    render(<LLMStatusBar {...defaultProps} onConfigUpdate={onConfigUpdate} />);

    // Click on temperature to edit
    const temperatureElement = screen.getByText(/temp 0.7/);
    fireEvent.click(temperatureElement);

    // Input should appear
    const input = screen.getByDisplayValue('0.7');
    expect(input).toBeInTheDocument();

    // Change value
    fireEvent.change(input, { target: { value: '0.9' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onConfigUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.9,
        })
      );
    });
  });

  it('should handle Enter key to save edit', async () => {
    const onConfigUpdate = jest.fn();
    render(<LLMStatusBar {...defaultProps} onConfigUpdate={onConfigUpdate} />);

    const maxTokensElement = screen.getByText(/max 2000/);
    fireEvent.click(maxTokensElement);

    const input = screen.getByDisplayValue('2000');
    fireEvent.change(input, { target: { value: '4000' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => {
      expect(onConfigUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          maxTokens: 4000,
        })
      );
    });
  });

  it('should handle Escape key to cancel edit', async () => {
    const onConfigUpdate = jest.fn();
    render(<LLMStatusBar {...defaultProps} onConfigUpdate={onConfigUpdate} />);

    const maxTokensElement = screen.getByText(/max 2000/);
    fireEvent.click(maxTokensElement);

    const input = screen.getByDisplayValue('2000');
    fireEvent.change(input, { target: { value: '4000' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    // Should not call onConfigUpdate
    expect(onConfigUpdate).not.toHaveBeenCalled();

    // Should show original value
    await waitFor(() => {
      expect(screen.getByText(/max 2000/)).toBeInTheDocument();
    });
  });

  it('should show compact button when messages > 2', async () => {
    const onCompact = jest.fn();
    render(<LLMStatusBar {...defaultProps} onCompact={onCompact} />);

    // Find button by waiting for tooltip content to appear on hover
    const buttons = screen.getAllByRole('button');
    const compactButton = buttons.find(
      (button) => button.querySelector('svg') && button.className.includes('h-5')
    );

    expect(compactButton).toBeInTheDocument();

    if (compactButton) {
      fireEvent.click(compactButton);
      expect(onCompact).toHaveBeenCalled();
    }
  });

  it('should disable compact button when streaming', () => {
    const onCompact = jest.fn();
    render(<LLMStatusBar {...defaultProps} isStreaming={true} onCompact={onCompact} />);

    const buttons = screen.getAllByRole('button');
    const compactButton = buttons.find(
      (button) => button.querySelector('svg') && button.className.includes('h-5')
    );

    expect(compactButton).toBeDisabled();
  });

  it('should not show compact button when messages <= 2', () => {
    render(
      <LLMStatusBar {...defaultProps} messages={[mockMessages[0]]} onCompact={jest.fn()} />
    );

    const buttons = screen.getAllByRole('button');
    const compactButton = buttons.find(
      (button) => button.querySelector('svg') && button.className.includes('h-5')
    );

    expect(compactButton).toBeUndefined();
  });

  it('should show warning color for high context usage', () => {
    const longMessages: Message[] = Array.from({ length: 100 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'A'.repeat(10000), // Long content
      created_at: Date.now(),
    }));

    render(<LLMStatusBar {...defaultProps} messages={longMessages} />);

    const contextElement = screen.getByTitle(/컨텍스트 사용량/);
    expect(contextElement).toHaveClass('text-orange-500');
  });

  it('should group tools by server', async () => {
    render(<LLMStatusBar {...defaultProps} />);

    const toolsButton = screen.getByText('3 tools').parentElement;
    fireEvent.click(toolsButton!);

    await waitFor(() => {
      expect(screen.getByText('Built-in Tools')).toBeInTheDocument();
      expect(screen.getByText('mcp-server')).toBeInTheDocument();
    });
  });

  it('should show "모델 설정 필요" when no config', () => {
    render(<LLMStatusBar {...defaultProps} llmConfig={null} />);

    expect(screen.getByText('모델 설정 필요')).toBeInTheDocument();
  });

  it('should not show tools when empty', () => {
    render(<LLMStatusBar {...defaultProps} tools={[]} />);

    expect(screen.queryByText(/tools/)).not.toBeInTheDocument();
  });

  it('should validate max tokens input', async () => {
    const onConfigUpdate = jest.fn();
    render(<LLMStatusBar {...defaultProps} onConfigUpdate={onConfigUpdate} />);

    const maxTokensElement = screen.getByText(/max 2000/);
    fireEvent.click(maxTokensElement);

    const input = screen.getByDisplayValue('2000');

    // Invalid value (negative)
    fireEvent.change(input, { target: { value: '-100' } });
    fireEvent.blur(input);

    // Should not call onConfigUpdate
    expect(onConfigUpdate).not.toHaveBeenCalled();
  });

  it('should validate temperature input', async () => {
    const onConfigUpdate = jest.fn();
    render(<LLMStatusBar {...defaultProps} onConfigUpdate={onConfigUpdate} />);

    const temperatureElement = screen.getByText(/temp 0.7/);
    fireEvent.click(temperatureElement);

    const input = screen.getByDisplayValue('0.7');

    // Invalid value (> 2)
    fireEvent.change(input, { target: { value: '3' } });
    fireEvent.blur(input);

    // Should not call onConfigUpdate
    expect(onConfigUpdate).not.toHaveBeenCalled();
  });
});
