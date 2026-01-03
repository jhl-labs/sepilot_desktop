'use client';

import React, { useState, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { useResizeObserver } from '@/hooks/use-resize-observer';
import { cn } from '@/lib/utils';

interface OverflowToolbarProps {
  children: React.ReactNode;
  className?: string;
  itemWidth?: number; // Estimated width of an item including gap in pixels
  overflowWidth?: number; // Width of the overflow button in pixels
}

export function OverflowToolbar({
  children,
  className,
  itemWidth = 30, // 28px button + 2px gap
  overflowWidth = 30,
}: OverflowToolbarProps) {
  const { ref, width } = useResizeObserver<HTMLDivElement>();
  const items = React.Children.toArray(children);

  const [visibleCount, setVisibleCount] = useState(items.length);

  useEffect(() => {
    if (width <= 0) {
      return;
    }

    // Total width required for all items
    const totalNeeded = items.length * itemWidth;

    // If we have enough space for everything, show all
    // We add a small buffer (5px) to avoid flickering at the edge
    if (width >= totalNeeded - 5) {
      setVisibleCount(items.length);
      return;
    }

    // Calculate how many items fit along with the overflow button
    const spaceForItems = width - overflowWidth;
    const count = Math.max(0, Math.floor(spaceForItems / itemWidth));

    setVisibleCount(count);
  }, [width, items.length, itemWidth, overflowWidth]);

  const visibleItems = items.slice(0, visibleCount);
  const overflowItems = items.slice(visibleCount);

  return (
    <div ref={ref} className={cn('flex items-center min-w-0 h-8', className)}>
      {/* Visible Items */}
      {visibleItems.map((item, index) => (
        <div key={index} className="shrink-0 flex items-center justify-center">
          {item}
        </div>
      ))}

      {/* Overflow Menu */}
      {overflowItems.length > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 ml-0.5">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-1 flex flex-col gap-1 min-w-[40px]"
            align="end"
            sideOffset={5}
          >
            <div className="flex flex-col gap-1">
              {overflowItems.map((item, idx) => (
                <div key={idx} className="flex justify-center items-center">
                  {item}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
