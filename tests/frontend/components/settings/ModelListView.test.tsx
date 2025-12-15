import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelListView } from '@/components/settings/ModelListView';
import { LLMConnection, ModelConfig, NetworkConfig } from '@/types';

const defaultNetworkConfig: NetworkConfig = {
  proxy: { enabled: false, mode: 'none' },
  ssl: { verify: true },
  customHeaders: {},
};

const baseConnection: LLMConnection = {
  id: 'conn-1',
  name: 'Main Connection',
  provider: 'openai',
  baseURL: 'https://api.openai.com/v1',
  apiKey: 'sk-test-key-1234567890',
  enabled: true,
  customHeaders: {
    'X-Conn-Header': 'conn-value',
    'X-Shared': 'conn-shared',
  },
};

describe('ModelListView - custom headers', () => {
  it('Connection 헤더를 표시하고 모델에서 덮어쓸 수 있다', async () => {
    const user = userEvent.setup();
    const handleModelsChange = jest.fn();

    const models: ModelConfig[] = [
      {
        id: 'model-1',
        connectionId: baseConnection.id,
        modelId: 'gpt-4o',
        tags: ['base'],
      },
    ];

    render(
      <ModelListView
        connections={[baseConnection]}
        models={models}
        onModelsChange={handleModelsChange}
        activeBaseModelId={undefined}
        activeVisionModelId={undefined}
        activeAutocompleteModelId={undefined}
        onActiveModelsChange={jest.fn()}
        networkConfig={defaultNetworkConfig}
        defaultTemperature={0.7}
        defaultMaxTokens={2000}
      />
    );

    await user.click(screen.getByRole('button', { name: /gpt-4o/i }));

    expect(screen.getByText('상속되는 헤더')).toBeInTheDocument();
    expect(screen.getByText('X-Shared')).toBeInTheDocument();
    expect(screen.getByText('conn-shared')).toBeInTheDocument();

    const keyInput = screen.getByPlaceholderText('헤더 이름');
    const valueInput = screen.getByPlaceholderText('헤더 값');

    fireEvent.change(keyInput, { target: { value: 'X-Shared' } });
    fireEvent.change(valueInput, { target: { value: 'model-override' } });
    await user.click(screen.getByRole('button', { name: '헤더 추가' }));

    expect(handleModelsChange).toHaveBeenCalled();
    const updatedModels = handleModelsChange.mock.calls[
      handleModelsChange.mock.calls.length - 1
    ][0] as ModelConfig[];
    expect(updatedModels[0].customHeaders).toEqual({
      'X-Shared': 'model-override',
    });
  });

  it('모델 전용 헤더를 제거하면 상속된 헤더로 복원된다', async () => {
    const user = userEvent.setup();
    const handleModelsChange = jest.fn();

    const models: ModelConfig[] = [
      {
        id: 'model-1',
        connectionId: baseConnection.id,
        modelId: 'gpt-4o',
        tags: ['base'],
        customHeaders: {
          'X-Shared': 'model-override',
          'X-Only-Model': 'model-only',
        },
      },
    ];

    render(
      <ModelListView
        connections={[baseConnection]}
        models={models}
        onModelsChange={handleModelsChange}
        activeBaseModelId={undefined}
        activeVisionModelId={undefined}
        activeAutocompleteModelId={undefined}
        onActiveModelsChange={jest.fn()}
        networkConfig={defaultNetworkConfig}
        defaultTemperature={0.7}
        defaultMaxTokens={2000}
      />
    );

    await user.click(screen.getByRole('button', { name: /gpt-4o/i }));

    const modelHeaderSection = screen.getByText('모델 전용 헤더').closest('div');
    expect(modelHeaderSection).toBeTruthy();

    const headerRow = modelHeaderSection
      ? within(modelHeaderSection).getByText('X-Shared').closest('div')
      : null;
    expect(headerRow).toBeTruthy();

    if (headerRow) {
      const deleteButton = within(headerRow).getByRole('button', { name: '삭제' });
      await user.click(deleteButton);
    }

    expect(handleModelsChange).toHaveBeenCalled();
    const updatedModels = handleModelsChange.mock.calls[
      handleModelsChange.mock.calls.length - 1
    ][0] as ModelConfig[];
    expect(updatedModels[0].customHeaders).toEqual({
      'X-Only-Model': 'model-only',
    });
  });
});
