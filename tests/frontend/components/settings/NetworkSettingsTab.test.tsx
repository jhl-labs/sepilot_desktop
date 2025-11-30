/**
 * NetworkSettingsTab 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NetworkSettingsTab } from '@/components/settings/NetworkSettingsTab';
import { NetworkConfig } from '@/types';

describe('NetworkSettingsTab', () => {
  const mockSetNetworkConfig = jest.fn();
  const mockOnSave = jest.fn();

  const defaultConfig: NetworkConfig = {
    proxy: {
      enabled: false,
      mode: 'none',
    },
    ssl: {
      verify: true,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnSave.mockResolvedValue(undefined);
  });

  it('should render network settings tab', () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByText('프록시 설정')).toBeInTheDocument();
    expect(screen.getByText('SSL 인증서 검증')).toBeInTheDocument();
  });

  it('should show save button', () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const saveButton = screen.getByRole('button', { name: /저장/ });
    expect(saveButton).toBeInTheDocument();
    expect(saveButton).not.toBeDisabled();
  });

  it('should toggle proxy enabled', () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const proxyToggle = screen.getByLabelText('프록시 설정');
    fireEvent.click(proxyToggle);

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...defaultConfig,
      proxy: {
        enabled: true,
        mode: 'none',
      },
    });
  });

  it('should show proxy mode selector when proxy is enabled', () => {
    const enabledConfig: NetworkConfig = {
      proxy: {
        enabled: true,
        mode: 'none',
      },
      ssl: { verify: true },
    };

    render(
      <NetworkSettingsTab
        networkConfig={enabledConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByLabelText('프록시 모드')).toBeInTheDocument();
  });

  it('should change proxy mode', () => {
    const enabledConfig: NetworkConfig = {
      proxy: {
        enabled: true,
        mode: 'none',
      },
      ssl: { verify: true },
    };

    render(
      <NetworkSettingsTab
        networkConfig={enabledConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const modeSelect = screen.getByLabelText('프록시 모드');
    fireEvent.change(modeSelect, { target: { value: 'system' } });

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...enabledConfig,
      proxy: {
        enabled: true,
        mode: 'system',
      },
    });
  });

  it('should show proxy URL input when mode is manual', () => {
    const manualConfig: NetworkConfig = {
      proxy: {
        enabled: true,
        mode: 'manual',
        url: '',
      },
      ssl: { verify: true },
    };

    render(
      <NetworkSettingsTab
        networkConfig={manualConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByLabelText('프록시 URL')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('http://proxy.example.com:8080')).toBeInTheDocument();
  });

  it('should update proxy URL', () => {
    const manualConfig: NetworkConfig = {
      proxy: {
        enabled: true,
        mode: 'manual',
        url: '',
      },
      ssl: { verify: true },
    };

    render(
      <NetworkSettingsTab
        networkConfig={manualConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const urlInput = screen.getByLabelText('프록시 URL');
    fireEvent.change(urlInput, { target: { value: 'http://proxy.test:8080' } });

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...manualConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
        url: 'http://proxy.test:8080',
      },
    });
  });

  it('should toggle SSL verification', () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const sslToggle = screen.getByLabelText('SSL 인증서 검증');
    fireEvent.click(sslToggle);

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...defaultConfig,
      ssl: {
        verify: false,
      },
    });
  });

  it('should show security warning when SSL verification is disabled', () => {
    const noSslConfig: NetworkConfig = {
      proxy: defaultConfig.proxy,
      ssl: { verify: false },
    };

    render(
      <NetworkSettingsTab
        networkConfig={noSslConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByText(/보안 경고/)).toBeInTheDocument();
    expect(screen.getByText(/중간자 공격에 취약/)).toBeInTheDocument();
  });

  it('should call onSave when save button is clicked', async () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const saveButton = screen.getByRole('button', { name: /저장/ });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalled();
  });

  it('should disable save button when saving', () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={true}
        message={null}
      />
    );

    const saveButton = screen.getByRole('button', { name: /저장 중.../ });
    expect(saveButton).toBeDisabled();
  });

  it('should show success message', () => {
    const successMessage = { type: 'success' as const, text: '저장되었습니다.' };

    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={successMessage}
      />
    );

    expect(screen.getByText('저장되었습니다.')).toBeInTheDocument();
  });

  it('should show error message', () => {
    const errorMessage = { type: 'error' as const, text: '저장에 실패했습니다.' };

    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={errorMessage}
      />
    );

    expect(screen.getByText('저장에 실패했습니다.')).toBeInTheDocument();
  });

  it('should have correct default values', () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const proxyToggle = screen.getByLabelText('프록시 설정') as HTMLInputElement;
    const sslToggle = screen.getByLabelText('SSL 인증서 검증') as HTMLInputElement;

    expect(proxyToggle.checked).toBe(false);
    expect(sslToggle.checked).toBe(true);
  });

  it('should not show proxy URL input when mode is system', () => {
    const systemConfig: NetworkConfig = {
      proxy: {
        enabled: true,
        mode: 'system',
      },
      ssl: { verify: true },
    };

    render(
      <NetworkSettingsTab
        networkConfig={systemConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.queryByLabelText('프록시 URL')).not.toBeInTheDocument();
  });

  it('should show description text', () => {
    render(
      <NetworkSettingsTab
        networkConfig={defaultConfig}
        setNetworkConfig={mockSetNetworkConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByText(/프록시 및 SSL 인증서 검증 설정을 관리합니다/)).toBeInTheDocument();
  });
});
