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
  FileCode,
  Globe,
} from 'lucide-react';

export type SettingSection =
  | 'llm'
  | 'network'
  | 'vectordb'
  | 'imagegen'
  | 'mcp'
  | 'github'
  | 'team-docs'
  | 'backup'
  | 'quickinput'
  | 'editor'
  | 'browser';

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

const settingsCategories: SettingsCategory[] = [
  {
    id: 'core',
    label: 'Core Settings',
    items: [
      {
        id: 'llm',
        label: 'LLM',
        icon: Settings,
        description: 'LLM 제공자 및 모델 설정',
      },
      {
        id: 'network',
        label: 'Network',
        icon: Network,
        description: '프록시 및 네트워크 설정',
      },
    ],
  },
  {
    id: 'integrations',
    label: 'Integrations',
    items: [
      {
        id: 'vectordb',
        label: 'VectorDB',
        icon: Database,
        description: '벡터 데이터베이스 및 임베딩',
      },
      {
        id: 'imagegen',
        label: 'ImageGen',
        icon: Image,
        description: '이미지 생성 (ComfyUI, NanoBanana)',
      },
      {
        id: 'mcp',
        label: 'MCP 서버',
        icon: Plug,
        description: 'Model Context Protocol 서버',
      },
    ],
  },
  {
    id: 'features',
    label: 'Features',
    items: [
      {
        id: 'quickinput',
        label: 'Quick Input',
        icon: Zap,
        description: '빠른 입력 및 단축키',
      },
      {
        id: 'editor',
        label: 'Editor',
        icon: FileCode,
        description: '코드 에디터 설정',
      },
      {
        id: 'browser',
        label: 'Browser',
        icon: Globe,
        description: '브라우저 에이전트 설정',
      },
    ],
  },
  {
    id: 'documents',
    label: 'Documents',
    items: [
      {
        id: 'team-docs',
        label: 'Team Docs',
        icon: Users,
        description: '팀 문서 동기화 (다중 Repo)',
      },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      {
        id: 'github',
        label: 'GitHub Sync',
        icon: Github,
        description: 'Personal Docs 동기화',
      },
      {
        id: 'backup',
        label: '백업/복구',
        icon: HardDrive,
        description: '데이터 백업 및 복원',
      },
    ],
  },
];

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
  return (
    <nav className={cn('w-64 border-r bg-muted/30 p-4 space-y-6', className)}>
      {settingsCategories.map((category) => (
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
