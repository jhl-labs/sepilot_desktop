/**
 * Extract Extension locales from main locales files
 *
 * This script extracts Editor, Browser, and Presentation translations
 * from main app locales and moves them to respective extension folders.
 */

const fs = require('fs');
const path = require('path');

// Locale files to process
const locales = ['ko', 'en', 'zh'];

// Extract extension translations
function extractExtensionLocales() {
  locales.forEach((locale) => {
    const inputPath = path.join(__dirname, '..', 'locales', `${locale}.json`);
    const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

    // Extract Editor translations
    const editorLocale = {
      settings: data.settings?.editor || {},
      modes: {
        editor: data.modes?.editor || 'Editor',
      },
      editor: data.editor || {},
    };

    // Extract Browser translations
    const browserLocale = {
      settings: data.settings?.browser || {},
      modes: {
        browser: data.modes?.browser || 'Browser',
      },
      browser: data.browser || {},
    };

    // Extract Presentation translations
    const presentationLocale = {
      modes: {
        presentation: data.modes?.presentation || 'Presentation',
      },
      presentation: data.presentation || {},
    };

    // Write extension locale files
    fs.writeFileSync(
      path.join(__dirname, '..', 'extensions', 'editor', 'locales', `${locale}.json`),
      JSON.stringify(editorLocale, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      path.join(__dirname, '..', 'extensions', 'browser', 'locales', `${locale}.json`),
      JSON.stringify(browserLocale, null, 2),
      'utf8'
    );

    fs.writeFileSync(
      path.join(__dirname, '..', 'extensions', 'presentation', 'locales', `${locale}.json`),
      JSON.stringify(presentationLocale, null, 2),
      'utf8'
    );

    // Remove extension sections from main app locales
    if (data.settings?.editor) delete data.settings.editor;
    if (data.settings?.browser) delete data.settings.browser;
    if (data.modes?.editor) delete data.modes.editor;
    if (data.modes?.browser) delete data.modes.browser;
    if (data.modes?.presentation) delete data.modes.presentation;
    if (data.editor) delete data.editor;
    if (data.browser) delete data.browser;
    if (data.presentation) delete data.presentation;

    // Write cleaned main app locales
    fs.writeFileSync(inputPath, JSON.stringify(data, null, 2), 'utf8');

    console.log(`✓ Processed ${locale}.json`);
  });

  console.log('\n✅ Extension locales extracted successfully!');
  console.log('   - extensions/editor/locales/');
  console.log('   - extensions/browser/locales/');
  console.log('   - extensions/presentation/locales/');
}

// Create scripts directory if needed
const scriptsDir = path.join(__dirname);
if (!fs.existsSync(scriptsDir)) {
  fs.mkdirSync(scriptsDir, { recursive: true });
}

// Run extraction
extractExtensionLocales();
