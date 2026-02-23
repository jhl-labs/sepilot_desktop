#!/usr/bin/env node
const AdmZip = require('adm-zip');

const pptxPath = process.argv[2] || 'C:/git/sepilot-docs/AI_Trends_2025.pptx';
const zip = new AdmZip(pptxPath);

// 1. Theme analysis
const theme = zip.getEntry('ppt/theme/theme1.xml');
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

// 2. Slide Master background
const master = zip.getEntry('ppt/slideMasters/slideMaster1.xml');
if (master) {
  const content = master.getData().toString('utf8');
  const hasBg = content.includes('<p:bg>');
  const gradFill = content.includes('<a:gradFill');
  const solidFill = content.includes('<a:solidFill');
  console.log('\n=== Slide Master ===');
  console.log('Has background:', hasBg);
  console.log('Gradient fill:', gradFill);
  console.log('Solid fill:', solidFill);
}

// 3. Slide Layout analysis
const layouts = zip
  .getEntries()
  .filter((e) => e.entryName.match(/ppt\/slideLayouts\/slideLayout\d+\.xml/));
console.log('\n=== Slide Layouts: ' + layouts.length + ' ===');

// 4. Per-slide design analysis
const slides = zip.getEntries().filter((e) => e.entryName.match(/ppt\/slides\/slide\d+\.xml/));
console.log('\n=== Per-Slide Design Analysis ===');

let totalShapes = 0;
let totalImages = 0;
let totalTables = 0;
let allColors = new Set();
let allFontSizes = new Set();

slides.forEach((e) => {
  const content = e.getData().toString('utf8');
  const slideNum = e.entryName.match(/slide(\d+)/)[1];

  const shapeCount = (content.match(/<p:sp>/g) || []).length;
  const hasImages = content.includes('<p:pic>');
  const hasTable = content.includes('<a:tbl>');
  const hasChart = content.includes('<c:chart');
  const hasBg = content.includes('<p:bg>');
  const hasGradient = content.includes('<a:gradFill');
  const hasSolidFill = (content.match(/<a:solidFill>/g) || []).length;

  const colors = (content.match(/<a:srgbClr val="([^"]+)"/g) || []).map(
    (c) => c.match(/val="([^"]+)"/)[1]
  );
  const uniqueSlideColors = [...new Set(colors)];

  const fontSizes = (content.match(/sz="(\d+)"/g) || []).map((s) => parseInt(s.match(/(\d+)/)[1]));
  const uniqueSizes = [...new Set(fontSizes)].sort((a, b) => b - a);

  const boldCount = (content.match(/b="1"/g) || []).length;
  const italicCount = (content.match(/i="1"/g) || []).length;

  // Check for bullet points
  const hasBullets = content.includes('<a:buChar') || content.includes('<a:buAutoNum');
  const hasCustomBullets = content.includes('<a:buClr') || content.includes('<a:buSzPct');

  // Text
  const texts = [];
  content.replace(/<a:t>([^<]+)<\/a:t>/g, (_, t) => {
    texts.push(t);
  });

  totalShapes += shapeCount;
  if (hasImages) totalImages++;
  if (hasTable) totalTables++;
  colors.forEach((c) => allColors.add(c));
  fontSizes.forEach((s) => allFontSizes.add(s));

  console.log(`\nSlide ${slideNum}: "${texts[0] || 'N/A'}"`);
  console.log(
    `  Shapes: ${shapeCount}, Image: ${hasImages}, Table: ${hasTable}, Chart: ${hasChart}`
  );
  console.log(`  Custom BG: ${hasBg}, Gradient: ${hasGradient}, SolidFills: ${hasSolidFill}`);
  console.log(`  Colors: ${uniqueSlideColors.map((c) => '#' + c).join(', ') || 'none'}`);
  console.log(`  Font sizes: ${uniqueSizes.map((s) => s / 100 + 'pt').join(', ')}`);
  console.log(`  Bold: ${boldCount}, Italic: ${italicCount}`);
  console.log(`  Bullets: ${hasBullets}, Custom bullets: ${hasCustomBullets}`);
});

console.log('\n=== Overall Design Summary ===');
console.log('Total slides:', slides.length);
console.log('Total shapes:', totalShapes);
console.log('Slides with images:', totalImages);
console.log('Slides with tables:', totalTables);
console.log('Unique colors used:', [...allColors].map((c) => '#' + c).join(', '));
console.log(
  'Font sizes used:',
  [...allFontSizes]
    .sort((a, b) => b - a)
    .map((s) => s / 100 + 'pt')
    .join(', ')
);

// Design Quality Score
let score = 0;
let issues = [];

if (slides.length >= 8) score += 10;
else issues.push('Slide count < 8');
if (allColors.size >= 3) score += 10;
else issues.push('Too few colors (< 3)');
if (allColors.size <= 8) score += 5;
else issues.push('Too many colors (> 8)');
if (totalImages > 0) score += 15;
else issues.push('No images/icons');
if (totalTables > 0) score += 10;
else issues.push('No tables');
if (allFontSizes.size >= 3) score += 10;
else issues.push('Too few font size variation');

// Check for visual hierarchy (title should be bigger)
const sortedSizes = [...allFontSizes].sort((a, b) => b - a);
if (sortedSizes[0] >= 2400) score += 10;
else issues.push('Title font too small');
if (sortedSizes[sortedSizes.length - 1] <= 1600) score += 5;
else issues.push('Body font too large');

// Check for consistency
const slidesWithBg = slides.filter((e) => e.getData().toString('utf8').includes('<p:bg>')).length;
if (slidesWithBg === 0 || slidesWithBg === slides.length) score += 10;
else issues.push('Inconsistent backgrounds (' + slidesWithBg + '/' + slides.length + ')');

console.log('\n=== Design Quality Score: ' + score + '/85 ===');
if (issues.length > 0) {
  console.log('Issues:');
  issues.forEach((i) => console.log('  - ' + i));
}
