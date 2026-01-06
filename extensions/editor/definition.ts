/**
 * Editor Extension Definition
 *
 * Extension의 전체 정의를 하나의 객체로 export
 */

import type { ExtensionDefinition } from '@/lib/extensions/types';
import { manifest } from './manifest';
import { EditorWithTerminal } from './components/EditorWithTerminal';
import { SidebarEditor } from './components/SidebarEditor';
import { EditorHeaderActions } from './components/EditorHeaderActions';
import { EditorSettingsTab } from './components/EditorSettingsTab';

export const editorExtension: ExtensionDefinition = {
  manifest,
  MainComponent: EditorWithTerminal,
  SidebarComponent: SidebarEditor,
  HeaderActionsComponent: EditorHeaderActions,
  SettingsTabComponent: EditorSettingsTab,
};
