// esbuild 모듈 해석 테스트
import { ExtensionManifest } from '@sepilot/extension-sdk/types';
import { createExtensionLogger } from '@sepilot/extension-sdk/utils';
import { Button } from '@sepilot/extension-sdk/ui';

console.log('Test imports successful');

export const testManifest: ExtensionManifest = {
  id: 'test',
  name: 'Test',
  description: 'Test',
  version: '1.0.0',
  author: 'Test',
  icon: 'test',
  mode: 'test',
  showInSidebar: false,
};
