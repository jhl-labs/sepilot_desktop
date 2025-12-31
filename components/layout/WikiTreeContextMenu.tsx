'use client';

import { ReactNode } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  FolderPlus,
  Pin,
  PinOff,
  Star,
  StarOff,
  EyeOff,
  Eye,
  Palette,
  FileEdit,
  Trash2,
  Move,
  Circle,
} from 'lucide-react';
import { WIKI_COLORS } from '@/types/wiki-tree';
import { useTranslation } from 'react-i18next';

export interface WikiTreeContextMenuProps {
  children: ReactNode;
  itemType: 'file' | 'group' | 'root';
  itemId: string;
  itemName: string;
  isPinned?: boolean;
  isFavorite?: boolean;
  isHidden?: boolean;
  currentColor?: string;
  isInGroup?: boolean;
  onCreateGroup?: () => void;
  onAddToGroup?: () => void;
  onRemoveFromGroup?: () => void;
  onPin?: () => void;
  onUnpin?: () => void;
  onFavorite?: () => void;
  onUnfavorite?: () => void;
  onHide?: () => void;
  onShow?: () => void;
  onChangeColor?: (color: string) => void;
  onChangeIcon?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  onMove?: () => void;
}

export function WikiTreeContextMenu({
  children,
  itemType,
  itemId: _itemId,
  itemName: _itemName,
  isPinned = false,
  isFavorite = false,
  isHidden = false,
  currentColor,
  isInGroup = false,
  onCreateGroup,
  onAddToGroup,
  onRemoveFromGroup,
  onPin,
  onUnpin,
  onFavorite,
  onUnfavorite,
  onHide,
  onShow,
  onChangeColor,
  onChangeIcon,
  onRename,
  onDelete,
  onMove,
}: WikiTreeContextMenuProps) {
  const { t } = useTranslation();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        {/* Pin/Unpin */}
        {itemType !== 'root' && (
          <>
            {!isPinned ? (
              <ContextMenuItem onClick={onPin}>
                <Pin className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.pin')}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={onUnpin}>
                <PinOff className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.unpin')}
              </ContextMenuItem>
            )}
          </>
        )}

        {/* Favorite/Unfavorite */}
        {itemType === 'file' && (
          <>
            {!isFavorite ? (
              <ContextMenuItem onClick={onFavorite}>
                <Star className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.addToFavorites')}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={onUnfavorite}>
                <StarOff className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.removeFromFavorites')}
              </ContextMenuItem>
            )}
          </>
        )}

        {/* Hide/Show */}
        {itemType === 'file' && (
          <>
            {!isHidden ? (
              <ContextMenuItem onClick={onHide}>
                <EyeOff className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.hide')}
              </ContextMenuItem>
            ) : (
              <ContextMenuItem onClick={onShow}>
                <Eye className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.show')}
              </ContextMenuItem>
            )}
          </>
        )}

        {itemType !== 'root' && <ContextMenuSeparator />}

        {/* Group Operations */}
        {itemType === 'file' && (
          <>
            {!isInGroup && onAddToGroup && (
              <ContextMenuItem onClick={onAddToGroup}>
                <FolderPlus className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.addToGroup')}
              </ContextMenuItem>
            )}
            {isInGroup && onRemoveFromGroup && (
              <ContextMenuItem onClick={onRemoveFromGroup}>
                <FolderPlus className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.removeFromGroup')}
              </ContextMenuItem>
            )}
          </>
        )}

        {itemType === 'root' && onCreateGroup && (
          <ContextMenuItem onClick={onCreateGroup}>
            <FolderPlus className="mr-2 h-4 w-4" />
            {t('wikiTree.contextMenu.createGroup')}
          </ContextMenuItem>
        )}

        {/* Color Selection */}
        {itemType !== 'root' && onChangeColor && (
          <>
            <ContextMenuSeparator />
            <ContextMenuSub>
              <ContextMenuSubTrigger>
                <Palette className="mr-2 h-4 w-4" />
                {t('wikiTree.contextMenu.changeColor')}
              </ContextMenuSubTrigger>
              <ContextMenuSubContent className="w-48">
                <div className="grid grid-cols-6 gap-1 p-2">
                  {Object.entries(WIKI_COLORS).map(([name, hex]) => (
                    <button
                      key={name}
                      onClick={() => onChangeColor(name)}
                      className={`w-6 h-6 rounded-full hover:ring-2 hover:ring-offset-1 hover:ring-primary ${
                        currentColor === name ? 'ring-2 ring-offset-1 ring-primary' : ''
                      }`}
                      style={{ backgroundColor: hex }}
                      title={name}
                      aria-label={`Color: ${name}`}
                    />
                  ))}
                </div>
                {currentColor && (
                  <>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onChangeColor('')}>
                      <Circle className="mr-2 h-4 w-4" />
                      {t('wikiTree.contextMenu.removeColor')}
                    </ContextMenuItem>
                  </>
                )}
              </ContextMenuSubContent>
            </ContextMenuSub>
          </>
        )}

        {/* Icon Selection */}
        {itemType !== 'root' && onChangeIcon && (
          <ContextMenuItem onClick={onChangeIcon}>
            <FileEdit className="mr-2 h-4 w-4" />
            {t('wikiTree.contextMenu.changeIcon')}
          </ContextMenuItem>
        )}

        {/* Move */}
        {itemType !== 'root' && onMove && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onMove}>
              <Move className="mr-2 h-4 w-4" />
              {t('wikiTree.contextMenu.move')}
            </ContextMenuItem>
          </>
        )}

        {/* Rename */}
        {itemType === 'group' && onRename && (
          <ContextMenuItem onClick={onRename}>
            <FileEdit className="mr-2 h-4 w-4" />
            {t('wikiTree.contextMenu.rename')}
          </ContextMenuItem>
        )}

        {/* Delete */}
        {itemType === 'group' && onDelete && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={onDelete} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              {t('wikiTree.contextMenu.deleteGroup')}
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
