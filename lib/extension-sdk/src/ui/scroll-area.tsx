import * as React from 'react';
import { cn } from '../utils/cn';

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const ScrollArea = React.forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div ref={ref} className={cn('relative overflow-auto', className)} {...props}>
        {children}
      </div>
    );
  }
);
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };
