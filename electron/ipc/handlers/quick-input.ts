import { ipcMain, BrowserWindow, clipboard } from 'electron';
import { logger } from '../../services/logger';
import { registerShortcuts, getMainWindow } from '../../main';

export function setupQuickInputHandlers() {
  // Quick Input 제출 핸들러
  ipcMain.handle('quick-input-submit', async (event, message: string) => {
    try {
      logger.info('[QuickInput Handler] Received message:', message);

      // Quick Input 창 숨기기
      const quickInputWindow = BrowserWindow.fromWebContents(event.sender);
      logger.info('[QuickInput Handler] Quick Input window:', quickInputWindow?.id);
      quickInputWindow?.hide();

      // 메인 창 가져오기
      const mainWindow = getMainWindow();
      logger.info('[QuickInput Handler] Main window from getMainWindow():', mainWindow?.id);

      if (mainWindow && !mainWindow.isDestroyed()) {
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

      // Send prompt as system message, clipboard as user message
      const messageData = {
        systemMessage: prompt,
        userMessage: clipboardContent.trim() || '(클립보드가 비어있습니다)',
      };
      logger.info('[QuickQuestion Handler] System message:', prompt.substring(0, 50));
      logger.info('[QuickQuestion Handler] User message:', messageData.userMessage.substring(0, 50));

      // 메인 창 가져오기
      const mainWindow = getMainWindow();
      logger.info('[QuickQuestion Handler] Main window from getMainWindow():', mainWindow?.id);

      if (mainWindow && !mainWindow.isDestroyed()) {
        logger.info('[QuickQuestion Handler] Main window found:', mainWindow.id);

        // 메인 창 표시 및 포커스
        mainWindow.show();
        mainWindow.focus();

        // 메인 창에 새 대화 생성 및 메시지 전송 이벤트 발생
        mainWindow.webContents.send('create-new-chat-with-message', messageData);
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

  // Reload shortcuts 핸들러 (설정 변경 시 호출)
  ipcMain.handle('quick-input:reload-shortcuts', async () => {
    try {
      logger.info('[QuickInput Handler] Reloading shortcuts...');
      await registerShortcuts();
      logger.info('[QuickInput Handler] Shortcuts reloaded successfully');
      return { success: true };
    } catch (error) {
      logger.error('[QuickInput Handler] Failed to reload shortcuts:', error);
      return { success: false, error: String(error) };
    }
  });
}
