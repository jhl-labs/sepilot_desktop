const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const assetsDir = path.join(__dirname, '..', 'assets');
const iconPath = path.join(assetsDir, 'icon.png');
const icoPath = path.join(assetsDir, 'icon.ico');
const generatedWinIconPath = path.join(assetsDir, 'icons', 'win', 'icon.ico');

function runElectronIconBuilder() {
  return new Promise((resolve, reject) => {
    const cliPath = require.resolve('electron-icon-builder');
    const child = spawn(
      process.execPath,
      [cliPath, '--input', iconPath, '--output', assetsDir],
      { stdio: 'inherit' }
    );

    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`electron-icon-builder exited with code ${code}`));
      }
    });
  });
}

async function buildIcons() {
  console.log('Building application icons...');

  if (!fs.existsSync(iconPath)) {
    console.error(`Error: Source icon not found at ${iconPath}`);
    process.exit(1);
  }

  try {
    console.log('Generating icon assets with electron-icon-builder...');
    await runElectronIconBuilder();

    if (!fs.existsSync(generatedWinIconPath)) {
      throw new Error(`Generated Windows icon not found at ${generatedWinIconPath}`);
    }

    fs.copyFileSync(generatedWinIconPath, icoPath);
    console.log(`✓ Copied Windows ICO to ${icoPath}`);
    console.log('✓ Icon generation completed successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

buildIcons();
