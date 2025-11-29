import { ipcMain, BrowserWindow, clipboard } from 'electron';
import { logger } from '../../services/logger';

export function setupQuickInputHandlers() {
  // Quick Input 제출 핸들러
  ipcMain.handle('quick-input-submit', async (event, message: string) => {
    try {
      logger.info('[QuickInput Handler] Received message:', message);

      // Quick Input 창 숨기기
      const quickInputWindow = BrowserWindow.fromWebContents(event.sender);
      logger.info('[QuickInput Handler] Quick Input window:', quickInputWindow?.id);
      quickInputWindow?.hide();

      // 메인 창 찾기
      const allWindows = BrowserWindow.getAllWindows();
      logger.info('[QuickInput Handler] Total windows:', allWindows.length);

      const mainWindow = allWindows.find(
        (win) => win !== quickInputWindow && !win.isDestroyed()
      );

      if (mainWindow) {
        logger.info('[QuickInput Handler] Main window found:', mainWindow.id);

        // 메인 창 표시 및 포커스
        mainWindow.show();
        mainWindow.focus();
        logger.info('[QuickInput Handler] Main window shown and focused');

        // 메인 창에 새 대화 생성 및 메시지 전송 이벤트 발생
        logger.info('[QuickInput Handler] Sending create-new-chat-with-message event to main window');
        mainWindow.webContents.send('create-new-chat-with-message', message);
        logger.info('[QuickInput Handler] Event sent successfully');
      } else {
        logger.error('[QuickInput Handler] Main window not found');
        return { success: false, error: 'Main window not found' };
      }

      return { success: true };
    } catch (error) {
      logger.error('[QuickInput Handler] Failed to handle quick input:', error);
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

  // Quick Question 핸들러
  ipcMain.handle('quick-question-execute', async (event, prompt: string) => {
    try {
      logger.info('[QuickQuestion Handler] Executing quick question with prompt:', prompt.substring(0, 100));

      // 클립보드 내용 읽기
      const clipboardContent = clipboard.readText();
      logger.info('[QuickQuestion Handler] Clipboard content:', clipboardContent.substring(0, 100));

      // 프롬프트에서 {{clipboard}} 치환
      const finalMessage = prompt.replace(/\{\{clipboard\}\}/g, clipboardContent);
      logger.info('[QuickQuestion Handler] Final message:', finalMessage.substring(0, 100));

      // 메인 창 찾기
      const allWindows = BrowserWindow.getAllWindows();
      const mainWindow = allWindows.find((win) => !win.isDestroyed() && win.webContents.getURL().includes('localhost'));

      if (mainWindow) {
        logger.info('[QuickQuestion Handler] Main window found:', mainWindow.id);

        // 메인 창 표시 및 포커스
        mainWindow.show();
        mainWindow.focus();

        // 메인 창에 새 대화 생성 및 메시지 전송 이벤트 발생
        mainWindow.webContents.send('create-new-chat-with-message', finalMessage);
        logger.info('[QuickQuestion Handler] Message sent to main window');
      } else {
        logger.error('[QuickQuestion Handler] Main window not found');
        return { success: false, error: 'Main window not found' };
      }

      return { success: true };
    } catch (error) {
      logger.error('[QuickQuestion Handler] Failed to execute quick question:', error);
      return { success: false, error: String(error) };
    }
  });
}
