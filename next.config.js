/** @type {import('next').NextConfig} */
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

const nextConfig = {
  output: 'export',
  distDir: 'out',
  trailingSlash: true,

  // Disable all external traffic for offline usage
  reactStrictMode: true,
  productionBrowserSourceMaps: false,

  images: {
    unoptimized: true,
  },

  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Use 'web' target instead of 'electron-renderer'
      config.target = 'web';

      // webpack output configuration
      config.output = config.output || {};
      config.output.globalObject = 'globalThis';

      // Monaco Editor webpack plugin
      config.plugins.push(
        new MonacoWebpackPlugin({
          languages: ['javascript', 'typescript', 'css', 'html', 'json', 'markdown', 'python', 'java', 'cpp', 'csharp', 'go', 'rust', 'yaml', 'xml', 'sql', 'shell'],
          filename: 'static/[name].worker.js',
        })
      );

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
        '@langchain/langgraph',
        '@langchain/core',
        'sharp',
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
