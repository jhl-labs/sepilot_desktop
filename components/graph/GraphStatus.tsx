'use client';

import { StreamEvent } from '@/lib/langgraph';
import { Loader2 } from 'lucide-react';

interface GraphStatusProps {
  isRunning: boolean;
  currentNode?: string;
  events: StreamEvent[];
}

export function GraphStatus({ isRunning, currentNode, events }: GraphStatusProps) {
  if (!isRunning && events.length === 0) {
    return null;
  }

  return (
    <div className="border-b bg-muted/50 px-4 py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {isRunning && (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              실행 중{currentNode && `: ${getNodeName(currentNode)}`}
            </span>
          </>
        )}

        {!isRunning && events.length > 0 && (
          <span className="text-xs">
            완료 ({events.filter((e) => e.type === 'node').length}개 노드 실행됨)
          </span>
        )}
      </div>
    </div>
  );
}

function getNodeName(nodeName: string): string {
  const nodeNames: Record<string, string> = {
    generate: 'LLM 응답 생성',
    retrieve: '문서 검색',
    rerank: '문서 재정렬',
    tools: '도구 실행',
  };

  return nodeNames[nodeName] || nodeName;
}
