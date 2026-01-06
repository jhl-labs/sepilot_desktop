'use client';

import { ExtensionManifest } from '@/lib/extensions/types';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import * as LucideIcons from 'lucide-react';
import { Bot, Settings as SettingsIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface ExtensionCardProps {
  manifest: ExtensionManifest;
  isActive: boolean;
  canDeactivate: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onSettings?: () => void;
  isToggling: boolean;
}

export function ExtensionCard({
  manifest,
  isActive,
  canDeactivate,
  onToggle,
  onSettings,
  isToggling,
}: ExtensionCardProps) {
  const { t } = useTranslation();

  // 아이콘 동적 로드
  const IconComponent =
    (LucideIcons[manifest.icon as keyof typeof LucideIcons] as React.ComponentType<{
      className?: string;
    }>) || Bot;

  const handleToggle = (checked: boolean) => {
    onToggle(manifest.id, checked);
  };

  // 비활성화 불가능한 경우 Tooltip 메시지
  const cannotDeactivateMessage = !canDeactivate
    ? t('settings.extensions.cannotDeactivate')
    : undefined;

  return (
    <Card className={cn('transition-opacity', isToggling && 'opacity-50')}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3 flex-1">
            <div className="mt-1 p-2 rounded-lg bg-primary/10 text-primary">
              <IconComponent className="w-5 h-5" />
            </div>
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg">{manifest.name}</CardTitle>
                {manifest.betaFlag && (
                  <Badge variant="secondary" className="text-xs">
                    {t('settings.extensions.betaBadge')}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-sm">
                {t('settings.extensions.version')}: {manifest.version}
                {manifest.author && ` • ${t('settings.extensions.author')}: ${manifest.author}`}
              </CardDescription>
            </div>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Switch
                    checked={isActive}
                    onCheckedChange={handleToggle}
                    disabled={isToggling || (!canDeactivate && isActive)}
                  />
                </div>
              </TooltipTrigger>
              {cannotDeactivateMessage && (
                <TooltipContent>
                  <p className="max-w-xs">{cannotDeactivateMessage}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 설명 */}
        <p className="text-sm text-muted-foreground">{manifest.description}</p>

        {/* 의존성 */}
        {manifest.dependencies && manifest.dependencies.length > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t('settings.extensions.dependencies')}:</span>
            <div className="flex flex-wrap gap-1">
              {manifest.dependencies.map((dep) => (
                <Badge key={dep} variant="outline" className="text-xs">
                  {dep}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            {t('settings.extensions.noDependencies')}
          </div>
        )}

        {/* 설정 버튼 */}
        {onSettings && (
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={onSettings} className="w-full">
              <SettingsIcon className="w-4 h-4 mr-2" />
              {t('settings.extensions.goToSettings')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
