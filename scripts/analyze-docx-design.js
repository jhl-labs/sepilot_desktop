#!/usr/bin/env node
const AdmZip = require('adm-zip');
const path = require('path');

const docxPath = process.argv[2] || 'C:/git/sepilot-docs/report.docx';
const zip = new AdmZip(docxPath);

console.log(`\n=== DOCX Design Analysis: ${path.basename(docxPath)} ===\n`);

// 1. Theme analysis
const theme = zip.getEntry('word/theme/theme1.xml');
if (theme) {
  const content = theme.getData().toString('utf8');
  const colorMatches = content.match(/<a:srgbClr val="([^"]+)"/g) || [];
  const uniqueColors = [...new Set(colorMatches.map((c) => c.match(/val="([^"]+)"/)[1]))];
  console.log('=== Theme Colors ===');
  uniqueColors.forEach((c) => console.log('  #' + c));

  const fontLatin = content.match(/<a:latin typeface="([^"]+)"/g) || [];
  const fontEA = content.match(/<a:ea typeface="([^"]+)"/g) || [];
  console.log('\n=== Theme Fonts ===');
  console.log('Latin:', [...new Set(fontLatin.map((f) => f.match(/typeface="([^"]+)"/)[1]))]);
  console.log('EA:', [...new Set(fontEA.map((f) => f.match(/typeface="([^"]+)"/)[1]))]);
}

// 2. Styles analysis (word/styles.xml)
const styles = zip.getEntry('word/styles.xml');
let headingStyles = 0;
let customStyles = 0;
let hasTableStyle = false;
let hasTocStyle = false;
if (styles) {
  const content = styles.getData().toString('utf8');
  const styleMatches = content.match(/<w:style\s[^>]*>/g) || [];
  customStyles = styleMatches.length;

  headingStyles = (content.match(/w:styleId="Heading\d"/g) || []).length;
  hasTableStyle = content.includes('w:styleId="TableGrid"') || content.includes('TableNormal');
  hasTocStyle = content.includes('TOC') || content.includes('w:styleId="TOCHeading"');

  console.log('\n=== Styles ===');
  console.log('Total styles:', customStyles);
  console.log('Heading styles:', headingStyles);
  console.log('Table style:', hasTableStyle);
  console.log('TOC style:', hasTocStyle);
}

// 3. Document body analysis (word/document.xml)
const document = zip.getEntry('word/document.xml');
let totalParagraphs = 0;
let totalTables = 0;
let totalImages = 0;
let totalHeaders = 0;
let totalBullets = 0;
let totalNumbered = 0;
let allColors = new Set();
let allFontSizes = new Set();
let hasPageBreaks = 0;
let hasSectionBreaks = 0;
let totalHyperlinks = 0;
let textContent = [];
let boldCount = 0;
let italicCount = 0;
let underlineCount = 0;
let highlightCount = 0;
let totalShapes = 0;
let hasHeader = false;
let hasFooter = false;

if (document) {
  const content = document.getData().toString('utf8');

  // Paragraphs
  totalParagraphs = (content.match(/<w:p[ >]/g) || []).length;

  // Tables
  totalTables = (content.match(/<w:tbl>/g) || []).length;

  // Images (blipFill or drawing)
  totalImages = (content.match(/<a:blip /g) || []).length;

  // Shapes (wsp, inline shapes)
  totalShapes =
    (content.match(/<wps:wsp>/g) || []).length +
    (content.match(/<mc:AlternateContent>/g) || []).length;

  // Headings (pStyle with Heading)
  const headingMatches = content.match(/<w:pStyle w:val="Heading\d"/g) || [];
  totalHeaders = headingMatches.length;

  // Bullet lists
  totalBullets = (content.match(/<w:numId w:val="[^0]"/g) || []).length;

  // Page breaks
  hasPageBreaks = (content.match(/<w:br w:type="page"/g) || []).length;

  // Section breaks
  hasSectionBreaks = (content.match(/<w:sectPr/g) || []).length;

  // Hyperlinks
  totalHyperlinks = (content.match(/<w:hyperlink/g) || []).length;

  // Colors
  const colors = (content.match(/<w:color w:val="([^"]+)"/g) || []).map(
    (c) => c.match(/w:val="([^"]+)"/)[1]
  );
  colors.forEach((c) => {
    if (c !== 'auto' && c !== '000000') allColors.add(c);
  });

  // Font sizes
  const fontSizes = (content.match(/<w:sz w:val="(\d+)"/g) || []).map((s) =>
    parseInt(s.match(/(\d+)/)[1])
  );
  fontSizes.forEach((s) => allFontSizes.add(s));

  // Bold, Italic, Underline
  boldCount =
    (content.match(/<w:b\/>/g) || []).length + (content.match(/<w:b w:val="true"/g) || []).length;
  italicCount =
    (content.match(/<w:i\/>/g) || []).length + (content.match(/<w:i w:val="true"/g) || []).length;
  underlineCount = (content.match(/<w:u /g) || []).length;

  // Highlight
  highlightCount = (content.match(/<w:highlight/g) || []).length;

  // Extract text samples (first few paragraphs)
  content.replace(/<w:t[^>]*>([^<]+)<\/w:t>/g, (_, t) => {
    if (textContent.length < 5 && t.trim().length > 10) {
      textContent.push(t.trim().substring(0, 60));
    }
  });

  console.log('\n=== Document Body ===');
  console.log('Paragraphs:', totalParagraphs);
  console.log('Tables:', totalTables);
  console.log('Images:', totalImages);
  console.log('Shapes/Drawings:', totalShapes);
  console.log('Headings:', totalHeaders);
  console.log('Bulleted/Numbered items:', totalBullets);
  console.log('Hyperlinks:', totalHyperlinks);
  console.log('Page breaks:', hasPageBreaks);
  console.log('Section breaks:', hasSectionBreaks);
  console.log('Bold runs:', boldCount);
  console.log('Italic runs:', italicCount);
  console.log('Underline runs:', underlineCount);
  console.log('Highlights:', highlightCount);
  console.log('Colors used:', [...allColors].map((c) => '#' + c).join(', ') || 'none (auto only)');
  console.log(
    'Font sizes:',
    [...allFontSizes]
      .sort((a, b) => b - a)
      .map((s) => s / 2 + 'pt')
      .join(', ')
  );
  if (textContent.length > 0) {
    console.log('\nText preview:');
    textContent.forEach((t, i) => console.log(`  [${i + 1}] "${t}..."`));
  }
}

// 4. Header/Footer check
const headerEntries = zip.getEntries().filter((e) => e.entryName.match(/word\/header\d+\.xml/));
const footerEntries = zip.getEntries().filter((e) => e.entryName.match(/word\/footer\d+\.xml/));
hasHeader = headerEntries.length > 0;
hasFooter = footerEntries.length > 0;

console.log('\n=== Header/Footer ===');
console.log('Headers:', headerEntries.length);
console.log('Footers:', footerEntries.length);

// 5. Numbering (word/numbering.xml)
const numbering = zip.getEntry('word/numbering.xml');
let numberingDefs = 0;
if (numbering) {
  const content = numbering.getData().toString('utf8');
  numberingDefs = (content.match(/<w:abstractNum /g) || []).length;
  console.log('\n=== Numbering Definitions ===');
  console.log('Abstract numbering:', numberingDefs);
}

// 6. Relationships (images, charts, etc.)
const rels = zip.getEntry('word/_rels/document.xml.rels');
let imageRels = 0;
let chartRels = 0;
let diagramRels = 0;
if (rels) {
  const content = rels.getData().toString('utf8');
  imageRels = (content.match(/Type="[^"]*image"/g) || []).length;
  chartRels = (content.match(/Type="[^"]*chart"/g) || []).length;
  diagramRels = (content.match(/Type="[^"]*diagram/g) || []).length;
  console.log('\n=== Relationships ===');
  console.log('Image relationships:', imageRels);
  console.log('Chart relationships:', chartRels);
  console.log('Diagram relationships:', diagramRels);
}

// 7. Design Quality Score
console.log('\n=== Design Quality Score ===');
let score = 0;
let issues = [];

// Content volume
if (totalParagraphs >= 20) score += 10;
else issues.push(`Too few paragraphs (${totalParagraphs} < 20)`);

// Heading structure
if (totalHeaders >= 3) score += 15;
else if (totalHeaders >= 1) {
  score += 5;
  issues.push(`Few headings (${totalHeaders} < 3)`);
} else issues.push('No headings — poor structure');

// Color usage
if (allColors.size >= 2) score += 5;
else issues.push('Too few colors (< 2)');
if (allColors.size <= 6) score += 5;
else issues.push('Too many colors (> 6) — inconsistent');

// Tables
if (totalTables >= 1) score += 10;
else issues.push('No tables — consider adding for data');

// Images or shapes
if (totalImages >= 1 || totalShapes >= 1) score += 10;
else issues.push('No images or shapes');

// Lists (bullets/numbered)
if (totalBullets >= 3) score += 5;
else issues.push('Few or no lists');

// Font size hierarchy
const sortedSizes = [...allFontSizes].sort((a, b) => b - a);
if (allFontSizes.size >= 3) score += 10;
else issues.push('Too few font size variation');

// Title size (should be 28pt+ = val 56+)
if (sortedSizes.length > 0 && sortedSizes[0] >= 48) score += 5;
else issues.push('Title font may be too small (< 24pt)');

// Headers/Footers
if (hasHeader || hasFooter) score += 5;
else issues.push('No header or footer');

// Page breaks (document structure)
if (hasPageBreaks >= 1 || hasSectionBreaks >= 2) score += 5;
else issues.push('No page breaks — may lack clear sections');

// Bold/emphasis usage
if (boldCount >= 3) score += 5;
else issues.push('Little or no emphasis (bold)');

// Hyperlinks (for references)
if (totalHyperlinks >= 1) score += 5;
else issues.push('No hyperlinks');

// Numbering definitions
if (numberingDefs >= 1) score += 5;
else issues.push('No numbering/bullet definitions');

console.log(`\nDesign Quality Score: ${score}/100`);
if (issues.length > 0) {
  console.log('Issues:');
  issues.forEach((i) => console.log('  - ' + i));
}

// Rating
if (score >= 80) console.log('\nRating: ★★★★★ Excellent');
else if (score >= 65) console.log('\nRating: ★★★★ Good');
else if (score >= 50) console.log('\nRating: ★★★ Average');
else if (score >= 35) console.log('\nRating: ★★ Below Average');
else console.log('\nRating: ★ Poor — needs significant improvement');
