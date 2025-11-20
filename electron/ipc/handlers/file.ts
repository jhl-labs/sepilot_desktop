import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';

/**
 * File IPC Handlers
 *
 * 파일 다이얼로그 및 이미지 로딩 핸들러
 */

// 이미지 최대 크기 설정 (픽셀)
// 적당한 크기로 설정 (너무 작으면 이미지 품질이 떨어짐)
const MAX_IMAGE_WIDTH = 512;
const MAX_IMAGE_HEIGHT = 512;

/**
 * 이미지 리사이징 및 최적화
 * 모든 이미지를 무조건 512x512 이하로 리사이징하고 JPEG로 압축
 */
async function processImage(filePath: string): Promise<Buffer> {
  try {
    const image = sharp(filePath);
    const metadata = await image.metadata();

    console.log(
      `[File] Processing image: ${metadata.width}x${metadata.height}, format: ${metadata.format}`
    );

    // 모든 이미지를 무조건 리사이징하고 JPEG로 변환
    const processed = await image
      .resize(MAX_IMAGE_WIDTH, MAX_IMAGE_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: false, // 작은 이미지도 처리
      })
      .jpeg({
        quality: 50, // 적당한 품질로 설정
        progressive: true,
        optimizeScans: true,
      })
      .toBuffer();

    console.log(
      `[File] Compressed: ${metadata.width}x${metadata.height} -> ${Math.round(processed.length / 1024)}KB`
    );

    return processed;
  } catch (error) {
    console.error('[File] Error processing image:', error);
    throw error; // 에러를 throw해서 사용자에게 알림
  }
}

export function registerFileHandlers() {
  // 이미지 파일 선택 다이얼로그
  ipcMain.handle('file:select-images', async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) {
        return {
          success: false,
          error: 'No focused window found',
        };
      }

      const result = await dialog.showOpenDialog(focusedWindow, {
        title: '이미지 선택',
        filters: [
          {
            name: 'Images',
            extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'],
          },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      // 선택된 파일 정보 반환
      const files = await Promise.all(
        result.filePaths.map(async (filePath) => {
          const filename = path.basename(filePath);
          const ext = path.extname(filePath).toLowerCase();
          const mimeType = getMimeType(ext);

          // 이미지 리사이징 및 최적화
          const processedBuffer = await processImage(filePath);
          const base64 = processedBuffer.toString('base64');

          console.log(
            `[File] Processed image: ${filename}, size: ${Math.round(processedBuffer.length / 1024)}KB`
          );

          return {
            id: `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            path: filePath,
            filename,
            mimeType: 'image/jpeg', // 처리 후 항상 JPEG
            base64: `data:image/jpeg;base64,${base64}`,
          };
        })
      );

      return {
        success: true,
        data: files,
      };
    } catch (error: any) {
      console.error('[File] Error selecting images:', error);
      return {
        success: false,
        error: error.message || 'Failed to select images',
      };
    }
  });

  // 이미지 파일 로드 (경로로부터)
  ipcMain.handle('file:load-image', async (_event, filePath: string) => {
    try {
      // 이미지 리사이징 및 최적화
      const processedBuffer = await processImage(filePath);
      const base64 = processedBuffer.toString('base64');

      return {
        success: true,
        data: {
          path: filePath,
          filename: path.basename(filePath),
          mimeType: 'image/jpeg',
          base64: `data:image/jpeg;base64,${base64}`,
        },
      };
    } catch (error: any) {
      console.error('[File] Error loading image:', error);
      return {
        success: false,
        error: error.message || 'Failed to load image',
      };
    }
  });

  console.log('[File] IPC handlers registered');
}

function getMimeType(ext: string): string {
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}
