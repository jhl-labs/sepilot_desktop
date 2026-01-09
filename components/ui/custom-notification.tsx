import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { MessageSquare, X, type LucideIcon } from 'lucide-react';

interface CustomNotificationProps {
  title: string;
  message: string;
  onClick?: () => void;
  onDismiss?: (e: React.MouseEvent) => void;
  icon?: LucideIcon;
  className?: string; // Additional styling
}

export const CustomNotification = ({
  title,
  message,
  onClick,
  onDismiss,
  icon: Icon = MessageSquare,
  className,
}: CustomNotificationProps) => {
  return (
    <div
      className={cn(
        'relative flex w-full max-w-sm overflow-hidden rounded-lg border bg-background shadow-lg ring-1 ring-black/5 transition-all hover:shadow-xl cursor-pointer dark:ring-white/10',
        className
      )}
      onClick={onClick}
      role="alert"
    >
      <div className="flex w-full p-4 gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 pt-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground line-clamp-1">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{message}</p>
        </div>

        {/* Close Button */}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Progress/Timer bar could go here */}
    </div>
  );
};

export const showCustomNotification = (props: CustomNotificationProps) => {
  toast.custom(
    (id) => (
      <CustomNotification
        {...props}
        onDismiss={(e) => {
          e.stopPropagation();
          toast.dismiss(id);
          props.onDismiss?.(e);
        }}
        onClick={() => {
          if (props.onClick) {
            props.onClick();
          }
          toast.dismiss(id);
        }}
      />
    ),
    {
      duration: 5000,
      position: 'top-right',
    }
  );
};
