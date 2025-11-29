/**
 * AlertDialog 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogOverlay,
} from '@/components/ui/alert-dialog';

describe('AlertDialog Components', () => {
  describe('AlertDialog with Content', () => {
    it('should render alert dialog when open', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Alert Title</AlertDialogTitle>
              <AlertDialogDescription>Alert Description</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Alert Title')).toBeInTheDocument();
      expect(screen.getByText('Alert Description')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });
  });

  describe('AlertDialogOverlay', () => {
    it('should render overlay with default styles', () => {
      const { container } = render(
        <AlertDialog open>
          <AlertDialogOverlay />
        </AlertDialog>
      );

      const overlay = container.querySelector('.fixed.inset-0');
      expect(overlay).toBeInTheDocument();
    });

    it('should apply custom className to overlay', () => {
      const { container } = render(
        <AlertDialog open>
          <AlertDialogOverlay className="custom-overlay" />
        </AlertDialog>
      );

      const overlay = container.querySelector('.custom-overlay');
      expect(overlay).toBeInTheDocument();
    });
  });

  describe('AlertDialogContent', () => {
    it('should render content', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <div>Content Text</div>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Content Text')).toBeInTheDocument();
    });

    it('should apply custom className to content', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent className="custom-content" data-testid="alert-content">
            <div>Content</div>
          </AlertDialogContent>
        </AlertDialog>
      );

      const content = screen.getByTestId('alert-content');
      expect(content).toHaveClass('custom-content');
    });
  });

  describe('AlertDialogHeader', () => {
    it('should render header', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <div>Header Content</div>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('should apply custom className to header', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader className="custom-header" data-testid="alert-header">
              <div>Header</div>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      const header = screen.getByTestId('alert-header');
      expect(header).toHaveClass('custom-header');
    });

    it('should have default flex styles', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader data-testid="alert-header">
              <div>Header</div>
            </AlertDialogHeader>
          </AlertDialogContent>
        </AlertDialog>
      );

      const header = screen.getByTestId('alert-header');
      expect(header).toHaveClass('flex');
      expect(header).toHaveClass('flex-col');
    });
  });

  describe('AlertDialogFooter', () => {
    it('should render footer', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogFooter>
              <div>Footer Content</div>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('should apply custom className to footer', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogFooter className="custom-footer" data-testid="alert-footer">
              <div>Footer</div>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      const footer = screen.getByTestId('alert-footer');
      expect(footer).toHaveClass('custom-footer');
    });

    it('should have default flex styles', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogFooter data-testid="alert-footer">
              <div>Footer</div>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      const footer = screen.getByTestId('alert-footer');
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('flex-col-reverse');
    });
  });

  describe('AlertDialogTitle', () => {
    it('should render title', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Title Text</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Title Text')).toBeInTheDocument();
    });

    it('should apply custom className to title', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle className="custom-title">Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      const title = screen.getByText('Title');
      expect(title).toHaveClass('custom-title');
    });

    it('should have default styles', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogTitle>Title</AlertDialogTitle>
          </AlertDialogContent>
        </AlertDialog>
      );

      const title = screen.getByText('Title');
      expect(title).toHaveClass('text-lg');
      expect(title).toHaveClass('font-semibold');
    });
  });

  describe('AlertDialogDescription', () => {
    it('should render description', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogDescription>Description Text</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Description Text')).toBeInTheDocument();
    });

    it('should apply custom className to description', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogDescription className="custom-desc">
              Description
            </AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      );

      const description = screen.getByText('Description');
      expect(description).toHaveClass('custom-desc');
    });

    it('should have default styles', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogDescription>Description</AlertDialogDescription>
          </AlertDialogContent>
        </AlertDialog>
      );

      const description = screen.getByText('Description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });
  });

  describe('AlertDialogAction', () => {
    it('should render action button', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogAction>Confirm</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });

    it('should apply custom className to action', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogAction className="custom-action">Action</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      );

      const action = screen.getByText('Action');
      expect(action).toHaveClass('custom-action');
    });

    it('should have button variant styles', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogAction>Action</AlertDialogAction>
          </AlertDialogContent>
        </AlertDialog>
      );

      const action = screen.getByText('Action');
      expect(action.tagName).toBe('BUTTON');
    });
  });

  describe('AlertDialogCancel', () => {
    it('should render cancel button', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });

    it('should apply custom className to cancel', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogCancel className="custom-cancel">Cancel</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      );

      const cancel = screen.getByText('Cancel');
      expect(cancel).toHaveClass('custom-cancel');
    });

    it('should have button variant styles', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogContent>
        </AlertDialog>
      );

      const cancel = screen.getByText('Cancel');
      expect(cancel.tagName).toBe('BUTTON');
    });
  });

  describe('Complete AlertDialog', () => {
    it('should render complete alert dialog', () => {
      render(
        <AlertDialog open>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction>Continue</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      );

      expect(screen.getByText('Are you sure?')).toBeInTheDocument();
      expect(screen.getByText('This action cannot be undone.')).toBeInTheDocument();
      expect(screen.getByText('Cancel')).toBeInTheDocument();
      expect(screen.getByText('Continue')).toBeInTheDocument();
    });
  });
});
