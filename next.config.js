/** @type {import('next').NextConfig} */
const { version } = require('./package.json');

const nextConfig = {
  output: 'export',
  distDir: 'out',
  trailingSlash: true,

  // Disable all external traffic for offline usage
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  // Environment variables
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
  },

  images: {
    unoptimized: true,
  },

  webpack: (config, { isServer, webpack }) => {
    // Enable WebAssembly support (for tiktoken)
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
    };

    // Handle .wasm files
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    // Handle node: protocol imports
    config.resolve.alias = {
      ...config.resolve.alias,
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
