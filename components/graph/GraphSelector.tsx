'use client';

import { GraphType } from '@/lib/langgraph';
import { cn } from '@/lib/utils';
import { MessageSquare, Database, Wrench } from 'lucide-react';

interface GraphSelectorProps {
  selected: GraphType;
  onSelect: (type: GraphType) => void;
}

export function GraphSelector({ selected, onSelect }: GraphSelectorProps) {
  const graphs = [
    {
      type: 'chat' as GraphType,
      name: '기본 채팅',
      description: '일반 LLM 대화',
      icon: MessageSquare,
    },
    {
      type: 'rag' as GraphType,
      name: 'RAG 채팅',
      description: '문서 검색 + LLM',
      icon: Database,
    },
    {
      type: 'agent' as GraphType,
      name: 'Agent',
      description: '도구 사용 가능',
      icon: Wrench,
    },
  ];

  return (
    <div className="flex gap-2 p-2 border-b bg-background">
      {graphs.map((graph) => {
        const Icon = graph.icon;
        return (
          <button
            key={graph.type}
            onClick={() => onSelect(graph.type)}
            className={cn(
              'flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
              selected === graph.type
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80'
            )}
            title={graph.description}
          >
            <Icon className="h-4 w-4" />
            <span className="font-medium">{graph.name}</span>
          </button>
        );
      })}
    </div>
  );
}
