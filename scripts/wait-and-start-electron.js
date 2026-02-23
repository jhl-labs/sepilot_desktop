#!/usr/bin/env node

/**
 * Wait for Next.js dev server and start Electron
 *
 * This script replaces wait-on for better Windows compatibility
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const PORT_RANGE = [3000, 3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008]; // Check multiple ports
const MAX_ATTEMPTS = 60; // 60 attempts = 60 seconds
const RETRY_DELAY = 1000; // 1 second
const ELECTRON_MAIN_PATH = path.join(__dirname, '../dist/electron/electron/main.js');

let attempts = 0;
let electronBuildAttempts = 0;
let detectedPort = null;

console.log('[wait-and-start-electron] Waiting for Next.js dev server and Electron build...');

function checkServer(port) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      if (res.statusCode === 200 || res.statusCode === 304) {
        resolve(port);
      } else {
        reject(new Error(`Unexpected status code: ${res.statusCode}`));
      }
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(2000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function detectNextJsPort() {
  // Try ports in order
  for (const port of PORT_RANGE) {
    try {
      await checkServer(port);
      return port;
    } catch (err) {
      // Port not ready, try next
    }
  }
  return null;
}

async function waitForElectronBuild() {
  console.log('[wait-and-start-electron] Checking for Electron build...');

  while (electronBuildAttempts < MAX_ATTEMPTS) {
    electronBuildAttempts++;

    if (fs.existsSync(ELECTRON_MAIN_PATH)) {
      console.log(
        `[wait-and-start-electron] ✓ Electron build is ready (attempt ${electronBuildAttempts}/${MAX_ATTEMPTS})`
      );
      return true;
    }

    if (electronBuildAttempts % 10 === 0) {
      console.log(
        `[wait-and-start-electron] Waiting for Electron build... (attempt ${electronBuildAttempts}/${MAX_ATTEMPTS})`
      );
    }

    if (electronBuildAttempts >= MAX_ATTEMPTS) {
      console.error(
        `[wait-and-start-electron] ✗ Electron build timeout after ${MAX_ATTEMPTS} attempts`
      );
      console.error('[wait-and-start-electron] Make sure Electron build is running');
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
  }

  return false;
}

async function waitForServer() {
  while (attempts < MAX_ATTEMPTS) {
    attempts++;

    try {
      // Detect Next.js port dynamically
      detectedPort = await detectNextJsPort();

      if (detectedPort) {
        console.log(
          `[wait-and-start-electron] ✓ Next.js dev server is ready on port ${detectedPort} (attempt ${attempts}/${MAX_ATTEMPTS})`
        );
        return true;
      }
    } catch (err) {
      // Port detection failed, continue
    }

    if (attempts % 5 === 0) {
      console.log(
        `[wait-and-start-electron] Waiting for Next.js... (attempt ${attempts}/${MAX_ATTEMPTS})`
      );
    }

    if (attempts >= MAX_ATTEMPTS) {
      console.error(`[wait-and-start-electron] ✗ Timeout after ${MAX_ATTEMPTS} attempts`);
      console.error('[wait-and-start-electron] Make sure Next.js dev server is running');
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY));
  }

  return false;
}

async function startElectron() {
  // Wait for both Next.js server and Electron build in parallel
  const [serverReady, electronReady] = await Promise.all([waitForServer(), waitForElectronBuild()]);

  if (!serverReady || !electronReady) {
    console.error('[wait-and-start-electron] ✗ Failed to start: prerequisites not met');
    process.exit(1);
  }

  console.log(`[wait-and-start-electron] Starting Electron with port ${detectedPort || PORT}...`);

  // Start Electron with detected port
  const electron = spawn('electron', ['.'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      PORT: detectedPort || PORT,
    },
  });

  electron.on('close', (code) => {
    console.log(`[wait-and-start-electron] Electron exited with code ${code}`);
    process.exit(code || 0);
  });

  electron.on('error', (err) => {
    console.error('[wait-and-start-electron] Failed to start Electron:', err);
    process.exit(1);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('[wait-and-start-electron] Received SIGINT, stopping Electron...');
    electron.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('[wait-and-start-electron] Received SIGTERM, stopping Electron...');
    electron.kill('SIGTERM');
  });
}

startElectron();
