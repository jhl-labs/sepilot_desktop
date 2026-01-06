'use client';

import { useChatStore } from '@/lib/store/chat-store';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Plus, Trash2, CheckCircle2, Circle, File, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export function PresentationSourceSidebar() {
  const {
    presentationSources,
    addPresentationSource,
    togglePresentationSource,
    removePresentationSource,
  } = useChatStore();
  const { t } = useTranslation();

  const handleAddFile = async () => {
    // Note: In a real implementation, this would trigger an electron file dialog
    // For now, we'll simulate adding a few mock sources or use the electron API if available
    if (typeof window !== 'undefined' && window.electronAPI) {
      try {
        // Use the exposed higher-level API which handles file reading too
        const response = await window.electronAPI.file.selectDocument();

        if (response.success && response.data && response.data.length > 0) {
          for (const doc of response.data) {
            addPresentationSource({
              id: crypto.randomUUID(),
              name: doc.filename,
              type: 'file',
              path: doc.path,
              content: doc.content, // Now we have actual content!
              isActive: true,
              createdAt: Date.now(),
            });
          }
        }
      } catch (error) {
        console.error('Failed to add documents', error);
      }
    } else {
      // Fallback for browser-only dev mode (if electronAPI missing)
      addPresentationSource({
        id: crypto.randomUUID(),
        name: 'README.md',
        type: 'file',
        content: '# Mock Content',
        isActive: true,
        createdAt: Date.now(),
      });
    }
  };

  return (
    <div className="flex flex-col h-full bg-background border-r">
      <div className="p-4 border-b flex items-center justify-between">
        <h2 className="font-semibold text-sm">Sources</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleAddFile}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {presentationSources.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
              <p>No sources added.</p>
              <p>Add documents to ground your presentation.</p>
            </div>
          )}

          {presentationSources.map((source) => (
            <div
              key={source.id}
              className={cn(
                'flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 group transition-colors',
                source.isActive ? 'bg-muted/30' : 'opacity-70'
              )}
            >
              <button
                onClick={() => togglePresentationSource(source.id)}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                {source.isActive ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>

              <div
                className="flex-1 min-w-0 flex items-center gap-2 cursor-pointer"
                onClick={() => togglePresentationSource(source.id)}
              >
                {source.type === 'file' ? (
                  <File className="h-3.5 w-3.5" />
                ) : (
                  <FileText className="h-3.5 w-3.5" />
                )}
                <span className="text-sm truncate select-none">{source.name}</span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removePresentationSource(source.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>

      <div className="p-4 border-t bg-muted/10">
        <div className="text-xs text-muted-foreground">
          <p>{presentationSources.filter((s) => s.isActive).length} sources selected</p>
        </div>
      </div>
    </div>
  );
}
