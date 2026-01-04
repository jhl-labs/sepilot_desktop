'use client';

import { cn } from '@/lib/utils';
import {
  Settings,
  Network,
  Database,
  Image,
  Plug,
  Github,
  Users,
  HardDrive,
  Zap,
  FlaskConical,
  Languages,
  Bot,
} from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExtensions } from '@/lib/extensions/use-extensions';

export type SettingSection =
  | 'general'
  | 'llm'
  | 'network'
  | 'vectordb'
  | 'imagegen'
  | 'mcp'
  | 'github'
  | 'team-docs'
  | 'backup'
  | 'quickinput'
  | 'beta'
  | string; // Allow Extension-provided Settings tabs dynamically

interface SettingsCategory {
  id: string;
  label: string;
  items: {
    id: SettingSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description?: string;
  }[];
}

interface SettingsSidebarProps {
  activeSection: SettingSection;
  onSectionChange: (section: SettingSection) => void;
  className?: string;
}

export function SettingsSidebar({
  activeSection,
  onSectionChange,
  className,
}: SettingsSidebarProps) {
  const { t } = useTranslation();
  const { activeExtensions } = useExtensions();

  const categories: SettingsCategory[] = [
    {
      id: 'core',
      label: t('settings.categories.core'),
      items: [
        {
          id: 'general',
          label: t('settings.general.title'),
          icon: Languages,
          description: t('settings.general.description'),
        },
        {
          id: 'llm',
          label: t('settings.llm.title'),
          icon: Settings,
          description: t('settings.llm.description'),
        },
        {
          id: 'network',
          label: t('settings.network.title'),
          icon: Network,
          description: t('settings.network.description'),
        },
      ],
    },
    {
      id: 'integrations',
      label: t('settings.categories.integrations'),
      items: [
        {
          id: 'vectordb',
          label: t('settings.vectordb.title'),
          icon: Database,
          description: t('settings.vectordb.description'),
        },
        {
          id: 'imagegen',
          label: t('settings.imagegen.title'),
          icon: Image,
          description: t('settings.imagegen.description'),
        },
        {
          id: 'mcp',
          label: t('settings.mcp.title'),
          icon: Plug,
          description: t('settings.mcp.description'),
        },
      ],
    },
    {
      id: 'features',
      label: t('settings.categories.features'),
      items: [
        {
          id: 'quickinput',
          label: t('settings.quickinput.title'),
          icon: Zap,
          description: t('settings.quickinput.description'),
        },
        // Extension-based settings (dynamically discovered from active Extensions)
        ...activeExtensions
          .filter((ext) => ext.manifest.settingsTab && ext.SettingsTabComponent)
          .map((ext) => {
            const settingsTab = ext.manifest.settingsTab!;
            const IconComponent: React.ComponentType<{ className?: string }> =
              (LucideIcons[settingsTab.icon as keyof typeof LucideIcons] as any) || Bot;
            return {
              id: settingsTab.id as SettingSection,
              label: t(settingsTab.label),
              icon: IconComponent,
              description: t(settingsTab.description),
            };
          }),
      ],
    },
    {
      id: 'documents',
      label: t('settings.categories.documents'),
      items: [
        {
          id: 'team-docs',
          label: t('settings.teamDocs.title'),
          icon: Users,
          description: t('settings.teamDocs.description'),
        },
      ],
    },
    {
      id: 'system',
      label: t('settings.categories.system'),
      items: [
        {
          id: 'github',
          label: t('settings.github.title'),
          icon: Github,
          description: t('settings.github.description'),
        },
        {
          id: 'backup',
          label: t('settings.backup.title'),
          icon: HardDrive,
          description: t('settings.backup.description'),
        },
        {
          id: 'beta',
          label: t('settings.beta.title'),
          icon: FlaskConical,
          description: t('settings.beta.description'),
        },
      ],
    },
  ];

  return (
    <nav className={cn('w-64 border-r bg-muted/30 p-4 space-y-6', className)}>
      {categories.map((category) => (
        <div key={category.id} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-3">
            {category.label}
          </h3>
          <div className="space-y-1">
            {category.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSectionChange(item.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                    'hover:bg-accent hover:text-accent-foreground',
                    isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
                  )}
                  title={item.description}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
