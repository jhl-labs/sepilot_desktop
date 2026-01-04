import type { PresentationSlide, PresentationExportFormat } from '../types';
import { isElectron } from '@/lib/platform';

function downloadBlob(content: BlobPart, type: string, filename: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function renderHtml(slides: PresentationSlide[]) {
  const styles = `
    body { font-family: 'Inter', 'Pretendard', system-ui, sans-serif; padding: 32px; background: #0b1021; color: #e9ecf5; }
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
            slide.imageData
              ? `<img src="${slide.imageData}" alt="${slide.title}" style="width: 100%; border-radius: 12px; margin-top: 12px;" />`
              : slide.imageUrl
                ? `<img src="${slide.imageUrl}" alt="${slide.title}" style="width: 100%; border-radius: 12px; margin-top: 12px;" />`
                : slide.imagePrompt
                  ? `<div class="image">Image prompt: ${slide.imagePrompt}</div>`
                  : ''
          }
        </div>`
    )
    .join('\n');

  return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>SEPilot Presentation</title><style>${styles}</style></head><body>${body}</body></html>`;
}

export async function exportPresentation(
  slides: PresentationSlide[],
  format: PresentationExportFormat
): Promise<string> {
  if (isElectron() && typeof window !== 'undefined' && window.electronAPI?.presentation) {
    return window.electronAPI.presentation.exportSlides(slides, format);
  }

  const html = renderHtml(slides);
  const filenameBase = `sepilot-presentation-${Date.now()}`;

  if (format === 'html') {
    const filename = `${filenameBase}.html`;
    downloadBlob(html, 'text/html', filename);
    return filename;
  }

  if (format === 'pdf') {
    const printable = window.open('', '_blank');
    if (printable) {
      printable.document.write(html);
      printable.document.close();
      printable.focus();
      printable.print();
    } else {
      downloadBlob(html, 'text/html', `${filenameBase}.pdf.html`);
    }
    return 'PDF 내보내기: 브라우저 인쇄 대화상자에서 저장하세요.';
  }

  if (format === 'pptx') {
    const payload = {
      generatedAt: new Date().toISOString(),
      slides,
      note: 'Convert this JSON to PPTX with your favorite generator (e.g., python-pptx).',
      source: 'SEPilot ppt-agent',
    };
    const filename = `${filenameBase}.pptx.json`;
    downloadBlob(JSON.stringify(payload, null, 2), 'application/json', filename);
    return filename;
  }

  // Fallback
  downloadBlob(html, 'text/html', `${filenameBase}.html`);
  return `${filenameBase}.html`;
}
