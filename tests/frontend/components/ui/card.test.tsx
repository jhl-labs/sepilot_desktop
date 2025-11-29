/**
 * Card 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

describe('Card Components', () => {
  describe('Card', () => {
    it('should render children', () => {
      render(<Card>Card Content</Card>);

      expect(screen.getByText('Card Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<Card className="custom-class">Content</Card>);

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('custom-class');
    });

    it('should apply default styles', () => {
      const { container } = render(<Card>Content</Card>);

      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('border');
      expect(card).toHaveClass('bg-card');
    });
  });

  describe('CardHeader', () => {
    it('should render children', () => {
      render(<CardHeader>Header Content</CardHeader>);

      expect(screen.getByText('Header Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<CardHeader className="custom-header">Content</CardHeader>);

      const header = container.firstChild as HTMLElement;
      expect(header).toHaveClass('custom-header');
    });
  });

  describe('CardTitle', () => {
    it('should render as h3 element', () => {
      render(<CardTitle>Title</CardTitle>);

      const title = screen.getByText('Title');
      expect(title.tagName).toBe('H3');
    });

    it('should apply custom className', () => {
      render(<CardTitle className="custom-title">Title</CardTitle>);

      const title = screen.getByText('Title');
      expect(title).toHaveClass('custom-title');
    });

    it('should apply default styles', () => {
      render(<CardTitle>Title</CardTitle>);

      const title = screen.getByText('Title');
      expect(title).toHaveClass('text-2xl');
      expect(title).toHaveClass('font-semibold');
    });
  });

  describe('CardDescription', () => {
    it('should render as paragraph element', () => {
      render(<CardDescription>Description</CardDescription>);

      const description = screen.getByText('Description');
      expect(description.tagName).toBe('P');
    });

    it('should apply custom className', () => {
      render(<CardDescription className="custom-desc">Description</CardDescription>);

      const description = screen.getByText('Description');
      expect(description).toHaveClass('custom-desc');
    });

    it('should apply default styles', () => {
      render(<CardDescription>Description</CardDescription>);

      const description = screen.getByText('Description');
      expect(description).toHaveClass('text-sm');
      expect(description).toHaveClass('text-muted-foreground');
    });
  });

  describe('CardContent', () => {
    it('should render children', () => {
      render(<CardContent>Content Area</CardContent>);

      expect(screen.getByText('Content Area')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<CardContent className="custom-content">Content</CardContent>);

      const content = container.firstChild as HTMLElement;
      expect(content).toHaveClass('custom-content');
    });

    it('should apply default padding styles', () => {
      const { container } = render(<CardContent>Content</CardContent>);

      const content = container.firstChild as HTMLElement;
      expect(content).toHaveClass('p-6');
      expect(content).toHaveClass('pt-0');
    });
  });

  describe('CardFooter', () => {
    it('should render children', () => {
      render(<CardFooter>Footer Content</CardFooter>);

      expect(screen.getByText('Footer Content')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<CardFooter className="custom-footer">Footer</CardFooter>);

      const footer = container.firstChild as HTMLElement;
      expect(footer).toHaveClass('custom-footer');
    });

    it('should apply default flex styles', () => {
      const { container } = render(<CardFooter>Footer</CardFooter>);

      const footer = container.firstChild as HTMLElement;
      expect(footer).toHaveClass('flex');
      expect(footer).toHaveClass('items-center');
    });
  });

  describe('Complete Card', () => {
    it('should render all card components together', () => {
      render(
        <Card>
          <CardHeader>
            <CardTitle>Test Card</CardTitle>
            <CardDescription>Test Description</CardDescription>
          </CardHeader>
          <CardContent>Test Content</CardContent>
          <CardFooter>Test Footer</CardFooter>
        </Card>
      );

      expect(screen.getByText('Test Card')).toBeInTheDocument();
      expect(screen.getByText('Test Description')).toBeInTheDocument();
      expect(screen.getByText('Test Content')).toBeInTheDocument();
      expect(screen.getByText('Test Footer')).toBeInTheDocument();
    });
  });
});
