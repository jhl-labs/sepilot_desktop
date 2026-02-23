#!/usr/bin/env node
const esbuild = require('esbuild');
const path = require('path');

const isWatch = process.argv.includes('--watch');
const isProd = process.argv.includes('--production');

const config = {
  entryPoints: ['electron/main.ts', 'electron/preload.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  outdir: 'dist/electron/electron',
  absWorkingDir: path.resolve(__dirname, '..'),
  // TypeScript 경로 해석을 위한 확장자 설정
  resolveExtensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
  mainFields: ['module', 'main'],
  conditions: ['import', 'require', 'node'],
  // esbuild 자체 alias로 @/ 경로 해석
  alias: {
    '@': path.resolve(__dirname, '..'),
  },
  // ====================================================================
  // IMPORTANT: 네이티브 모듈과 Electron만 external로 유지
  // 나머지 모든 npm 의존성은 번들에 포함됩니다.
  // ====================================================================
  external: [
    // Electron 런타임
    'electron',

    // 네이티브 모듈 (.node 바이너리) - 번들링 불가
    'sql.js',
    'sharp',
    'node-pty',
    '@vscode/ripgrep',
    'canvas',
    'tiktoken',
    'better-sqlite3',

    // 플랫폼별 모듈
    'fsevents',

    // Extension 패키지 (동적 로딩)
    '@sepilot/extension-sdk',
    '@sepilot/extension-architect',
    '@sepilot/extension-browser',
    '@sepilot/extension-editor',
    '@sepilot/extension-github-actions',
    '@sepilot/extension-github-pr-review',
    '@sepilot/extension-github-project',
    '@sepilot/extension-presentation',
    '@sepilot/extension-terminal',

    // @vue/compiler-sfc의 optional 템플릿 엔진들
    // (consolidate.js가 동적으로 require하는 optional deps)
    'velocityjs',
    'dustjs-linkedin',
    'atpl',
    'liquor',
    'twig',
    'eco',
    'jazz',
    'jqtpl',
    'hamljs',
    'hamlet',
    'whiskers',
    'haml-coffee',
    'hogan.js',
    'templayed',
    'walrus',
    'just',
    'ect',
    'mote',
    'toffee',
    'dot',
    'bracket-template',
    'ractive',
    'htmling',
    'babel-core',
    'plates',
    'vash',
    'slm',
    'marko',
    'teacup/lib/express',
    'coffee-script',
    'squirrelly',
    'twing',

    // optional/peer deps from various packages
    'vue',
    'mock-aws-s3',
    '@napi-rs/canvas',
  ],
  // packages: 'external' 을 의도적으로 제거!
  sourcemap: true,
  minify: isProd,
  logLevel: 'info',
  define: {
    'process.env.ESBUILD_BUNDLED': '"true"',
  },
  format: 'cjs',
  treeShaking: true,
  // Suppress direct-eval warning from safe-require.ts (intentional pattern for Extension loading)
  logOverride: {
    'direct-eval': 'silent',
  },
};

async function build() {
  try {
    if (isWatch) {
      const context = await esbuild.context(config);
      await context.watch();
      console.log('👀 Watching for changes...');
    } else {
      const result = await esbuild.build(config);
      if (result.errors.length > 0) {
        console.error('❌ Build errors:', result.errors);
        process.exit(1);
      }
      if (result.warnings.length > 0) {
        console.warn(`⚠️ Build warnings: ${result.warnings.length}`);
      }
      console.log('✅ Electron build complete (bundled)');
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
