'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Trash2,
  Loader2,
  Package,
  Download,
  Calendar,
  Hash,
  ChevronDown,
  Shield,
  FolderOpen,
  Store,
} from 'lucide-react';
import type { InstalledSkill, SkillSourceType } from '@/types';
import { cn } from '@/lib/utils';
import { Trans, useTranslation } from 'react-i18next';

interface SkillManagerProps {
  onRefresh?: () => void;
}

export function SkillManager({ onRefresh }: SkillManagerProps) {
  const { t, i18n } = useTranslation();
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<{
    open: boolean;
    skillId: string | null;
    skillName: string | null;
  }>({
    open: false,
    skillId: null,
    skillName: null,
  });
  const [openGroups, setOpenGroups] = useState<Set<SkillSourceType>>(
    new Set(['builtin', 'local', 'marketplace'])
  );

  useEffect(() => {
    loadSkills();
  }, []);

  const loadSkills = async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI?.skills) {
        const result = await window.electronAPI.skills.getInstalled();
        if (result.success && result.data) {
          setSkills(result.data);
        }
      }
    } catch (error) {
      console.error('Failed to load skills:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = async (skillId: string, currentState: boolean) => {
    setTogglingSkill(skillId);
    try {
      if (window.electronAPI?.skills) {
        const result = await window.electronAPI.skills.toggle(skillId, !currentState);
        if (result.success) {
          await loadSkills();
          onRefresh?.();
        } else {
          console.error('Failed to toggle skill:', result.error);
        }
      }
    } catch (error) {
      console.error('Failed to toggle skill:', error);
    } finally {
      setTogglingSkill(null);
    }
  };

  const handleRemove = async () => {
    const { skillId } = deleteDialog;
    if (!skillId) {
      return;
    }

    try {
      if (window.electronAPI?.skills) {
        const result = await window.electronAPI.skills.remove(skillId);
        if (result.success) {
          await loadSkills();
          onRefresh?.();
        } else {
          console.error('Failed to remove skill:', result.error);
        }
      }
    } catch (error) {
      console.error('Failed to remove skill:', error);
    } finally {
      setDeleteDialog({ open: false, skillId: null, skillName: null });
    }
  };

  const groupSkillsBySource = (): Record<SkillSourceType, InstalledSkill[]> => {
    const grouped: Record<string, InstalledSkill[]> = {
      builtin: [],
      local: [],
      marketplace: [],
      github: [],
    };

    for (const skill of skills) {
      const sourceType = skill.source.type;
      if (!grouped[sourceType]) {
        grouped[sourceType] = [];
      }
      grouped[sourceType].push(skill);
    }

    return grouped as Record<SkillSourceType, InstalledSkill[]>;
  };

  const getSourceIcon = (sourceType: SkillSourceType) => {
    switch (sourceType) {
      case 'builtin':
        return Shield;
      case 'local':
        return FolderOpen;
      case 'marketplace':
        return Store;
      case 'github':
        return Download;
      default:
        return Package;
    }
  };

  const getSourceLabel = (sourceType: SkillSourceType): string => {
    return t(`settings.skills.manager.sources.${sourceType}.label`, sourceType);
  };

  const getSourceDescription = (sourceType: SkillSourceType): string => {
    return t(`settings.skills.manager.sources.${sourceType}.desc`, '');
  };

  const toggleGroup = (sourceType: SkillSourceType) => {
    setOpenGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(sourceType)) {
        newSet.delete(sourceType);
      } else {
        newSet.add(sourceType);
      }
      return newSet;
    });
  };

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      'web-development': 'bg-blue-500/10 text-blue-500',
      'mobile-development': 'bg-purple-500/10 text-purple-500',
      'data-science': 'bg-green-500/10 text-green-500',
      devops: 'bg-orange-500/10 text-orange-500',
      security: 'bg-red-500/10 text-red-500',
      design: 'bg-pink-500/10 text-pink-500',
      writing: 'bg-yellow-500/10 text-yellow-500',
      productivity: 'bg-cyan-500/10 text-cyan-500',
      other: 'bg-gray-500/10 text-gray-500',
    };
    return colors[category] || colors.other;
  };

  const formatDate = (timestamp: number): string => {
    try {
      return new Date(timestamp).toLocaleDateString(i18n.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      // Fallback if i18n.language is invalid for some reason
      return new Date(timestamp).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center">
        <Package className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">
          {t('settings.skills.manager.noSkills.title')}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t('settings.skills.manager.noSkills.description')}
        </p>
      </div>
    );
  }

  const groupedSkills = groupSkillsBySource();
  const sourceOrder: SkillSourceType[] = ['builtin', 'local', 'marketplace', 'github'];

  const renderSkillRow = (skill: InstalledSkill) => (
    <TableRow key={skill.id}>
      {/* 스킬 이름 */}
      <TableCell>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-medium">{skill.manifest.name}</div>
            <div className="text-xs text-muted-foreground line-clamp-1">
              {skill.manifest.description}
            </div>
          </div>
        </div>
      </TableCell>

      {/* 카테고리 */}
      <TableCell>
        <Badge
          variant="secondary"
          className={cn('text-xs', getCategoryColor(skill.manifest.category))}
        >
          {skill.manifest.category}
        </Badge>
      </TableCell>

      {/* 버전 */}
      <TableCell>
        <span className="text-sm text-muted-foreground">{skill.manifest.version}</span>
      </TableCell>

      {/* 사용 횟수 */}
      <TableCell className="text-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="cursor-help">
                {skill.usageCount || 0}
              </Badge>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {skill.lastUsedAt
                  ? t('settings.skills.manager.table.lastUsed', {
                      date: formatDate(skill.lastUsedAt),
                    })
                  : t('settings.skills.manager.table.neverUsed')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>

      {/* 설치일 */}
      <TableCell>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {formatDate(skill.installedAt)}
        </div>
      </TableCell>

      {/* 활성화 토글 */}
      <TableCell className="text-center">
        <Switch
          checked={skill.enabled}
          disabled={togglingSkill === skill.id}
          onCheckedChange={() => handleToggle(skill.id, skill.enabled)}
        />
      </TableCell>

      {/* 제거 버튼 */}
      <TableCell>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() =>
                  setDeleteDialog({
                    open: true,
                    skillId: skill.id,
                    skillName: skill.manifest.name,
                  })
                }
                disabled={skill.source.type === 'builtin'}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>
                {skill.source.type === 'builtin'
                  ? t('settings.skills.manager.table.cannotRemoveBuiltin')
                  : t('settings.skills.manager.table.removeTooltip')}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </TableCell>
    </TableRow>
  );

  return (
    <>
      <div className="space-y-4">
        {/* 통계 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('settings.skills.manager.stats.total')}
                </p>
                <p className="text-2xl font-bold">{skills.length}</p>
              </div>
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('settings.skills.manager.stats.enabled')}
                </p>
                <p className="text-2xl font-bold text-green-500">
                  {skills.filter((s) => s.enabled).length}
                </p>
              </div>
              <Download className="h-8 w-8 text-green-500" />
            </div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  {t('settings.skills.manager.stats.usage')}
                </p>
                <p className="text-2xl font-bold">
                  {skills.reduce((sum, s) => sum + (s.usageCount || 0), 0)}
                </p>
              </div>
              <Hash className="h-8 w-8 text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* 스킬 목록 - Source 별 그룹화 */}
        <div className="space-y-3">
          {sourceOrder.map((sourceType) => {
            const groupSkills = groupedSkills[sourceType] || [];
            if (groupSkills.length === 0) {
              return null;
            }

            const Icon = getSourceIcon(sourceType);
            const isOpen = openGroups.has(sourceType);

            return (
              <Collapsible
                key={sourceType}
                open={isOpen}
                onOpenChange={() => toggleGroup(sourceType)}
              >
                <div className="rounded-lg border">
                  {/* 그룹 헤더 */}
                  <CollapsibleTrigger className="flex w-full items-center justify-between p-4 hover:bg-accent/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 items-center justify-center rounded-lg',
                          sourceType === 'builtin' && 'bg-blue-500/10',
                          sourceType === 'local' && 'bg-green-500/10',
                          sourceType === 'marketplace' && 'bg-purple-500/10',
                          sourceType === 'github' && 'bg-orange-500/10'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-5 w-5',
                            sourceType === 'builtin' && 'text-blue-500',
                            sourceType === 'local' && 'text-green-500',
                            sourceType === 'marketplace' && 'text-purple-500',
                            sourceType === 'github' && 'text-orange-500'
                          )}
                        />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold">{getSourceLabel(sourceType)}</div>
                        <div className="text-xs text-muted-foreground">
                          {getSourceDescription(sourceType)}
                        </div>
                      </div>
                      <Badge variant="secondary" className="ml-2">
                        {groupSkills.length}
                      </Badge>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-5 w-5 text-muted-foreground transition-transform duration-200',
                        isOpen && 'transform rotate-180'
                      )}
                    />
                  </CollapsibleTrigger>

                  {/* 그룹 컨텐츠 */}
                  <CollapsibleContent>
                    <div className="border-t">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40%]">
                              {t('settings.skills.manager.table.name')}
                            </TableHead>
                            <TableHead className="w-[15%]">
                              {t('settings.skills.manager.table.category')}
                            </TableHead>
                            <TableHead className="w-[10%]">
                              {t('settings.skills.manager.table.version')}
                            </TableHead>
                            <TableHead className="w-[10%] text-center">
                              {t('settings.skills.manager.table.usage')}
                            </TableHead>
                            <TableHead className="w-[15%]">
                              {t('settings.skills.manager.table.installed')}
                            </TableHead>
                            <TableHead className="w-[10%] text-center">
                              {t('settings.skills.manager.table.enabled')}
                            </TableHead>
                            <TableHead className="w-[5%]"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>{groupSkills.map((skill) => renderSkillRow(skill))}</TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      </div>

      {/* 제거 확인 다이얼로그 */}
      <AlertDialog
        open={deleteDialog.open}
        onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.skills.manager.deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="settings.skills.manager.deleteDialog.desc"
                values={{ name: deleteDialog.skillName }}
                components={{ 1: <span className="font-semibold" /> }}
              />
              <br />
              {t('settings.skills.manager.deleteDialog.warning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
