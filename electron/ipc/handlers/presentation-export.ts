import { app, ipcMain, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import type { PresentationSlide, PresentationExportFormat } from '@/types/presentation';

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
  const filename = `img-${Date.now()}-${Math.random().toString(16).slice(2)}${path.extname(parsed.pathname) || '.png'}`;
  const targetPath = path.join(tempDir, filename);

  const client = parsed.protocol === 'http:' ? http : https;

  const buffer: Buffer = await new Promise((resolve, reject) => {
    const req = client.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk as Buffer));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });

  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}

function buildHtml(slides: PresentationSlide[]) {
  const styles = `
    body { font-family: 'Inter','Pretendard',system-ui,sans-serif; padding: 32px; background: #0b1021; color: #e9ecf5; }
    .slide { background: #0f172a; border: 1px solid #1f2a44; border-radius: 16px; padding: 20px; margin-bottom: 16px; box-shadow: 0 16px 36px rgba(0,0,0,0.35); }
    .title { font-size: 20px; font-weight: 700; margin-bottom: 8px; display: flex; align-items: center; gap: 8px; }
    .desc { color: #c3c8d8; font-size: 14px; margin-bottom: 8px; }
    .bullets { margin: 0; padding-left: 20px; color: #d8dcee; font-size: 14px; }
    .bullet { margin-bottom: 6px; }
    .badge { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 4px 8px; border-radius: 9999px; background: rgba(255,255,255,0.08); }
    .image { margin-top: 10px; color: #94a3b8; font-size: 12px; }
  `;

  const body = slides
    .map(
      (slide) => `
        <div class="slide">
          <div class="title">
            <span class="badge" style="color:${slide.accentColor || '#c084fc'}">●</span>
            ${slide.title}
          </div>
          ${slide.description ? `<div class="desc">${slide.description}</div>` : ''}
          ${
            slide.bullets && slide.bullets.length
              ? `<ul class="bullets">${slide.bullets.map((b) => `<li class="bullet">${b}</li>`).join('')}</ul>`
              : ''
          }
          ${
            slide.imagePrompt
              ? `<div class="image">Image prompt: ${slide.imagePrompt}</div>`
              : slide.imageUrl
                ? `<img src="${slide.imageUrl}" alt="${slide.title}" style="width: 100%; border-radius: 12px; margin-top: 12px;" />`
                : ''
          }
        </div>`
    )
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>SEPilot Presentation</title><style>${styles}</style></head><body>${body}</body></html>`;
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
    const leftCol = slide.layout === 'two-column' ? 0.5 : 0.5;
    const rightCol = 5.5;
    const bodyWidth = slide.layout === 'two-column' ? 4.2 : 8.5;
    const bodyHeight = 3.8;
    const accent = slide.accentColor || 'c084fc';

    s.addText(slide.title, {
      x: 0.5,
      y: 0.3,
      w: 9,
      h: 1,
      fontSize: 28,
      bold: true,
      color: 'ffffff',
    });

    if (slide.description) {
      s.addText(slide.description, {
        x: leftCol,
        y: 1.1,
        w: bodyWidth,
        h: 1,
        fontSize: 16,
        color: 'd9e0ec',
      });
    }

    if (slide.bullets && slide.bullets.length) {
      s.addText(slide.bullets.map((b) => `• ${b}`).join('\n'), {
        x: leftCol,
        y: slide.description ? 1.8 : 1.5,
        w: bodyWidth,
        h: bodyHeight,
        fontSize: 16,
        color: 'd9e0ec',
      });
    }

    const imageX = slide.layout === 'two-column' ? rightCol : 5.5;
    const imageY = slide.layout === 'two-column' ? 1.2 : 1.6;
    const imageW = slide.layout === 'two-column' ? 4 : 4;
    const imageH = slide.layout === 'two-column' ? 3.8 : 3;

    if (slide.imageData) {
      try {
        const tempDir = ensureTempDir();
        const filePath = path.join(
          tempDir,
          `slide-${slide.id}-${Date.now()}-${Math.random().toString(16).slice(2)}.png`
        );
        const base64 = slide.imageData.replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        s.addImage({ path: filePath, x: imageX, y: imageY, w: imageW, h: imageH });
      } catch (error) {
        s.addText('이미지 삽입 실패', {
          x: imageX,
          y: imageY,
          w: imageW,
          h: imageH,
          fontSize: 12,
          color: 'a0a9b8',
        });
      }
    } else if (slide.imageUrl) {
      try {
        const localPath =
          slide.imageUrl.startsWith('http') || slide.imageUrl.startsWith('https')
            ? await downloadImageToTemp(slide.imageUrl)
            : slide.imageUrl;
        s.addImage({ path: localPath, x: imageX, y: imageY, w: imageW, h: imageH });
      } catch (error) {
        s.addText(`Image: ${slide.imageUrl}`, {
          x: imageX,
          y: imageY,
          w: imageW,
          h: imageH,
          fontSize: 12,
          color: 'a0a9b8',
        });
      }
    } else if (slide.imagePrompt) {
      s.addText(`Image prompt: ${slide.imagePrompt}`, {
        x: imageX,
        y: imageY,
        w: imageW,
        h: imageH,
        fontSize: 12,
        color: 'a0a9b8',
      });
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

export function setupPresentationExportHandlers() {
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
