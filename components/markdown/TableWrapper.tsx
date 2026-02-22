'use client';

import React, { useState } from 'react';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '@/lib/utils/clipboard';
import { toast } from 'sonner';

interface TableWrapperProps {
  children: React.ReactNode;
}

export function TableWrapper({ children }: TableWrapperProps) {
  const [copied, setCopied] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const handleCopyTable = async () => {
    if (!tableRef.current) {
      return;
    }

    // HTML 테이블에서 텍스트 데이터 추출 (간단한 TSV 형태)
    const table = tableRef.current.querySelector('table');
    if (!table) {
      return;
    }

    const rows = Array.from(table.querySelectorAll('tr'));
    const textData = rows
      .map((row) => {
      const cells = Array.from(row.querySelectorAll('th, td'));
        return cells.map((cell) => cell.textContent?.trim() || '').join('\t');
      })
      .join('\n');

    const success = await copyToClipboard(textData);
    if (success) {
      setCopied(true);
      toast.success('표 데이터가 클립보드에 복사되었습니다. (TSV 형식)');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="group relative my-6">
      <div className="absolute -top-3 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopyTable}
          className="h-7 bg-background/80 backdrop-blur-sm shadow-sm gap-1.5"
        >
          {copied ? (
            <Check className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span className="text-[10px]">데이터 복사</span>
        </Button>
      </div>

      <div
        ref={tableRef}
        className="w-full overflow-x-auto rounded-lg border border-border bg-card/50 scrollbar-thin scrollbar-thumb-muted"
      >
        {children}
      </div>
    </div>
  );
}
