import { toast } from 'sonner';
import { cn } from '../utils/cn';
import { MessageSquare, X, type LucideIcon } from 'lucide-react';
import DOMPurify from 'dompurify';

interface CustomNotificationProps {
  title: string;
  message: string;
  html?: string;
  imageUrl?: string;
  onClick?: () => void;
  onDismiss?: (e: React.MouseEvent) => void;
  icon?: LucideIcon;
  className?: string; // Additional styling
}

export const CustomNotification = ({
  title,
  message,
  html,
  imageUrl,
  onClick,
  onDismiss,
  icon: Icon = MessageSquare,
  className,
}: CustomNotificationProps) => {
  const sanitizedHtml = html ? DOMPurify.sanitize(html) : null;

  return (
    <div
      className={cn(
        'relative flex w-full max-w-sm flex-col overflow-hidden rounded-lg border bg-background shadow-lg ring-1 ring-black/5 transition-all hover:shadow-xl cursor-pointer dark:ring-white/10',
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
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-base font-semibold text-foreground line-clamp-1">{title}</p>

          {sanitizedHtml ? (
            <div
              className="text-sm text-foreground/90 prose-sm dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
            />
          ) : (
            <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{message}</p>
          )}

          {imageUrl && (
            <div className="mt-2 rounded-md overflow-hidden bg-muted/50">
              {}
              <img
                src={imageUrl}
                alt="Notification attachment"
                className="w-full h-auto object-cover max-h-48"
              />
            </div>
          )}
        </div>

        {/* Close Button */}
        {onDismiss && (
          <div className="flex-shrink-0">
            <button
              onClick={onDismiss}
              className="h-6 w-6 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Progress/Timer bar could go here */}
    </div>
  );
};

export const showCustomNotification = (props: CustomNotificationProps) => {
  (toast as any).custom(
    (id: any) => (
      <CustomNotification
        {...props}
        onDismiss={(e) => {
          e.stopPropagation();
          (toast as any).dismiss(id);
          props.onDismiss?.(e);
        }}
        onClick={() => {
          if (props.onClick) {
            props.onClick();
          }
          (toast as any).dismiss(id);
        }}
      />
    ),
    {
      duration: 5000,
      position: 'top-right',
    }
  );
};
