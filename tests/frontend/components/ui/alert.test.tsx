/**
 * Alert 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';

describe('Alert Components', () => {
  describe('Alert', () => {
    it('should render children', () => {
      render(<Alert>Alert Content</Alert>);

      expect(screen.getByText('Alert Content')).toBeInTheDocument();
    });

    it('should have role="alert"', () => {
      render(<Alert>Alert</Alert>);

      const alert = screen.getByRole('alert');
      expect(alert).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(<Alert className="custom-class">Content</Alert>);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('custom-class');
    });

    it('should apply default variant styles', () => {
      render(<Alert>Content</Alert>);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-background');
      expect(alert).toHaveClass('text-foreground');
    });

    it('should apply destructive variant styles', () => {
      render(<Alert variant="destructive">Content</Alert>);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-destructive/50');
      expect(alert).toHaveClass('text-destructive');
    });

    it('should apply base styles', () => {
      render(<Alert>Content</Alert>);

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('relative');
      expect(alert).toHaveClass('w-full');
      expect(alert).toHaveClass('rounded-lg');
      expect(alert).toHaveClass('border');
      expect(alert).toHaveClass('p-4');
    });
  });

  describe('AlertTitle', () => {
    it('should render children', () => {
      render(<AlertTitle>Title</AlertTitle>);

      expect(screen.getByText('Title')).toBeInTheDocument();
    });

    it('should render as h5 element', () => {
      render(<AlertTitle>Title</AlertTitle>);

      const title = screen.getByText('Title');
      expect(title.tagName).toBe('H5');
    });

    it('should apply custom className', () => {
      render(<AlertTitle className="custom-title">Title</AlertTitle>);

      const title = screen.getByText('Title');
      expect(title).toHaveClass('custom-title');
    });

    it('should apply default styles', () => {
      render(<AlertTitle>Title</AlertTitle>);

      const title = screen.getByText('Title');
      expect(title).toHaveClass('mb-1');
      expect(title).toHaveClass('font-medium');
      expect(title).toHaveClass('leading-none');
      expect(title).toHaveClass('tracking-tight');
    });
  });

  describe('AlertDescription', () => {
    it('should render children', () => {
      render(<AlertDescription>Description</AlertDescription>);

      expect(screen.getByText('Description')).toBeInTheDocument();
    });

    it('should render as div element', () => {
      const { container } = render(<AlertDescription>Description</AlertDescription>);

      const description = container.firstChild as HTMLElement;
      expect(description.tagName).toBe('DIV');
    });

    it('should apply custom className', () => {
      const { container } = render(
        <AlertDescription className="custom-desc">Description</AlertDescription>
      );

      const description = container.firstChild as HTMLElement;
      expect(description).toHaveClass('custom-desc');
    });

    it('should apply default styles', () => {
      const { container } = render(<AlertDescription>Description</AlertDescription>);

      const description = container.firstChild as HTMLElement;
      expect(description).toHaveClass('text-sm');
    });

    it('should handle paragraph children', () => {
      render(
        <AlertDescription>
          <p>First paragraph</p>
          <p>Second paragraph</p>
        </AlertDescription>
      );

      expect(screen.getByText('First paragraph')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph')).toBeInTheDocument();
    });
  });

  describe('Complete Alert', () => {
    it('should render all alert components together with default variant', () => {
      render(
        <Alert>
          <AlertTitle>Test Alert</AlertTitle>
          <AlertDescription>This is a test alert description</AlertDescription>
        </Alert>
      );

      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText('Test Alert')).toBeInTheDocument();
      expect(screen.getByText('This is a test alert description')).toBeInTheDocument();
    });

    it('should render destructive alert', () => {
      render(
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>Something went wrong</AlertDescription>
        </Alert>
      );

      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('text-destructive');
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should render alert with icon', () => {
      render(
        <Alert>
          <svg data-testid="alert-icon" />
          <AlertTitle>Alert with Icon</AlertTitle>
          <AlertDescription>Description</AlertDescription>
        </Alert>
      );

      expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
      expect(screen.getByText('Alert with Icon')).toBeInTheDocument();
    });
  });
});
