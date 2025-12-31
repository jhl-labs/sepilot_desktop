'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Hash,
  ExternalLink,
  Star,
  Pin,
  Folder,
  Plus,
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { useChatStore } from '@/lib/store/chat-store';
import { useFileSystem } from '@/hooks/use-file-system';
import { getLanguageFromFilename } from '@/lib/utils/file-language';
import {
  parseMarkdown,
  extractMarkdownTitle,
  buildHeadingHierarchy,
} from '@/lib/utils/markdown-parser';
import type { HeadingNode } from '@/lib/utils/markdown-parser';
import { logger } from '@/lib/utils/logger';
import { useTranslation } from 'react-i18next';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  useDroppable,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { WikiTreeContextMenu } from './WikiTreeContextMenu';
import { WikiGroupDialog } from './WikiGroupDialog';
import { WikiIconDialog } from './WikiIconDialog';
import { Button } from '@/components/ui/button';
import {
  WikiTreeConfig,
  WikiTreeGroup,
  WikiTreeFile,
  DEFAULT_WIKI_CONFIG,
  WIKI_COLORS,
  WikiColor,
} from '@/types/wiki-tree';

interface WikiFileNode {
  path: string;
  filename: string;
  title: string;
  headings: HeadingNode[];
  linkCount: number;
}

interface SortableFileItemProps {
  file: WikiFileNode;
  config: WikiTreeFile | null;
  isActive: boolean;
  isExpanded: boolean;
  childFiles?: WikiFileNode[]; // Child files for nesting
  depth?: number; // Nesting depth
  wikiConfig: WikiTreeConfig; // For child rendering
  activeFilePath: string | null; // For child rendering
  expandedFiles: Set<string>; // For child rendering
  getChildren: (parentPath: string) => WikiFileNode[]; // For child rendering
  onFileClick: (file: WikiFileNode) => void;
  onToggleExpanded: (filePath: string) => void;
  onPin: () => void;
  onUnpin: () => void;
  onFavorite: () => void;
  onUnfavorite: () => void;
  onChangeColor: (color: string) => void;
  onChangeIcon: () => void;
}

function SortableFileItem({
  file,
  config,
  isActive,
  isExpanded,
  childFiles = [],
  depth = 0,
  wikiConfig,
  activeFilePath,
  expandedFiles,
  getChildren,
  onFileClick,
  onToggleExpanded,
  onPin,
  onUnpin,
  onFavorite,
  onUnfavorite,
  onChangeColor,
  onChangeIcon,
}: SortableFileItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: file.path,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const hasHeadings = file.headings.length > 0;
  const hasChildren = childFiles.length > 0;
  const hasExpandable = hasHeadings || hasChildren;
  const isPinned = config?.pinned || false;
  const isFavorite = config?.favorite || false;
  const customColor = config?.color ? WIKI_COLORS[config.color as WikiColor] : undefined;
  const CustomIcon = config?.icon ? (Icons[config.icon as keyof typeof Icons] as any) : undefined;

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <WikiTreeContextMenu
        itemType="file"
        itemId={file.path}
        itemName={file.title}
        isPinned={isPinned}
        isFavorite={isFavorite}
        currentColor={config?.color}
        isInGroup={!!config?.groupId}
        onPin={onPin}
        onUnpin={onUnpin}
        onFavorite={onFavorite}
        onUnfavorite={onUnfavorite}
        onChangeColor={onChangeColor}
        onChangeIcon={onChangeIcon}
      >
        <div style={{ marginLeft: `${depth * 16}px` }}>
          <div
            className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer group ${
              isActive ? 'bg-primary/10 text-primary' : 'hover:bg-muted/50'
            }`}
            onClick={() => onFileClick(file)}
            {...listeners}
          >
            {/* Chevron */}
            {hasExpandable ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleExpanded(file.path);
                }}
                className="shrink-0 p-0.5 hover:bg-muted rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
              </button>
            ) : (
              <div className="w-4" />
            )}

            {/* Icon */}
            {CustomIcon ? (
              <CustomIcon className="h-4 w-4 shrink-0" style={{ color: customColor }} />
            ) : (
              <FileText
                className={`h-4 w-4 shrink-0`}
                style={{ color: customColor || (isActive ? undefined : 'var(--muted-foreground)') }}
              />
            )}

            {/* Title and badges */}
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span
                className={`text-sm truncate ${isActive ? 'font-medium' : ''}`}
                style={{ color: customColor }}
              >
                {config?.customTitle || file.title}
              </span>

              {/* Badges */}
              <div className="flex items-center gap-1 shrink-0">
                {isPinned && <Pin className="h-3 w-3 text-orange-500" />}
                {isFavorite && <Star className="h-3 w-3 text-yellow-500 fill-yellow-500" />}
                {file.linkCount > 0 && (
                  <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <ExternalLink className="h-3 w-3" />
                    {file.linkCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Headings Tree */}
          {isExpanded && hasHeadings && (
            <div className="ml-5 mt-0.5 space-y-0.5">
              {file.headings.map((headingNode) => renderHeadingNode(headingNode, isActive))}
            </div>
          )}

          {/* Child Files (Nested Pages) */}
          {isExpanded && hasChildren && (
            <div className="mt-0.5 space-y-0.5">
              {childFiles.map((childFile) => {
                const childConfig = wikiConfig.files[childFile.path] || null;
                const childChildren = getChildren(childFile.path);
                return (
                  <SortableFileItem
                    key={childFile.path}
                    file={childFile}
                    config={childConfig}
                    isActive={activeFilePath === childFile.path}
                    isExpanded={expandedFiles.has(childFile.path)}
                    childFiles={childChildren}
                    depth={depth + 1}
                    wikiConfig={wikiConfig}
                    activeFilePath={activeFilePath}
                    expandedFiles={expandedFiles}
                    getChildren={getChildren}
                    onFileClick={onFileClick}
                    onToggleExpanded={onToggleExpanded}
                    onPin={onPin}
                    onUnpin={onUnpin}
                    onFavorite={onFavorite}
                    onUnfavorite={onUnfavorite}
                    onChangeColor={onChangeColor}
                    onChangeIcon={onChangeIcon}
                  />
                );
              })}
            </div>
          )}
        </div>
      </WikiTreeContextMenu>
    </div>
  );
}

function renderHeadingNode(
  node: HeadingNode,
  fileIsActive: boolean,
  depth: number = 0
): React.ReactElement {
  const hasChildren = node.children.length > 0;

  return (
    <div key={`${node.heading.line}-${depth}`} style={{ marginLeft: `${depth * 12}px` }}>
      <div
        className={`flex items-center gap-1 py-0.5 text-xs cursor-pointer hover:bg-muted/50 rounded px-1 ${
          fileIsActive ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <Hash className="h-3 w-3 shrink-0" />
        <span className="truncate">{node.heading.text}</span>
      </div>
      {hasChildren &&
        node.children.map((child) => renderHeadingNode(child, fileIsActive, depth + 1))}
    </div>
  );
}

export function WikiTree() {
  const { t } = useTranslation();
  const { workingDirectory, openFile, activeFilePath } = useChatStore();
  const { readFile } = useFileSystem();

  // State
  const [wikiFiles, setWikiFiles] = useState<WikiFileNode[]>([]);
  const [wikiConfig, setWikiConfig] = useState<WikiTreeConfig>(DEFAULT_WIKI_CONFIG);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  // Dialog state
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [groupDialogMode, setGroupDialogMode] = useState<'create' | 'edit'>('create');
  const [editingGroup, setEditingGroup] = useState<WikiTreeGroup | null>(null);
  const [iconDialogOpen, setIconDialogOpen] = useState(false);
  const [iconDialogTarget, setIconDialogTarget] = useState<{
    type: 'file' | 'group';
    id: string;
  } | null>(null);

  // Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load markdown files and config
  useEffect(() => {
    if (!workingDirectory) {
      setWikiFiles([]);
      return;
    }

    loadWikiTree();
  }, [workingDirectory]);

  const loadWikiTree = async () => {
    if (!workingDirectory || !window.electronAPI) {
      return;
    }

    setIsLoading(true);
    try {
      // Load config file
      const configResult = await window.electronAPI.fs.readWikiConfig(workingDirectory);
      if (configResult.success && configResult.data) {
        setWikiConfig(configResult.data);
        setExpandedGroups(new Set(configResult.data.expandedGroups || []));
      } else {
        setWikiConfig(DEFAULT_WIKI_CONFIG);
      }

      // Load markdown files
      const result = await window.electronAPI.fs.findFiles(workingDirectory, '**/*.md');

      if (!result.success || !result.data) {
        console.error('[WikiTree] Failed to find markdown files:', result.error);
        setWikiFiles([]);
        return;
      }

      const mdFiles = result.data;
      logger.info(`[WikiTree] Found ${mdFiles.length} markdown files`);

      // Parse each markdown file
      const parsedFiles: WikiFileNode[] = [];

      for (const filePath of mdFiles) {
        const content = await readFile(filePath);
        if (content === null) {
          continue;
        }

        const filename = filePath.split(/[\\/]/).pop() || filePath;
        const parsed = parseMarkdown(content);
        const title = extractMarkdownTitle(content, filename);
        const headingHierarchy = buildHeadingHierarchy(parsed.headings);

        parsedFiles.push({
          path: filePath,
          filename,
          title,
          headings: headingHierarchy,
          linkCount: parsed.links.length,
        });
      }

      setWikiFiles(parsedFiles);
    } catch (error) {
      console.error('[WikiTree] Failed to load wiki tree:', error);
      setWikiFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const saveConfig = useCallback(
    async (newConfig: WikiTreeConfig) => {
      if (!workingDirectory || !window.electronAPI) {
        return;
      }

      const configToSave = {
        ...newConfig,
        lastModified: Date.now(),
      };

      const result = await window.electronAPI.fs.writeWikiConfig(workingDirectory, configToSave);
      if (result.success) {
        setWikiConfig(configToSave);
      } else {
        console.error('[WikiTree] Failed to save config:', result.error);
      }
    },
    [workingDirectory]
  );

  const handleFileClick = async (file: WikiFileNode) => {
    const content = await readFile(file.path);
    if (content !== null) {
      const language = getLanguageFromFilename(file.filename);
      openFile({
        path: file.path,
        filename: file.filename,
        content,
        language,
      });
    }
  };

  // Get children files for nesting
  const getChildren = useCallback(
    (parentPath: string): WikiFileNode[] => {
      return wikiFiles
        .filter((file) => {
          const fileConfig = wikiConfig.files[file.path];
          return fileConfig?.parentId === parentPath && !fileConfig?.hidden;
        })
        .sort((a, b) => {
          const aConfig = wikiConfig.files[a.path];
          const bConfig = wikiConfig.files[b.path];
          const aOrder = aConfig?.order ?? Infinity;
          const bOrder = bConfig?.order ?? Infinity;

          if (aOrder !== bOrder) {
            return aOrder - bOrder;
          }

          return a.title.localeCompare(b.title);
        });
    },
    [wikiFiles, wikiConfig]
  );

  const toggleExpanded = (filePath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const toggleGroupExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });

    // Save to config
    const newExpandedGroups = Array.from(
      expandedGroups.has(groupId)
        ? new Set([...expandedGroups].filter((id) => id !== groupId))
        : new Set([...expandedGroups, groupId])
    );
    saveConfig({ ...wikiConfig, expandedGroups: newExpandedGroups });
  };

  // Context menu handlers
  // File actions
  const handlePin = (filePath: string) => {
    const updatedFiles = {
      ...wikiConfig.files,
      [filePath]: {
        ...(wikiConfig.files[filePath] || {}),
        pinned: true,
      },
    };
    const updatedPinnedFiles = [...new Set([...wikiConfig.pinnedFiles, filePath])];
    saveConfig({ ...wikiConfig, files: updatedFiles, pinnedFiles: updatedPinnedFiles });
  };

  const handleUnpin = (filePath: string) => {
    const updatedFiles = {
      ...wikiConfig.files,
      [filePath]: {
        ...(wikiConfig.files[filePath] || {}),
        pinned: false,
      },
    };
    const updatedPinnedFiles = wikiConfig.pinnedFiles.filter((f) => f !== filePath);
    saveConfig({ ...wikiConfig, files: updatedFiles, pinnedFiles: updatedPinnedFiles });
  };

  const handleFavorite = (filePath: string) => {
    const updatedFiles = {
      ...wikiConfig.files,
      [filePath]: {
        ...(wikiConfig.files[filePath] || {}),
        favorite: true,
      },
    };
    const updatedFavorites = [...new Set([...wikiConfig.favorites, filePath])];
    saveConfig({ ...wikiConfig, files: updatedFiles, favorites: updatedFavorites });
  };

  const handleUnfavorite = (filePath: string) => {
    const updatedFiles = {
      ...wikiConfig.files,
      [filePath]: {
        ...(wikiConfig.files[filePath] || {}),
        favorite: false,
      },
    };
    const updatedFavorites = wikiConfig.favorites.filter((f) => f !== filePath);
    saveConfig({ ...wikiConfig, files: updatedFiles, favorites: updatedFavorites });
  };

  const handleChangeColor = (filePath: string, color: string) => {
    const updatedFiles = {
      ...wikiConfig.files,
      [filePath]: {
        ...(wikiConfig.files[filePath] || {}),
        color: color || undefined,
      },
    };
    saveConfig({ ...wikiConfig, files: updatedFiles });
  };

  const handleChangeIcon = (filePath: string) => {
    setIconDialogTarget({ type: 'file', id: filePath });
    setIconDialogOpen(true);
  };

  // Group management
  const handleCreateGroup = () => {
    setGroupDialogMode('create');
    setEditingGroup(null);
    setGroupDialogOpen(true);
  };

  const handleSaveGroup = (data: { name: string; icon?: string; color?: string }) => {
    const newGroup: WikiTreeGroup = {
      id: `group-${Date.now()}`,
      name: data.name,
      icon: data.icon,
      color: data.color,
      order: wikiConfig.groups.length,
      fileIds: [],
    };

    saveConfig({
      ...wikiConfig,
      groups: [...wikiConfig.groups, newGroup],
    });
  };

  // Drag and drop handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if overId is a group ID
    const isOverGroup = groups.some((g) => g.id === overId);

    // Find which section the files belong to
    const { pinnedFiles, ungroupedFiles, groupedFiles } = organizedFiles();

    const isActivePinned = pinnedFiles.some((f) => f.path === activeId);
    const isOverPinned = pinnedFiles.some((f) => f.path === overId);
    const isActiveUngrouped = ungroupedFiles.some((f) => f.path === activeId);
    const isOverUngrouped = ungroupedFiles.some((f) => f.path === overId);

    let activeGroupId: string | undefined;
    let overGroupId: string | undefined;

    groupedFiles.forEach((files, groupId) => {
      if (files.some((f) => f.path === activeId)) {
        activeGroupId = groupId;
      }
      if (files.some((f) => f.path === overId)) {
        overGroupId = groupId;
      }
    });

    // Determine if this is reordering or nesting
    const updatedFiles = { ...wikiConfig.files };

    // Helper to update file order
    const updateOrder = (filePaths: string[]) => {
      filePaths.forEach((path, index) => {
        if (!updatedFiles[path]) {
          updatedFiles[path] = { id: path, order: index };
        } else {
          updatedFiles[path] = { ...updatedFiles[path], order: index };
        }
      });
    };

    // Moving to a group
    if (isOverGroup) {
      if (!updatedFiles[activeId]) {
        updatedFiles[activeId] = { id: activeId, order: 0 };
      }
      updatedFiles[activeId] = {
        ...updatedFiles[activeId],
        groupId: overId,
        parentId: undefined, // Remove parent if moving to group
        pinned: false, // Remove pinned status
        order: 0,
      };
      // Remove from pinnedFiles if it was pinned
      const updatedPinnedFiles = wikiConfig.pinnedFiles.filter((f) => f !== activeId);
      saveConfig({ ...wikiConfig, files: updatedFiles, pinnedFiles: updatedPinnedFiles });
      return;
    }

    // Reorder within the same section
    if (isActivePinned && isOverPinned) {
      // Reorder pinned files
      const oldIndex = pinnedFiles.findIndex((f) => f.path === activeId);
      const newIndex = pinnedFiles.findIndex((f) => f.path === overId);
      const reordered = arrayMove(pinnedFiles, oldIndex, newIndex);
      updateOrder(reordered.map((f) => f.path));
      saveConfig({ ...wikiConfig, files: updatedFiles, pinnedFiles: reordered.map((f) => f.path) });
    } else if (isActiveUngrouped && isOverUngrouped) {
      // Reorder ungrouped files
      const oldIndex = ungroupedFiles.findIndex((f) => f.path === activeId);
      const newIndex = ungroupedFiles.findIndex((f) => f.path === overId);
      const reordered = arrayMove(ungroupedFiles, oldIndex, newIndex);
      updateOrder(reordered.map((f) => f.path));
      saveConfig({ ...wikiConfig, files: updatedFiles });
    } else if (activeGroupId && overGroupId && activeGroupId === overGroupId) {
      // Reorder within the same group
      const groupFiles = groupedFiles.get(activeGroupId)!;
      const oldIndex = groupFiles.findIndex((f) => f.path === activeId);
      const newIndex = groupFiles.findIndex((f) => f.path === overId);
      const reordered = arrayMove(groupFiles, oldIndex, newIndex);
      updateOrder(reordered.map((f) => f.path));
      saveConfig({ ...wikiConfig, files: updatedFiles });
    } else {
      // Moving between sections or nesting - set as child of over
      if (!updatedFiles[activeId]) {
        updatedFiles[activeId] = { id: activeId, order: 0 };
      }
      updatedFiles[activeId] = {
        ...updatedFiles[activeId],
        parentId: overId,
        groupId: undefined, // Remove group if nesting as child
        order: 0,
      };
      saveConfig({ ...wikiConfig, files: updatedFiles });
    }
  };

  // Organize files
  const organizedFiles = useCallback(() => {
    const config = wikiConfig;
    const pinnedFiles: WikiFileNode[] = [];
    const groupedFiles: Map<string, WikiFileNode[]> = new Map();
    const ungroupedFiles: WikiFileNode[] = [];

    wikiFiles.forEach((file) => {
      const fileConfig = config.files[file.path];

      // Skip hidden files
      if (fileConfig?.hidden || config.hiddenFiles.includes(file.path)) {
        return;
      }

      // Skip files that have a parent (they'll be rendered as children)
      if (fileConfig?.parentId) {
        return;
      }

      // Pinned files
      if (fileConfig?.pinned || config.pinnedFiles.includes(file.path)) {
        pinnedFiles.push(file);
        return;
      }

      // Grouped files
      if (fileConfig?.groupId) {
        if (!groupedFiles.has(fileConfig.groupId)) {
          groupedFiles.set(fileConfig.groupId, []);
        }
        groupedFiles.get(fileConfig.groupId)!.push(file);
        return;
      }

      // Ungrouped files
      ungroupedFiles.push(file);
    });

    // Sort by custom order or default
    const sortFiles = (files: WikiFileNode[]) => {
      return files.sort((a, b) => {
        const aConfig = config.files[a.path];
        const bConfig = config.files[b.path];
        const aOrder = aConfig?.order ?? Infinity;
        const bOrder = bConfig?.order ?? Infinity;

        if (aOrder !== bOrder) {
          return aOrder - bOrder;
        }

        return a.title.localeCompare(b.title);
      });
    };

    return {
      pinnedFiles: sortFiles(pinnedFiles),
      groups: config.groups.sort((a, b) => a.order - b.order),
      groupedFiles,
      ungroupedFiles: sortFiles(ungroupedFiles),
    };
  }, [wikiFiles, wikiConfig]);

  const { pinnedFiles, groups, groupedFiles, ungroupedFiles } = organizedFiles();

  // Group Header Component with droppable
  const GroupHeader = ({
    group,
    isExpanded,
    filesCount,
  }: {
    group: WikiTreeGroup;
    isExpanded: boolean;
    filesCount: number;
  }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: group.id,
    });

    const GroupIcon = group.icon ? (Icons[group.icon as keyof typeof Icons] as any) : Folder;
    const groupColor = group.color ? WIKI_COLORS[group.color as WikiColor] : undefined;

    return (
      <WikiTreeContextMenu
        itemType="group"
        itemId={group.id}
        itemName={group.name}
        currentColor={group.color}
        onChangeColor={(color) => {
          const updatedGroups = groups.map((g) => (g.id === group.id ? { ...g, color } : g));
          saveConfig({ ...wikiConfig, groups: updatedGroups });
        }}
        onChangeIcon={() => {
          setIconDialogTarget({ type: 'group', id: group.id });
          setIconDialogOpen(true);
        }}
        onRename={() => {
          setEditingGroup(group);
          setGroupDialogMode('edit');
          setGroupDialogOpen(true);
        }}
        onDelete={() => {
          if (window.confirm(t('wikiTree.confirmDeleteGroup', { name: group.name }))) {
            const updatedGroups = groups.filter((g) => g.id !== group.id);
            // Remove group from files
            const updatedFiles = { ...wikiConfig.files };
            Object.keys(updatedFiles).forEach((filePath) => {
              if (updatedFiles[filePath].groupId === group.id) {
                delete updatedFiles[filePath].groupId;
              }
            });
            saveConfig({ ...wikiConfig, groups: updatedGroups, files: updatedFiles });
          }
        }}
      >
        <div
          ref={setNodeRef}
          className={`flex items-center gap-1 py-1 px-1 rounded cursor-pointer hover:bg-muted/50 mb-1 ${
            isOver ? 'bg-primary/20 ring-1 ring-primary' : ''
          }`}
          onClick={() => toggleGroupExpanded(group.id)}
        >
          <button className="shrink-0 p-0.5">
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
          {GroupIcon && <GroupIcon className="h-4 w-4 shrink-0" style={{ color: groupColor }} />}
          <span className="text-sm font-medium" style={{ color: groupColor }}>
            {group.name}
          </span>
          <span className="text-xs text-muted-foreground ml-auto">{filesCount}</span>
        </div>
      </WikiTreeContextMenu>
    );
  };

  // Render group
  const renderGroup = (group: WikiTreeGroup) => {
    const isExpanded = expandedGroups.has(group.id);
    const files = groupedFiles.get(group.id) || [];

    return (
      <div key={group.id} className="mb-2">
        <GroupHeader group={group} isExpanded={isExpanded} filesCount={files.length} />

        {isExpanded && (
          <div className="ml-4 space-y-0.5">
            {files.map((file) => {
              const fileConfig = wikiConfig.files[file.path] || null;
              return (
                <SortableFileItem
                  key={file.path}
                  file={file}
                  config={fileConfig}
                  isActive={activeFilePath === file.path}
                  isExpanded={expandedFiles.has(file.path)}
                  childFiles={getChildren(file.path)}
                  wikiConfig={wikiConfig}
                  activeFilePath={activeFilePath}
                  expandedFiles={expandedFiles}
                  getChildren={getChildren}
                  onFileClick={handleFileClick}
                  onToggleExpanded={toggleExpanded}
                  onPin={() => handlePin(file.path)}
                  onUnpin={() => handleUnpin(file.path)}
                  onFavorite={() => handleFavorite(file.path)}
                  onUnfavorite={() => handleUnfavorite(file.path)}
                  onChangeColor={(color) => handleChangeColor(file.path, color)}
                  onChangeIcon={() => handleChangeIcon(file.path)}
                />
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        {t('wikiTree.loading')}
      </div>
    );
  }

  if (!workingDirectory) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
        <FileText className="mb-2 h-8 w-8 opacity-50" />
        <p className="text-sm">{t('wikiTree.selectDirectoryMessage')}</p>
      </div>
    );
  }

  if (wikiFiles.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
        {t('wikiTree.noMarkdownFiles')}
      </div>
    );
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="space-y-1">
          {/* Create Group Button */}
          <WikiTreeContextMenu
            itemType="root"
            itemId="root"
            itemName="root"
            onCreateGroup={handleCreateGroup}
          >
            <div className="px-1 py-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCreateGroup}
                className="w-full justify-start gap-2"
              >
                <Plus className="h-4 w-4" />
                {t('wikiTree.contextMenu.createGroup')}
              </Button>
            </div>
          </WikiTreeContextMenu>

          {/* Pinned Files */}
          {pinnedFiles.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-1">
                {t('wikiTree.pinned')}
              </div>
              <SortableContext
                items={pinnedFiles.map((f) => f.path)}
                strategy={verticalListSortingStrategy}
              >
                {pinnedFiles.map((file) => {
                  const fileConfig = wikiConfig.files[file.path] || null;
                  return (
                    <SortableFileItem
                      key={file.path}
                      file={file}
                      config={fileConfig}
                      isActive={activeFilePath === file.path}
                      isExpanded={expandedFiles.has(file.path)}
                      childFiles={getChildren(file.path)}
                      wikiConfig={wikiConfig}
                      activeFilePath={activeFilePath}
                      expandedFiles={expandedFiles}
                      getChildren={getChildren}
                      onFileClick={handleFileClick}
                      onToggleExpanded={toggleExpanded}
                      onPin={() => handlePin(file.path)}
                      onUnpin={() => handleUnpin(file.path)}
                      onFavorite={() => handleFavorite(file.path)}
                      onUnfavorite={() => handleUnfavorite(file.path)}
                      onChangeColor={(color) => handleChangeColor(file.path, color)}
                      onChangeIcon={() => handleChangeIcon(file.path)}
                    />
                  );
                })}
              </SortableContext>
            </div>
          )}

          {/* Groups */}
          {groups.map((group) => renderGroup(group))}

          {/* Ungrouped Files */}
          {ungroupedFiles.length > 0 && (
            <div>
              {groups.length > 0 && (
                <div className="text-xs font-semibold text-muted-foreground uppercase px-1 mb-1 mt-4">
                  {t('wikiTree.ungrouped')}
                </div>
              )}
              <SortableContext
                items={ungroupedFiles.map((f) => f.path)}
                strategy={verticalListSortingStrategy}
              >
                {ungroupedFiles.map((file) => {
                  const fileConfig = wikiConfig.files[file.path] || null;
                  return (
                    <SortableFileItem
                      key={file.path}
                      file={file}
                      config={fileConfig}
                      isActive={activeFilePath === file.path}
                      isExpanded={expandedFiles.has(file.path)}
                      childFiles={getChildren(file.path)}
                      wikiConfig={wikiConfig}
                      activeFilePath={activeFilePath}
                      expandedFiles={expandedFiles}
                      getChildren={getChildren}
                      onFileClick={handleFileClick}
                      onToggleExpanded={toggleExpanded}
                      onPin={() => handlePin(file.path)}
                      onUnpin={() => handleUnpin(file.path)}
                      onFavorite={() => handleFavorite(file.path)}
                      onUnfavorite={() => handleUnfavorite(file.path)}
                      onChangeColor={(color) => handleChangeColor(file.path, color)}
                      onChangeIcon={() => handleChangeIcon(file.path)}
                    />
                  );
                })}
              </SortableContext>
            </div>
          )}
        </div>
      </DndContext>

      {/* Dialogs */}
      <WikiGroupDialog
        open={groupDialogOpen}
        mode={groupDialogMode}
        initialData={
          editingGroup
            ? { name: editingGroup.name, icon: editingGroup.icon, color: editingGroup.color }
            : undefined
        }
        onClose={() => {
          setGroupDialogOpen(false);
          setEditingGroup(null);
        }}
        onSave={handleSaveGroup}
      />

      <WikiIconDialog
        open={iconDialogOpen}
        currentIcon={
          iconDialogTarget?.type === 'file'
            ? wikiConfig.files[iconDialogTarget.id]?.icon
            : iconDialogTarget?.type === 'group'
              ? groups.find((g) => g.id === iconDialogTarget.id)?.icon
              : undefined
        }
        onClose={() => {
          setIconDialogOpen(false);
          setIconDialogTarget(null);
        }}
        onSelect={(icon) => {
          if (!iconDialogTarget) {
            return;
          }

          if (iconDialogTarget.type === 'file') {
            const updatedFiles = {
              ...wikiConfig.files,
              [iconDialogTarget.id]: {
                ...wikiConfig.files[iconDialogTarget.id],
                id: iconDialogTarget.id,
                icon,
                order: wikiConfig.files[iconDialogTarget.id]?.order ?? 0,
              },
            };
            saveConfig({ ...wikiConfig, files: updatedFiles });
          } else if (iconDialogTarget.type === 'group') {
            const updatedGroups = groups.map((g) =>
              g.id === iconDialogTarget.id ? { ...g, icon } : g
            );
            saveConfig({ ...wikiConfig, groups: updatedGroups });
          }
        }}
      />
    </>
  );
}
