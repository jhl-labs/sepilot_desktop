/**
 * Switch 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { Switch } from '@/components/ui/switch';

describe('Switch', () => {
  it('should render switch button', () => {
    render(<Switch />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toBeInTheDocument();
  });

  it('should be unchecked by default', () => {
    render(<Switch />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toHaveAttribute('data-state', 'unchecked');
  });

  it('should render checked when checked prop is true', () => {
    render(<Switch checked={true} onCheckedChange={() => {}} />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toHaveAttribute('data-state', 'checked');
  });

  it('should call onCheckedChange when clicked', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(<Switch onCheckedChange={handleChange} />);

    const switchButton = screen.getByRole('switch');
    await user.click(switchButton);

    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it('should toggle state when clicked multiple times', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(<Switch onCheckedChange={handleChange} />);

    const switchButton = screen.getByRole('switch');

    await user.click(switchButton);
    expect(handleChange).toHaveBeenCalledWith(true);

    await user.click(switchButton);
    expect(handleChange).toHaveBeenCalledWith(false);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<Switch disabled />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toBeDisabled();
  });

  it('should not call onCheckedChange when disabled', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(<Switch disabled onCheckedChange={handleChange} />);

    const switchButton = screen.getByRole('switch');
    await user.click(switchButton);

    expect(handleChange).not.toHaveBeenCalled();
  });

  it('should apply custom className', () => {
    render(<Switch className="custom-switch" />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toHaveClass('custom-switch');
  });

  it('should apply base styles', () => {
    render(<Switch />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toHaveClass(
      'peer',
      'inline-flex',
      'h-5',
      'w-9',
      'shrink-0',
      'cursor-pointer',
      'items-center',
      'rounded-full'
    );
  });

  it('should apply disabled cursor when disabled', () => {
    render(<Switch disabled />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toHaveClass('disabled:cursor-not-allowed', 'disabled:opacity-50');
  });

  it('should have correct focus styles', () => {
    render(<Switch />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toHaveClass(
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring'
    );
  });

  it('should support controlled component pattern', async () => {
    const user = userEvent.setup();
    const ControlledSwitch = () => {
      const [checked, setChecked] = React.useState(false);
      return (
        <div>
          <Switch checked={checked} onCheckedChange={setChecked} />
          <span>{checked ? 'ON' : 'OFF'}</span>
        </div>
      );
    };

    render(<ControlledSwitch />);

    expect(screen.getByText('OFF')).toBeInTheDocument();

    const switchButton = screen.getByRole('switch');
    await user.click(switchButton);

    expect(screen.getByText('ON')).toBeInTheDocument();
  });

  it('should pass through additional props', () => {
    render(<Switch data-testid="test-switch" id="switch-id" />);

    const switchButton = screen.getByTestId('test-switch');
    expect(switchButton).toHaveAttribute('id', 'switch-id');
  });

  it('should have proper aria attributes', () => {
    render(<Switch aria-label="Toggle setting" />);

    const switchButton = screen.getByRole('switch');
    expect(switchButton).toHaveAttribute('aria-label', 'Toggle setting');
  });

  it('should handle keyboard interaction (Space)', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(<Switch onCheckedChange={handleChange} />);

    const switchButton = screen.getByRole('switch');
    switchButton.focus();
    await user.keyboard(' ');

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('should handle keyboard interaction (Enter)', async () => {
    const user = userEvent.setup();
    const handleChange = jest.fn();

    render(<Switch onCheckedChange={handleChange} />);

    const switchButton = screen.getByRole('switch');
    switchButton.focus();
    await user.keyboard('{Enter}');

    expect(handleChange).toHaveBeenCalledTimes(1);
  });

  it('should render thumb element', () => {
    const { container } = render(<Switch />);

    // Radix UI renders a thumb inside the switch
    const switchButton = container.querySelector('[role="switch"]');
    expect(switchButton).toBeInTheDocument();
    expect(switchButton?.children.length).toBeGreaterThan(0);
  });

  it('should support ref forwarding', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Switch ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
