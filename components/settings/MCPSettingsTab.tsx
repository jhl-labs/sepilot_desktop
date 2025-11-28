'use client';

import { useState } from 'react';
import { MCPServerList } from '@/components/mcp/MCPServerList';
import { MCPServerConfigComponent } from '@/components/mcp/MCPServerConfig';

export function MCPSettingsTab() {
  const [mcpRefreshKey, setMcpRefreshKey] = useState(0);

  return (
    <div className="space-y-8">
      {/* MCP 서버 목록 - 먼저 표시 */}
      <div className="space-y-4">
        <MCPServerList
          key={mcpRefreshKey}
          onRefresh={() => {
            setMcpRefreshKey((prev) => prev + 1);
          }}
        />
      </div>

      {/* 구분선 */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-dashed" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-3 text-muted-foreground">새 서버 추가</span>
        </div>
      </div>

      {/* MCP 서버 추가 폼 */}
      <div className="space-y-4">
        <MCPServerConfigComponent
          onAdd={() => {
            setMcpRefreshKey((prev) => prev + 1);
          }}
        />
      </div>
    </div>
  );
}
