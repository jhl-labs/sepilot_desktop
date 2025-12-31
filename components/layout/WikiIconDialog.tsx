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
import { Label } from '@/components/ui/label';
import { WIKI_ICONS } from '@/types/wiki-tree';
import * as Icons from 'lucide-react';

export interface WikiIconDialogProps {
  open: boolean;
  currentIcon?: string;
  onClose: () => void;
  onSelect: (icon: string | undefined) => void;
}

export function WikiIconDialog({ open, currentIcon, onClose, onSelect }: WikiIconDialogProps) {
  const { t } = useTranslation();
  const [selectedIcon, setSelectedIcon] = useState<string | undefined>(currentIcon);

  useEffect(() => {
    if (open) {
      setSelectedIcon(currentIcon);
    }
  }, [open, currentIcon]);

  const handleSave = () => {
    onSelect(selectedIcon);
    onClose();
  };

  const handleClear = () => {
    setSelectedIcon(undefined);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('wikiTree.iconDialog.title')}</DialogTitle>
          <DialogDescription>{t('wikiTree.iconDialog.description')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Icon Grid */}
          <div className="space-y-2">
            <Label>{t('wikiTree.iconDialog.selectIcon')}</Label>
            <div className="grid grid-cols-10 gap-2 p-4 border rounded-md max-h-80 overflow-y-auto">
              {WIKI_ICONS.map((iconName) => {
                const IconComponent = Icons[iconName as keyof typeof Icons] as any;
                if (!IconComponent) return null;

                return (
                  <button
                    key={iconName}
                    onClick={() => setSelectedIcon(iconName)}
                    className={`p-3 rounded hover:bg-muted flex items-center justify-center transition-colors ${
                      selectedIcon === iconName ? 'bg-primary text-primary-foreground' : ''
                    }`}
                    title={iconName}
                  >
                    <IconComponent className="h-6 w-6" />
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Icon Display */}
          {selectedIcon && (
            <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/30">
              {(() => {
                const IconComponent = Icons[selectedIcon as keyof typeof Icons] as any;
                return IconComponent ? (
                  <>
                    <IconComponent className="h-8 w-8" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{selectedIcon}</div>
                      <div className="text-xs text-muted-foreground">
                        {t('wikiTree.iconDialog.selected')}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={handleClear}>
                      {t('wikiTree.iconDialog.clear')}
                    </Button>
                  </>
                ) : null;
              })()}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
