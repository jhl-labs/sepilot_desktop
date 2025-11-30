/**
 * ComfyUISettingsTab 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComfyUISettingsTab } from '@/components/settings/ComfyUISettingsTab';
import { ComfyUIConfig, NetworkConfig } from '@/types';
import { enableElectronMode, mockElectronAPI, disableElectronMode } from '../../../setup';

describe('ComfyUISettingsTab', () => {
  const defaultConfig: ComfyUIConfig = {
    enabled: true,
    httpUrl: 'http://127.0.0.1:8188',
    wsUrl: 'ws://127.0.0.1:8188/ws',
    workflowId: 'workflow.json',
    clientId: 'test-client',
    apiKey: 'test-key',
    seed: -1,
    steps: 30,
    cfgScale: 7,
    positivePrompt: 'beautiful landscape',
    negativePrompt: 'ugly, bad',
  };

  const defaultNetworkConfig: NetworkConfig = {
    useProxy: false,
    sslVerification: true,
  };

  const mockSetComfyConfig = jest.fn();
  const mockOnSave = jest.fn();
  const mockSetMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    disableElectronMode();
  });

  describe('기본 렌더링', () => {
    it('should render all form fields', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      expect(screen.getByLabelText(/HTTP Endpoint/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/WebSocket Endpoint/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/기본 워크플로우 ID 또는 파일/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Client ID/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/API Key/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Seed/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Steps/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/CFG Scale/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/기본 프롬프트/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/네거티브 프롬프트/i)).toBeInTheDocument();
    });

    it('should display config values', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      expect(screen.getByLabelText(/HTTP Endpoint/i)).toHaveValue('http://127.0.0.1:8188');
      expect(screen.getByLabelText(/WebSocket Endpoint/i)).toHaveValue('ws://127.0.0.1:8188/ws');
      expect(screen.getByLabelText(/기본 워크플로우 ID 또는 파일/i)).toHaveValue('workflow.json');
      expect(screen.getByLabelText(/Client ID/i)).toHaveValue('test-client');
      expect(screen.getByLabelText(/Seed/i)).toHaveValue(-1);
      expect(screen.getByLabelText(/Steps/i)).toHaveValue(30);
      expect(screen.getByLabelText(/CFG Scale/i)).toHaveValue(7);
    });
  });

  describe('ComfyUI 활성화 토글', () => {
    it('should toggle ComfyUI enabled state', async () => {
      const user = userEvent.setup();
      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, enabled: false }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const toggle = screen.getByRole('checkbox');
      await user.click(toggle);

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        enabled: true,
      });
    });

    it('should disable inputs when ComfyUI is disabled', () => {
      const { container } = render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, enabled: false }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const disabledSection = container.querySelector('.pointer-events-none');
      expect(disabledSection).toBeInTheDocument();
    });

    it('should show helper text when disabled', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, enabled: false }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      expect(
        screen.getByText(/토글을 활성화하면 아래 설정을 편집할 수 있습니다/i)
      ).toBeInTheDocument();
    });
  });

  describe('입력 필드 변경', () => {
    it('should update HTTP URL', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const httpInput = screen.getByLabelText(/HTTP Endpoint/i);
      fireEvent.change(httpInput, { target: { value: 'http://localhost:9000' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        httpUrl: 'http://localhost:9000',
      });
    });

    it('should update WebSocket URL', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const wsInput = screen.getByLabelText(/WebSocket Endpoint/i);
      fireEvent.change(wsInput, { target: { value: 'ws://localhost:9000/ws' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        wsUrl: 'ws://localhost:9000/ws',
      });
    });

    it('should update workflow ID', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const workflowInput = screen.getByLabelText(/기본 워크플로우 ID 또는 파일/i);
      fireEvent.change(workflowInput, { target: { value: 'new-workflow.json' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        workflowId: 'new-workflow.json',
      });
    });

    it('should update client ID', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const clientIdInput = screen.getByLabelText(/Client ID/i);
      fireEvent.change(clientIdInput, { target: { value: 'new-client-id' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        clientId: 'new-client-id',
      });
    });

    it('should update API key', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      fireEvent.change(apiKeyInput, { target: { value: 'new-api-key' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        apiKey: 'new-api-key',
      });
    });

    it('should render API key as password field', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const apiKeyInput = screen.getByLabelText(/API Key/i);
      expect(apiKeyInput).toHaveAttribute('type', 'password');
    });

    it('should update seed', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const seedInput = screen.getByLabelText(/Seed/i);
      fireEvent.change(seedInput, { target: { value: '12345' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        seed: 12345,
      });
    });

    it('should handle invalid seed', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const seedInput = screen.getByLabelText(/Seed/i);
      fireEvent.change(seedInput, { target: { value: 'invalid' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        seed: undefined,
      });
    });

    it('should update steps', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const stepsInput = screen.getByLabelText(/Steps/i);
      fireEvent.change(stepsInput, { target: { value: '50' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        steps: 50,
      });
    });

    it('should handle invalid steps', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const stepsInput = screen.getByLabelText(/Steps/i);
      fireEvent.change(stepsInput, { target: { value: 'abc' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        steps: undefined,
      });
    });

    it('should update CFG scale', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const cfgInput = screen.getByLabelText(/CFG Scale/i);
      fireEvent.change(cfgInput, { target: { value: '9.5' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        cfgScale: 9.5,
      });
    });

    it('should handle invalid CFG scale', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const cfgInput = screen.getByLabelText(/CFG Scale/i);
      fireEvent.change(cfgInput, { target: { value: 'xyz' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        cfgScale: undefined,
      });
    });

    it('should update positive prompt', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const positiveInput = screen.getByLabelText(/기본 프롬프트/i);
      fireEvent.change(positiveInput, { target: { value: 'new positive prompt' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        positivePrompt: 'new positive prompt',
      });
    });

    it('should update negative prompt', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const negativeInput = screen.getByLabelText(/네거티브 프롬프트/i);
      fireEvent.change(negativeInput, { target: { value: 'new negative prompt' } });

      expect(mockSetComfyConfig).toHaveBeenCalledWith({
        ...defaultConfig,
        negativePrompt: 'new negative prompt',
      });
    });
  });

  describe('연결 테스트', () => {
    it('should test connection in Electron mode', async () => {
      const user = userEvent.setup();
      enableElectronMode();
      mockElectronAPI.comfyui.testConnection.mockResolvedValue({
        success: true,
      });

      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockElectronAPI.comfyui.testConnection).toHaveBeenCalledWith(
          'http://127.0.0.1:8188',
          'test-key',
          { useProxy: false, sslVerification: true }
        );
        expect(mockSetMessage).toHaveBeenCalledWith({
          type: 'success',
          text: 'ComfyUI 서버와 연결되었습니다.',
        });
      });
    });

    it('should show error when connection fails in Electron mode', async () => {
      const user = userEvent.setup();
      enableElectronMode();
      mockElectronAPI.comfyui.testConnection.mockResolvedValue({
        success: false,
        error: 'Connection refused',
      });

      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockSetMessage).toHaveBeenCalledWith({
          type: 'error',
          text: 'Connection refused',
        });
      });
    });

    it('should show error when HTTP URL is empty', async () => {
      const user = userEvent.setup();
      enableElectronMode();

      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, httpUrl: '' }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });

      // Button should be disabled when httpUrl is empty
      expect(testButton).toBeDisabled();
    });

    it('should disable test button when ComfyUI is disabled', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, enabled: false }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      expect(testButton).toBeDisabled();
    });

    it('should show loading state while testing', async () => {
      const user = userEvent.setup();
      enableElectronMode();

      // Create a promise we can control
      let resolveTest: any;
      const testPromise = new Promise((resolve) => {
        resolveTest = resolve;
      });
      mockElectronAPI.comfyui.testConnection.mockReturnValue(testPromise);

      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      // Should show loading text
      expect(screen.getByRole('button', { name: /테스트 중.../i })).toBeInTheDocument();

      // Resolve the promise
      resolveTest({ success: true });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /연결 테스트/i })).toBeInTheDocument();
      });
    });
  });

  describe('저장 기능', () => {
    it('should call onSave when save button clicked', async () => {
      const user = userEvent.setup();
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^저장$/i });
      await user.click(saveButton);

      expect(mockOnSave).toHaveBeenCalled();
    });

    it('should show saving state', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={true}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      expect(screen.getByRole('button', { name: /저장 중.../i })).toBeInTheDocument();
    });

    it('should disable save button when ComfyUI is enabled but httpUrl is empty', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, httpUrl: '' }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^저장$/i });
      expect(saveButton).toBeDisabled();
    });

    it('should enable save button when ComfyUI is disabled', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, enabled: false, httpUrl: '' }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const saveButton = screen.getByRole('button', { name: /^저장$/i });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe('메시지 표시', () => {
    it('should show success message', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={{ type: 'success', text: 'Settings saved successfully' }}
          setMessage={mockSetMessage}
        />
      );

      const message = screen.getByText('Settings saved successfully');
      expect(message).toBeInTheDocument();
      expect(message.className).toContain('text-green-500');
    });

    it('should show error message', () => {
      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={{ type: 'error', text: 'Connection failed' }}
          setMessage={mockSetMessage}
        />
      );

      const message = screen.getByText('Connection failed');
      expect(message).toBeInTheDocument();
      expect(message.className).toContain('text-destructive');
    });
  });

  describe('브라우저 환경에서의 연결 테스트', () => {
    const originalFetch = global.fetch;

    beforeEach(() => {
      // Ensure Electron mode is disabled
      disableElectronMode();
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should test connection using fetch in browser mode', async () => {
      const user = userEvent.setup();
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8188/system_stats', {
          headers: {
            Authorization: 'Bearer test-key',
          },
        });
        expect(mockSetMessage).toHaveBeenCalledWith({
          type: 'success',
          text: 'ComfyUI 서버와 연결되었습니다.',
        });
      });
    });

    it('should test connection without API key in browser mode', async () => {
      const user = userEvent.setup();
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, apiKey: '' }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8188/system_stats', {
          headers: undefined,
        });
        expect(mockSetMessage).toHaveBeenCalledWith({
          type: 'success',
          text: 'ComfyUI 서버와 연결되었습니다.',
        });
      });
    });

    it('should handle HTTP error in browser mode', async () => {
      const user = userEvent.setup();
      const mockFetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });
      global.fetch = mockFetch;

      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockSetMessage).toHaveBeenCalledWith({
          type: 'error',
          text: 'ComfyUI 서버 응답이 올바르지 않습니다. (HTTP 404)',
        });
      });
    });

    it('should normalize URL by removing trailing slash in browser mode', async () => {
      const user = userEvent.setup();
      const mockFetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      global.fetch = mockFetch;

      render(
        <ComfyUISettingsTab
          comfyConfig={{ ...defaultConfig, httpUrl: 'http://127.0.0.1:8188/' }}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('http://127.0.0.1:8188/system_stats', {
          headers: {
            Authorization: 'Bearer test-key',
          },
        });
      });
    });

    it('should handle network error in browser mode', async () => {
      const user = userEvent.setup();
      const mockFetch = jest.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      render(
        <ComfyUISettingsTab
          comfyConfig={defaultConfig}
          setComfyConfig={mockSetComfyConfig}
          networkConfig={defaultNetworkConfig}
          onSave={mockOnSave}
          isSaving={false}
          message={null}
          setMessage={mockSetMessage}
        />
      );

      const testButton = screen.getByRole('button', { name: /연결 테스트/i });
      await user.click(testButton);

      await waitFor(() => {
        expect(mockSetMessage).toHaveBeenCalledWith({
          type: 'error',
          text: 'Network error',
        });
      });
    });
  });
});
