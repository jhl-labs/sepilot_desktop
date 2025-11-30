/**
 * DropdownMenu 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';

describe('DropdownMenu Components', () => {
  describe('DropdownMenu', () => {
    it('should render children', () => {
      render(
        <DropdownMenu>
          <div>Dropdown Content</div>
        </DropdownMenu>
      );

      expect(screen.getByText('Dropdown Content')).toBeInTheDocument();
    });

    it('should have relative inline-block wrapper', () => {
      const { container } = render(
        <DropdownMenu>
          <div>Content</div>
        </DropdownMenu>
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('relative');
      expect(wrapper).toHaveClass('inline-block');
    });
  });

  describe('DropdownMenuTrigger', () => {
    it('should render trigger', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
        </DropdownMenu>
      );

      expect(screen.getByText('Trigger')).toBeInTheDocument();
    });

    it('should toggle dropdown on click', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      expect(screen.queryByText('Content')).not.toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.getByText('Content')).toBeInTheDocument();

      fireEvent.click(trigger);
      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('should support asChild prop', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button>Custom Button</button>
          </DropdownMenuTrigger>
        </DropdownMenu>
      );

      expect(screen.getByText('Custom Button')).toBeInTheDocument();
    });
  });

  describe('DropdownMenuContent', () => {
    it('should not render when closed', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      expect(screen.queryByText('Content')).not.toBeInTheDocument();
    });

    it('should render when opened', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      expect(screen.getByText('Content')).toBeInTheDocument();
    });

    it('should apply custom className', async () => {
      const { container } = render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="custom-content">
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      // Wait for portal to mount
      await waitFor(() => {
        const content = document.querySelector('.custom-content');
        expect(content).toBeInTheDocument();
      });
    });

    it('should apply align end', async () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      // Wait for portal to mount and position to be calculated
      await waitFor(() => {
        const content = document.querySelector('[style*="position: fixed"]');
        expect(content).toBeInTheDocument();
      });
    });

    it('should apply align start', async () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument();
      });
    });

    it('should apply align center', async () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument();
      });
    });

    it('should apply side bottom (default)', async () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument();
      });
    });

    it('should apply side top', async () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top">
            <div>Content</div>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('Content')).toBeInTheDocument();
      });
    });

    it('should close on outside click', async () => {
      render(
        <div>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button>Trigger</button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div>Content</div>
            </DropdownMenuContent>
          </DropdownMenu>
          <div>Outside</div>
        </div>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);
      expect(screen.getByText('Content')).toBeInTheDocument();

      const outside = screen.getByText('Outside');
      fireEvent.mouseDown(outside);

      await waitFor(() => {
        expect(screen.queryByText('Content')).not.toBeInTheDocument();
      });
    });
  });

  describe('DropdownMenuItem', () => {
    it('should render item', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item 1</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      expect(screen.getByText('Item 1')).toBeInTheDocument();
    });

    it('should call onClick handler', () => {
      const handleClick = jest.fn();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleClick}>Item 1</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      const item = screen.getByText('Item 1');
      fireEvent.click(item);

      expect(handleClick).toHaveBeenCalled();
    });

    it('should close dropdown after item click', async () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item 1</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);
      expect(screen.getByText('Item 1')).toBeInTheDocument();

      const item = screen.getByText('Item 1');
      fireEvent.click(item);

      await waitFor(() => {
        expect(screen.queryByText('Item 1')).not.toBeInTheDocument();
      });
    });

    it('should apply custom className', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem className="custom-item">Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      const item = screen.getByText('Item');
      expect(item).toHaveClass('custom-item');
    });

    it('should render disabled item', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem disabled>Disabled Item</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      const item = screen.getByText('Disabled Item');
      expect(item).toHaveClass('cursor-not-allowed');
      expect(item).toHaveClass('opacity-50');
    });

    it('should not call onClick when disabled', () => {
      const handleClick = jest.fn();

      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={handleClick} disabled>
              Disabled Item
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      const item = screen.getByText('Disabled Item');
      fireEvent.click(item);

      expect(handleClick).not.toHaveBeenCalled();
    });
  });

  describe('DropdownMenuSeparator', () => {
    it('should render separator', async () => {
      const { container } = render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem>Item 1</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Item 2</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      await waitFor(() => {
        const separator = document.querySelector('.bg-muted');
        expect(separator).toBeInTheDocument();
      });
    });

    it('should apply custom className', async () => {
      const { container } = render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSeparator className="custom-separator" />
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      await waitFor(() => {
        const separator = document.querySelector('.custom-separator');
        expect(separator).toBeInTheDocument();
      });
    });
  });

  describe('DropdownMenuLabel', () => {
    it('should render label', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Label Text</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      expect(screen.getByText('Label Text')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel className="custom-label">Label</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      const label = screen.getByText('Label');
      expect(label).toHaveClass('custom-label');
    });

    it('should have default styles', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Label</DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      const label = screen.getByText('Label');
      expect(label).toHaveClass('font-semibold');
    });
  });

  describe('DropdownMenuSub', () => {
    it('should render sub menu trigger', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sub Menu</DropdownMenuSubTrigger>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      expect(screen.getByText('Sub Menu')).toBeInTheDocument();
    });

    it('should show sub content on mouse enter', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sub Menu</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <div>Sub Content</div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      expect(screen.queryByText('Sub Content')).not.toBeInTheDocument();

      const subTrigger = screen.getByText('Sub Menu');
      fireEvent.mouseEnter(subTrigger);

      expect(screen.getByText('Sub Content')).toBeInTheDocument();
    });

    it('should hide sub content on mouse leave', async () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sub Menu</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <div>Sub Content</div>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      const subTrigger = screen.getByText('Sub Menu');
      fireEvent.mouseEnter(subTrigger);
      expect(screen.getByText('Sub Content')).toBeInTheDocument();

      fireEvent.mouseLeave(subTrigger);
      await waitFor(() => {
        expect(screen.queryByText('Sub Content')).not.toBeInTheDocument();
      });
    });

    it('should render arrow icon in sub trigger', async () => {
      const { container } = render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Trigger</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sub Menu</DropdownMenuSubTrigger>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Trigger').parentElement!;
      fireEvent.click(trigger);

      await waitFor(() => {
        const svg = document.querySelector('svg');
        expect(svg).toBeInTheDocument();
      });
    });
  });

  describe('Complete DropdownMenu', () => {
    it('should render complete dropdown with all components', () => {
      render(
        <DropdownMenu>
          <DropdownMenuTrigger>
            <button>Open Menu</button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Menu Label</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>Item 1</DropdownMenuItem>
            <DropdownMenuItem>Item 2</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>More Options</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuItem>Sub Item 1</DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      );

      const trigger = screen.getByText('Open Menu');
      fireEvent.click(trigger);

      expect(screen.getByText('Menu Label')).toBeInTheDocument();
      expect(screen.getByText('Item 1')).toBeInTheDocument();
      expect(screen.getByText('Item 2')).toBeInTheDocument();
      expect(screen.getByText('More Options')).toBeInTheDocument();
    });
  });
});
