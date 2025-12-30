import { ipcMain, dialog, BrowserWindow, shell } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import sharp from 'sharp';
import TurndownService from 'turndown';
import mammoth from 'mammoth';
import { httpFetch, getNetworkConfig } from '@/lib/http';

const execAsync = promisify(exec);

/**
 * Get ripgrep binary path
 * @vscode/ripgrep 패키지는 플랫폼별로 다른 바이너리를 제공
 */
function getRipgrepPath(): string {
  try {
    // @vscode/ripgrep 패키지 경로
    // require.resolve('@vscode/ripgrep')는 /path/to/node_modules/@vscode/ripgrep/lib/index.js를 반환
    const ripgrepModule = require.resolve('@vscode/ripgrep');
    // lib/index.js -> lib -> @vscode/ripgrep (패키지 루트)
    const ripgrepDir = path.dirname(path.dirname(ripgrepModule));

    // 플랫폼별 바이너리 경로
    let binaryName = 'rg';
    if (process.platform === 'win32') {
      binaryName = 'rg.exe';
    }

    // bin 디렉토리 찾기
    const binPath = path.join(ripgrepDir, 'bin', binaryName);

    console.log('[File] Resolved ripgrep path:', binPath);
    return binPath;
  } catch (error) {
    console.error('[File] Failed to resolve ripgrep path:', error);
    throw new Error('Failed to locate ripgrep binary');
  }
}

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

  // URL에서 콘텐츠 가져오기
  ipcMain.handle('file:fetch-url', async (_event, url: string) => {
    try {
      console.log('[File] Fetching URL:', url);

      const networkConfig = await getNetworkConfig();
      const response = await httpFetch(url, { networkConfig: networkConfig ?? undefined });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';

      if (!contentType.includes('text/html')) {
        console.warn('[File] Content is not HTML:', contentType);
      }

      const html = await response.text();

      // HTML을 마크다운으로 변환
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced',
      });

      const markdown = turndownService.turndown(html);

      // 제목 추출 (title 태그에서)
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch ? titleMatch[1].trim() : '';

      console.log('[File] Fetched and converted to markdown');

      return {
        success: true,
        data: {
          content: markdown,
          title,
          url,
        },
      };
    } catch (error: any) {
      console.error('[File] Error fetching URL:', error);
      return {
        success: false,
        error: error.message || 'Failed to fetch URL',
      };
    }
  });

  // 문서 파일 선택 및 읽기
  ipcMain.handle('file:select-document', async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) {
        return {
          success: false,
          error: 'No focused window found',
        };
      }

      const result = await dialog.showOpenDialog(focusedWindow, {
        title: '문서 파일 선택',
        filters: [
          {
            name: 'Documents',
            extensions: ['txt', 'md', 'pdf', 'docx'],
          },
        ],
        properties: ['openFile'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: true,
          data: [],
        };
      }

      const filePath = result.filePaths[0];
      const filename = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();

      console.log('[File] Reading document:', filename);

      let content = '';

      // 파일 형식에 따라 읽기
      if (ext === '.txt' || ext === '.md') {
        // 텍스트 파일
        content = await fs.readFile(filePath, 'utf-8');
      } else if (ext === '.pdf') {
        // PDF 파일
        const dataBuffer = await fs.readFile(filePath);
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(dataBuffer);
        content = pdfData.text;
      } else if (ext === '.docx') {
        // DOCX 파일
        const dataBuffer = await fs.readFile(filePath);
        const docxResult = await mammoth.extractRawText({ buffer: dataBuffer });
        content = docxResult.value;
      } else {
        throw new Error(`Unsupported file format: ${ext}`);
      }

      console.log('[File] Document read successfully, length:', content.length);

      return {
        success: true,
        data: [
          {
            path: filePath,
            filename,
            title: path.basename(filePath, ext),
            content,
          },
        ],
      };
    } catch (error: any) {
      console.error('[File] Error selecting document:', error);
      return {
        success: false,
        error: error.message || 'Failed to select document',
      };
    }
  });

  // 텍스트 파일 읽기 (코딩 에이전트용)
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error: any) {
      // If file doesn't exist (ENOENT), return empty string for CodeDiffViewer
      // This allows diffing for new files in file_write operations
      if (error.code === 'ENOENT') {
        console.log(`[File] File does not exist (will be created): ${filePath}`);
        return '';
      }
      // For other errors, throw
      console.error('[File] Error reading file:', error);
      throw new Error(`Failed to read file: ${error.message}`);
    }
  });

  // 디렉토리 선택 다이얼로그 (코딩 에이전트용)
  ipcMain.handle('file:select-directory', async () => {
    try {
      const focusedWindow = BrowserWindow.getFocusedWindow();
      if (!focusedWindow) {
        return {
          success: false,
          error: 'No focused window found',
        };
      }

      const result = await dialog.showOpenDialog(focusedWindow, {
        title: '작업 디렉토리 선택',
        properties: ['openDirectory'],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return {
          success: true,
          data: null,
        };
      }

      const selectedPath = result.filePaths[0];
      console.log('[File] Selected directory:', selectedPath);

      return {
        success: true,
        data: selectedPath,
      };
    } catch (error: any) {
      console.error('[File] Error selecting directory:', error);
      return {
        success: false,
        error: error.message || 'Failed to select directory',
      };
    }
  });

  // 디렉토리 내용 읽기 (파일 탐색기용)
  ipcMain.handle('fs:read-directory', async (_event, dirPath: string) => {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      // 파일과 디렉토리 분류 및 정렬
      const fileNodes = entries
        .filter((entry) => !entry.name.startsWith('.')) // 숨김 파일 제외
        .map((entry) => ({
          name: entry.name,
          path: path.join(dirPath, entry.name),
          isDirectory: entry.isDirectory(),
        }))
        .sort((a, b) => {
          // 디렉토리 우선, 그 다음 알파벳 순
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

      return {
        success: true,
        data: fileNodes,
      };
    } catch (error: any) {
      console.error('[File] Error reading directory:', error);
      return {
        success: false,
        error: error.message || 'Failed to read directory',
      };
    }
  });

  // 파일 읽기 (Editor용)
  ipcMain.handle('fs:read-file', async (_event, filePath: string) => {
    try {
      console.log('[File] Reading file:', filePath);

      // 파일 존재 여부 확인
      try {
        await fs.access(filePath);
      } catch (accessError: any) {
        console.error('[File] File does not exist or is not accessible:', filePath);
        return {
          success: false,
          error: `File not found or not accessible: ${filePath}`,
          code: accessError.code || 'ENOENT',
        };
      }

      const content = await fs.readFile(filePath, 'utf-8');
      console.log('[File] File read successfully:', filePath, `(${content.length} bytes)`);
      return {
        success: true,
        data: content,
      };
    } catch (error: any) {
      console.error('[File] Error reading file:', {
        path: filePath,
        error: error.message,
        code: error.code,
        stack: error.stack,
      });
      return {
        success: false,
        error: error.message || 'Failed to read file',
        code: error.code || 'UNKNOWN',
      };
    }
  });

  // 파일 쓰기 (Editor 저장용)
  ipcMain.handle('fs:write-file', async (_event, filePath: string, content: string) => {
    try {
      await fs.writeFile(filePath, content, 'utf-8');
      console.log('[File] File saved successfully:', filePath);
      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error writing file:', error);
      return {
        success: false,
        error: error.message || 'Failed to write file',
      };
    }
  });

  // 파일 생성 (Editor용)
  ipcMain.handle('fs:create-file', async (_event, filePath: string, content: string = '') => {
    try {
      // 부모 디렉토리 확인
      const dirPath = path.dirname(filePath);
      await fs.mkdir(dirPath, { recursive: true });

      // 파일 생성
      await fs.writeFile(filePath, content, 'utf-8');
      console.log('[File] File created successfully:', filePath);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error creating file:', error);
      return {
        success: false,
        error: error.message || 'Failed to create file',
      };
    }
  });

  // 폴더 생성 (Editor용)
  ipcMain.handle('fs:create-directory', async (_event, dirPath: string) => {
    try {
      await fs.mkdir(dirPath, { recursive: true });
      console.log('[File] Directory created successfully:', dirPath);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error creating directory:', error);
      return {
        success: false,
        error: error.message || 'Failed to create directory',
      };
    }
  });

  // 파일/폴더 삭제 (Editor용)
  ipcMain.handle('fs:delete', async (_event, targetPath: string) => {
    try {
      const stats = await fs.stat(targetPath);

      if (stats.isDirectory()) {
        await fs.rm(targetPath, { recursive: true, force: true });
        console.log('[File] Directory deleted successfully:', targetPath);
      } else {
        await fs.unlink(targetPath);
        console.log('[File] File deleted successfully:', targetPath);
      }

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error deleting:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete',
      };
    }
  });

  // 파일/폴더 이름 변경 (Editor용)
  ipcMain.handle('fs:rename', async (_event, oldPath: string, newPath: string) => {
    try {
      await fs.rename(oldPath, newPath);
      console.log('[File] Renamed successfully:', oldPath, '->', newPath);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error renaming:', error);
      return {
        success: false,
        error: error.message || 'Failed to rename',
      };
    }
  });

  // 파일/폴더 복사 (Editor용 - 클립보드 기능)
  ipcMain.handle('fs:copy', async (_event, sourcePath: string, destPath: string) => {
    try {
      const stats = await fs.stat(sourcePath);

      if (stats.isDirectory()) {
        // 디렉토리 복사 (재귀적으로)
        await fs.cp(sourcePath, destPath, { recursive: true });
        console.log('[File] Directory copied successfully:', sourcePath, '->', destPath);
      } else {
        // 파일 복사
        await fs.copyFile(sourcePath, destPath);
        console.log('[File] File copied successfully:', sourcePath, '->', destPath);
      }

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error copying:', error);
      return {
        success: false,
        error: error.message || 'Failed to copy',
      };
    }
  });

  // 파일/폴더 이동 (Editor용 - 클립보드 잘라내기)
  ipcMain.handle('fs:move', async (_event, sourcePath: string, destPath: string) => {
    try {
      await fs.rename(sourcePath, destPath);
      console.log('[File] Moved successfully:', sourcePath, '->', destPath);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error moving:', error);
      return {
        success: false,
        error: error.message || 'Failed to move',
      };
    }
  });

  // 파일/폴더 경로 복사를 위한 절대 경로 가져오기
  ipcMain.handle('fs:get-absolute-path', async (_event, filePath: string) => {
    try {
      const absolutePath = path.resolve(filePath);
      return {
        success: true,
        data: absolutePath,
      };
    } catch (error: any) {
      console.error('[File] Error getting absolute path:', error);
      return {
        success: false,
        error: error.message || 'Failed to get absolute path',
      };
    }
  });

  // 상대 경로 계산 (working directory 기준)
  ipcMain.handle('fs:get-relative-path', async (_event, from: string, to: string) => {
    try {
      const relativePath = path.relative(from, to);
      return {
        success: true,
        data: relativePath,
      };
    } catch (error: any) {
      console.error('[File] Error getting relative path:', error);
      return {
        success: false,
        error: error.message || 'Failed to get relative path',
      };
    }
  });

  // 상대 경로를 절대 경로로 변환 (Markdown 이미지 렌더링용)
  ipcMain.handle('fs:resolve-path', async (_event, basePath: string, relativePath: string) => {
    try {
      // basePath가 파일인지 디렉토리인지 확인
      let baseDir: string;

      try {
        const stats = await fs.stat(basePath);
        if (stats.isDirectory()) {
          // 이미 디렉토리면 그대로 사용
          baseDir = basePath;
        } else {
          // 파일이면 디렉토리 추출
          baseDir = path.dirname(basePath);
        }
      } catch {
        // 파일/디렉토리가 존재하지 않으면 파일로 간주하고 dirname 사용
        baseDir = path.dirname(basePath);
      }

      const absolutePath = path.resolve(baseDir, relativePath);

      console.log('[File] Resolved path:', { basePath, relativePath, baseDir, absolutePath });

      return {
        success: true,
        data: absolutePath,
      };
    } catch (error: any) {
      console.error('[File] Error resolving path:', error);
      return {
        success: false,
        error: error.message || 'Failed to resolve path',
      };
    }
  });

  // 경로에서 파일명 추출 (basename)
  ipcMain.handle('fs:basename', async (_event, filePath: string, ext?: string) => {
    try {
      const basename = ext !== undefined ? path.basename(filePath, ext) : path.basename(filePath);
      return {
        success: true,
        data: basename,
      };
    } catch (error: any) {
      console.error('[File] Error getting basename:', error);
      return {
        success: false,
        error: error.message || 'Failed to get basename',
      };
    }
  });

  // 경로에서 디렉토리 추출 (dirname)
  ipcMain.handle('fs:dirname', async (_event, filePath: string) => {
    try {
      const dirname = path.dirname(filePath);
      return {
        success: true,
        data: dirname,
      };
    } catch (error: any) {
      console.error('[File] Error getting dirname:', error);
      return {
        success: false,
        error: error.message || 'Failed to get dirname',
      };
    }
  });

  // 경로에서 확장자 추출 (extname)
  ipcMain.handle('fs:extname', async (_event, filePath: string) => {
    try {
      const extname = path.extname(filePath);
      return {
        success: true,
        data: extname,
      };
    } catch (error: any) {
      console.error('[File] Error getting extname:', error);
      return {
        success: false,
        error: error.message || 'Failed to get extname',
      };
    }
  });

  // 시스템 탐색기에서 파일/폴더 열기
  ipcMain.handle('fs:show-in-folder', async (_event, itemPath: string) => {
    try {
      // Check if path exists
      await fs.access(itemPath);

      // Show item in folder (works for both files and directories)
      shell.showItemInFolder(itemPath);
      console.log('[File] Showed in folder:', itemPath);

      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error showing in folder:', error);
      return {
        success: false,
        error: error.message || 'Failed to show in folder',
      };
    }
  });

  // 기본 앱으로 파일 열기
  ipcMain.handle('fs:open-with-default-app', async (_event, itemPath: string) => {
    try {
      // Check if path exists
      await fs.access(itemPath);

      // Open file with default application
      const result = await shell.openPath(itemPath);

      if (result) {
        // openPath returns an error string if failed, empty string on success
        console.error('[File] Failed to open with default app:', result);
        return {
          success: false,
          error: result,
        };
      }

      console.log('[File] Opened with default app:', itemPath);
      return {
        success: true,
      };
    } catch (error: any) {
      console.error('[File] Error opening with default app:', error);
      return {
        success: false,
        error: error.message || 'Failed to open with default app',
      };
    }
  });

  // 파일 stat 정보 가져오기 (수정 시간 등)
  ipcMain.handle('fs:get-file-stat', async (_event, filePath: string) => {
    try {
      const stats = await fs.stat(filePath);

      return {
        success: true,
        data: {
          mtime: stats.mtimeMs, // 수정 시간 (milliseconds)
          size: stats.size,
          isFile: stats.isFile(),
          isDirectory: stats.isDirectory(),
        },
      };
    } catch (error: any) {
      console.error('[File] Error getting file stat:', error);
      return {
        success: false,
        error: error.message || 'Failed to get file stat',
      };
    }
  });

  // 파일 복제 (같은 폴더에 복사본 생성)
  ipcMain.handle('fs:duplicate', async (_event, sourcePath: string) => {
    try {
      const dir = path.dirname(sourcePath);
      const ext = path.extname(sourcePath);
      const basename = path.basename(sourcePath, ext);

      // Generate unique name for duplicate
      let counter = 1;
      let destPath = path.join(dir, `${basename} copy${ext}`);

      // Check if file exists and increment counter
      while (true) {
        try {
          await fs.access(destPath);
          // File exists, try next number
          destPath = path.join(dir, `${basename} copy ${counter}${ext}`);
          counter++;
        } catch {
          // File doesn't exist, we can use this name
          break;
        }
      }

      // Copy the file or directory
      const stats = await fs.stat(sourcePath);
      if (stats.isDirectory()) {
        await fs.cp(sourcePath, destPath, { recursive: true });
        console.log('[File] Directory duplicated:', sourcePath, '->', destPath);
      } else {
        await fs.copyFile(sourcePath, destPath);
        console.log('[File] File duplicated:', sourcePath, '->', destPath);
      }

      return {
        success: true,
        data: destPath,
      };
    } catch (error: any) {
      console.error('[File] Error duplicating:', error);
      return {
        success: false,
        error: error.message || 'Failed to duplicate',
      };
    }
  });

  // 클립보드 이미지를 파일로 저장 (Markdown editor용)
  ipcMain.handle('fs:save-clipboard-image', async (_event, destDir: string) => {
    try {
      const { clipboard, nativeImage } = require('electron');

      // 클립보드에서 이미지 가져오기
      const image = clipboard.readImage();

      if (image.isEmpty()) {
        console.log('[File] No image in clipboard');
        return {
          success: false,
          error: 'No image in clipboard',
        };
      }

      console.log('[File] Image found in clipboard');

      // 고유한 파일명 생성 (타임스탬프 기반)
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      let filename = `image-${timestamp}.png`;
      let destPath = path.join(destDir, filename);
      let counter = 1;

      // 파일명 중복 확인 및 처리
      while (true) {
        try {
          await fs.access(destPath);
          // 파일이 존재하면 카운터 추가
          filename = `image-${timestamp}-${counter}.png`;
          destPath = path.join(destDir, filename);
          counter++;
        } catch {
          // 파일이 없으면 사용 가능
          break;
        }
      }

      // 이미지를 PNG 버퍼로 변환하여 저장
      const buffer = image.toPNG();
      await fs.writeFile(destPath, buffer);

      // Base64 data URL 생성 (미리보기용)
      const base64 = buffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64}`;

      console.log('[File] Clipboard image saved:', destPath);

      return {
        success: true,
        data: {
          filename,
          path: destPath,
          dataUrl, // 미리보기용 base64 data URL
        },
      };
    } catch (error: any) {
      console.error('[File] Error saving clipboard image:', error);
      return {
        success: false,
        error: error.message || 'Failed to save clipboard image',
      };
    }
  });

  // 이미지 파일을 base64로 읽기 (미리보기용)
  ipcMain.handle('fs:read-image-as-base64', async (_event, filePath: string) => {
    try {
      console.log('[File] Reading image as base64:', filePath);

      // 파일 존재 여부 확인
      try {
        await fs.access(filePath);
      } catch (accessError: any) {
        console.error('[File] Image file does not exist:', filePath);
        return {
          success: false,
          error: `Image file not found: ${filePath}`,
          code: accessError.code || 'ENOENT',
        };
      }

      // 바이너리로 읽기
      const buffer = await fs.readFile(filePath);
      const base64 = buffer.toString('base64');

      // 파일 확장자로 MIME 타입 추정
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp',
      };
      const mimeType = mimeTypes[ext] || 'image/png';

      const dataUrl = `data:${mimeType};base64,${base64}`;

      console.log('[File] Image read successfully:', filePath, `(${buffer.length} bytes)`);

      return {
        success: true,
        data: dataUrl,
      };
    } catch (error: any) {
      console.error('[File] Error reading image:', error);
      return {
        success: false,
        error: error.message || 'Failed to read image',
      };
    }
  });

  // 파일 전체 검색 (ripgrep 사용)
  ipcMain.handle(
    'fs:search-files',
    async (
      _event,
      query: string,
      dirPath: string,
      options?: {
        caseSensitive?: boolean;
        wholeWord?: boolean;
        useRegex?: boolean;
        includePattern?: string;
        excludePattern?: string;
      }
    ) => {
      try {
        console.log('[File] Searching files:', { query, dirPath, options });

        // .gitignore 파일 읽기
        const gitignorePath = path.join(dirPath, '.gitignore');
        let gitignorePatterns: string[] = [];
        try {
          const gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
          gitignorePatterns = gitignoreContent
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => {
              // 빈 줄, 주석, '!'로 시작하는 라인 제외
              // '!'로 시작하는 라인은 gitignore에서 "제외하지 않음"을 의미하므로
              // ripgrep의 --glob 패턴으로는 처리하지 않음
              return line && !line.startsWith('#') && !line.startsWith('!');
            });
          console.log(`[File] Loaded ${gitignorePatterns.length} patterns from .gitignore`);
        } catch (error) {
          console.log('[File] No .gitignore file found or failed to read');
        }

        // ripgrep 명령 구성
        const args: string[] = [
          '--line-number', // 라인 번호 표시
          '--column', // 컬럼 번호 표시
          '--no-heading', // 파일명을 각 줄에 표시
          '--with-filename', // 파일명 포함
          '--color=never', // 컬러 출력 비활성화
        ];

        // 옵션 적용
        if (!options?.caseSensitive) {
          args.push('--ignore-case');
        }
        if (options?.wholeWord) {
          args.push('--word-regexp');
        }
        if (!options?.useRegex) {
          args.push('--fixed-strings'); // 정규식이 아닌 일반 문자열 검색
        }
        if (options?.includePattern) {
          args.push('--glob', options.includePattern);
        }
        if (options?.excludePattern) {
          args.push('--glob', `!${options.excludePattern}`);
        }

        // .gitignore 패턴 추가
        for (const pattern of gitignorePatterns) {
          args.push('--glob', `!${pattern}`);
        }

        // 기본 제외 패턴 (gitignore에 없을 경우 대비)
        args.push('--glob', '!.git/**');

        // 검색어 추가
        args.push('--', query, '.');

        // ripgrep 경로 가져오기
        let rgPath: string;
        try {
          rgPath = getRipgrepPath();
          console.log('[File] Using bundled ripgrep at:', rgPath);
        } catch (error: any) {
          console.error('[File] Failed to get ripgrep path:', error);
          return {
            success: false,
            error: `Failed to locate ripgrep: ${error.message}`,
          };
        }

        // ripgrep 실행 파일 존재 확인
        try {
          await fs.access(rgPath);
          console.log('[File] ripgrep binary exists');
        } catch (error) {
          console.error('[File] ripgrep binary NOT found at:', rgPath);
          // 디렉토리 내용 확인
          const binDir = path.dirname(rgPath);
          try {
            const files = await fs.readdir(binDir);
            console.log('[File] Files in bin directory:', files);
          } catch (e) {
            console.error('[File] Cannot read bin directory:', binDir);
          }
          return {
            success: false,
            error: `ripgrep binary not found at: ${rgPath}`,
          };
        }

        console.log('[File] Working directory:', dirPath);
        console.log('[File] Search args:', args);

        // spawn을 사용하여 직접 실행 (shell 파싱 문제 회피)
        const stdout = await new Promise<string>((resolve, reject) => {
          const child = spawn(rgPath, args, {
            cwd: dirPath,
            windowsHide: true,
          });

          let output = '';
          let errorOutput = '';

          child.stdout.on('data', (data) => {
            output += data.toString();
          });

          child.stderr.on('data', (data) => {
            errorOutput += data.toString();
          });

          child.on('close', (code) => {
            if (code === 0) {
              // 성공
              resolve(output);
            } else if (code === 1) {
              // 매칭 없음
              console.log('[File] No matches found (exit code 1)');
              resolve('');
            } else {
              // 에러
              console.error('[File] ripgrep error:', { code, stderr: errorOutput });
              reject(new Error(`ripgrep failed with code ${code}: ${errorOutput}`));
            }
          });

          child.on('error', (error) => {
            console.error('[File] Failed to spawn ripgrep:', error);
            reject(error);
          });
        });

        console.log('[File] Search stdout length:', stdout.length);

        // 결과 파싱
        const results: Record<string, Array<{ line: number; column: number; text: string }>> = {};

        if (!stdout || stdout.trim().length === 0) {
          console.log('[File] No matches found (empty stdout)');
          return {
            success: true,
            data: {
              query,
              totalFiles: 0,
              totalMatches: 0,
              results: [],
            },
          };
        }

        const lines = stdout.trim().split('\n');
        console.log('[File] Total output lines:', lines.length);

        for (const line of lines) {
          // 형식: 파일명:라인:컬럼:텍스트
          const match = line.match(/^([^:]+):(\d+):(\d+):(.*)$/);
          if (match) {
            const [, filePath, lineNum, colNum, text] = match;
            if (!results[filePath]) {
              results[filePath] = [];
            }
            results[filePath].push({
              line: parseInt(lineNum, 10),
              column: parseInt(colNum, 10),
              text: text,
            });
          } else {
            console.log('[File] Failed to parse line:', line.substring(0, 100));
          }
        }

        // 파일별로 그룹화된 결과로 변환
        const groupedResults = Object.entries(results).map(([file, matches]) => ({
          file,
          matches,
        }));

        console.log(
          `[File] Search complete: ${groupedResults.length} files, ${Object.values(results).reduce((sum, m) => sum + m.length, 0)} matches`
        );

        return {
          success: true,
          data: {
            query,
            totalFiles: groupedResults.length,
            totalMatches: Object.values(results).reduce((sum, m) => sum + m.length, 0),
            results: groupedResults,
          },
        };
      } catch (error: any) {
        // ripgrep 실행 에러 처리
        console.error('[File] Error searching files:', error);

        if (error.code === 'ENOENT') {
          console.error('[File] Bundled ripgrep not found');
          return {
            success: false,
            error: 'Internal error: bundled ripgrep not found. Please report this issue.',
          };
        }

        console.error('[File] Unexpected error during search');
        return {
          success: false,
          error: `Search error: ${error.message || 'Unknown error'}`,
        };
      }
    }
  );

  // Find files by glob pattern
  ipcMain.handle(
    'fs:find-files',
    async (_event, rootPath: string, pattern: string): Promise<{ success: boolean; data?: string[]; error?: string }> => {
      try {
        console.log(`[File] Finding files: ${rootPath} with pattern: ${pattern}`);

        // Simple implementation for **/*.md pattern
        const results: string[] = [];

        async function walkDir(dir: string): Promise<void> {
          try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
              const fullPath = path.join(dir, entry.name);

              if (entry.isDirectory()) {
                // Skip node_modules, .git, and other common ignore directories
                if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                  await walkDir(fullPath);
                }
              } else if (entry.isFile()) {
                // Check if file matches pattern (simple .md check for now)
                if (pattern === '**/*.md' && entry.name.endsWith('.md')) {
                  results.push(fullPath);
                } else if (pattern.includes('*')) {
                  // Handle other glob patterns if needed
                  const ext = path.extname(entry.name);
                  const patternExt = pattern.split('*').pop();
                  if (patternExt && ext === patternExt) {
                    results.push(fullPath);
                  }
                }
              }
            }
          } catch (error) {
            // Skip directories we can't access
            console.warn(`[File] Could not access directory: ${dir}`, error);
          }
        }

        await walkDir(rootPath);

        console.log(`[File] Found ${results.length} files matching ${pattern}`);

        return {
          success: true,
          data: results,
        };
      } catch (error: any) {
        console.error('[File] Error finding files:', error);
        return {
          success: false,
          error: `Failed to find files: ${error.message}`,
        };
      }
    }
  );

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
