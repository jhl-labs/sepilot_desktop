// Critical polyfills for Node.js globals in browser
// This file must be loaded before any other JavaScript

(function () {
  'use strict';

  // Fix: global is not defined
  if (typeof global === 'undefined') {
    window.global = window;
    if (typeof globalThis !== 'undefined') {
      globalThis.global = globalThis;
    }
  }

  // Fix: process is not defined
  if (typeof process === 'undefined') {
    window.process = {
      env: { NODE_ENV: 'production' },
      version: '',
      versions: {},
      platform: 'browser',
      browser: true,
      cwd: function () {
        return '/';
      },
      nextTick: function (callback) {
        var args = Array.prototype.slice.call(arguments, 1);
        setTimeout(function () {
          callback.apply(null, args);
        }, 0);
      },
      argv: [],
      binding: function () {
        throw new Error('process.binding is not supported in browser');
      },
      umask: function () {
        return 0;
      },
    };
  }

  // Fix: Buffer is not defined
  if (typeof Buffer === 'undefined') {
    window.Buffer = {
      from: function (data) {
        return data;
      },
      isBuffer: function () {
        return false;
      },
      alloc: function (size) {
        return new Uint8Array(size);
      },
      allocUnsafe: function (size) {
        return new Uint8Array(size);
      },
    };
  }

  // Do NOT polyfill require/define/module/exports - Monaco Editor needs clean environment
  // Electron renderer with contextIsolation=true doesn't have Node.js globals anyway

  // Ensure webpackChunk array exists
  if (typeof globalThis !== 'undefined' && !globalThis.webpackChunk_N_E) {
    globalThis.webpackChunk_N_E = [];
  }

  console.log('[Polyfills] Initialized from polyfills.js');
})();
