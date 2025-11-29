'use client';

import { Globe } from 'lucide-react';

export function BrowserPanel() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-4 text-muted-foreground">
      <Globe className="mb-2 h-12 w-12 opacity-20" />
      <p className="text-center text-sm font-medium">브라우저 기능</p>
      <p className="mt-2 text-center text-xs">
        준비 중입니다
      </p>
    </div>
  );
}
