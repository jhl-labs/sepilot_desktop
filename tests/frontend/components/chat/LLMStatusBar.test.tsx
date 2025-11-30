/**
 * LLMStatusBar 컴포넌트 테스트
 *
 * LLM 상태 표시 및 설정 인라인 편집 기능을 테스트합니다.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LLMStatusBar } from '@/components/chat/LLMStatusBar';
import { LLMConfig } from '@/types';

describe('LLMStatusBar', () => {
  const defaultConfig: LLMConfig = {
    provider: 'openai',
    model: 'gpt-4',
    apiKey: 'test-key',
    baseURL: 'https://api.openai.com/v1',
    maxTokens: 2000,
    temperature: 0.7,
  };

  describe('기본 상태', () => {
    it('모델 정보를 표시해야 함', () => {
      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
        />
      );

      expect(screen.getByText('gpt-4')).toBeInTheDocument();
      expect(screen.getByText(/max 2000/)).toBeInTheDocument();
      expect(screen.getByText(/temp 0.7/)).toBeInTheDocument();
    });

    it('설정이 없을 때 안내 메시지를 표시해야 함', () => {
      render(
        <LLMStatusBar isStreaming={false} llmConfig={null} messages={[]} input="" mounted={true} />
      );

      expect(screen.getByText('모델 설정 필요')).toBeInTheDocument();
    });

    it('스트리밍 중일 때 상태를 표시해야 함', () => {
      render(
        <LLMStatusBar
          isStreaming={true}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
        />
      );

      expect(screen.getByText(/응답 생성 중/)).toBeInTheDocument();
      expect(screen.getByText(/Esc로 중지/)).toBeInTheDocument();
    });
  });

  describe('컨텍스트 사용량', () => {
    it('컨텍스트 사용량을 표시해야 함', () => {
      const messages = [
        { id: '1', role: 'user' as const, content: 'Hello', created_at: Date.now() },
        { id: '2', role: 'assistant' as const, content: 'Hi there!', created_at: Date.now() },
      ];

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={messages}
          input="How are you?"
          mounted={true}
        />
      );

      // 토큰 카운트 표시 확인 (정확한 값은 추정이므로 존재만 확인)
      const statusText = screen.getByText(/K/);
      expect(statusText).toBeInTheDocument();
    });

    it('긴 메시지에 대해 토큰 수를 K 단위로 표시해야 함', () => {
      const longContent = 'A'.repeat(3000);
      const messages = [
        { id: '1', role: 'user' as const, content: longContent, created_at: Date.now() },
      ];

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={messages}
          input=""
          mounted={true}
        />
      );

      expect(screen.getByText(/K/)).toBeInTheDocument();
    });
  });

  describe('설정 인라인 편집', () => {
    it('maxTokens 클릭 시 편집 모드로 전환되어야 함', async () => {
      const user = userEvent.setup();
      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
        />
      );

      const maxTokensText = screen.getByText(/max 2000/);
      await user.click(maxTokensText);

      const input = screen.getByDisplayValue('2000');
      expect(input).toBeInTheDocument();
      expect(input.tagName).toBe('INPUT');
    });

    it('temperature 클릭 시 편집 모드로 전환되어야 함', async () => {
      const user = userEvent.setup();
      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
        />
      );

      const tempText = screen.getByText(/temp 0.7/);
      await user.click(tempText);

      const input = screen.getByDisplayValue('0.7');
      expect(input).toBeInTheDocument();
    });

    it('maxTokens 수정 후 Enter 키 입력 시 저장되어야 함', async () => {
      const user = userEvent.setup();
      const mockOnConfigUpdate = jest.fn();

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
          onConfigUpdate={mockOnConfigUpdate}
        />
      );

      const maxTokensText = screen.getByText(/max 2000/);
      await user.click(maxTokensText);

      const input = screen.getByDisplayValue('2000');
      await user.clear(input);
      await user.type(input, '4000');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockOnConfigUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            maxTokens: 4000,
          })
        );
      });
    });

    it('temperature 수정 후 Enter 키 입력 시 저장되어야 함', async () => {
      const user = userEvent.setup();
      const mockOnConfigUpdate = jest.fn();

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
          onConfigUpdate={mockOnConfigUpdate}
        />
      );

      const tempText = screen.getByText(/temp 0.7/);
      await user.click(tempText);

      const input = screen.getByDisplayValue('0.7');
      await user.clear(input);
      await user.type(input, '0.9');
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(mockOnConfigUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            temperature: 0.9,
          })
        );
      });
    });

    it('Escape 키 입력 시 편집 취소되어야 함', async () => {
      const user = userEvent.setup();
      const mockOnConfigUpdate = jest.fn();

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
          onConfigUpdate={mockOnConfigUpdate}
        />
      );

      const maxTokensText = screen.getByText(/max 2000/);
      await user.click(maxTokensText);

      const input = screen.getByDisplayValue('2000');
      await user.clear(input);
      await user.type(input, '9999');
      await user.keyboard('{Escape}');

      await waitFor(() => {
        expect(mockOnConfigUpdate).not.toHaveBeenCalled();
        expect(screen.getByText(/max 2000/)).toBeInTheDocument();
      });
    });

    it('잘못된 maxTokens 값은 저장되지 않아야 함', async () => {
      const user = userEvent.setup();
      const mockOnConfigUpdate = jest.fn();

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
          onConfigUpdate={mockOnConfigUpdate}
        />
      );

      const maxTokensText = screen.getByText(/max 2000/);
      await user.click(maxTokensText);

      const input = screen.getByDisplayValue('2000');
      await user.clear(input);
      await user.type(input, '-100');
      await user.keyboard('{Enter}');

      expect(mockOnConfigUpdate).not.toHaveBeenCalled();
    });

    it('잘못된 temperature 값은 저장되지 않아야 함', async () => {
      const user = userEvent.setup();
      const mockOnConfigUpdate = jest.fn();

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
          onConfigUpdate={mockOnConfigUpdate}
        />
      );

      const tempText = screen.getByText(/temp 0.7/);
      await user.click(tempText);

      const input = screen.getByDisplayValue('0.7');
      await user.clear(input);
      await user.type(input, '5'); // 범위 초과 (max 2)
      await user.keyboard('{Enter}');

      expect(mockOnConfigUpdate).not.toHaveBeenCalled();
    });
  });

  describe('툴 표시', () => {
    it('툴이 있을 때 툴 카운트를 표시해야 함', () => {
      const tools = [
        { name: 'file_read', description: '파일 읽기', serverName: 'builtin' },
        { name: 'file_write', description: '파일 쓰기', serverName: 'builtin' },
      ];

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
          tools={tools}
        />
      );

      expect(screen.getByText('2 tools')).toBeInTheDocument();
    });

    it('툴이 없을 때는 툴 표시를 하지 않아야 함', () => {
      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={true}
          tools={[]}
        />
      );

      expect(screen.queryByText(/tools/)).not.toBeInTheDocument();
    });
  });

  describe('엣지 케이스', () => {
    it('llmConfig가 null일 때 편집 시도해도 아무 일도 일어나지 않아야 함', async () => {
      const user = userEvent.setup();
      const mockOnConfigUpdate = jest.fn();

      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={null}
          messages={[]}
          input=""
          mounted={true}
          onConfigUpdate={mockOnConfigUpdate}
        />
      );

      // null config일 때는 편집 가능한 요소가 없음
      expect(screen.getByText('모델 설정 필요')).toBeInTheDocument();
      expect(mockOnConfigUpdate).not.toHaveBeenCalled();
    });

    it('mounted가 false일 때도 렌더링되어야 함', () => {
      render(
        <LLMStatusBar
          isStreaming={false}
          llmConfig={defaultConfig}
          messages={[]}
          input=""
          mounted={false}
        />
      );

      expect(screen.getByText('gpt-4')).toBeInTheDocument();
    });
  });
});
