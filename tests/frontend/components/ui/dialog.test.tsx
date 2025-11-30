/**
 * Dialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

describe('Dialog Components', () => {
  describe('Dialog', () => {
    it('should not render when open is false', () => {
      const { container } = render(
        <Dialog open={false} onOpenChange={() => {}}>
          <div>Dialog Content</div>
        </Dialog>
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render when open is true', () => {
      render(
        <Dialog open={true} onOpenChange={() => {}}>
          <div>Dialog Content</div>
        </Dialog>
      );

      expect(screen.getByText('Dialog Content')).toBeInTheDocument();
    });

    it('should call onOpenChange when backdrop is clicked', () => {
      const handleOpenChange = jest.fn();
      const { container } = render(
        <Dialog open={true} onOpenChange={handleOpenChange}>
          <div>Dialog Content</div>
        </Dialog>
      );

      // Find backdrop (the div with bg-background/80 class)
      const backdrop = container.querySelector('.bg-background\\/80');
      expect(backdrop).toBeInTheDocument();

      fireEvent.click(backdrop!);

      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });

    it('should render children in content area', () => {
      render(
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent>
            <p>Test Content</p>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText('Test Content')).toBeInTheDocument();
    });
  });

  describe('DialogContent', () => {
    it('should render children', () => {
      render(<DialogContent>Content Text</DialogContent>);

      expect(screen.getByText('Content Text')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<DialogContent className="custom-class">Content</DialogContent>);

      const content = container.firstChild as HTMLElement;
      expect(content).toHaveClass('custom-class');
    });

    it('should apply default styles', () => {
      const { container } = render(<DialogContent>Content</DialogContent>);

      const content = container.firstChild as HTMLElement;
      expect(content).toHaveClass('rounded-lg');
      expect(content).toHaveClass('border');
      expect(content).toHaveClass('bg-background');
    });

    it('should show close button when onClose is provided', () => {
      render(<DialogContent onClose={() => {}}>Content</DialogContent>);

      const closeButton = screen.getByRole('button', { name: /close/i });
      expect(closeButton).toBeInTheDocument();
    });

    it('should not show close button when onClose is not provided', () => {
      render(<DialogContent>Content</DialogContent>);

      const closeButton = screen.queryByRole('button', { name: /close/i });
      expect(closeButton).not.toBeInTheDocument();
    });

    it('should call onClose when close button is clicked', () => {
      const handleClose = jest.fn();
      render(<DialogContent onClose={handleClose}>Content</DialogContent>);

      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);

      expect(handleClose).toHaveBeenCalled();
    });
  });

  describe('DialogHeader', () => {
    it('should render children', () => {
      render(<DialogHeader>Header Content</DialogHeader>);

      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('should apply margin bottom', () => {
      const { container } = render(<DialogHeader>Header</DialogHeader>);

      const header = container.firstChild as HTMLElement;
      expect(header).toHaveClass('mb-4');
    });
  });

  describe('DialogTitle', () => {
    it('should render as h2 element', () => {
      render(<DialogTitle>Title</DialogTitle>);

      const title = screen.getByText('Title');
      expect(title.tagName).toBe('H2');
    });

    it('should apply default styles', () => {
      render(<DialogTitle>Title</DialogTitle>);

      const title = screen.getByText('Title');
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
    });
  });

  describe('DialogDescription', () => {
    it('should render as paragraph element', () => {
      render(<DialogDescription>Description</DialogDescription>);

      const description = screen.getByText('Description');
      expect(description.tagName).toBe('P');
    });

    it('should apply default styles', () => {
      render(<DialogDescription>Description</DialogDescription>);

      const description = screen.getByText('Description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });
  });

  describe('DialogFooter', () => {
    it('should render children', () => {
      render(<DialogFooter>Footer Content</DialogFooter>);

      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<DialogFooter className="custom-footer">Footer</DialogFooter>);

      const footer = container.firstChild as HTMLElement;
      expect(footer).toHaveClass('custom-footer');
    });

    it('should apply flex styles', () => {
      const { container } = render(<DialogFooter>Footer</DialogFooter>);

      const footer = container.firstChild as HTMLElement;
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('flex-col-reverse');
    });
  });

  describe('Complete Dialog', () => {
    it('should render all dialog components together', () => {
      const handleClose = jest.fn();

      render(
        <Dialog open={true} onOpenChange={handleClose}>
          <DialogContent onClose={handleClose}>
            <DialogHeader>
              <DialogTitle>Test Dialog</DialogTitle>
              <DialogDescription>This is a test dialog</DialogDescription>
            </DialogHeader>
            <div>Dialog Body</div>
            <DialogFooter>
              <button onClick={handleClose}>Close</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      );

      expect(screen.getByText('Test Dialog')).toBeInTheDocument();
      expect(screen.getByText('This is a test dialog')).toBeInTheDocument();
      expect(screen.getByText('Dialog Body')).toBeInTheDocument();
      expect(screen.getAllByText('Close').length).toBeGreaterThan(0);
    });
  });
});
