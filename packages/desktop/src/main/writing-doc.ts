import { dialog, ipcMain, type BrowserWindow } from 'electron'

export function registerWritingDocIpc(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle('sepilot:writing/pick-open', async () => {
    const win = getMainWindow() ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: '글쓰기 모드 — 마크다운 파일 열기',
      properties: ['openFile', 'createDirectory'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown', 'mdx'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return { path: result.filePaths[0] }
  })

  ipcMain.handle('sepilot:writing/pick-save-as', async () => {
    const win = getMainWindow() ?? undefined
    const result = await dialog.showSaveDialog(win!, {
      title: '다른 이름으로 저장',
      defaultPath: 'untitled.md',
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
      ],
    })
    if (result.canceled || !result.filePath) return null
    return { path: result.filePath }
  })
}
