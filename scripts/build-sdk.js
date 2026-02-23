const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const sdkPath = path.join(projectRoot, 'lib', 'extension-sdk');

console.log('[build-sdk] ==========================================');
console.log('[build-sdk] Building Extension SDK...');
console.log('[build-sdk] SDK Path:', sdkPath);
console.log('[build-sdk] Platform:', process.platform);
console.log('[build-sdk] ==========================================');

// Validate SDK directory exists
if (!fs.existsSync(sdkPath)) {
  console.error('[build-sdk] ❌ ERROR: SDK directory not found:', sdkPath);
  console.error('[build-sdk] 💡 Make sure you are running this from the project root');
  process.exit(1);
}

// Check if package.json exists
const sdkPackageJson = path.join(sdkPath, 'package.json');
if (!fs.existsSync(sdkPackageJson)) {
  console.error('[build-sdk] ❌ ERROR: SDK package.json not found:', sdkPackageJson);
  console.error('[build-sdk] 💡 The SDK structure may be corrupted');
  process.exit(1);
}

// Check if tsup.config.ts exists
const tsupConfig = path.join(sdkPath, 'tsup.config.ts');
if (!fs.existsSync(tsupConfig)) {
  console.error('[build-sdk] ⚠️  WARNING: tsup.config.ts not found:', tsupConfig);
  console.error('[build-sdk] Build may fail without proper configuration');
}

// Use pnpm.cmd on Windows, pnpm on others
// Windows에서는 .cmd 확장자가 필요하며, shell: true로 실행
const isWindows = process.platform === 'win32';
const pnpmCmd = isWindows ? 'pnpm.cmd' : 'pnpm';

console.log('[build-sdk] Using command:', pnpmCmd, 'build');

try {
  const result = spawnSync(pnpmCmd, ['build'], {
    cwd: sdkPath,
    stdio: 'inherit',
    shell: isWindows, // Windows에서만 shell 사용 (Unix에서는 불필요)
    env: { ...process.env }, // Explicitly inherit environment variables
  });

  if (result.error) {
    console.error('[build-sdk] ❌ ERROR: Failed to start build process');
    console.error('[build-sdk] Error message:', result.error.message);
    console.error('[build-sdk]');
    console.error('[build-sdk] 💡 Possible solutions:');
    console.error('[build-sdk]    1. Check if pnpm is installed: pnpm --version');
    console.error('[build-sdk]    2. Make sure pnpm is in your PATH');
    console.error('[build-sdk]    3. Try running: npm install -g pnpm');
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error('[build-sdk] ❌ ERROR: Build process exited with code', result.status);
    if (result.signal) {
      console.error('[build-sdk] Process was killed with signal:', result.signal);
    }
    console.error('[build-sdk]');
    console.error('[build-sdk] 💡 Troubleshooting:');
    console.error('[build-sdk]    1. Check TypeScript errors in lib/extension-sdk/');
    console.error('[build-sdk]    2. Try: cd lib/extension-sdk && pnpm install');
    console.error('[build-sdk]    3. Check if all dependencies are installed');
    process.exit(1);
  }

  console.log('[build-sdk] ✅ Done!');
  console.log('[build-sdk] ==========================================');
} catch (err) {
  console.error('[build-sdk] ❌ UNEXPECTED ERROR:', err.message);
  console.error('[build-sdk]');
  console.error('[build-sdk] Stack trace:');
  console.error(err.stack);
  console.error('[build-sdk]');
  console.error('[build-sdk] 💡 Please report this error with the stack trace above');
  process.exit(1);
}
