#!/usr/bin/env node
const AdmZip = require('adm-zip');
const path = require('path');

const xlsxPath = process.argv[2] || 'C:/git/sepilot-docs/report.xlsx';
const zip = new AdmZip(xlsxPath);

console.log(`\n=== XLSX Design Analysis: ${path.basename(xlsxPath)} ===\n`);

// 1. Workbook info
const workbook = zip.getEntry('xl/workbook.xml');
let sheetNames = [];
if (workbook) {
  const content = workbook.getData().toString('utf8');
  const sheets = content.match(/<sheet name="([^"]+)"/g) || [];
  sheetNames = sheets.map((s) => s.match(/name="([^"]+)"/)[1]);
  console.log('=== Workbook ===');
  console.log('Sheets:', sheetNames.length);
  sheetNames.forEach((name, i) => console.log(`  [${i + 1}] ${name}`));
}

// 2. Theme analysis
const theme = zip.getEntry('xl/theme/theme1.xml');
if (theme) {
  const content = theme.getData().toString('utf8');
  const colorMatches = content.match(/<a:srgbClr val="([^"]+)"/g) || [];
  const uniqueColors = [...new Set(colorMatches.map((c) => c.match(/val="([^"]+)"/)[1]))];
  console.log('\n=== Theme Colors ===');
  uniqueColors.forEach((c) => console.log('  #' + c));

  const fontLatin = content.match(/<a:latin typeface="([^"]+)"/g) || [];
  const fontEA = content.match(/<a:ea typeface="([^"]+)"/g) || [];
  console.log('\n=== Theme Fonts ===');
  console.log('Latin:', [...new Set(fontLatin.map((f) => f.match(/typeface="([^"]+)"/)[1]))]);
  console.log('EA:', [...new Set(fontEA.map((f) => f.match(/typeface="([^"]+)"/)[1]))]);
}

// 3. Styles analysis (xl/styles.xml)
const stylesXml = zip.getEntry('xl/styles.xml');
let totalFills = 0;
let totalFonts = 0;
let totalBorders = 0;
let totalNumFormats = 0;
let totalCellXfs = 0;
let hasConditionalFmt = false;
let fillColors = new Set();
let fontSizes = new Set();
let fontColors = new Set();
let borderStyles = new Set();

if (stylesXml) {
  const content = stylesXml.getData().toString('utf8');

  // Fills
  const fills = content.match(/<fill>/g) || [];
  totalFills = fills.length;

  // Extract fill colors
  const fgColors = content.match(/<fgColor rgb="([^"]+)"/g) || [];
  fgColors.forEach((c) => {
    const val = c.match(/rgb="([^"]+)"/)[1];
    if (val && val !== '00000000') fillColors.add(val);
  });

  // Fonts
  const fonts = content.match(/<font>/g) || [];
  totalFonts = fonts.length;

  // Font sizes
  const sizes = content.match(/<sz val="([^"]+)"/g) || [];
  sizes.forEach((s) => fontSizes.add(parseFloat(s.match(/val="([^"]+)"/)[1])));

  // Font colors
  const fColors = content.match(/<color rgb="([^"]+)"/g) || [];
  fColors.forEach((c) => {
    const val = c.match(/rgb="([^"]+)"/)[1];
    if (val && val !== 'FF000000') fontColors.add(val);
  });

  // Borders
  const borders = content.match(/<border>/g) || [];
  totalBorders = borders.length;

  // Border styles
  const bStyles = content.match(/<(left|right|top|bottom)\s+style="([^"]+)"/g) || [];
  bStyles.forEach((b) => {
    const style = b.match(/style="([^"]+)"/);
    if (style) borderStyles.add(style[1]);
  });

  // Number formats
  totalNumFormats = (content.match(/<numFmt /g) || []).length;

  // Cell formats
  totalCellXfs = (content.match(/<xf /g) || []).length;

  console.log('\n=== Styles ===');
  console.log('Total fills:', totalFills);
  console.log('Fill colors:', [...fillColors].map((c) => '#' + c).join(', ') || 'none');
  console.log('Total fonts:', totalFonts);
  console.log(
    'Font sizes:',
    [...fontSizes]
      .sort((a, b) => b - a)
      .map((s) => s + 'pt')
      .join(', ')
  );
  console.log('Font colors:', [...fontColors].map((c) => '#' + c).join(', ') || 'default only');
  console.log('Total borders:', totalBorders);
  console.log('Border styles:', [...borderStyles].join(', ') || 'none');
  console.log('Number formats:', totalNumFormats);
  console.log('Cell format combos:', totalCellXfs);
}

// 4. Per-sheet analysis
const sheetEntries = zip
  .getEntries()
  .filter((e) => e.entryName.match(/xl\/worksheets\/sheet\d+\.xml/));
let totalRows = 0;
let totalCells = 0;
let totalMergedCells = 0;
let totalCharts = 0;
let totalConditionalFormats = 0;
let totalFormulas = 0;
let totalHyperlinks = 0;
let maxColIndex = 0;
let sheetsWithData = 0;
let sheetsWithFormatting = 0;
let sheetsWithFilters = 0;
let sheetsWithFreeze = 0;

console.log('\n=== Per-Sheet Analysis ===');

sheetEntries.forEach((e, idx) => {
  const content = e.getData().toString('utf8');
  const sheetNum = e.entryName.match(/sheet(\d+)/)[1];
  const sheetName = sheetNames[parseInt(sheetNum) - 1] || `Sheet${sheetNum}`;

  const rows = (content.match(/<row /g) || []).length;
  const cells = (content.match(/<c /g) || []).length;
  const merged = (content.match(/<mergeCell /g) || []).length;
  const formulas = (content.match(/<f>/g) || []).length + (content.match(/<f /g) || []).length;
  const hyperlinks = (content.match(/<hyperlink /g) || []).length;
  const conditionalFmt = (content.match(/<conditionalFormatting/g) || []).length;
  const hasAutoFilter = content.includes('<autoFilter');
  const hasFreeze = content.includes('<pane ');
  const hasSheetColor = content.includes('tabColor');

  // Column range
  const colRefs = content.match(/r="([A-Z]+)\d+"/g) || [];
  let sheetMaxCol = 0;
  colRefs.forEach((ref) => {
    const col = ref.match(/r="([A-Z]+)/)[1];
    const colNum = col.split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0);
    if (colNum > sheetMaxCol) sheetMaxCol = colNum;
  });

  totalRows += rows;
  totalCells += cells;
  totalMergedCells += merged;
  totalFormulas += formulas;
  totalHyperlinks += hyperlinks;
  totalConditionalFormats += conditionalFmt;
  if (rows > 0) sheetsWithData++;
  if (merged > 0 || conditionalFmt > 0 || hasSheetColor) sheetsWithFormatting++;
  if (hasAutoFilter) sheetsWithFilters++;
  if (hasFreeze) sheetsWithFreeze++;
  if (sheetMaxCol > maxColIndex) maxColIndex = sheetMaxCol;

  console.log(`\n  Sheet "${sheetName}":`);
  console.log(`    Rows: ${rows}, Cells: ${cells}, Columns: ${sheetMaxCol}`);
  console.log(`    Merged cells: ${merged}, Formulas: ${formulas}`);
  console.log(`    Hyperlinks: ${hyperlinks}, Conditional formats: ${conditionalFmt}`);
  console.log(
    `    Auto filter: ${hasAutoFilter}, Freeze pane: ${hasFreeze}, Tab color: ${hasSheetColor}`
  );
});

// 5. Charts
const chartEntries = zip.getEntries().filter((e) => e.entryName.match(/xl\/charts\/chart\d+\.xml/));
totalCharts = chartEntries.length;
if (totalCharts > 0) {
  console.log('\n=== Charts ===');
  console.log('Total charts:', totalCharts);
  chartEntries.forEach((e) => {
    const content = e.getData().toString('utf8');
    const chartTypes = [];
    if (content.includes('<c:barChart')) chartTypes.push('bar');
    if (content.includes('<c:lineChart')) chartTypes.push('line');
    if (content.includes('<c:pieChart')) chartTypes.push('pie');
    if (content.includes('<c:areaChart')) chartTypes.push('area');
    if (content.includes('<c:scatterChart')) chartTypes.push('scatter');
    if (content.includes('<c:doughnutChart')) chartTypes.push('doughnut');
    if (content.includes('<c:radarChart')) chartTypes.push('radar');
    console.log(`  ${e.entryName}: ${chartTypes.join(', ') || 'unknown type'}`);
  });
}

// 6. Drawings (images, shapes)
const drawingEntries = zip
  .getEntries()
  .filter((e) => e.entryName.match(/xl\/drawings\/drawing\d+\.xml/));
let totalDrawingImages = 0;
let totalDrawingShapes = 0;
if (drawingEntries.length > 0) {
  drawingEntries.forEach((e) => {
    const content = e.getData().toString('utf8');
    totalDrawingImages += (content.match(/<a:blip /g) || []).length;
    totalDrawingShapes += (content.match(/<xdr:sp>/g) || []).length;
  });
  console.log('\n=== Drawings ===');
  console.log('Images:', totalDrawingImages);
  console.log('Shapes:', totalDrawingShapes);
}

// 7. Overall Summary
console.log('\n=== Overall Summary ===');
console.log('Sheets:', sheetNames.length, `(${sheetsWithData} with data)`);
console.log('Total rows:', totalRows);
console.log('Total cells:', totalCells);
console.log('Max columns:', maxColIndex);
console.log('Merged cells:', totalMergedCells);
console.log('Formulas:', totalFormulas);
console.log('Charts:', totalCharts);
console.log('Conditional formats:', totalConditionalFormats);
console.log('Hyperlinks:', totalHyperlinks);
console.log('Sheets with auto-filter:', sheetsWithFilters);
console.log('Sheets with freeze pane:', sheetsWithFreeze);
console.log('Sheets with formatting:', sheetsWithFormatting);

// 8. Design Quality Score
console.log('\n=== Design Quality Score ===');
let score = 0;
let issues = [];

// Data volume
if (totalRows >= 5) score += 5;
else issues.push(`Very few rows (${totalRows} < 5)`);
if (totalCells >= 20) score += 5;
else issues.push(`Very few cells (${totalCells} < 20)`);

// Multi-sheet structure
if (sheetNames.length >= 2) score += 10;
else if (sheetNames.length === 1) {
  score += 3;
  issues.push('Single sheet only');
}

// Headers (merged cells often used for headers)
if (totalMergedCells >= 1) score += 5;
else issues.push('No merged cells (may lack header structure)');

// Fill colors (header styling)
if (fillColors.size >= 2) score += 10;
else if (fillColors.size === 1) {
  score += 5;
  issues.push('Only 1 fill color');
} else issues.push('No fill colors — plain white cells');

// Font variation
if (fontSizes.size >= 2) score += 5;
else issues.push('No font size variation');

// Font colors
if (fontColors.size >= 1) score += 5;
else issues.push('No colored fonts');

// Borders
if (borderStyles.size >= 1) score += 10;
else issues.push('No borders — data may be hard to read');

// Number formats
if (totalNumFormats >= 1) score += 5;
else issues.push('No custom number formats');

// Formulas
if (totalFormulas >= 3) score += 10;
else if (totalFormulas >= 1) {
  score += 5;
  issues.push('Few formulas');
} else issues.push('No formulas — static data only');

// Charts
if (totalCharts >= 2) score += 10;
else if (totalCharts === 1) {
  score += 5;
  issues.push('Only 1 chart');
} else issues.push('No charts — consider adding visualizations');

// Conditional formatting
if (totalConditionalFormats >= 1) score += 5;
else issues.push('No conditional formatting');

// Auto-filter
if (sheetsWithFilters >= 1) score += 5;
else issues.push('No auto-filter');

// Freeze pane
if (sheetsWithFreeze >= 1) score += 5;
else issues.push('No freeze pane (headers scroll out of view)');

// Hyperlinks
if (totalHyperlinks >= 1) score += 5;
else issues.push('No hyperlinks');

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
