/**
 * Select 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectLabel,
  SelectSeparator,
} from '@/components/ui/select';

describe('Select Components', () => {
  describe('Select with SelectTrigger', () => {
    it('should render trigger', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByText('Select an option')).toBeInTheDocument();
    });

    it('should apply custom className to trigger', () => {
      const { container } = render(
        <Select>
          <SelectTrigger className="custom-trigger">
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      const trigger = container.querySelector('.custom-trigger');
      expect(trigger).toBeInTheDocument();
    });

    it('should render chevron icon', () => {
      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      const icon = container.querySelector('svg');
      expect(icon).toBeInTheDocument();
    });
  });

  describe('SelectContent', () => {
    it('should render content with items', async () => {
      const user = userEvent.setup();

      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="option1">Option 1</SelectItem>
            <SelectItem value="option2">Option 2</SelectItem>
          </SelectContent>
        </Select>
      );

      const trigger = screen.getByText('Choose');
      await user.click(trigger);

      expect(await screen.findByText('Option 1')).toBeInTheDocument();
      expect(screen.getByText('Option 2')).toBeInTheDocument();
    });

    it('should apply custom className to content', async () => {
      const user = userEvent.setup();

      const { container } = render(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="custom-content">
            <SelectItem value="test">Test</SelectItem>
          </SelectContent>
        </Select>
      );

      const trigger = container.querySelector('[role="combobox"]');
      if (trigger) {
        await user.click(trigger);
      }

      // Content should have custom class when opened
      const content = document.querySelector('.custom-content');
      expect(content).toBeTruthy();
    });
  });

  describe('SelectItem', () => {
    it('should render item with custom className', async () => {
      const user = userEvent.setup();

      render(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="test" className="custom-item">
              Test Item
            </SelectItem>
          </SelectContent>
        </Select>
      );

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      const item = await screen.findByText('Test Item');
      expect(item.closest('.custom-item')).toBeInTheDocument();
    });
  });

  describe('Complete Select', () => {
    it('should render complete select', async () => {
      const user = userEvent.setup();

      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="carrot">Carrot</SelectItem>
          </SelectContent>
        </Select>
      );

      expect(screen.getByText('Select an option')).toBeInTheDocument();

      const trigger = screen.getByRole('combobox');
      await user.click(trigger);

      expect(await screen.findByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
      expect(screen.getByText('Carrot')).toBeInTheDocument();
    });
  });
});
