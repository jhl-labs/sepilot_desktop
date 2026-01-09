/**
 * Presentation Extension Definition
 *
 * Extension의 전체 정의를 하나의 객체로 export
 */

import type { ExtensionDefinition } from '@/lib/extensions/types';
import { manifest } from './manifest';
import { PresentationStudio } from './components/PresentationStudio';
import { PresentationSourceSidebar } from './components/PresentationSidebar';
import { PresentationHeaderActions } from './components/PresentationHeaderActions';
import { PresentationSettingsTab } from './components/PresentationSettingsTab';
import { createPresentationSlice } from './store';

export const presentationExtension: ExtensionDefinition = {
  manifest,
  MainComponent: PresentationStudio,
  SidebarComponent: PresentationSourceSidebar,
  HeaderActionsComponent: PresentationHeaderActions,
  SettingsTabComponent: PresentationSettingsTab,
  createStoreSlice: createPresentationSlice,
};
