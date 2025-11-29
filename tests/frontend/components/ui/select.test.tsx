/**
 * Select 컴포넌트 테스트
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  Select,
  SelectTrigger,
  SelectValue,
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

    it('should have combobox role', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toBeInTheDocument();
    });

    it('should have default styles', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
        </Select>
      );

      const trigger = screen.getByRole('combobox');
      expect(trigger).toHaveClass('flex');
      expect(trigger).toHaveClass('items-center');
      expect(trigger).toHaveClass('justify-between');
      expect(trigger).toHaveClass('rounded-md');
    });
  });

  describe('SelectValue', () => {
    it('should render placeholder', () => {
      render(
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Choose an option" />
          </SelectTrigger>
        </Select>
      );

      expect(screen.getByText('Choose an option')).toBeInTheDocument();
    });
  });
});
