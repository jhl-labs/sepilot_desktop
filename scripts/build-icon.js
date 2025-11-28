const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function buildIcons() {
  try {
    console.log('Generating application icons...');

    const inputPath = path.join(__dirname, '..', 'assets', 'icon.png');
    const outputDir = path.join(__dirname, '..', 'assets');

    // Check if source icon exists
    if (!fs.existsSync(inputPath)) {
      console.warn(`⚠ Source icon not found at ${inputPath}`);
      console.log('Checking if icon files already exist...');

      const icoPath = path.join(outputDir, 'icon.ico');
      if (fs.existsSync(icoPath)) {
        console.log('✓ Icon files already exist, skipping generation');
        return;
      }

      throw new Error('Source icon.png not found and no existing icons available');
    }

    // Use electron-icon-builder to generate icons for all platforms
    execSync(`npx electron-icon-builder --input="${inputPath}" --output="${outputDir}" --flatten`, {
      stdio: 'inherit'
    });

    console.log('✓ Successfully generated application icons');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    // Don't fail the build, just warn
    console.warn('⚠ Icon generation failed, but continuing build...');
    process.exit(0); // Exit successfully to not block the build
  }
}

buildIcons();
