/**
 * LLMSettingsTab 컴포넌트 테스트 (V2 - Connection 기반)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LLMSettingsTab } from '@/components/settings/LLMSettingsTab';
import { LLMConfigV2, NetworkConfig, LLMConnection, ModelConfig } from '@/types';

// Mock child components
jest.mock('@/components/settings/SettingsSectionHeader', () => ({
  SettingsSectionHeader: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="settings-header">
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

jest.mock('@/components/settings/ConnectionManager', () => ({
  ConnectionManager: ({
    connections,
    onConnectionsChange,
  }: {
    connections: LLMConnection[];
    onConnectionsChange: (c: LLMConnection[]) => void;
  }) => (
    <div data-testid="connection-manager">
      <span>Connections: {connections.length}</span>
      <button
        onClick={() =>
          onConnectionsChange([
            ...connections,
            { id: 'new', name: 'New', provider: 'openai', baseURL: '', apiKey: '', enabled: true },
          ])
        }
      >
        Add Connection
      </button>
    </div>
  ),
}));

jest.mock('@/components/settings/ModelListView', () => ({
  ModelListView: ({
    models,
    onModelsChange,
  }: {
    models: ModelConfig[];
    onModelsChange: (m: ModelConfig[]) => void;
  }) => (
    <div data-testid="model-list-view">
      <span>Models: {models.length}</span>
      <button
        onClick={() =>
          onModelsChange([
            ...models,
            { id: 'new-model', connectionId: 'c1', modelId: 'gpt-4', tags: ['base'] },
          ])
        }
      >
        Add Model
      </button>
    </div>
  ),
}));

describe('LLMSettingsTab', () => {
  const defaultConfig: LLMConfigV2 = {
    version: 2,
    connections: [
      {
        id: 'c1',
        name: 'OpenAI',
        provider: 'openai',
        baseURL: 'https://api.openai.com/v1',
        apiKey: 'sk-test-key-123',
        enabled: true,
      },
    ],
    models: [
      {
        id: 'm1',
        connectionId: 'c1',
        modelId: 'gpt-4',
        tags: ['base'],
        temperature: 0.7,
        maxTokens: 2000,
      },
    ],
    defaultTemperature: 0.7,
    defaultMaxTokens: 4096,
    activeBaseModelId: 'm1',
  };

  const defaultNetworkConfig: NetworkConfig = {
    proxy: {
      enabled: false,
      mode: 'none',
      url: '',
    },
    ssl: {
      verify: true,
    },
    customHeaders: {},
  };

  const mockSetConfig = jest.fn();
  const mockOnSave = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('기본 렌더링', () => {
    it('should render settings header', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      expect(screen.getByTestId('settings-header')).toBeInTheDocument();
    });

    it('should render connections tab by default', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      expect(screen.getByTestId('connection-manager')).toBeInTheDocument();
      expect(screen.getByText('Connections: 1')).toBeInTheDocument();
    });

    it('should render save button', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      expect(screen.getByText('저장')).toBeInTheDocument();
    });
  });

  describe('탭 전환', () => {
    it('should switch to models tab', async () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      // Find and click the models tab button
      const modelsTab = screen.getByText('Models');
      fireEvent.click(modelsTab);

      await waitFor(() => {
        expect(screen.getByTestId('model-list-view')).toBeInTheDocument();
        expect(screen.getByText('Models: 1')).toBeInTheDocument();
      });
    });

    it('should switch back to connections tab', async () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      // Switch to models first
      fireEvent.click(screen.getByText('Models'));

      await waitFor(() => {
        expect(screen.getByTestId('model-list-view')).toBeInTheDocument();
      });

      // Switch back to connections
      fireEvent.click(screen.getByText('Connections'));

      await waitFor(() => {
        expect(screen.getByTestId('connection-manager')).toBeInTheDocument();
      });
    });
  });

  describe('저장 기능', () => {
    it('should call onSave when save button is clicked', async () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      const saveButton = screen.getByText('저장');
      fireEvent.click(saveButton);

      expect(mockOnSave).toHaveBeenCalled();
    });

    it('should show saving state', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={true}
          message={null}
        />
      );

      expect(screen.getByText('저장 중...')).toBeInTheDocument();
    });

    it('should disable save button while saving', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={true}
          message={null}
        />
      );

      const saveButton = screen.getByText('저장 중...');
      expect(saveButton.closest('button')).toBeDisabled();
    });
  });

  describe('메시지 표시', () => {
    it('should display success message', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={{ type: 'success', text: '설정이 저장되었습니다.' }}
        />
      );

      expect(screen.getByText('설정이 저장되었습니다.')).toBeInTheDocument();
    });

    it('should display error message', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={{ type: 'error', text: '저장에 실패했습니다.' }}
        />
      );

      expect(screen.getByText('저장에 실패했습니다.')).toBeInTheDocument();
    });

    it('should not display message when null', () => {
      const { container } = render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      expect(container.querySelector('.bg-green-500\\/10')).not.toBeInTheDocument();
      expect(container.querySelector('.bg-destructive\\/10')).not.toBeInTheDocument();
    });
  });

  describe('Config 업데이트', () => {
    it('should update connections via ConnectionManager', async () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      const addButton = screen.getByText('Add Connection');
      fireEvent.click(addButton);

      expect(mockSetConfig).toHaveBeenCalled();
    });

    it('should update models via ModelListView', async () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      // Switch to models tab
      fireEvent.click(screen.getByText('Models'));

      await waitFor(() => {
        const addButton = screen.getByText('Add Model');
        fireEvent.click(addButton);
      });

      expect(mockSetConfig).toHaveBeenCalled();
    });
  });

  describe('빈 설정', () => {
    it('should render with empty connections and models', () => {
      const emptyConfig: LLMConfigV2 = {
        version: 2,
        connections: [],
        models: [],
        defaultTemperature: 0.7,
        defaultMaxTokens: 4096,
      };

      render(
        <LLMSettingsTab
          config={emptyConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      expect(screen.getByText('Connections: 0')).toBeInTheDocument();
    });
  });
});
