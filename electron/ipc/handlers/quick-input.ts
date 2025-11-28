import { ipcMain, BrowserWindow } from 'electron';
import { logger } from '../../services/logger';

export function setupQuickInputHandlers() {
  // Quick Input 제출 핸들러
  ipcMain.handle('quick-input-submit', async (event, message: string) => {
    try {
      logger.info('Quick input submitted:', message);

      // Quick Input 창 숨기기
      const quickInputWindow = BrowserWindow.fromWebContents(event.sender);
      quickInputWindow?.hide();

      // 메인 창 찾기
      const allWindows = BrowserWindow.getAllWindows();
      const mainWindow = allWindows.find(
        (win) => win !== quickInputWindow && !win.isDestroyed()
      );

      if (mainWindow) {
        // 메인 창 표시 및 포커스
        mainWindow.show();
        mainWindow.focus();

        // 메인 창에 새 대화 생성 및 메시지 전송 이벤트 발생
        mainWindow.webContents.send('create-new-chat-with-message', message);
      } else {
        logger.error('Main window not found');
      }

      return { success: true };
    } catch (error) {
      logger.error('Failed to handle quick input:', error);
      return { success: false, error: String(error) };
    }
  });

  // Quick Input 창 닫기 핸들러
  ipcMain.handle('quick-input-close', async (event) => {
    try {
      const quickInputWindow = BrowserWindow.fromWebContents(event.sender);
      quickInputWindow?.hide();
      return { success: true };
    } catch (error) {
      logger.error('Failed to close quick input:', error);
      return { success: false, error: String(error) };
    }
  });
}
