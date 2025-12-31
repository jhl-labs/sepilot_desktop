'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WIKI_COLORS, WIKI_ICONS, WikiColor, WikiIcon } from '@/types/wiki-tree';
import * as Icons from 'lucide-react';

export interface WikiGroupDialogProps {
  open: boolean;
  mode: 'create' | 'edit';
  initialData?: {
    name: string;
    icon?: string;
    color?: string;
  };
  onClose: () => void;
  onSave: (data: { name: string; icon?: string; color?: string }) => void;
}

export function WikiGroupDialog({
  open,
  mode,
  initialData,
  onClose,
  onSave,
}: WikiGroupDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(undefined);
  const [selectedColor, setSelectedColor] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (open) {
      setName(initialData?.name || '');
      setSelectedIcon(initialData?.icon);
      setSelectedColor(initialData?.color);
    }
  }, [open, initialData]);

  const handleSave = () => {
    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      icon: selectedIcon,
      color: selectedColor,
    });
    handleClose();
  };

  const handleClose = () => {
    setName('');
    setSelectedIcon(undefined);
    setSelectedColor(undefined);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? t('wikiTree.groupDialog.createTitle')
              : t('wikiTree.groupDialog.editTitle')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? t('wikiTree.groupDialog.createDescription')
              : t('wikiTree.groupDialog.editDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Group Name */}
          <div className="space-y-2">
            <Label htmlFor="group-name">{t('wikiTree.groupDialog.name')}</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('wikiTree.groupDialog.namePlaceholder')}
              autoFocus
            />
          </div>

          {/* Icon Selection */}
          <div className="space-y-2">
            <Label>{t('wikiTree.groupDialog.icon')}</Label>
            <div className="grid grid-cols-10 gap-2 p-4 border rounded-md max-h-60 overflow-y-auto">
              {WIKI_ICONS.map((iconName) => {
                const IconComponent = Icons[iconName as keyof typeof Icons] as any;
                if (!IconComponent) return null;

                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={`p-2 rounded hover:bg-muted flex items-center justify-center ${
                      selectedIcon === iconName ? 'bg-primary text-primary-foreground' : ''
                    }`}
                    title={iconName}
                  >
                    <IconComponent className="h-5 w-5" />
                  </button>
                );
              })}
            </div>
            {selectedIcon && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{t('wikiTree.groupDialog.selectedIcon')}:</span>
                <span className="font-medium">{selectedIcon}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedIcon(undefined)}
                  className="h-6"
                >
                  {t('wikiTree.groupDialog.clearIcon')}
                </Button>
              </div>
            )}
          </div>

          {/* Color Selection */}
          <div className="space-y-2">
            <Label>{t('wikiTree.groupDialog.color')}</Label>
            <div className="grid grid-cols-9 gap-2 p-4 border rounded-md">
              {Object.entries(WIKI_COLORS).map(([name, hex]) => (
                <button
                  key={name}
                  onClick={() => setSelectedColor(name)}
                  className={`w-full aspect-square rounded hover:ring-2 hover:ring-offset-2 hover:ring-primary ${
                    selectedColor === name ? 'ring-2 ring-offset-2 ring-primary' : ''
                  }`}
                  style={{ backgroundColor: hex }}
                  title={name}
                  aria-label={`Color: ${name}`}
                />
              ))}
            </div>
            {selectedColor && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: WIKI_COLORS[selectedColor as WikiColor] }}
                />
                <span>{t('wikiTree.groupDialog.selectedColor')}:</span>
                <span className="font-medium">{selectedColor}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedColor(undefined)}
                  className="h-6"
                >
                  {t('wikiTree.groupDialog.clearColor')}
                </Button>
              </div>
            )}
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>{t('wikiTree.groupDialog.preview')}</Label>
            <div className="p-4 border rounded-md bg-muted/30">
              <div className="flex items-center gap-2">
                {selectedIcon && (() => {
                  const IconComponent = Icons[selectedIcon as keyof typeof Icons] as any;
                  return IconComponent ? (
                    <IconComponent
                      className="h-5 w-5"
                      style={{
                        color: selectedColor
                          ? WIKI_COLORS[selectedColor as WikiColor]
                          : undefined,
                      }}
                    />
                  ) : null;
                })()}
                <span
                  className="font-medium"
                  style={{
                    color: selectedColor ? WIKI_COLORS[selectedColor as WikiColor] : undefined,
                  }}
                >
                  {name || t('wikiTree.groupDialog.untitled')}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            {mode === 'create' ? t('common.create') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
