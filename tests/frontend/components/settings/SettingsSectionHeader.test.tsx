/**
 * SettingsSectionHeader 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsSectionHeader } from '@/components/settings/SettingsSectionHeader';

// Mock icon component
const MockIcon = ({ className }: { className?: string }) => (
  <svg className={className} data-testid="mock-icon" />
);

describe('SettingsSectionHeader', () => {
  it('should render title correctly', () => {
    render(<SettingsSectionHeader title="Test Title" />);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test Title');
  });

  it('should render description when provided', () => {
    render(
      <SettingsSectionHeader
        title="Test Title"
        description="This is a test description"
      />
    );

    expect(screen.getByText('This is a test description')).toBeInTheDocument();
  });

  it('should not render description when not provided', () => {
    const { container } = render(<SettingsSectionHeader title="Test Title" />);

    const description = container.querySelector('.text-muted-foreground');
    expect(description).not.toBeInTheDocument();
  });

  it('should render icon when provided', () => {
    render(
      <SettingsSectionHeader
        title="Test Title"
        icon={MockIcon}
      />
    );

    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('should not render icon when not provided', () => {
    render(<SettingsSectionHeader title="Test Title" />);

    expect(screen.queryByTestId('mock-icon')).not.toBeInTheDocument();
  });

  it('should apply correct icon className when icon is provided', () => {
    render(
      <SettingsSectionHeader
        title="Test Title"
        icon={MockIcon}
      />
    );

    const icon = screen.getByTestId('mock-icon');
    expect(icon).toHaveClass('w-6', 'h-6', 'text-primary');
  });

  it('should render all elements together', () => {
    render(
      <SettingsSectionHeader
        title="Complete Title"
        description="Complete Description"
        icon={MockIcon}
      />
    );

    expect(screen.getByText('Complete Title')).toBeInTheDocument();
    expect(screen.getByText('Complete Description')).toBeInTheDocument();
    expect(screen.getByTestId('mock-icon')).toBeInTheDocument();
  });

  it('should have correct container styling', () => {
    const { container } = render(<SettingsSectionHeader title="Test Title" />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('mb-6', 'pb-4', 'border-b');
  });

  it('should have correct heading styling', () => {
    render(<SettingsSectionHeader title="Test Title" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveClass('text-2xl', 'font-semibold', 'tracking-tight');
  });

  it('should have correct description styling', () => {
    render(
      <SettingsSectionHeader
        title="Test Title"
        description="Test Description"
      />
    );

    const description = screen.getByText('Test Description');
    expect(description).toHaveClass('text-sm', 'text-muted-foreground', 'mt-1');
  });

  it('should render with empty title', () => {
    render(<SettingsSectionHeader title="" />);

    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading).toHaveTextContent('');
  });

  it('should render with very long title', () => {
    const longTitle = 'A'.repeat(100);
    render(<SettingsSectionHeader title={longTitle} />);

    expect(screen.getByText(longTitle)).toBeInTheDocument();
  });

  it('should render with very long description', () => {
    const longDescription = 'B'.repeat(200);
    render(
      <SettingsSectionHeader
        title="Test Title"
        description={longDescription}
      />
    );

    expect(screen.getByText(longDescription)).toBeInTheDocument();
  });

  it('should render with special characters in title', () => {
    const specialTitle = 'Title with <>&"\'';
    render(<SettingsSectionHeader title={specialTitle} />);

    expect(screen.getByText(specialTitle)).toBeInTheDocument();
  });

  it('should render with special characters in description', () => {
    const specialDescription = 'Description with <>&"\'';
    render(
      <SettingsSectionHeader
        title="Test Title"
        description={specialDescription}
      />
    );

    expect(screen.getByText(specialDescription)).toBeInTheDocument();
  });
});
