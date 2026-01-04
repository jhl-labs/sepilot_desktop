'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Globe } from 'lucide-react';

interface TranslateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTranslate: (targetLanguage: string) => void;
}

const LANGUAGES = [
  { value: 'English', label: 'English' },
  { value: 'Korean', label: 'Korean (한국어)' },
  { value: 'Japanese', label: 'Japanese (日本語)' },
  { value: 'Chinese', label: 'Chinese (中文)' },
  { value: 'Spanish', label: 'Spanish (Español)' },
  { value: 'French', label: 'French (Français)' },
  { value: 'German', label: 'German (Deutsch)' },
  { value: 'Russian', label: 'Russian (Русский)' },
];

export function TranslateDialog({ open, onOpenChange, onTranslate }: TranslateDialogProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<string>('English');

  const handleTranslate = () => {
    onTranslate(selectedLanguage);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Translate Selection
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="language" className="text-right">
              Target
            </Label>
            <div className="col-span-3">
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage}>
                <SelectTrigger id="language">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((lang) => (
                    <SelectItem key={lang.value} value={lang.value}>
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleTranslate}>Translate</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
