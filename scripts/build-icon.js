const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function buildIcons() {
  try {
    console.log('Generating application icons...');

    const inputPath = path.join(__dirname, '..', 'assets', 'icon.png');
    const outputDir = path.join(__dirname, '..', 'assets');

    // Use electron-icon-builder to generate icons for all platforms
    execSync(`npx electron-icon-builder --input="${inputPath}" --output="${outputDir}" --flatten`, {
      stdio: 'inherit'
    });

    console.log('✓ Successfully generated application icons');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    // Don't fail the build, just warn
    console.warn('⚠ Icon generation failed, but continuing build...');
  }
}

buildIcons();
