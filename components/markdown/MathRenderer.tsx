'use client';

import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { logger } from '@/lib/utils/logger';

interface MathRendererProps {
  formula: string;
  displayMode?: boolean;
}

export function MathRenderer({ formula, displayMode = false }: MathRendererProps) {
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      try {
        katex.render(formula, containerRef.current, {
          displayMode,
          throwOnError: false,
          output: 'html',
          strict: false,
        });
      } catch (error) {
        logger.error('[MathRenderer] Katex rendering error:', error);
        containerRef.current.textContent = formula;
      }
    }
  }, [formula, displayMode]);

  return (
    <span 
      ref={containerRef} 
      className={displayMode ? 'block my-4 overflow-x-auto text-center' : 'inline-block px-1'}
    >
      {formula}
    </span>
  );
}
