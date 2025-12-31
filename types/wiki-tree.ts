/**
 * Wiki Tree Configuration Types
 *
 * Inspired by Notion and Obsidian wiki navigation features
 */

export interface WikiTreeGroup {
  id: string;
  name: string;
  icon?: string; // Emoji or lucide icon name
  color?: string; // Hex color or predefined color name
  order: number;
  collapsed?: boolean;
  fileIds: string[]; // Array of file paths
}

export interface WikiTreeFile {
  id: string; // File path
  order: number; // Custom order within group or root
  pinned?: boolean; // Pinned to top
  hidden?: boolean; // Hidden from view
  icon?: string; // Custom icon/emoji
  color?: string; // Custom color
  groupId?: string; // Parent group ID
  favorite?: boolean; // Starred/favorited
  customTitle?: string; // Override file title
}

export interface WikiTreeBreadcrumb {
  id: string;
  label: string;
  path: string;
}

export interface WikiTreeConfig {
  version: string; // Config version for migration
  groups: WikiTreeGroup[];
  files: Record<string, WikiTreeFile>; // Map of file path to config
  pinnedFiles: string[]; // Array of pinned file paths (ordered)
  hiddenFiles: string[]; // Array of hidden file paths
  favorites: string[]; // Array of favorite file paths
  expandedGroups: string[]; // Array of expanded group IDs
  lastModified: number; // Timestamp
}

export const DEFAULT_WIKI_CONFIG: WikiTreeConfig = {
  version: '1.0.0',
  groups: [],
  files: {},
  pinnedFiles: [],
  hiddenFiles: [],
  favorites: [],
  expandedGroups: [],
  lastModified: Date.now(),
};

// Predefined colors for groups and files
export const WIKI_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  purple: '#a855f7',
  fuchsia: '#d946ef',
  pink: '#ec4899',
  rose: '#f43f5e',
  gray: '#6b7280',
} as const;

export type WikiColor = keyof typeof WIKI_COLORS;

// Common icons for groups and files
export const WIKI_ICONS = [
  'Book',
  'FileText',
  'Folder',
  'Star',
  'Heart',
  'Bookmark',
  'Tag',
  'Hash',
  'Link',
  'Zap',
  'Lightbulb',
  'Target',
  'Flag',
  'Compass',
  'Map',
  'Box',
  'Archive',
  'Database',
  'Code',
  'Terminal',
  'Settings',
  'Tool',
  'Rocket',
  'Trophy',
  'Award',
  'Gift',
  'Briefcase',
  'Calendar',
  'Clock',
  'Users',
  'User',
] as const;

export type WikiIcon = (typeof WIKI_ICONS)[number];
