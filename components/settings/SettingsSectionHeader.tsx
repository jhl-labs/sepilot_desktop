'use client';

interface SettingsSectionHeaderProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export function SettingsSectionHeader({
  title,
  description,
  icon: Icon,
}: SettingsSectionHeaderProps) {
  return (
    <div className="mb-6 pb-4 border-b">
      <div className="flex items-center gap-3">
        {Icon && <Icon className="w-6 h-6 text-primary" />}
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
