// Critical polyfills for Node.js globals in browser
// This file must be loaded before any other JavaScript

(function() {
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
      cwd: function() { return '/'; },
      nextTick: function(callback) {
        var args = Array.prototype.slice.call(arguments, 1);
        setTimeout(function() {
          callback.apply(null, args);
        }, 0);
      },
      argv: [],
      binding: function() {
        throw new Error('process.binding is not supported in browser');
      },
      umask: function() { return 0; }
    };
  }

  // Fix: Buffer is not defined
  if (typeof Buffer === 'undefined') {
    window.Buffer = {
      from: function(data) { return data; },
      isBuffer: function() { return false; },
      alloc: function(size) { return new Uint8Array(size); },
      allocUnsafe: function(size) { return new Uint8Array(size); }
    };
  }

  // Fix: require is not defined (but allow Monaco Editor's AMD loader to override)
  if (typeof require === 'undefined') {
    // Create a minimal require for Node.js polyfills only
    // Monaco Editor will replace this with its own AMD loader
    var polyfillRequire = function(id) {
      // Special cases for polyfilled modules
      if (id === 'process' || id === 'process/browser' || id === 'process/browser.js') {
        return window.process;
      }
      if (id === 'buffer' || id === 'buffer/') {
        return { Buffer: window.Buffer };
      }

      // Check if there's a real AMD loader available (Monaco)
      if (window.__monacoRequire && typeof window.__monacoRequire === 'function') {
        return window.__monacoRequire(id);
      }

      console.warn('[Polyfill] Attempting to require "' + id + '" in browser');
      throw new Error('Module "' + id + '" cannot be required in browser environment');
    };

    polyfillRequire.resolve = function(id) { return id; };
    polyfillRequire.cache = {};
    polyfillRequire.config = function(config) {
      console.log('[Polyfill] require.config called, will be handled by Monaco loader');
      // Store for Monaco to pick up
      window.__monacoConfig = config;
    };

    // Use Object.defineProperty to allow Monaco to override
    Object.defineProperty(window, 'require', {
      value: polyfillRequire,
      writable: true,
      configurable: true,
      enumerable: true
    });

    // Minimal AMD define - Monaco will override this too
    if (typeof define === 'undefined') {
      Object.defineProperty(window, 'define', {
        value: function(id, dependencies, factory) {
          console.log('[Polyfill] Minimal define called, Monaco will override');
          // Just a stub - Monaco's loader will replace this
        },
        writable: true,
        configurable: true,
        enumerable: true
      });
      window.define.amd = true;
    }
  }

  // Fix: module is not defined
  if (typeof module === 'undefined') {
    window.module = { exports: {} };
  }

  // Fix: exports is not defined
  if (typeof exports === 'undefined') {
    window.exports = window.module.exports;
  }

  // Ensure webpackChunk array exists
  if (typeof globalThis !== 'undefined' && !globalThis.webpackChunk_N_E) {
    globalThis.webpackChunk_N_E = [];
  }

  console.log('[Polyfills] Initialized from polyfills.js');
})();
