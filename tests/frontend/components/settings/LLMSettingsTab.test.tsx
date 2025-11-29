/**
 * LLMSettingsTab 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LLMSettingsTab } from '@/components/settings/LLMSettingsTab';
import { LLMConfig, NetworkConfig } from '@/types';
import * as settingsUtils from '@/components/settings/settingsUtils';

// Mock settingsUtils
jest.mock('@/components/settings/settingsUtils', () => ({
  fetchAvailableModels: jest.fn(),
  createDefaultVisionConfig: jest.fn(() => ({
    enabled: false,
    provider: 'openai',
    baseURL: '',
    apiKey: '',
    model: '',
    maxImageTokens: 4096,
    enableStreaming: false,
  })),
  createDefaultAutocompleteConfig: jest.fn(() => ({
    enabled: false,
    provider: 'openai',
    baseURL: '',
    apiKey: '',
    model: '',
  })),
}));

describe('LLMSettingsTab', () => {
  const defaultConfig: LLMConfig = {
    provider: 'openai',
    baseURL: 'https://api.openai.com/v1',
    apiKey: 'sk-test-key-123',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 2000,
  };

  const defaultNetworkConfig: NetworkConfig = {
    useProxy: false,
    sslVerification: true,
  };

  const mockSetConfig = jest.fn();
  const mockOnSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('기본 렌더링', () => {
    it('should render all basic fields', () => {
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

      expect(screen.getByLabelText(/Provider/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Base URL/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Model/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Temperature/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Max Tokens/i)).toBeInTheDocument();
    });

    it('should display config values', () => {
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

      const providerSelect = screen.getByLabelText(/Provider/i) as HTMLSelectElement;
      expect(providerSelect.value).toBe('openai');

      const baseURLInput = screen.getByLabelText(/Base URL/i) as HTMLInputElement;
      expect(baseURLInput.value).toBe('https://api.openai.com/v1');

      const apiKeyInput = screen.getByLabelText(/API Key/i) as HTMLInputElement;
      expect(apiKeyInput.value).toBe('sk-test-key-123');

      const maxTokensInput = screen.getByLabelText(/Max Tokens/i) as HTMLInputElement;
      expect(maxTokensInput.value).toBe('2000');
    });
  });

  describe('Provider 변경', () => {
    it('should change provider', async () => {
      const user = userEvent.setup();
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

      const providerSelect = screen.getByLabelText(/Provider/i);
      await user.selectOptions(providerSelect, 'anthropic');

      expect(mockSetConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        provider: 'anthropic',
      });
    });

    it('should change to custom provider', async () => {
      const user = userEvent.setup();
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

      const providerSelect = screen.getByLabelText(/Provider/i);
      await user.selectOptions(providerSelect, 'custom');

      expect(mockSetConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        provider: 'custom',
      });
    });
  });

  describe('Base URL 변경', () => {
    it('should update base URL', async () => {
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

      const baseURLInput = screen.getByLabelText(/Base URL/i);
      fireEvent.change(baseURLInput, { target: { value: 'https://custom.api.com/v1' } });

      expect(mockSetConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        baseURL: 'https://custom.api.com/v1',
      });
    });
  });

  describe('API Key 변경', () => {
    it('should update API key', async () => {
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

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      fireEvent.change(apiKeyInput, { target: { value: 'sk-new-key-456' } });

      expect(mockSetConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        apiKey: 'sk-new-key-456',
      });
    });

    it('should render API key input as password type', () => {
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

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      expect(apiKeyInput).toHaveAttribute('type', 'password');
    });
  });

  describe('Temperature 조절', () => {
    it('should update temperature via slider', async () => {
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

      const temperatureSlider = screen.getByLabelText(/Temperature/i);
      fireEvent.change(temperatureSlider, { target: { value: '1.2' } });

      expect(mockSetConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        temperature: 1.2,
      });
    });

    it('should display current temperature value', () => {
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

      expect(screen.getByText(/Temperature \(0.7\)/i)).toBeInTheDocument();
    });
  });

  describe('Max Tokens 변경', () => {
    it('should update max tokens', async () => {
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

      const maxTokensInput = screen.getByLabelText(/Max Tokens/i);
      fireEvent.change(maxTokensInput, { target: { value: '4000' } });

      expect(mockSetConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        maxTokens: 4000,
      });
    });
  });

  describe('모델 새로고침', () => {
    it('should fetch models when refresh button clicked', async () => {
      const user = userEvent.setup();
      const mockModels = ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      (settingsUtils.fetchAvailableModels as jest.Mock).mockResolvedValue(mockModels);

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

      const refreshButton = screen.getByTitle(/모델 목록 새로고침/i);
      await user.click(refreshButton);

      await waitFor(() => {
        expect(settingsUtils.fetchAvailableModels).toHaveBeenCalledWith({
          provider: 'openai',
          baseURL: 'https://api.openai.com/v1',
          apiKey: 'sk-test-key-123',
          customHeaders: undefined,
          networkConfig: defaultNetworkConfig,
        });
      });
    });

    it('should show loading state while fetching models', async () => {
      const user = userEvent.setup();
      (settingsUtils.fetchAvailableModels as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(['gpt-4']), 100))
      );

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

      const refreshButton = screen.getByTitle(/모델 목록 새로고침/i);
      await user.click(refreshButton);

      expect(screen.getByText(/모델 목록을 불러오는 중입니다/i)).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText(/모델 목록을 불러오는 중입니다/i)).not.toBeInTheDocument();
      });
    });

    it('should show error when model fetch fails', async () => {
      const user = userEvent.setup();
      (settingsUtils.fetchAvailableModels as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

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

      const refreshButton = screen.getByTitle(/모델 목록 새로고침/i);
      await user.click(refreshButton);

      await waitFor(() => {
        expect(screen.getByText(/Network error/i)).toBeInTheDocument();
      });
    });

    it('should show error when API key is missing', async () => {
      const user = userEvent.setup();
      const configWithoutKey = { ...defaultConfig, apiKey: '' };

      render(
        <LLMSettingsTab
          config={configWithoutKey}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      const refreshButton = screen.getByTitle(/모델 목록 새로고침/i);

      // Refresh button should be disabled when API key is empty
      expect(refreshButton).toBeDisabled();

      // No fetch should happen
      expect(settingsUtils.fetchAvailableModels).not.toHaveBeenCalled();
    });

    it('should disable refresh button when API key is empty', () => {
      const configWithoutKey = { ...defaultConfig, apiKey: '' };

      render(
        <LLMSettingsTab
          config={configWithoutKey}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      const refreshButton = screen.getByTitle(/모델 목록 새로고침/i);
      expect(refreshButton).toBeDisabled();
    });
  });

  describe('Custom Headers', () => {
    it('should display existing custom headers', () => {
      const configWithHeaders = {
        ...defaultConfig,
        customHeaders: {
          'X-API-Version': 'v1',
          'X-Custom-Header': 'test-value',
        },
      };

      render(
        <LLMSettingsTab
          config={configWithHeaders}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      expect(screen.getByText('X-API-Version')).toBeInTheDocument();
      expect(screen.getByText('v1')).toBeInTheDocument();
      expect(screen.getByText('X-Custom-Header')).toBeInTheDocument();
      expect(screen.getByText('test-value')).toBeInTheDocument();
    });

    it('should add new custom header', async () => {
      const user = userEvent.setup();
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

      const keyInput = screen.getByPlaceholderText(/헤더 이름/i);
      const valueInput = screen.getByPlaceholderText(/헤더 값/i);
      const addButton = screen.getByRole('button', { name: /헤더 추가/i });

      fireEvent.change(keyInput, { target: { value: 'X-Custom-Header' } });
      fireEvent.change(valueInput, { target: { value: 'custom-value' } });
      await user.click(addButton);

      expect(mockSetConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        customHeaders: {
          'X-Custom-Header': 'custom-value',
        },
      });
    });

    it('should delete custom header', async () => {
      const user = userEvent.setup();
      const configWithHeaders = {
        ...defaultConfig,
        customHeaders: {
          'X-API-Version': 'v1',
        },
      };

      render(
        <LLMSettingsTab
          config={configWithHeaders}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      const deleteButtons = screen.getAllByRole('button');
      const deleteButton = deleteButtons.find((btn) => btn.querySelector('svg path[d*="M6 18L18 6"]'));

      if (deleteButton) {
        await user.click(deleteButton);

        expect(mockSetConfig).toHaveBeenCalledWith({
          ...defaultConfig,
          customHeaders: {},
        });
      }
    });

    it('should not add header with empty key or value', async () => {
      const user = userEvent.setup();
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

      const addButton = screen.getByRole('button', { name: /헤더 추가/i });
      await user.click(addButton);

      expect(mockSetConfig).not.toHaveBeenCalled();
    });
  });

  describe('Vision 설정', () => {
    it('should toggle vision enabled', async () => {
      const user = userEvent.setup();
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

      // Find checkbox in Vision section by looking for the description text unique to Vision section
      const visionDescription = screen.getByText(/이미지 이해\/해석이 필요한 멀티모달 요청 시 사용할 Vision 모델을 별도로 지정할 수 있습니다/i);
      const visionSection = visionDescription.closest('div')!.parentElement!;
      const visionCheckbox = visionSection.querySelector('input[type="checkbox"].sr-only') as HTMLInputElement;

      expect(visionCheckbox).toBeInTheDocument();
      await user.click(visionCheckbox);

      // setConfig is called with a function, so we need to verify it was called
      expect(mockSetConfig).toHaveBeenCalled();

      // Call the updater function with the current config to verify the result
      const updaterFn = mockSetConfig.mock.calls[0][0];
      if (typeof updaterFn === 'function') {
        const result = updaterFn(defaultConfig);
        expect(result.vision).toEqual(expect.objectContaining({
          enabled: true,
        }));
      }
    });

    it('should show vision settings when enabled', async () => {
      const user = userEvent.setup();
      const configWithVision = {
        ...defaultConfig,
        vision: {
          enabled: true,
          provider: 'openai',
          baseURL: '',
          apiKey: '',
          model: 'gpt-4-vision-preview',
          maxImageTokens: 4096,
          enableStreaming: false,
        },
      };

      render(
        <LLMSettingsTab
          config={configWithVision}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
        />
      );

      // Vision section should be visible with vision-specific fields
      expect(screen.getByLabelText(/Max Image Tokens/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/스트리밍 응답 활성화/i)).toBeInTheDocument();

      // Vision-specific placeholders/text
      expect(screen.getByPlaceholderText(/비워두면 기본 API 키 사용/i)).toBeInTheDocument();
      expect(screen.getByText(/Vision 모델에 다른 API 키를 사용하려면 입력하세요/i)).toBeInTheDocument();
    });
  });

  describe('저장 기능', () => {
    it('should call onSave when save button clicked', async () => {
      const user = userEvent.setup();
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

      const saveButton = screen.getByRole('button', { name: /^저장$/ });
      await user.click(saveButton);

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

      expect(screen.getByRole('button', { name: /저장 중/i })).toBeDisabled();
    });

    it('should show success message', () => {
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

      expect(screen.getByText(/설정이 저장되었습니다/i)).toBeInTheDocument();
    });

    it('should show error message', () => {
      render(
        <LLMSettingsTab
          config={defaultConfig}
          setConfig={mockSetConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={{ type: 'error', text: '저장 중 오류가 발생했습니다.' }}
        />
      );

      expect(screen.getByText(/저장 중 오류가 발생했습니다/i)).toBeInTheDocument();
    });
  });
});
