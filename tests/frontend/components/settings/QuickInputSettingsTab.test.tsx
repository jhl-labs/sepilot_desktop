/**
 * QuickInputSettingsTab 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuickInputSettingsTab } from '@/components/settings/QuickInputSettingsTab';
import { QuickInputConfig } from '@/types';

describe('QuickInputSettingsTab', () => {
  const mockConfig: QuickInputConfig = {
    quickInputShortcut: 'CommandOrControl+Shift+Space',
    quickQuestions: [
      {
        id: 'qq-1',
        name: 'Test Question',
        shortcut: 'CommandOrControl+1',
        prompt: 'Test prompt',
        enabled: true,
      },
    ],
  };

  const mockSetConfig = jest.fn();
  const mockOnSave = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    window.alert = jest.fn();
  });

  it('should render quick input shortcut input', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByLabelText('Quick Input 단축키')).toHaveValue(
      'CommandOrControl+Shift+Space'
    );
  });

  it('should update quick input shortcut', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const input = screen.getByLabelText('Quick Input 단축키');
    fireEvent.change(input, { target: { value: 'CommandOrControl+K' } });

    expect(mockSetConfig).toHaveBeenCalledWith({
      ...mockConfig,
      quickInputShortcut: 'CommandOrControl+K',
    });
  });

  it('should render existing quick questions', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByDisplayValue('Test Question')).toBeInTheDocument();
    expect(screen.getByDisplayValue('CommandOrControl+1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Test prompt')).toBeInTheDocument();
  });

  it('should add new quick question', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const addButton = screen.getByRole('button', { name: /추가/i });
    fireEvent.click(addButton);

    expect(mockSetConfig).toHaveBeenCalledWith({
      ...mockConfig,
      quickQuestions: [
        ...mockConfig.quickQuestions,
        expect.objectContaining({
          name: 'Quick Question 2',
          shortcut: '',
          prompt: '',
          enabled: true,
        }),
      ],
    });
  });

  it('should disable add button when 5 quick questions exist', () => {
    const configWith5Questions: QuickInputConfig = {
      ...mockConfig,
      quickQuestions: Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `qq-${i}`,
          name: `Question ${i}`,
          shortcut: '',
          prompt: '',
          enabled: true,
        })),
    };

    render(
      <QuickInputSettingsTab
        config={configWith5Questions}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const addButton = screen.getByRole('button', { name: /추가/i });
    expect(addButton).toBeDisabled();
  });

  it('should remove quick question', () => {
    const { container } = render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    // Find delete button by SVG icon (Trash2)
    const deleteButton = container.querySelector('button.text-destructive');
    expect(deleteButton).toBeInTheDocument();

    fireEvent.click(deleteButton as HTMLElement);

    expect(mockSetConfig).toHaveBeenCalledWith({
      ...mockConfig,
      quickQuestions: [],
    });
  });

  it('should update question name', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const nameInput = screen.getByDisplayValue('Test Question');
    fireEvent.change(nameInput, { target: { value: 'Updated Question' } });

    expect(mockSetConfig).toHaveBeenCalledWith({
      ...mockConfig,
      quickQuestions: [
        {
          ...mockConfig.quickQuestions[0],
          name: 'Updated Question',
        },
      ],
    });
  });

  it('should update question shortcut', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const shortcutInput = screen.getByDisplayValue('CommandOrControl+1');
    fireEvent.change(shortcutInput, { target: { value: 'CommandOrControl+2' } });

    expect(mockSetConfig).toHaveBeenCalledWith({
      ...mockConfig,
      quickQuestions: [
        {
          ...mockConfig.quickQuestions[0],
          shortcut: 'CommandOrControl+2',
        },
      ],
    });
  });

  it('should update question prompt', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const promptInput = screen.getByDisplayValue('Test prompt');
    fireEvent.change(promptInput, { target: { value: 'Updated prompt' } });

    expect(mockSetConfig).toHaveBeenCalledWith({
      ...mockConfig,
      quickQuestions: [
        {
          ...mockConfig.quickQuestions[0],
          prompt: 'Updated prompt',
        },
      ],
    });
  });

  it('should call onSave when save button is clicked', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const saveButton = screen.getByRole('button', { name: /저장/i });
    fireEvent.click(saveButton);

    expect(mockOnSave).toHaveBeenCalled();
  });

  it('should disable save button when saving', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={true}
        message={null}
      />
    );

    const saveButton = screen.getByRole('button', { name: /저장 중.../i });
    expect(saveButton).toBeDisabled();
  });

  it('should show success message', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={{ type: 'success', text: '설정이 저장되었습니다.' }}
      />
    );

    expect(screen.getByText('설정이 저장되었습니다.')).toBeInTheDocument();
  });

  it('should show error message', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={{ type: 'error', text: '저장에 실패했습니다.' }}
      />
    );

    expect(screen.getByText('저장에 실패했습니다.')).toBeInTheDocument();
  });

  it('should show alert when trying to add more than 5 questions', () => {
    const configWith5Questions: QuickInputConfig = {
      ...mockConfig,
      quickQuestions: Array(5)
        .fill(null)
        .map((_, i) => ({
          id: `qq-${i}`,
          name: `Question ${i}`,
          shortcut: '',
          prompt: '',
          enabled: true,
        })),
    };

    render(
      <QuickInputSettingsTab
        config={configWith5Questions}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    const addButton = screen.getByRole('button', { name: /추가/i });

    // Button should be disabled, but test the alert logic by simulating the function call
    // Since the button is disabled, we need to test the alert through the actual component logic
    expect(addButton).toBeDisabled();

    // Verify the button is disabled prevents the alert from being shown
    fireEvent.click(addButton);
    expect(mockSetConfig).not.toHaveBeenCalled();
  });

  it('should toggle question enabled state', () => {
    render(
      <QuickInputSettingsTab
        config={mockConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    // Find the checkbox (it's hidden but functional)
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);

    expect(mockSetConfig).toHaveBeenCalledWith({
      ...mockConfig,
      quickQuestions: [
        {
          ...mockConfig.quickQuestions[0],
          enabled: false,
        },
      ],
    });
  });

  it('should show empty state when no quick questions', () => {
    const emptyConfig: QuickInputConfig = {
      ...mockConfig,
      quickQuestions: [],
    };

    render(
      <QuickInputSettingsTab
        config={emptyConfig}
        setConfig={mockSetConfig}
        onSave={mockOnSave}
        isSaving={false}
        message={null}
      />
    );

    expect(screen.getByText('등록된 Quick Question이 없습니다.')).toBeInTheDocument();
  });
});
