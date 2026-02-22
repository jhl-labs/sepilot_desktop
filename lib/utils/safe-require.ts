import { createRequire } from 'module';

let runtimeRequire: any;

try {
  if (typeof createRequire === 'function' && typeof __filename !== 'undefined') {
    runtimeRequire = createRequire(__filename);
  }
} catch {
  // Ignore in browser/webpack environment
}

/**
 * Dynamically require a module bypassing Webpack/Bundlers.
 * This is essential for Electron Extensions to load Node.js native modules (fs, child_process)
 * without them being bundled into the extension's renderer/main bundle by tsup/webpack.
 *
 * @param modulePath - The name or path of the module to require (e.g., 'fs', 'child_process')
 * @returns The required module
 */
export function safeRequire(modulePath: string): any {
  try {
    return runtimeRequire(modulePath);
  } catch (e) {
    console.error(
      `[safeRequire] Failed to require '${modulePath}'. Ensure you are running in a Node.js environment (Electron Main Process).`,
      e
    );
    throw e;
  }
}
