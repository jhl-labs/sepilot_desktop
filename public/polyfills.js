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

  // Fix: require is not defined (AMD-compatible for Monaco Editor)
  if (typeof require === 'undefined') {
    window.require = function(id) {
      // Special cases for polyfilled modules
      if (id === 'process' || id === 'process/browser' || id === 'process/browser.js') {
        return window.process;
      }
      if (id === 'buffer' || id === 'buffer/') {
        return { Buffer: window.Buffer };
      }

      console.warn('[Polyfill] Attempting to require "' + id + '" in browser');
      throw new Error('Module "' + id + '" cannot be required in browser environment');
    };
    window.require.resolve = function(id) { return id; };
    window.require.cache = {};

    // AMD-style config for Monaco Editor
    window.require.config = function(config) {
      console.log('[Polyfill] AMD require.config called with:', config);
      // Store config but don't actually apply it - Monaco will use CDN
      window.require._config = config;
    };

    // AMD-style define for Monaco Editor
    if (typeof define === 'undefined') {
      window.define = function(id, dependencies, factory) {
        console.log('[Polyfill] AMD define called:', id);
        // Minimal AMD define implementation
        if (typeof id === 'function') {
          // define(factory)
          factory = id;
          id = null;
        } else if (Array.isArray(id)) {
          // define(dependencies, factory)
          factory = dependencies;
          dependencies = id;
          id = null;
        }
        // Execute factory if it's a function
        if (typeof factory === 'function') {
          try {
            var module = { exports: {} };
            var result = factory(window.require, module.exports, module);
            return result || module.exports;
          } catch (e) {
            console.warn('[Polyfill] AMD define execution failed:', e);
          }
        }
      };
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
