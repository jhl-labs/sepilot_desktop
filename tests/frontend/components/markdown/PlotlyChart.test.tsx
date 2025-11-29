/**
 * PlotlyChart 컴포넌트 테스트
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PlotlyChart } from '@/components/markdown/PlotlyChart';

// Mock next/dynamic
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: (fn: any) => {
    const Component = ({ data, layout, config }: any) => (
      <div data-testid="plotly-chart" data-plot-data={JSON.stringify(data)}>
        Mock Plotly
      </div>
    );
    Component.displayName = 'Plot';
    return Component;
  },
}));

describe('PlotlyChart', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
    });
  });

  const validPlotlyData = JSON.stringify({
    data: [
      {
        x: [1, 2, 3],
        y: [2, 4, 6],
        type: 'scatter',
      },
    ],
    layout: {
      title: 'Test Chart',
    },
  });

  it('should render chart with valid data', () => {
    render(<PlotlyChart data={validPlotlyData} />);

    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
    expect(screen.getByText('Mock Plotly')).toBeInTheDocument();
  });

  it('should show error for invalid JSON', () => {
    const invalidData = 'invalid json {';
    render(<PlotlyChart data={invalidData} />);

    expect(screen.getByText('Plotly Chart Error')).toBeInTheDocument();
    expect(screen.getByText(/파싱 오류:/)).toBeInTheDocument();
  });

  it('should show error when data array is missing', () => {
    const dataWithoutArray = JSON.stringify({
      layout: { title: 'Test' },
    });

    render(<PlotlyChart data={dataWithoutArray} />);

    expect(screen.getByText('Plotly Chart Error')).toBeInTheDocument();
    expect(screen.getByText(/Invalid Plotly data/)).toBeInTheDocument();
  });

  it('should show error when data is not an array', () => {
    const dataNotArray = JSON.stringify({
      data: 'not an array',
    });

    render(<PlotlyChart data={dataNotArray} />);

    expect(screen.getByText('Plotly Chart Error')).toBeInTheDocument();
  });

  it('should show copy button on valid chart', () => {
    render(<PlotlyChart data={validPlotlyData} />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    expect(copyButton).toBeInTheDocument();
  });

  it('should copy data to clipboard', async () => {
    render(<PlotlyChart data={validPlotlyData} />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(validPlotlyData);
      expect(screen.getByRole('button', { name: /복사됨/ })).toBeInTheDocument();
    });
  });

  it('should show copy button in error state', () => {
    const invalidData = 'invalid json';
    render(<PlotlyChart data={invalidData} />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    expect(copyButton).toBeInTheDocument();
  });

  it('should copy data even in error state', async () => {
    const invalidData = 'invalid json';
    render(<PlotlyChart data={invalidData} />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(invalidData);
    });
  });

  it('should display original code in error message', () => {
    const invalidData = '{ incomplete';
    render(<PlotlyChart data={invalidData} />);

    expect(screen.getByText('원본 코드:')).toBeInTheDocument();
    expect(screen.getByText(invalidData)).toBeInTheDocument();
  });

  it('should reset copy state after 2 seconds', async () => {
    jest.useFakeTimers();
    render(<PlotlyChart data={validPlotlyData} />);

    const copyButton = screen.getByRole('button', { name: /복사/ });
    fireEvent.click(copyButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /복사됨/ })).toBeInTheDocument();
    });

    jest.advanceTimersByTime(2000);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /복사/ })).toBeInTheDocument();
    });

    jest.useRealTimers();
  });

  it('should handle empty data array', () => {
    const emptyData = JSON.stringify({
      data: [],
    });

    render(<PlotlyChart data={emptyData} />);

    // Empty data array is valid, should render chart
    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
  });

  it('should handle data with multiple traces', () => {
    const multiTraceData = JSON.stringify({
      data: [
        { x: [1, 2], y: [1, 2], type: 'scatter', name: 'Trace 1' },
        { x: [1, 2], y: [2, 4], type: 'scatter', name: 'Trace 2' },
      ],
    });

    render(<PlotlyChart data={multiTraceData} />);

    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
  });

  it('should parse and render different chart types', () => {
    const barChartData = JSON.stringify({
      data: [
        {
          x: ['A', 'B', 'C'],
          y: [10, 20, 30],
          type: 'bar',
        },
      ],
    });

    render(<PlotlyChart data={barChartData} />);

    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
  });

  it('should update when data prop changes', () => {
    const { rerender } = render(<PlotlyChart data={validPlotlyData} />);

    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();

    const newData = JSON.stringify({
      data: [{ x: [5, 6], y: [10, 12], type: 'line' }],
    });

    rerender(<PlotlyChart data={newData} />);

    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
  });

  it('should clear error when valid data is provided after invalid', () => {
    const { rerender } = render(<PlotlyChart data="invalid" />);

    expect(screen.getByText('Plotly Chart Error')).toBeInTheDocument();

    rerender(<PlotlyChart data={validPlotlyData} />);

    expect(screen.queryByText('Plotly Chart Error')).not.toBeInTheDocument();
    expect(screen.getByTestId('plotly-chart')).toBeInTheDocument();
  });
});
