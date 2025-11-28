/**
 * ThemeToggle 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { useTheme } from 'next-themes';

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(),
}));

describe('ThemeToggle', () => {
  const mockSetTheme = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render nothing before mounting (SSR hydration)', () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    const { container } = render(<ThemeToggle />);

    // Initially returns null to avoid hydration mismatch
    expect(container.firstChild).toBeNull();
  });

  it('should render moon icon in light mode after mounting', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    // Wait for mounting effect
    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    // Should show Moon icon (indicating switch to dark mode)
    expect(screen.getByTitle('다크 모드로 전환')).toBeInTheDocument();
  });

  it('should render sun icon in dark mode after mounting', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    // Should show Sun icon (indicating switch to light mode)
    expect(screen.getByTitle('라이트 모드로 전환')).toBeInTheDocument();
  });

  it('should toggle from light to dark on click', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockSetTheme).toHaveBeenCalledWith('dark');
  });

  it('should toggle from dark to light on click', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(mockSetTheme).toHaveBeenCalledWith('light');
  });

  it('should have screen reader text', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(screen.getByText('테마 전환')).toBeInTheDocument();
    });

    const srText = screen.getByText('테마 전환');
    expect(srText).toHaveClass('sr-only');
  });

  it('should render as a button with ghost variant', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    const { container } = render(<ThemeToggle />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    const button = container.querySelector('button');
    expect(button).toHaveClass('variant-ghost');
  });

  it('should display correct title attribute for light mode', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', '다크 모드로 전환');
    });
  });

  it('should display correct title attribute for dark mode', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'dark',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('title', '라이트 모드로 전환');
    });
  });

  it('should handle multiple clicks', async () => {
    (useTheme as jest.Mock).mockReturnValue({
      resolvedTheme: 'light',
      setTheme: mockSetTheme,
    });

    render(<ThemeToggle />);

    await waitFor(() => {
      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });

    const button = screen.getByRole('button');

    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledWith('dark');

    fireEvent.click(button);
    expect(mockSetTheme).toHaveBeenCalledTimes(2);
  });
});
