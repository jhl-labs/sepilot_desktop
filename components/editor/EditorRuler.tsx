'use client';

import { useState, useEffect, useRef } from 'react';
import type monaco from 'monaco-editor';
import { useChatStore } from '@/lib/store/chat-store';
import { cn } from '@/lib/utils';
import { GripVertical } from 'lucide-react';

interface EditorRulerProps {
  editor: monaco.editor.IStandaloneCodeEditor | null;
  monaco: typeof monaco | null;
}

export function EditorRuler({ editor, monaco }: EditorRulerProps) {
  const { editorAppearanceConfig, setEditorAppearanceConfig } = useChatStore();
  const [handleLeft, setHandleLeft] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const rulerRef = useRef<HTMLDivElement>(null);
  const editorLayoutRef = useRef<{ contentLeft: number; charWidth: number } | null>(null);
  const [editorLayout, setEditorLayout] = useState<{
    contentLeft: number;
    charWidth: number;
  } | null>(null);

  // Real implementation
  useEffect(() => {
    if (!editor || !monaco || isDragging) {
      return;
    }

    const updateMetrics = () => {
      // Safe access using Monaco Enum
      const fontInfoStr = editor.getOption(monaco.editor.EditorOption.fontInfo);
      const fontInfo = fontInfoStr as any;

      // Check validity
      if (!fontInfo || typeof fontInfo.typicalHalfwidthCharacterWidth !== 'number') {
        console.warn('[EditorRuler] Invalid font info:', fontInfo);
        return;
      }

      const layoutInfo = editor.getLayoutInfo();
      if (!layoutInfo) {
        console.warn('[EditorRuler] No layout info');
        return;
      }

      const charWidth = fontInfo.typicalHalfwidthCharacterWidth;
      const contentLeft = layoutInfo.contentLeft;

      if (charWidth <= 0) {
        console.warn('[EditorRuler] Invalid charWidth:', charWidth);
        return;
      }

      // console.log(`[EditorRuler] Updating metrics. charWidth: ${charWidth}, contentLeft: ${contentLeft}, col: ${editorAppearanceConfig.wordWrapColumn}`);

      const layout = { contentLeft, charWidth };
      editorLayoutRef.current = layout;
      setEditorLayout(layout);

      // Calculate initial handle position
      const column = editorAppearanceConfig.wordWrapColumn || 80;
      const px = contentLeft + column * charWidth;
      setHandleLeft(px);
    };

    updateMetrics();

    // Listen to layout changes (e.g. sidebar toggle, resize)
    const disposable = editor.onDidLayoutChange(updateMetrics);
    // Listen to configuration changes (e.g. font size change triggers layout change usually, but maybe not immediately)
    const optionsDisposable = editor.onDidChangeConfiguration(() => updateMetrics());

    return () => {
      disposable.dispose();
      optionsDisposable.dispose();
    };
  }, [
    editor,
    monaco,
    editorAppearanceConfig.wordWrapColumn,
    editorAppearanceConfig.fontSize,
    isDragging,
  ]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    console.log('[EditorRuler] MouseDown');

    setIsDragging(true);
    document.body.style.cursor = 'col-resize';

    const startX = e.clientX;
    const startHandleLeft = handleLeft;

    // Ensure we have metrics
    if ((!editorLayoutRef.current || editorLayoutRef.current.charWidth <= 0) && editor && monaco) {
      const layoutInfo = editor.getLayoutInfo();
      const fontInfo = editor.getOption(monaco.editor.EditorOption.fontInfo);

      if (layoutInfo && fontInfo && fontInfo.typicalHalfwidthCharacterWidth > 0) {
        editorLayoutRef.current = {
          contentLeft: layoutInfo.contentLeft,
          charWidth: fontInfo.typicalHalfwidthCharacterWidth,
        };
      }
    }

    // Store the latest left position in a ref to access it in mouseUp closure
    // without depending on state updates
    let currentLeft = startHandleLeft;

    const handleMouseMove = (mv: MouseEvent) => {
      if (!editorLayoutRef.current || editorLayoutRef.current.charWidth <= 0) {
        return;
      }
      const deltaX = mv.clientX - startX;
      let newLeft = startHandleLeft + deltaX;

      // Constrain
      const { contentLeft, charWidth } = editorLayoutRef.current;
      newLeft = Math.max(contentLeft + charWidth * 10, newLeft); // Min 10 chars for sanity

      // Update local visual state immediately
      setHandleLeft(newLeft);
      currentLeft = newLeft;
    };

    const handleMouseUp = () => {
      console.log('[EditorRuler] MouseUp. Final Left:', currentLeft);
      setIsDragging(false);
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // Finalize store update
      if (editorLayoutRef.current && editorLayoutRef.current.charWidth > 0) {
        const { contentLeft, charWidth } = editorLayoutRef.current;
        const newCol = Math.round((currentLeft - contentLeft) / charWidth);

        console.log('[EditorRuler] Setting wordWrapColumn:', newCol);
        setEditorAppearanceConfig({
          wordWrap: 'wordWrapColumn',
          wordWrapColumn: newCol,
        });
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Only show ruler if we have a valid editor
  if (!editor || !monaco) {
    // If not loaded yet, just return null or empty div to avoid layout shift if possible
    // But we want to indicate loading if debugging
    return <div className="h-5 w-full bg-muted border-b" />;
  }

  return (
    <div
      ref={rulerRef}
      className="h-5 w-full bg-secondary/30 border-b relative select-none overflow-hidden text-[10px] text-muted-foreground flex items-center justify-end px-2"
      title="Drag handle to set max width (Word Wrap Column)"
    >
      <span className="opacity-50">Word Wrap: {editorAppearanceConfig.wordWrapColumn || 80}</span>
      {/* Ruler Ticks (Optional, simple visual) */}
      <div className="absolute inset-0 opacity-20">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute top-2 bottom-0 w-px bg-foreground"
            style={{
              left: (editorLayout?.contentLeft || 0) + i * 10 * (editorLayout?.charWidth || 8),
            }}
          />
        ))}
      </div>

      {/* The Handle */}
      <div
        className={cn(
          'absolute top-0 bottom-0 w-4 -ml-2 flex items-center justify-center cursor-col-resize group z-10 transition-colors',
          isDragging ? 'text-primary' : 'text-muted-foreground hover:text-primary'
        )}
        style={{ left: handleLeft }}
        onMouseDown={handleMouseDown}
      >
        {/* Visual Line */}
        <div
          className={cn(
            'w-0.5 h-full bg-primary/50 group-hover:bg-primary transition-colors',
            isDragging && 'bg-primary w-0.5'
          )}
        />

        {/* Grip Icon */}
        <div
          className={cn(
            'absolute top-0 bg-background shadow-sm border rounded-[1px] p-0.5 transform -translate-y-[2px]',
            isDragging && 'ring-1 ring-primary border-primary'
          )}
        >
          <GripVertical className="h-3 w-3" />
        </div>

        {/* Tooltip on hover/drag */}
        <div
          className={cn(
            'absolute top-5 bg-popover text-popover-foreground text-[10px] px-1.5 py-0.5 rounded border shadow-sm opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none',
            isDragging && 'opacity-100'
          )}
        >
          {editorAppearanceConfig.wordWrapColumn}
        </div>
      </div>

      {/* Shadow indicating the margin area */}
      <div
        className="absolute top-0 bottom-0 left-0 bg-black/5 dark:bg-white/5 pointer-events-none"
        style={{ width: handleLeft }}
      />
    </div>
  );
}
