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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';

interface CustomPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRun: (prompt: string) => void;
}

export function CustomPromptDialog({ open, onOpenChange, onRun }: CustomPromptDialogProps) {
  const [prompt, setPrompt] = useState('');

  const handleRun = () => {
    if (!prompt.trim()) {
      return;
    }
    onRun(prompt);
    onOpenChange(false);
    setPrompt(''); // Reset after run
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-indigo-500" />
              <span>Custom Prompt</span>
            </div>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="custom-prompt">Enter your instructions for the AI</Label>
            <Textarea
              id="custom-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Convert this to a bulleted list..."
              className="min-h-[100px] font-mono text-sm"
              autoFocus
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleRun} disabled={!prompt.trim()}>
            Run AI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
