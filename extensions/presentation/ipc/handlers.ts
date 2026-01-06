/**
 * Presentation Extension - IPC Handlers
 *
 * Main Process에서 실행되는 IPC handler들
 */

import { app, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import type { PresentationSlide, PresentationExportFormat } from '../types';
import { downloadImage, getNetworkConfig } from '@/lib/http';
import { generateId } from '@/lib/utils/id-generator';

interface ExportPayload {
  slides: PresentationSlide[];
  format: PresentationExportFormat;
}

function ensureOutputDir() {
  const base = path.join(app.getPath('documents'), 'SEPilot', 'presentations');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

function ensureTempDir() {
  const base = path.join(app.getPath('temp'), 'sepilot-presentation');
  fs.mkdirSync(base, { recursive: true });
  return base;
}

async function downloadImageToTemp(url: string): Promise<string> {
  const tempDir = ensureTempDir();
  const parsed = new URL(url);
  const filename = `${generateId('img')}${path.extname(parsed.pathname) || '.png'}`;
  const targetPath = path.join(tempDir, filename);

  const networkConfig = await getNetworkConfig();
  const result = await downloadImage(url, {
    networkConfig: networkConfig ?? undefined,
    timeout: 60000,
  });

  fs.writeFileSync(targetPath, result.buffer);
  return targetPath;
}

function buildHtml(slides: PresentationSlide[]) {
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@700&family=Sora:wght@600;800&family=Source+Sans+Pro:wght@400;600&display=swap');

    body { font-family: 'Inter','Pretendard',system-ui,sans-serif; margin: 0; padding: 40px; background: #0b1021; color: #e9ecf5; }
    
    .slide-container {
      max-width: 1200px;
      margin: 0 auto;
    }

    .slide { 
      position: relative;
      background: #0f172a; 
      border-radius: 16px; 
      overflow: hidden;
      margin-bottom: 24px; 
      box-shadow: 0 16px 36px rgba(0,0,0,0.35);
      aspect-ratio: 16/9;
      display: flex;
      flex-direction: column;
    }

    /* Layouts */
    .layout-hero {
      justify-content: center;
      text-align: center;
      padding: 60px;
    }
    .layout-hero .title { font-size: 48px; justify-content: center; }
    .layout-hero .desc { font-size: 24px; max-width: 800px; margin: 0 auto; }

    .layout-two-column {
      flex-direction: row;
      padding: 0;
    }
    .layout-two-column .col-left { flex: 1; padding: 60px; display: flex; flex-direction: column; justify-content: center; }
    .layout-two-column .col-right { flex: 1; padding: 0; position: relative; }
    .layout-two-column .image-cover { width: 100%; height: 100%; object-fit: cover; }

    .layout-title-body {
      padding: 60px;
    }

    .layout-stats {
      padding: 60px;
      display: flex;
      flex-direction: column;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 30px;
      margin-top: 40px;
    }
    .stat-item {
      text-align: center;
      padding: 20px;
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
    }
    .stat-value { font-size: 42px; font-weight: 800; margin-bottom: 8px; }
    .stat-label { font-size: 16px; opacity: 0.8; }

    /* Common */
    .title { font-size: 36px; font-weight: 800; margin-bottom: 16px; line-height: 1.2; }
    .subtitle { font-size: 18px; opacity: 0.7; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 1px; }
    .desc { font-size: 18px; opacity: 0.9; margin-bottom: 32px; line-height: 1.6; white-space: pre-wrap; }
    
    .bullets { margin: 0; padding-left: 20px; font-size: 18px; line-height: 1.8; }
    .bullet { margin-bottom: 12px; }
    
    .content-image {
      width: 100%;
      border-radius: 12px;
      margin-top: 24px;
      max-height: 400px;
      object-fit: cover;
    }
    
    .badge { 
      display: inline-flex; 
      align-items: center; 
      gap: 6px; 
      font-size: 12px; 
      padding: 6px 12px; 
      border-radius: 9999px; 
      background: rgba(255,255,255,0.1); 
      margin-bottom: 16px;
      backdrop-filter: blur(4px);
    }

    /* Print Specifics */
    @media print {
      body { padding: 0; background: none; }
      .slide { break-inside: avoid; page-break-after: always; margin: 0; border: none; }
      .slide-container { max-width: none; }
    }
  `;

  const renderSlideContent = (slide: PresentationSlide) => {
    // Fonts
    const titleFont = slide.titleFont ? `'${slide.titleFont}', sans-serif` : 'inherit';
    const bodyFont = slide.bodyFont ? `'${slide.bodyFont}', sans-serif` : 'inherit';

    // Explicit Styles
    const containerStyle = [
      `background: ${slide.backgroundColor || '#0f172a'}`,
      `color: ${slide.textColor || '#f8fafc'}`,
      `font-family: ${bodyFont}`,
    ].join(';');

    const titleStyle = `color: ${slide.textColor || '#f8fafc'}; font-family: ${titleFont}`;
    const accentStyle = `color: ${slide.accentColor || '#c084fc'}`;

    // Helper to generate text content
    const textContent = `
      ${slide.subtitle ? `<div class="subtitle" style="${accentStyle}">${slide.subtitle}</div>` : ''}
      <div class="title" style="${titleStyle}">${slide.title}</div>
      ${slide.description ? `<div class="desc">${slide.description}</div>` : ''}
      ${
        slide.bullets && slide.bullets.length
          ? `<ul class="bullets">${slide.bullets.map((b) => `<li class="bullet">${b}</li>`).join('')}</ul>`
          : ''
      }
    `;

    // Helper to generate image content
    const imageContent = () => {
      if (slide.imageData) return `<img src="${slide.imageData}" class="content-image" />`;
      if (slide.imageUrl) return `<img src="${slide.imageUrl}" class="content-image" />`;
      if (slide.imagePrompt)
        return `<div class="image-placeholder" style="border: 1px dashed ${slide.accentColor}; padding: 20px; border-radius: 8px; margin-top: 20px; text-align: center; color: ${slide.accentColor}; opacity: 0.7;">Image Prompt: ${slide.imagePrompt}</div>`;
      return '';
    };

    // Render based on Layout
    if (slide.layout === 'two-column') {
      return `
        <div class="slide layout-two-column" style="${containerStyle}">
          <div class="col-left">
            ${textContent}
          </div>
          <div class="col-right">
            ${
              slide.imageData || slide.imageUrl
                ? `<img src="${slide.imageData || slide.imageUrl}" class="image-cover" />`
                : `<div style="width:100%; height:100%; background:${slide.accentColor}20; display:flex; align-items:center; justify-content:center; color:${slide.accentColor || '#fff'}">Image Area</div>`
            }
          </div>
        </div>
      `;
    }

    if (slide.layout === 'hero') {
      return `
        <div class="slide layout-hero" style="${containerStyle}">
          ${slide.subtitle ? `<div class="subtitle" style="${accentStyle}">${slide.subtitle}</div>` : ''}
          <div class="title" style="${titleStyle}">${slide.title}</div>
          ${slide.description ? `<div class="desc">${slide.description}</div>` : ''}
        </div>
      `;
    }

    if (slide.layout === 'stats' && slide.slots?.stats) {
      return `
        <div class="slide layout-stats" style="${containerStyle}">
           <div>
            ${textContent}
           </div>
           <div class="stats-grid">
             ${slide.slots.stats
               .map(
                 (stat) => `
               <div class="stat-item">
                 <div class="stat-value" style="${accentStyle}">${stat.value}</div>
                 <div class="stat-label">${stat.label}</div>
               </div>
             `
               )
               .join('')}
           </div>
        </div>
      `;
    }

    // Default: title-body matches most other cases
    return `
      <div class="slide layout-title-body" style="${containerStyle}">
        ${textContent}
        ${imageContent()}
      </div>
    `;
  };

  const body = slides.map(renderSlideContent).join('\n');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>SEPilot Presentation</title>
    <style>${styles}</style>
  </head>
  <body>
    <div class="slide-container">
      ${body}
    </div>
  </body>
</html>`;
}

async function exportHtml(slides: PresentationSlide[]) {
  const outDir = ensureOutputDir();
  const filePath = path.join(outDir, `sepilot-presentation-${Date.now()}.html`);
  const html = buildHtml(slides);
  fs.writeFileSync(filePath, html, 'utf-8');
  return filePath;
}

async function exportPdf(slides: PresentationSlide[]) {
  const html = buildHtml(slides);
  const outDir = ensureOutputDir();
  const filePath = path.join(outDir, `sepilot-presentation-${Date.now()}.pdf`);

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      offscreen: true,
    },
  });

  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  const pdfBuffer = await win.webContents.printToPDF({ printBackground: true });
  fs.writeFileSync(filePath, pdfBuffer);
  win.destroy();
  return filePath;
}

async function exportPptx(slides: PresentationSlide[]) {
  // Lazy import to avoid bundling overhead
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PptxGenJS = require('pptxgenjs');
  const pptx = new PptxGenJS();

  for (const slide of slides) {
    const s = pptx.addSlide();
    const accent = (slide.accentColor || '#c084fc').replace('#', '');
    const background = (slide.backgroundColor || '#0f172a').replace('#', '');
    const textColor = (slide.textColor || '#ffffff').replace('#', '');
    // const titleFont = slide.titleFont || 'Helvetica';

    // Set Slide Background
    s.background = { color: background };

    // Layout Logic
    const isTwoCol = slide.layout === 'two-column';
    const isHero = slide.layout === 'hero';

    if (isHero) {
      s.addText(slide.title, {
        x: 0.5,
        y: 2.0,
        w: 9,
        h: 1.5,
        fontSize: 48,
        bold: true,
        color: textColor,
        align: 'center',
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 0.5,
          y: 1.5,
          w: 9,
          h: 0.5,
          fontSize: 18,
          color: accent,
          align: 'center',
          charSpacing: 2,
        });
      }
      if (slide.description) {
        s.addText(slide.description, {
          x: 1.5,
          y: 3.5,
          w: 7,
          h: 1.5,
          fontSize: 20,
          color: 'a0a9b8',
          align: 'center',
        });
      }
      continue; // Hero has different flow
    }

    // Standard Layouts
    const leftCol = 0.5;
    const rightCol = isTwoCol ? 5.5 : 5.5; // Image/Content split point
    const bodyWidth = isTwoCol ? 4.5 : 9;

    // 1. Title
    s.addText(slide.title, {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 0.8,
      fontSize: 32,
      bold: true,
      color: textColor,
    });

    // 2. Subtitle
    if (slide.subtitle) {
      s.addText(slide.subtitle, {
        x: 0.5,
        y: 1.0,
        w: 9,
        h: 0.4,
        fontSize: 14,
        color: accent,
        bold: true,
      });
    }

    const contentStartY = slide.subtitle ? 1.5 : 1.2;

    // 3. Description
    if (slide.description) {
      s.addText(slide.description, {
        x: leftCol,
        y: contentStartY,
        w: bodyWidth,
        h: 1,
        fontSize: 18,
        color: textColor, // Use main text color but maybe slightly muted in real app
        transparency: 10,
      });
    }

    // 4. Bullets
    if (slide.bullets && slide.bullets.length) {
      s.addText(slide.bullets.map((b) => `• ${b}`).join('\n'), {
        x: leftCol,
        y: slide.description ? contentStartY + 1.0 : contentStartY,
        w: bodyWidth,
        h: 3.5,
        fontSize: 16,
        color: textColor,
        lineSpacing: 28,
      });
    }

    // 5. Images (for Two Column or Right placement)
    const imageX = isTwoCol ? 5.2 : 0.5;
    const imageY = isTwoCol ? 1.2 : 4.5;
    const imageW = isTwoCol ? 4.3 : 9;
    const imageH = isTwoCol ? 4.0 : 2.5;

    // Only add image if we have space or layout demands it
    // In Title-Body, image usually goes below text if space permits

    if (slide.imageData || slide.imageUrl || slide.imagePrompt) {
      // ... (Image handling logic remains mostly same but position adjusted)
      if (slide.imageData) {
        try {
          const tempDir = ensureTempDir();
          const filePath = path.join(tempDir, `slide-${slide.id}-${generateId('img')}.png`);
          const base64 = slide.imageData.replace(/^data:image\/\w+;base64,/, '');
          fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
          s.addImage({ path: filePath, x: imageX, y: imageY, w: imageW, h: imageH });
        } catch (error) {
          /* ignore */
        }
      } else if (slide.imageUrl) {
        try {
          const localPath =
            slide.imageUrl.startsWith('http') || slide.imageUrl.startsWith('https')
              ? await downloadImageToTemp(slide.imageUrl)
              : slide.imageUrl;
          s.addImage({ path: localPath, x: imageX, y: imageY, w: imageW, h: imageH });
        } catch (error) {
          /* ignore */
        }
      }
    }

    // Simple chart/table placeholders based on slots (rasterized text placeholders)
    if (slide.slots?.chart) {
      const data = [
        {
          name: 'Series 1',
          labels: ['A', 'B', 'C', 'D'],
          values: [3, 5, 2, 4],
        },
      ];
      try {
        s.addChart(
          slide.slots.chart.type === 'pie' ? pptx.ChartType.pie : pptx.ChartType.bar,
          data,
          {
            x: 0.5,
            y: 5.0,
            w: 4.5,
            h: 2.0,
            chartColors: [accent, '94a3b8', '60a5fa', '22d3ee'],
            showLegend: false,
            dataLabelFormatCode: '0.0',
          }
        );
      } catch (error) {
        s.addText(
          `Chart (${slide.slots.chart.type})\n${slide.slots.chart.description || slide.slots.chart.title || ''}`,
          {
            x: 0.5,
            y: 5.2,
            w: 4.5,
            h: 1.2,
            fontSize: 12,
            color: accent,
            bold: true,
          }
        );
      }
    }

    if (slide.slots?.timeline) {
      const steps = Array.isArray(slide.slots.timeline.steps) ? slide.slots.timeline.steps : [];
      const labels = steps.map((step) => step.title || 'Step');
      s.addText(`Timeline (${steps.length} steps): ${labels.join(' → ')}`, {
        x: 5.2,
        y: 5.2,
        w: 4.3,
        h: 1.2,
        fontSize: 12,
        color: accent,
        bold: true,
      });
    }

    if (slide.slots?.table) {
      const headers = slide.slots.table.headers || [];
      const rows = slide.slots.table.rows || [];
      const tableData: any[] = [headers, ...rows];

      try {
        s.addTable(tableData, {
          x: 0.5,
          y: 6.4,
          w: 9,
          fontSize: 12,
          color: 'e5e7eb',
          fill: '0f172a',
          border: { type: 'none' },
        });
      } catch (error) {
        s.addText(
          `Table ${headers.join(' | ')} (${rows.length} rows)${slide.slots.table.caption ? ` - ${slide.slots.table.caption}` : ''}`,
          {
            x: 0.5,
            y: 6.5,
            w: 9,
            h: 0.8,
            fontSize: 12,
            color: '9ca3af',
          }
        );
      }
    }
  }

  const outDir = ensureOutputDir();
  const filePath = path.join(outDir, `sepilot-presentation-${Date.now()}.pptx`);
  const buffer = await pptx.write('nodebuffer');
  fs.writeFileSync(filePath, buffer);
  return filePath;
}

/**
 * Presentation Extension IPC Handlers 등록
 */
export function setupPresentationIpcHandlers() {
  ipcMain.handle('presentation:export', async (_event, payload: ExportPayload) => {
    const { slides, format } = payload;
    if (!slides || !slides.length) {
      throw new Error('No slides to export');
    }

    switch (format) {
      case 'html':
        return exportHtml(slides);
      case 'pdf':
        return exportPdf(slides);
      case 'pptx':
        return exportPptx(slides);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  });
}
