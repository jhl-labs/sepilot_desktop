/** @type {import('next').NextConfig} */
const { version } = require('./package.json');
const fs = require('fs');

const nextConfig = {
  output: 'export',
  distDir: 'out',
  trailingSlash: true,
  outputFileTracingRoot: __dirname,

  // Disable all external traffic for offline usage
  // Disable Strict Mode in development for better performance (2x faster)
  // Keep enabled in production for bug detection
  reactStrictMode: process.env.NODE_ENV === 'production',
  productionBrowserSourceMaps: false,

  // TypeScript configuration - ignore build errors from node_modules extensions
  typescript: {
    ignoreBuildErrors: true,
  },

  // Environment variables
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },

  images: {
    unoptimized: true,
  },

  // Transpile packages that need to be compiled
  // Extensions are pre-built to dist/, so they don't need transpiling
  transpilePackages: [
    'react-syntax-highlighter',
  ],

  webpack: (config, { isServer, webpack, dev }) => {
    // Enable WebAssembly support (for tiktoken)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Disable cache for Extension imports in development
    if (dev && !isServer) {
      config.cache = false; // Prevent stale Extension chunks
    }

    // Handle .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // Ignore optional dependencies of ws package to suppress warnings
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(bufferutil|utf-8-validate)$/,
      })
    );

    // Ignore optional template engine dependencies from @vue/compiler-sfc
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^(dustjs-linkedin|atpl|liquor|twig|eco|jazz|jqtpl|hamljs|hamlet|whiskers|haml-coffee|hogan\.js|templayed|walrus|just|ect|mote|toffee|dot|bracket-template|ractive|htmling|babel-core|plates|vash|slm|marko|teacup\/lib\/express|coffee-script|squirrelly)$/,
      })
    );

    // Resolve @/ imports in Extension packages to main app
    const path = require('path');

    // Initialize resolve object if missing
    if (!config.resolve) {
      config.resolve = {};
    }

    // Store original extensions before modifying
    const originalExtensions = config.resolve.extensions || ['.ts', '.tsx', '.js', '.jsx', '.json'];

    // Prioritize .js over .ts for proper module resolution
    // Extensions are pre-built, so .js files should be used first
    config.resolve.extensions = [
      '.js',
      '.jsx',
      '.json',
      '.ts',
      '.tsx',
      ...(originalExtensions.filter(ext =>
        !['.tsx', '.ts', '.jsx', '.js', '.json'].includes(ext)
      ))
    ];

    // Initialize alias if missing
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }

    // Merge aliases safely
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
      // Resolve next/dynamic for extensions (prevent transpile errors)
      'next/dynamic': path.resolve(__dirname, 'node_modules/next/dynamic.js'),
      // Resolve @sepilot/extension-sdk subpaths (using src for subpaths, dist for main)
      // Extension SDK exports subpaths from src/ directly (see package.json exports)
      '@sepilot/extension-sdk/ui$': path.resolve(__dirname, 'lib/extension-sdk/src/ui/index.ts'),
      '@sepilot/extension-sdk/utils$': path.resolve(__dirname, 'lib/extension-sdk/src/utils/index.ts'),
      '@sepilot/extension-sdk/types$': path.resolve(__dirname, 'lib/extension-sdk/src/types/index.ts'),
      '@sepilot/extension-sdk/ipc$': path.resolve(__dirname, 'lib/extension-sdk/src/ipc/index.ts'),
      '@sepilot/extension-sdk/runtime$': path.resolve(__dirname, 'lib/extension-sdk/src/runtime/index.ts'),
      '@sepilot/extension-sdk/store$': path.resolve(__dirname, 'lib/extension-sdk/src/store/index.ts'),
      '@sepilot/extension-sdk/agent$': path.resolve(__dirname, 'lib/extension-sdk/src/agent/index.ts'),
      '@sepilot/extension-sdk/chat$': path.resolve(__dirname, 'lib/extension-sdk/src/chat/index.ts'),
      '@sepilot/extension-sdk/host$': path.resolve(__dirname, 'lib/extension-sdk/src/host/index.ts'),
      '@sepilot/extension-sdk/hooks$': path.resolve(__dirname, 'lib/extension-sdk/src/hooks/index.ts'),
      '@sepilot/extension-sdk/services$': path.resolve(__dirname, 'lib/extension-sdk/src/services/index.ts'),
      '@sepilot/extension-sdk$': path.resolve(__dirname, 'lib/extension-sdk/src/index.ts'),
      // Alias all extensions dynamically from resources/extensions/
      // Each extension with a dist/index.js gets aliases:
      //   @sepilot/extension-{name}$ → dist/index.js (exact match, $ prevents prefix matching)
      //   @sepilot/extension-{name}/agents → dist/agents (subpath for agent graphs)
      ...(() => {
        const extensionsDir = path.resolve(__dirname, 'resources/extensions');
        const aliases = {};
        try {
          const dirs = fs.readdirSync(extensionsDir, { withFileTypes: true })
            .filter(d => d.isDirectory());
          for (const dir of dirs) {
            const distPath = path.resolve(extensionsDir, dir.name, 'dist/index.js');
            if (fs.existsSync(distPath)) {
              // Exact match for main entry ($ suffix prevents prefix matching of subpaths)
              aliases[`@sepilot/extension-${dir.name}$`] = distPath;
              // Subpath alias for agents/ directory
              const agentsDir = path.resolve(extensionsDir, dir.name, 'dist/agents');
              if (fs.existsSync(agentsDir)) {
                aliases[`@sepilot/extension-${dir.name}/agents`] = agentsDir;
              }
            }
          }
        } catch (e) {
          // Ignore errors during extension alias scanning
        }
        return aliases;
      })(),
      // Prevent crypto-browserify require errors
      'crypto-browserify': false,
      'node:assert': 'assert',
      'node:async_hooks': 'async_hooks',
      'node:buffer': 'buffer',
      'node:console': 'console',
      'node:crypto': 'crypto',
      'node:diagnostics_channel': 'diagnostics_channel',
      'node:events': 'events',
      'node:fs': 'fs',
      'node:http': 'http',
      'node:https': 'https',
      'node:module': 'module',
      'node:net': 'net',
      'node:os': 'os',
      'node:path': 'path',
      'node:process': 'process',
      'node:stream': 'stream',
      'node:string_decoder': 'string_decoder',
      'node:tls': 'tls',
      'node:url': 'url',
      'node:util': 'util',
      'node:worker_threads': 'worker_threads',
      'node:zlib': 'zlib',
    };

    // Replace lib/http with browser stub in client-side builds
    if (!isServer) {
      const path = require('path');

      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /lib\/http\/index\.ts$/,
          path.resolve(__dirname, 'lib/http/browser-stub.ts')
        )
      );

      // Replace lib/langgraph with browser stub (Extensions should not use LangGraph in browser)
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /lib\/langgraph\/.+\.ts$/,
          path.resolve(__dirname, 'lib/langgraph/browser-stub.ts')
        )
      );

      // Ensure next/dynamic is properly resolved for Extensions
      // Extensions' compiled code requires 'next/dynamic', which needs to be available
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^next\/dynamic$/,
          path.resolve(__dirname, 'node_modules/next/dynamic.js')
        )
      );
    }

    // Bundle analysis (only for client-side)
    if (!isServer && process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'json',
          generateStatsFile: true,
          statsFilename: '../analyze/__bundle_analysis.json',
          reportFilename: '../analyze/bundle-report.html',
          openAnalyzer: false,
        })
      );
    }

    if (!isServer) {
      // Use 'web' target instead of 'electron-renderer'
      config.target = 'web';

      // webpack output configuration
      config.output = config.output || {};
      config.output.globalObject = 'globalThis';

      // Only exclude truly Node.js-only modules from client bundle
      // Do NOT exclude UI libraries that should work in browser
      const nodeOnlyModules = [
        'better-sqlite3',
        'electron',
        'fs',
        'path',
        'crypto',
        'stream',
        'child_process',
        'sharp',
        'dns',
        'undici',
        'proxy-agent',
        'pac-resolver',
        'pac-proxy-agent',
        'socks-proxy-agent',
        'http-proxy-agent',
        'https-proxy-agent',
        'agent-base',
        '@langchain/langgraph',
      ];

      // Extension packages should not be bundled by webpack
      // They will be loaded at runtime via sepilot-ext:// protocol
      const extensionModules = [
        '@sepilot/extension-editor',
        '@sepilot/extension-browser',
        '@sepilot/extension-terminal',
        '@sepilot/extension-architect',
        '@sepilot/extension-presentation',
        '@sepilot/extension-github-actions',
        '@sepilot/extension-github-pr-review',
        '@sepilot/extension-github-project',
        '@sepilot/extension-jira-scrum',
        '@sepilot/extension-mail-file-watcher',
        '@sepilot/extension-confluence',
        '@sepilot/extension-git-desktop-assistant',
      ];

      // Add as externals to prevent bundling
      config.externals = config.externals || [];
      if (!Array.isArray(config.externals)) {
        config.externals = [config.externals];
      }

      nodeOnlyModules.forEach(mod => {
        config.externals.push(({ request }, callback) => {
          if (request === mod || request?.startsWith(mod + '/')) {
            return callback(null, 'commonjs ' + request);
          }
          callback();
        });
      });

      // Mark extension modules as external - they will be loaded at runtime
      extensionModules.forEach(mod => {
        config.externals.push(({ request }, callback) => {
          if (request === mod || request?.startsWith(mod + '/')) {
            // Return a module that throws a helpful error at runtime
            // The actual extension will be loaded via extensionRegistry
            return callback(null, `throw new Error('${mod} must be loaded via extensionRegistry, not webpack import')`);
          }
          callback();
        });
      });

      // Provide browser polyfills for required modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        dns: false,
        child_process: false,
        stream: false,
        url: false,
        zlib: false,
        http: false,
        https: false,
        assert: false,
        os: false,
        crypto: false,
        path: false,
        util: false,
        buffer: false,
        process: false,
        module: false,
        async_hooks: false,
        'node:async_hooks': false,
      };
    } else {
      // Server-side: Externalize SQLite
      config.externals = config.externals || {};
      if (typeof config.externals === 'object' && !Array.isArray(config.externals)) {
        config.externals['better-sqlite3'] = 'commonjs better-sqlite3';
      }
    }

    return config;
  },
};

module.exports = nextConfig;
