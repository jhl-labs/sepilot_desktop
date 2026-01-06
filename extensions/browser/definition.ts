/**
 * Browser Extension Definition
 *
 * Extension의 전체 정의를 하나의 객체로 export
 */

import type { ExtensionDefinition } from '@/lib/extensions/types';
import { manifest } from './manifest';
import { BrowserPanel } from './components/BrowserPanel';
import { SidebarBrowser } from './components/SidebarBrowser';
import { BrowserSettingsTab } from './components/BrowserSettingsTab';

export const browserExtension: ExtensionDefinition = {
  manifest,
  MainComponent: BrowserPanel,
  SidebarComponent: SidebarBrowser,
  SettingsTabComponent: BrowserSettingsTab,
};
