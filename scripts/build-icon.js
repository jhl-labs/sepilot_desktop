const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default || require('png-to-ico');

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

    // Create icons directory for temporary files
    const iconsDir = path.join(outputDir, 'icons');
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }

    // Generate various sizes for macOS .icns
    const macSizes = [16, 32, 64, 128, 256, 512, 1024];
    const macPaths = [];

    for (const size of macSizes) {
      const outputPath = path.join(iconsDir, `icon_${size}x${size}.png`);
      await sharp(inputPath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(outputPath);
      macPaths.push(outputPath);
      console.log(`✓ Generated ${size}x${size} icon`);
    }

    // Generate Windows .ico (multiple sizes in one file)
    const icoSizes = [16, 32, 48, 64, 128, 256];
    const icoPaths = [];

    for (const size of icoSizes) {
      const outputPath = path.join(iconsDir, `icon_${size}.png`);
      await sharp(inputPath)
        .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(outputPath);
      icoPaths.push(outputPath);
    }

    // Create .ico file
    const icoBuffer = await pngToIco(icoPaths);
    const icoPath = path.join(outputDir, 'icon.ico');
    fs.writeFileSync(icoPath, icoBuffer);
    console.log(`✓ Generated icon.ico`);

    // For Linux, copy the original as icon.png (or largest size)
    const linuxIconPath = path.join(outputDir, 'icon.png');
    if (!fs.existsSync(linuxIconPath) || linuxIconPath !== inputPath) {
      await sharp(inputPath)
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(outputDir, 'icon_512x512.png'));
      console.log('✓ Generated Linux icon');
    }

    console.log('✓ Successfully generated application icons');
  } catch (error) {
    console.error('Error generating icons:', error.message);
    // Don't fail the build, just warn
    console.warn('⚠ Icon generation failed, but continuing build...');
    process.exit(0); // Exit successfully to not block the build
  }
}

buildIcons();
