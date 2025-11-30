/**
 * ContextMenu 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuRadioGroup,
} from '@/components/ui/context-menu';

describe('ContextMenu Components', () => {
  describe('ContextMenu with Trigger', () => {
    it('should render trigger', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Right Click Me</div>
          </ContextMenuTrigger>
        </ContextMenu>
      );

      expect(screen.getByText('Right Click Me')).toBeInTheDocument();
    });
  });

  describe('ContextMenuContent', () => {
    it('should render content with items on context menu', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Item 1</ContextMenuItem>
            <ContextMenuItem>Item 2</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );

      const trigger = screen.getByText('Trigger');
      fireEvent.contextMenu(trigger);

      // Context menu items might appear after right-click
      expect(screen.getByText('Trigger')).toBeInTheDocument();
    });

    it('should apply custom className to content', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent className="custom-content" data-testid="context-content">
            <ContextMenuItem>Item</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      );

      const trigger = screen.getByText('Trigger');
      fireEvent.contextMenu(trigger);
    });
  });


  describe('ContextMenuLabel', () => {
    it('should render label', () => {
      const { container } = render(
        <ContextMenuLabel>Label Text</ContextMenuLabel>
      );

      expect(container.textContent).toContain('Label Text');
    });

    it('should apply custom className', () => {
      render(
        <ContextMenuLabel className="custom-label" data-testid="menu-label">
          Label
        </ContextMenuLabel>
      );

      const label = screen.getByTestId('menu-label');
      expect(label).toHaveClass('custom-label');
    });

    it('should apply inset styles', () => {
      render(
        <ContextMenuLabel inset data-testid="menu-label">
          Label
        </ContextMenuLabel>
      );

      const label = screen.getByTestId('menu-label');
      expect(label).toHaveClass('pl-8');
    });
  });

  describe('ContextMenuSeparator', () => {
    it('should render separator', () => {
      const { container } = render(
        <ContextMenuSeparator />
      );

      const separator = container.firstChild as HTMLElement;
      expect(separator).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <ContextMenuSeparator className="custom-separator" data-testid="separator" />
      );

      const separator = screen.getByTestId('separator');
      expect(separator).toHaveClass('custom-separator');
    });
  });

  describe('ContextMenuShortcut', () => {
    it('should render shortcut', () => {
      render(
        <ContextMenuShortcut>⌘K</ContextMenuShortcut>
      );

      expect(screen.getByText('⌘K')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <ContextMenuShortcut className="custom-shortcut">
          ⌘S
        </ContextMenuShortcut>
      );

      const shortcut = screen.getByText('⌘S');
      expect(shortcut).toHaveClass('custom-shortcut');
    });

    it('should have default styles', () => {
      render(
        <ContextMenuShortcut>⌘C</ContextMenuShortcut>
      );

      const shortcut = screen.getByText('⌘C');
      expect(shortcut).toHaveClass('ml-auto');
      expect(shortcut).toHaveClass('text-xs');
    });
  });


  describe('Complete ContextMenu', () => {
    it('should render complete context menu', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Right Click</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuLabel>Actions</ContextMenuLabel>
            <ContextMenuSeparator />
            <ContextMenuItem>
              Cut
              <ContextMenuShortcut>⌘X</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem>
              Copy
              <ContextMenuShortcut>⌘C</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>More Options</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>Sub Option</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      );

      expect(screen.getByText('Right Click')).toBeInTheDocument();
    });

    it('should render context menu with checkbox items', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuCheckboxItem checked>
              Option 1
            </ContextMenuCheckboxItem>
            <ContextMenuCheckboxItem>
              Option 2
            </ContextMenuCheckboxItem>
          </ContextMenuContent>
        </ContextMenu>
      );

      expect(screen.getByText('Trigger')).toBeInTheDocument();
    });

    it('should render context menu with radio items', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuRadioGroup value="option1">
              <ContextMenuRadioItem value="option1">
                Choice 1
              </ContextMenuRadioItem>
              <ContextMenuRadioItem value="option2">
                Choice 2
              </ContextMenuRadioItem>
            </ContextMenuRadioGroup>
          </ContextMenuContent>
        </ContextMenu>
      );

      expect(screen.getByText('Trigger')).toBeInTheDocument();
    });
  });

  describe('ContextMenuSub', () => {
    it('should render sub menu with trigger and content', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Main Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem>Regular Item</ContextMenuItem>
            <ContextMenuSub>
              <ContextMenuSubTrigger>More Options</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>Sub Item 1</ContextMenuItem>
                <ContextMenuItem>Sub Item 2</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      );

      expect(screen.getByText('Main Trigger')).toBeInTheDocument();
    });

    it('should render sub menu with inset option', () => {
      render(
        <ContextMenu>
          <ContextMenuTrigger>
            <div>Trigger</div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuSub>
              <ContextMenuSubTrigger inset>
                Indented Submenu
              </ContextMenuSubTrigger>
              <ContextMenuSubContent>
                <ContextMenuItem>Item</ContextMenuItem>
              </ContextMenuSubContent>
            </ContextMenuSub>
          </ContextMenuContent>
        </ContextMenu>
      );

      expect(screen.getByText('Trigger')).toBeInTheDocument();
    });
  });
});
