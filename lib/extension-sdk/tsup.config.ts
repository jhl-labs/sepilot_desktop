import { defineConfig, Options } from 'tsup';

/**
 * Host App이 제공하는 공유 패키지 목록
 * Extension에서 중복 번들링되지 않도록 external로 지정
 */
const sharedExternal: (string | RegExp)[] = [
  'react',
  'react-dom',
  'react/jsx-runtime',
  'next/dynamic',
  'lucide-react',
  /^@radix-ui\/.*/,
  'zustand',
  'react-i18next',
  'reactflow',
  'class-variance-authority',
  'clsx',
  'tailwind-merge',
  'sonner',
];

const commonOptions: Partial<Options> = {
  format: ['esm', 'cjs'],
  dts: false, // ⚠️ 임시로 비활성화 - tsc로 별도 생성 (tsup 버그 회피)
  sourcemap: true,
  splitting: false, // DTS 생성 시 splitting 비활성화 (안정성)
};

export default defineConfig({
  entry: {
    'index': 'src/index.ts',
    'ui/index': 'src/ui/index.ts',
    'utils/index': 'src/utils/index.ts',
    'types/index': 'src/types/index.ts',
    'ipc/index': 'src/ipc/index.ts',
    'runtime/index': 'src/runtime/index.ts',
    'agent/index': 'src/agent/index.ts',
    'store/index': 'src/store/index.ts',
    'chat/index': 'src/chat/index.ts',
    'host/index': 'src/host/index.ts',
    'services/index': 'src/services/index.ts',
    'hooks/index': 'src/hooks/index.ts',
  },
  ...commonOptions,
  clean: true,
  external: sharedExternal,
  outDir: 'dist',
});
