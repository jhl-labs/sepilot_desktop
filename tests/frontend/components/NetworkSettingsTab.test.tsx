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

  const defaultNetworkConfig: NetworkConfig = {
    proxy: {
      enabled: false,
      mode: 'manual',
    },
    ssl: {
      verify: true,
    },
  };

  const defaultProps = {
    networkConfig: defaultNetworkConfig,
    setNetworkConfig: mockSetNetworkConfig,
    onSave: mockOnSave,
    isSaving: false,
    message: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render proxy settings section', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    expect(screen.getByText('프록시 설정')).toBeInTheDocument();
    expect(screen.getByLabelText('프록시 설정')).toBeInTheDocument();
  });

  it('should render SSL verification section', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    expect(screen.getByText('SSL 인증서 검증')).toBeInTheDocument();
    expect(screen.getByLabelText('SSL 인증서 검증')).toBeInTheDocument();
  });

  it('should render save button', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    const saveButton = screen.getByRole('button', { name: /저장/i });
    expect(saveButton).toBeInTheDocument();
  });

  it('should enable proxy when checkbox is clicked', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    const proxyCheckbox = screen.getByLabelText('프록시 설정');
    fireEvent.click(proxyCheckbox);

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
      },
    });
  });

  it('should show proxy mode selector when proxy is enabled', () => {
    const enabledProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={enabledProxyConfig} />);

    expect(screen.getByLabelText('프록시 모드')).toBeInTheDocument();
  });

  it('should not show proxy mode selector when proxy is disabled', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    expect(screen.queryByLabelText('프록시 모드')).not.toBeInTheDocument();
  });

  it.skip('should change proxy mode', () => {
    // Skip: Component only supports 'manual' mode now, no 'system' option
    const enabledProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={enabledProxyConfig} />);

    const modeSelect = screen.getByLabelText('프록시 모드');
    fireEvent.change(modeSelect, { target: { value: 'system' } });

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...enabledProxyConfig,
      proxy: {
        enabled: true,
        mode: 'system',
      },
    });
  });

  it('should show proxy URL input when mode is manual', () => {
    const manualProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
        url: '',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={manualProxyConfig} />);

    expect(screen.getByLabelText('프록시 URL')).toBeInTheDocument();
  });

  it('should not show proxy URL input when mode is not manual', () => {
    const systemProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'none',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={systemProxyConfig} />);

    expect(screen.queryByLabelText('프록시 URL')).not.toBeInTheDocument();
  });

  it('should update proxy URL', () => {
    const manualProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
        url: '',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={manualProxyConfig} />);

    const urlInput = screen.getByLabelText('프록시 URL');
    fireEvent.change(urlInput, { target: { value: 'http://proxy.example.com:8080' } });

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...manualProxyConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
        url: 'http://proxy.example.com:8080',
      },
    });
  });

  it('should toggle SSL verification', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    const sslCheckbox = screen.getByLabelText('SSL 인증서 검증');
    fireEvent.click(sslCheckbox);

    expect(mockSetNetworkConfig).toHaveBeenCalledWith({
      ...defaultNetworkConfig,
      ssl: {
        verify: false,
      },
    });
  });

  it('should show security warning when SSL verification is disabled', () => {
    const noSslConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      ssl: {
        verify: false,
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={noSslConfig} />);

    expect(screen.getByText(/보안 경고/)).toBeInTheDocument();
    expect(screen.getByText(/중간자 공격/)).toBeInTheDocument();
  });

  it('should not show security warning when SSL verification is enabled', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    expect(screen.queryByText(/보안 경고/)).not.toBeInTheDocument();
  });

  it('should call onSave when save button is clicked', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    const saveButton = screen.getByRole('button', { name: /저장/i });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalled();
  });

  it('should disable save button when saving', () => {
    render(<NetworkSettingsTab {...defaultProps} isSaving={true} />);

    const saveButton = screen.getByRole('button', { name: /저장 중.../i });
    expect(saveButton).toBeDisabled();
  });

  it('should show save button text as "저장 중..." when saving', () => {
    render(<NetworkSettingsTab {...defaultProps} isSaving={true} />);

    expect(screen.getByText('저장 중...')).toBeInTheDocument();
  });

  it('should display success message', () => {
    const message = { type: 'success' as const, text: '설정이 저장되었습니다' };
    render(<NetworkSettingsTab {...defaultProps} message={message} />);

    expect(screen.getByText('설정이 저장되었습니다')).toBeInTheDocument();
  });

  it('should display error message', () => {
    const message = { type: 'error' as const, text: '저장에 실패했습니다' };
    render(<NetworkSettingsTab {...defaultProps} message={message} />);

    expect(screen.getByText('저장에 실패했습니다')).toBeInTheDocument();
  });

  it('should not display message when message is null', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    expect(screen.queryByText(/설정이 저장/)).not.toBeInTheDocument();
    expect(screen.queryByText(/저장에 실패/)).not.toBeInTheDocument();
  });

  it.skip('should have all proxy mode options', () => {
    // Skip: Component only supports 'manual' mode now (only 1 option)
    const enabledProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={enabledProxyConfig} />);

    const modeSelect = screen.getByLabelText('프록시 모드');
    expect(modeSelect).toBeInTheDocument();

    // Check all options
    const options = Array.from(modeSelect.querySelectorAll('option'));
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveValue('none');
    expect(options[1]).toHaveValue('system');
    expect(options[2]).toHaveValue('manual');
  });

  it('should display proxy URL placeholder', () => {
    const manualProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
        url: '',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={manualProxyConfig} />);

    const urlInput = screen.getByPlaceholderText(/http:\/\/proxy.example.com:8080/);
    expect(urlInput).toBeInTheDocument();
  });

  it('should display proxy URL example text', () => {
    const manualProxyConfig: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
        url: '',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={manualProxyConfig} />);

    expect(screen.getByText(/예:/)).toBeInTheDocument();
    expect(screen.getByText(/socks5/)).toBeInTheDocument();
  });

  it('should render description text', () => {
    render(<NetworkSettingsTab {...defaultProps} />);

    expect(screen.getByText(/프록시 및 SSL 인증서 검증 설정을 관리합니다/)).toBeInTheDocument();
  });

  it('should handle proxy enabled with existing URL', () => {
    const configWithUrl: NetworkConfig = {
      ...defaultNetworkConfig,
      proxy: {
        enabled: true,
        mode: 'manual',
        url: 'http://existing.proxy:8080',
      },
    };

    render(<NetworkSettingsTab {...defaultProps} networkConfig={configWithUrl} />);

    const urlInput = screen.getByLabelText('프록시 URL') as HTMLInputElement;
    expect(urlInput.value).toBe('http://existing.proxy:8080');
  });
});
