/**
 * Badge 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Badge } from '@/components/ui/badge';

describe('Badge', () => {
  it('should render children correctly', () => {
    render(<Badge>Test Badge</Badge>);

    expect(screen.getByText('Test Badge')).toBeInTheDocument();
  });

  it('should render with default variant', () => {
    const { container } = render(<Badge>Default</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('bg-primary', 'text-primary-foreground');
  });

  it('should render with secondary variant', () => {
    const { container } = render(<Badge variant="secondary">Secondary</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('bg-secondary', 'text-secondary-foreground');
  });

  it('should render with destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Destructive</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('bg-destructive', 'text-destructive-foreground');
  });

  it('should render with outline variant', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('text-foreground');
  });

  it('should apply base classes to all variants', () => {
    const { container } = render(<Badge>Test</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass(
      'inline-flex',
      'items-center',
      'rounded-full',
      'border',
      'px-2.5',
      'py-0.5',
      'text-xs',
      'font-semibold'
    );
  });

  it('should merge custom className with variant classes', () => {
    const { container } = render(
      <Badge className="custom-class">Test</Badge>
    );

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('custom-class');
    expect(badge).toHaveClass('bg-primary'); // default variant class
  });

  it('should pass through additional props', () => {
    const { container } = render(
      <Badge data-testid="test-badge" id="badge-id">
        Test
      </Badge>
    );

    const badge = screen.getByTestId('test-badge');
    expect(badge).toHaveAttribute('id', 'badge-id');
  });

  it('should render empty badge', () => {
    const { container } = render(<Badge />);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('inline-flex');
  });

  it('should render badge with number', () => {
    render(<Badge>99+</Badge>);

    expect(screen.getByText('99+')).toBeInTheDocument();
  });

  it('should render badge with special characters', () => {
    render(<Badge>★ Special</Badge>);

    expect(screen.getByText('★ Special')).toBeInTheDocument();
  });

  it('should handle onClick event', () => {
    const handleClick = jest.fn();
    render(<Badge onClick={handleClick}>Clickable</Badge>);

    const badge = screen.getByText('Clickable');
    badge.click();

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('should render badge with nested elements', () => {
    render(
      <Badge>
        <span>Nested</span> Content
      </Badge>
    );

    expect(screen.getByText('Nested')).toBeInTheDocument();
    expect(screen.getByText(/Content/)).toBeInTheDocument();
  });

  it('should support all variant types', () => {
    const variants = ['default', 'secondary', 'destructive', 'outline'] as const;

    variants.forEach((variant) => {
      const { container } = render(<Badge variant={variant}>{variant}</Badge>);
      const badge = container.firstChild as HTMLElement;
      expect(badge).toBeInTheDocument();
    });
  });

  it('should apply hover styles for default variant', () => {
    const { container } = render(<Badge>Hover Test</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('hover:bg-primary/80');
  });

  it('should apply hover styles for secondary variant', () => {
    const { container } = render(<Badge variant="secondary">Hover Test</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('hover:bg-secondary/80');
  });

  it('should apply hover styles for destructive variant', () => {
    const { container } = render(<Badge variant="destructive">Hover Test</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('hover:bg-destructive/80');
  });

  it('should apply focus styles', () => {
    const { container } = render(<Badge>Focus Test</Badge>);

    const badge = container.firstChild as HTMLElement;
    expect(badge).toHaveClass('focus:outline-none', 'focus:ring-2', 'focus:ring-ring');
  });
});
