'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ToolCategory, CategoryMeta } from '@/lib/langgraph/tools/editor-tools-registry';

/**
 * Tool 정보 (클라이언트용)
 */
interface ToolInfo {
  name: string;
  category: ToolCategory;
  description: string;
  icon: string;
  dangerous?: boolean;
}

/**
 * Category별 Tool 리스트
 */
interface CategoryToolsList {
  category: CategoryMeta;
  tools: ToolInfo[];
}

interface EditorToolsListProps {
  selectable?: boolean;
  selectedTools?: Set<string>;
  onToggleTool?: (toolName: string) => void;
}

/**
 * Editor Tools List Component
 *
 * 사용 가능한 Tool을 Category별로 표시
 * - Collapsible UI (접기/펴기)
 * - 위험한 Tool은 경고 표시
 * - Optional: 선택 가능한 모드 지원
 */
export function EditorToolsList({
  selectable = false,
  selectedTools,
  onToggleTool,
}: EditorToolsListProps = {}) {
  const [toolsByCategory, setToolsByCategory] = useState<CategoryToolsList[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<ToolCategory>>(
    new Set(['file', 'tab']) // 기본적으로 파일, 탭 카테고리 열기
  );
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadTools();
  }, []);

  const loadTools = async () => {
    setIsLoading(true);
    try {
      // Dynamic import to avoid SSR issues
      const { editorToolsRegistry, getAllCategories } = await import('@/lib/langgraph/tools/index');
      const { registerAllEditorTools } = await import('@/lib/langgraph/tools/index');

      // Tool 등록
      registerAllEditorTools();

      // Category별로 Tool 그룹화
      const categories = getAllCategories();
      const grouped: CategoryToolsList[] = categories
        .map((category) => ({
          category,
          tools: editorToolsRegistry.getByCategory(category.id).map((tool) => ({
            name: tool.name,
            category: tool.category,
            description: tool.description,
            icon: tool.icon,
            dangerous: tool.dangerous,
          })),
        }))
        .filter((group) => group.tools.length > 0); // Tool이 있는 카테고리만

      setToolsByCategory(grouped);
    } catch (error) {
      console.error('[EditorToolsList] Failed to load tools:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleCategory = (categoryId: ToolCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        로딩 중...
      </div>
    );
  }

  if (toolsByCategory.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        등록된 Tool이 없습니다
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium mb-3">사용 가능한 Editor Agent 도구</div>

      {toolsByCategory.map(({ category, tools }) => {
        const isExpanded = expandedCategories.has(category.id);

        return (
          <div key={category.id} className="border rounded-lg overflow-hidden">
            {/* Category Header */}
            <button
              onClick={() => toggleCategory(category.id)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{category.icon}</span>
                <span className="text-sm font-medium">
                  {category.label} ({tools.length})
                </span>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {/* Tool List */}
            {isExpanded && (
              <div className="px-3 py-2 space-y-2 bg-background">
                {tools.map((tool) => (
                  <div
                    key={tool.name}
                    className={cn(
                      'flex items-start gap-2 text-xs',
                      tool.dangerous && 'text-orange-600 dark:text-orange-400',
                      selectable && 'cursor-pointer hover:bg-muted/50 rounded p-1 -mx-1'
                    )}
                    onClick={() => selectable && onToggleTool?.(tool.name)}
                  >
                    {selectable && (
                      <input
                        type="checkbox"
                        checked={selectedTools?.has(tool.name) ?? false}
                        onChange={() => onToggleTool?.(tool.name)}
                        className="shrink-0 mt-1"
                      />
                    )}
                    <span className="shrink-0 mt-0.5">{tool.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium flex items-center gap-2">
                        {tool.name}
                        {tool.dangerous && (
                          <span className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded">
                            승인 필요
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground mt-0.5">{tool.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <div className="text-[10px] text-muted-foreground mt-3 px-1">
        💡 Tip: Agent와 대화하면 필요한 도구를 자동으로 선택하여 실행합니다
      </div>
    </div>
  );
}
