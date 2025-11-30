'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DropdownMenuProps {
  children: React.ReactNode;
  onOpenChange?: (open: boolean) => void;
}

interface DropdownMenuTriggerProps {
  asChild?: boolean;
  children: React.ReactNode;
}

interface DropdownMenuContentProps {
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom';
  children: React.ReactNode;
  className?: string;
}

interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}

const DropdownMenuContext = React.createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLDivElement | null> | null;
}>({
  isOpen: false,
  setIsOpen: () => {},
  triggerRef: null,
});

export function DropdownMenu({ children, onOpenChange }: DropdownMenuProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLDivElement>(null);

  const handleOpenChange = React.useCallback(
    (open: boolean) => {
      setIsOpen(open);
      onOpenChange?.(open);
    },
    [onOpenChange]
  );

  return (
    <DropdownMenuContext.Provider value={{ isOpen, setIsOpen: handleOpenChange, triggerRef }}>
      <div className="relative inline-block">{children}</div>
    </DropdownMenuContext.Provider>
  );
}

export const DropdownMenuTrigger = React.forwardRef<HTMLDivElement, DropdownMenuTriggerProps>(
  ({ asChild, children }, ref) => {
    const { setIsOpen, isOpen, triggerRef } = React.useContext(DropdownMenuContext);

    const handleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOpen(!isOpen);
    };

    // Merge refs using a ref callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const mergedRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        // Update context ref
        if (triggerRef && 'current' in triggerRef) {
          triggerRef.current = node;
        }
        // Update forwarded ref
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref && 'current' in ref) {
          ref.current = node;
        }
      },
      [ref, triggerRef]
    );

    if (asChild && React.isValidElement(children)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return React.cloneElement(children as React.ReactElement<any>, {
        onClick: handleClick,
        ref: mergedRef,
      });
    }

    return (
      <div ref={mergedRef} onClick={handleClick}>
        {children}
      </div>
    );
  }
);
DropdownMenuTrigger.displayName = 'DropdownMenuTrigger';

export function DropdownMenuContent({
  align = 'end',
  side = 'bottom',
  children,
  className,
}: DropdownMenuContentProps) {
  const { isOpen, setIsOpen, triggerRef } = React.useContext(DropdownMenuContext);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({ top: 0, left: 0 });
  const [mounted, setMounted] = React.useState(false);

  // Mount check for SSR
  React.useEffect(() => {
    setMounted(true);
  }, []);

  // Calculate position based on trigger element
  React.useEffect(() => {
    if (!isOpen || !triggerRef?.current) {
      return;
    }

    const updatePosition = () => {
      const triggerRect = triggerRef.current!.getBoundingClientRect();
      const contentRect = contentRef.current?.getBoundingClientRect();

      let top = 0;
      let left = 0;

      // Calculate vertical position
      if (side === 'bottom') {
        top = triggerRect.bottom + 4; // 4px offset
      } else {
        top = triggerRect.top - (contentRect?.height || 0) - 4;
      }

      // Calculate horizontal position
      if (align === 'end') {
        left = triggerRect.right - (contentRect?.width || 0);
      } else if (align === 'start') {
        left = triggerRect.left;
      } else {
        left = triggerRect.left + triggerRect.width / 2 - (contentRect?.width || 0) / 2;
      }

      setPosition({ top, left });
    };

    updatePosition();

    // Update position on scroll or resize
    const handleUpdate = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isOpen, triggerRef, side, align]);

  // Close when clicking outside
  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, setIsOpen]);

  if (!isOpen || !mounted) {
    return null;
  }

  const content = (
    <div
      ref={contentRef}
      style={{
        position: 'fixed',
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80',
        className
      )}
    >
      {children}
    </div>
  );

  return createPortal(content, document.body);
}

export function DropdownMenuItem({
  children,
  onClick,
  className,
  disabled,
}: DropdownMenuItemProps) {
  const { setIsOpen } = React.useContext(DropdownMenuContext);

  const handleClick = () => {
    if (disabled) {
      return;
    }
    onClick?.();
    setIsOpen(false);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-50'
          : 'cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        className
      )}
    >
      {children}
    </div>
  );
}

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return <div className={cn('-mx-1 my-1 h-px bg-muted', className)} />;
}

export function DropdownMenuLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('px-2 py-1.5 text-sm font-semibold', className)}>{children}</div>;
}

interface DropdownMenuSubProps {
  children: React.ReactNode;
}

const DropdownMenuSubContext = React.createContext<{
  isSubOpen: boolean;
  setIsSubOpen: (open: boolean) => void;
}>({
  isSubOpen: false,
  setIsSubOpen: () => {},
});

export function DropdownMenuSub({ children }: DropdownMenuSubProps) {
  const [isSubOpen, setIsSubOpen] = React.useState(false);

  return (
    <DropdownMenuSubContext.Provider value={{ isSubOpen, setIsSubOpen }}>
      <div className="relative">{children}</div>
    </DropdownMenuSubContext.Provider>
  );
}

export function DropdownMenuSubTrigger({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { setIsSubOpen } = React.useContext(DropdownMenuSubContext);

  return (
    <div
      onMouseEnter={() => setIsSubOpen(true)}
      onMouseLeave={() => setIsSubOpen(false)}
      className={cn(
        'relative flex select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors cursor-pointer hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
        className
      )}
    >
      {children}
      <svg
        width="15"
        height="15"
        viewBox="0 0 15 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="ml-auto h-4 w-4"
      >
        <path
          d="M6.1584 3.13508C6.35985 2.94621 6.67627 2.95642 6.86514 3.15788L10.6151 7.15788C10.7954 7.3502 10.7954 7.64949 10.6151 7.84182L6.86514 11.8418C6.67627 12.0433 6.35985 12.0535 6.1584 11.8646C5.95694 11.6757 5.94673 11.3593 6.1356 11.1579L9.565 7.49985L6.1356 3.84182C5.94673 3.64036 5.95694 3.32394 6.1584 3.13508Z"
          fill="currentColor"
          fillRule="evenodd"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}

export function DropdownMenuSubContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { isSubOpen } = React.useContext(DropdownMenuSubContext);

  if (!isSubOpen) {
    return null;
  }

  return (
    <div
      className={cn(
        'absolute left-full top-0 ml-1 z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80',
        className
      )}
    >
      {children}
    </div>
  );
}
