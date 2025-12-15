import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConnectionManager } from '@/components/settings/ConnectionManager';
import { LLMConnection } from '@/types';

describe('ConnectionManager', () => {
  it('새 Connection 생성 시 커스텀 헤더를 추가할 수 있다', async () => {
    const user = userEvent.setup();
    const handleConnectionsChange = jest.fn();

    render(
      <ConnectionManager
        connections={[]}
        onConnectionsChange={handleConnectionsChange}
        models={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: '추가' }));

    fireEvent.change(screen.getByLabelText('이름'), { target: { value: 'Custom API' } });
    fireEvent.change(screen.getByLabelText(/Base URL/i), {
      target: { value: 'https://api.custom.ai/v1' },
    });
    fireEvent.change(screen.getByLabelText(/API Key/i), {
      target: { value: 'sk-test-key-1234567890abcd' },
    });

    fireEvent.change(screen.getByPlaceholderText('헤더 이름'), {
      target: { value: 'X-Test-Header' },
    });
    fireEvent.change(screen.getByPlaceholderText('헤더 값'), { target: { value: 'test-value' } });
    await user.click(screen.getByRole('button', { name: '헤더 추가' }));

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(handleConnectionsChange).toHaveBeenCalledTimes(1);
    const newConnections = handleConnectionsChange.mock.calls[0][0] as LLMConnection[];
    expect(newConnections[0]).toEqual(
      expect.objectContaining({
        name: 'Custom API',
        baseURL: 'https://api.custom.ai/v1',
        customHeaders: {
          'X-Test-Header': 'test-value',
        },
      })
    );
  });

  it('기존 Connection 편집 시 커스텀 헤더를 수정할 수 있다', async () => {
    const user = userEvent.setup();
    const handleConnectionsChange = jest.fn();
    const existingConnection: LLMConnection = {
      id: 'conn-1',
      name: 'Existing',
      provider: 'openai',
      baseURL: 'https://api.openai.com/v1',
      apiKey: 'sk-existing-key-1234567890',
      enabled: true,
      customHeaders: {
        'X-API-Version': 'v1',
      },
    };

    render(
      <ConnectionManager
        connections={[existingConnection]}
        onConnectionsChange={handleConnectionsChange}
        models={[]}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Connection 수정' }));

    const deleteButton = screen.getByRole('button', { name: '삭제' });
    await user.click(deleteButton);

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(handleConnectionsChange).toHaveBeenCalledTimes(1);
    const updatedConnections = handleConnectionsChange.mock.calls[0][0] as LLMConnection[];
    expect(updatedConnections[0].customHeaders).toEqual({});
  });
});
