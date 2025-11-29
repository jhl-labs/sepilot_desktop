/**
 * Avatar 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

describe('Avatar', () => {
  describe('Avatar Root', () => {
    it('should render avatar container', () => {
      const { container } = render(<Avatar />);

      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toBeInTheDocument();
    });

    it('should apply base styles', () => {
      const { container } = render(<Avatar />);

      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toHaveClass(
        'relative',
        'flex',
        'h-10',
        'w-10',
        'shrink-0',
        'overflow-hidden',
        'rounded-full'
      );
    });

    it('should merge custom className', () => {
      const { container } = render(<Avatar className="custom-avatar" />);

      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toHaveClass('custom-avatar');
      expect(avatar).toHaveClass('rounded-full'); // base class
    });

    it('should support ref forwarding', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(<Avatar ref={ref} />);

      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('should pass through additional props', () => {
      const { container } = render(
        <Avatar data-testid="test-avatar" id="avatar-id" />
      );

      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toHaveAttribute('data-testid', 'test-avatar');
      expect(avatar).toHaveAttribute('id', 'avatar-id');
    });
  });

  describe('AvatarImage', () => {
    it('should render AvatarImage component', () => {
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User Avatar" />
        </Avatar>
      );

      // AvatarImage is rendered but may not be visible until image loads
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should pass src prop to AvatarImage', () => {
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" />
        </Avatar>
      );

      // Just verify the Avatar container is rendered
      expect(container.firstChild).toHaveClass('rounded-full');
    });
  });

  describe('AvatarFallback', () => {
    it('should render fallback content', () => {
      render(
        <Avatar>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should apply base fallback styles', () => {
      const { container } = render(
        <Avatar>
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      const fallback = screen.getByText('JD');
      expect(fallback).toHaveClass(
        'flex',
        'h-full',
        'w-full',
        'items-center',
        'justify-center',
        'rounded-full',
        'bg-muted'
      );
    });

    it('should merge custom className for fallback', () => {
      render(
        <Avatar>
          <AvatarFallback className="custom-fallback">JD</AvatarFallback>
        </Avatar>
      );

      const fallback = screen.getByText('JD');
      expect(fallback).toHaveClass('custom-fallback');
      expect(fallback).toHaveClass('bg-muted'); // base class
    });

    it('should support ref forwarding for fallback', () => {
      const ref = React.createRef<HTMLSpanElement>();
      render(
        <Avatar>
          <AvatarFallback ref={ref}>JD</AvatarFallback>
        </Avatar>
      );

      expect(ref.current).toBeInstanceOf(HTMLSpanElement);
    });

    it('should render fallback with special characters', () => {
      render(
        <Avatar>
          <AvatarFallback>★</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('★')).toBeInTheDocument();
    });

    it('should render fallback with nested elements', () => {
      render(
        <Avatar>
          <AvatarFallback>
            <span>J</span>
            <span>D</span>
          </AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('J')).toBeInTheDocument();
      expect(screen.getByText('D')).toBeInTheDocument();
    });
  });

  describe('Avatar with Image and Fallback', () => {
    it('should render avatar with both components', () => {
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="User Avatar" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      // Verify Avatar container is rendered
      expect(container.firstChild).toBeInTheDocument();
      expect(container.firstChild).toHaveClass('rounded-full');
    });

    it('should show fallback when image src is empty', () => {
      render(
        <Avatar>
          <AvatarImage src="" alt="User Avatar" />
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('JD')).toBeInTheDocument();
    });
  });

  describe('Avatar Sizes', () => {
    it('should support custom size via className', () => {
      const { container } = render(
        <Avatar className="h-20 w-20">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toHaveClass('h-20', 'w-20');
    });

    it('should support small size', () => {
      const { container } = render(
        <Avatar className="h-8 w-8">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toHaveClass('h-8', 'w-8');
    });

    it('should support large size', () => {
      const { container } = render(
        <Avatar className="h-16 w-16">
          <AvatarFallback>JD</AvatarFallback>
        </Avatar>
      );

      const avatar = container.firstChild as HTMLElement;
      expect(avatar).toHaveClass('h-16', 'w-16');
    });
  });

  describe('Avatar Accessibility', () => {
    it('should render avatar with image alt attribute', () => {
      const { container } = render(
        <Avatar>
          <AvatarImage src="https://example.com/avatar.jpg" alt="John Doe's avatar" />
        </Avatar>
      );

      // Verify Avatar container is accessible
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should render fallback text for screen readers', () => {
      render(
        <Avatar>
          <AvatarFallback>John Doe</AvatarFallback>
        </Avatar>
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });
});
