/**
 * Terminal Extension Definition
 *
 * Extension의 전체 정의를 하나의 객체로 export
 *
 * NOTE: Phase 3 완료 시 활성화 예정
 */

import type { ExtensionDefinition } from '@/lib/extensions/types';
import { manifest } from './manifest';
import { TerminalPanel } from './components/TerminalPanel';
import { SidebarTerminal } from './components/SidebarTerminal';
import { TerminalSettings } from './components/TerminalSettings';
import { createTerminalSlice } from './store';

export const terminalExtension: ExtensionDefinition = {
  manifest,
  MainComponent: TerminalPanel,
  SidebarComponent: SidebarTerminal,
  SettingsTabComponent: TerminalSettings,
  createStoreSlice: createTerminalSlice,
};
