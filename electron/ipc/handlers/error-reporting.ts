/**
 * Error Reporting IPC Handlers
 * 에러 자동 리포팅 (GitHub Issue 생성)
 */

import { ipcMain, app } from 'electron';
import type { ErrorReportData, GitHubSyncConfig } from '../../../types';
import { databaseService } from '../../services/database';
import { Octokit } from '@octokit/rest';
import os from 'os';

/**
 * 민감한 정보를 제거하는 함수
 */
function sanitizeErrorData(data: ErrorReportData): ErrorReportData {
  const sanitized = { ...data };

  // 스택 트레이스에서 민감한 정보 제거 (경로의 사용자명 등)
  if (sanitized.error.stack) {
    // 사용자 홈 디렉토리를 <USER_HOME>으로 대체
    const homeDir = os.homedir();
    sanitized.error.stack = sanitized.error.stack.replace(new RegExp(homeDir, 'g'), '<USER_HOME>');

    // 절대 경로에서 사용자명 제거
    sanitized.error.stack = sanitized.error.stack.replace(/\/home\/[^/]+\//g, '/home/<USER>/');
    sanitized.error.stack = sanitized.error.stack.replace(
      /C:\\Users\\[^\\]+\\/g,
      'C:\\Users\\<USER>\\'
    );
  }

  // 에러 메시지에서 민감한 정보 제거
  if (sanitized.error.message) {
    const homeDir = os.homedir();
    sanitized.error.message = sanitized.error.message.replace(
      new RegExp(homeDir, 'g'),
      '<USER_HOME>'
    );

    // API 키 패턴 제거
    sanitized.error.message = sanitized.error.message.replace(/[a-zA-Z0-9_-]{20,}/g, '<REDACTED>');
  }

  // additionalInfo에서 민감한 정보 제거
  if (sanitized.additionalInfo) {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(sanitized.additionalInfo)) {
      // API 키, 토큰 등은 제외
      if (
        key.toLowerCase().includes('key') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('secret')
      ) {
        continue;
      }
      cleaned[key] = value;
    }
    sanitized.additionalInfo = cleaned;
  }

  return sanitized;
}

/**
 * GitHub Issue 본문 생성
 */
function generateIssueBody(data: ErrorReportData): string {
  const { error, context, reproduction, additionalInfo } = data;

  let body = '## 에러 정보\n\n';
  body += `**타입**: ${error.type}\n`;
  body += `**메시지**: ${error.message}\n\n`;

  if (error.stack) {
    body += '### 스택 트레이스\n\n';
    body += '```\n';
    body += error.stack;
    body += '\n```\n\n';
  }

  body += '## 시스템 정보\n\n';
  body += `- **앱 버전**: ${context.version}\n`;
  body += `- **플랫폼**: ${context.platform}\n`;
  body += `- **발생 시간**: ${new Date(context.timestamp).toISOString()}\n`;

  if (context.userAgent) {
    body += `- **User Agent**: ${context.userAgent}\n`;
  }

  if (reproduction) {
    body += '\n## 재현 방법\n\n';
    body += reproduction;
    body += '\n';
  }

  if (additionalInfo && Object.keys(additionalInfo).length > 0) {
    body += '\n## 추가 정보\n\n';
    body += '```json\n';
    body += JSON.stringify(additionalInfo, null, 2);
    body += '\n```\n';
  }

  body += '\n---\n';
  body += '*이 이슈는 자동으로 생성되었습니다.*\n';

  return body;
}

/**
 * 중복 이슈 확인
 */
async function checkDuplicateIssue(
  octokit: Octokit,
  owner: string,
  repo: string,
  errorMessage: string
): Promise<boolean> {
  try {
    // 최근 생성된 오픈 이슈 중에서 동일한 에러 메시지가 있는지 확인
    const { data: issues } = await octokit.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      labels: 'bug,auto-generated',
      per_page: 50,
      sort: 'created',
      direction: 'desc',
    });

    // 동일한 에러 메시지를 가진 이슈가 있는지 확인
    const duplicate = issues.some((issue) => issue.body?.includes(errorMessage.substring(0, 100)));

    return duplicate;
  } catch (error) {
    console.error('[ErrorReporting] Failed to check duplicate issues:', error);
    return false; // 확인 실패 시 새 이슈 생성 허용
  }
}

export function setupErrorReportingHandlers() {
  /**
   * 에러 리포트 전송 (GitHub Issue 생성)
   */
  ipcMain.handle('error-reporting-send', async (_event, errorData: ErrorReportData) => {
    try {
      // GitHub Sync 설정 확인
      const appConfigStr = databaseService.getSetting('app_config');
      if (!appConfigStr) {
        return {
          success: false,
          error: 'GitHub Sync 설정이 없습니다.',
        };
      }

      const appConfig = JSON.parse(appConfigStr);
      const githubSync: GitHubSyncConfig | undefined = appConfig.githubSync;

      if (!githubSync || !githubSync.token || !githubSync.owner || !githubSync.repo) {
        return {
          success: false,
          error: 'GitHub Sync가 설정되지 않았습니다.',
        };
      }

      // 에러 리포팅이 활성화되어 있는지 확인
      if (!githubSync.errorReporting) {
        return {
          success: false,
          error: '에러 리포팅이 비활성화되어 있습니다.',
        };
      }

      // 민감한 정보 제거
      const sanitizedData = sanitizeErrorData(errorData);

      // Octokit 인스턴스 생성
      const octokit = new Octokit({
        auth: githubSync.token,
      });

      // 중복 이슈 확인
      const isDuplicate = await checkDuplicateIssue(
        octokit,
        githubSync.owner,
        githubSync.repo,
        sanitizedData.error.message
      );

      if (isDuplicate) {
        console.log('[ErrorReporting] Duplicate issue found, skipping creation');
        return {
          success: true,
          message: '동일한 에러가 이미 리포트되어 있습니다.',
          skipped: true,
        };
      }

      // GitHub Issue 생성
      const issueBody = generateIssueBody(sanitizedData);

      const { data: issue } = await octokit.issues.create({
        owner: githubSync.owner,
        repo: githubSync.repo,
        title: sanitizedData.title,
        body: issueBody,
        labels: ['bug', 'auto-generated', `type:${sanitizedData.error.type}`],
      });

      console.log('[ErrorReporting] Issue created:', issue.html_url);

      return {
        success: true,
        message: '에러 리포트가 전송되었습니다.',
        issueUrl: issue.html_url,
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[ErrorReporting] Failed to send error report:', err);
      return {
        success: false,
        error: err.message || '에러 리포트 전송 실패',
      };
    }
  });

  /**
   * 에러 리포팅 설정 확인
   */
  ipcMain.handle('error-reporting-is-enabled', async () => {
    try {
      const appConfigStr = databaseService.getSetting('app_config');
      if (!appConfigStr) {
        return { enabled: false };
      }

      const appConfig = JSON.parse(appConfigStr);
      const githubSync: GitHubSyncConfig | undefined = appConfig.githubSync;

      return {
        enabled: !!githubSync?.errorReporting && !!githubSync?.token,
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[ErrorReporting] Failed to check if enabled:', err);
      return { enabled: false };
    }
  });

  /**
   * 에러 컨텍스트 정보 생성
   */
  ipcMain.handle('error-reporting-get-context', async () => {
    try {
      return {
        success: true,
        data: {
          version: app.getVersion(),
          platform: `${os.platform()} ${os.release()}`,
          timestamp: Date.now(),
        },
      };
    } catch (error: unknown) {
      const err = error as Error;
      console.error('[ErrorReporting] Failed to get context:', err);
      return {
        success: false,
        error: err.message,
      };
    }
  });

  /**
   * 대화 내용 리포트 전송 (GitHub Issue 생성)
   */
  ipcMain.handle(
    'error-reporting-send-conversation',
    async (
      _event,
      data: {
        issue: string;
        messages: any[];
        conversationId?: string;
        additionalInfo?: string;
      }
    ) => {
      try {
        // GitHub Sync 설정 확인
        const appConfigStr = databaseService.getSetting('app_config');
        if (!appConfigStr) {
          return {
            success: false,
            error: 'GitHub Sync 설정이 없습니다.',
          };
        }

        const appConfig = JSON.parse(appConfigStr);
        const githubSync: GitHubSyncConfig | undefined = appConfig.githubSync;

        if (!githubSync || !githubSync.token || !githubSync.owner || !githubSync.repo) {
          return {
            success: false,
            error: 'GitHub Sync가 설정되지 않았습니다.',
          };
        }

        // 에러 리포팅이 활성화되어 있는지 확인
        if (!githubSync.errorReporting) {
          return {
            success: false,
            error: '에러 리포팅이 비활성화되어 있습니다.',
          };
        }

        // Octokit 인스턴스 생성
        const octokit = new Octokit({
          auth: githubSync.token,
        });

        // Issue 본문 생성
        let issueBody = '## 문제점\n\n';
        issueBody += data.issue + '\n\n';

        if (data.additionalInfo) {
          issueBody += '## 추가 정보\n\n';
          issueBody += data.additionalInfo + '\n\n';
        }

        issueBody += '## 대화 정보\n\n';
        issueBody += `- 총 메시지: ${data.messages.length}개\n`;
        issueBody += `- 사용자 메시지: ${data.messages.filter((m) => m.role === 'user').length}개\n`;
        issueBody += `- AI 응답: ${data.messages.filter((m) => m.role === 'assistant').length}개\n`;
        const hasTools = data.messages.some((m) => m.tool_calls && m.tool_calls.length > 0);
        if (hasTools) {
          issueBody += '- Tool 사용: 있음\n';
        }
        if (data.conversationId) {
          issueBody += `- 대화 ID: \`${data.conversationId}\`\n`;
        }
        issueBody += '\n';

        issueBody += '## 시스템 정보\n\n';
        issueBody += `- **앱 버전**: ${app.getVersion()}\n`;
        issueBody += `- **플랫폼**: ${os.platform()} ${os.release()}\n`;
        issueBody += `- **리포트 시간**: ${new Date().toISOString()}\n\n`;

        // 대화 내용 추가 (민감한 정보 제거)
        issueBody += '## 대화 내용\n\n';
        issueBody += '<details>\n<summary>전체 대화 보기</summary>\n\n';
        issueBody += '```json\n';

        // 메시지에서 민감한 정보 제거
        const sanitizedMessages = data.messages.map((msg) => ({
          role: msg.role,
          content:
            typeof msg.content === 'string' && msg.content.length > 500
              ? msg.content.substring(0, 500) + '...'
              : msg.content,
          tool_calls: msg.tool_calls
            ? msg.tool_calls.map((tc: any) => ({
                name: tc.name,
                // arguments는 민감할 수 있으므로 제외
              }))
            : undefined,
          created_at: msg.created_at,
        }));

        issueBody += JSON.stringify(sanitizedMessages, null, 2);
        issueBody += '\n```\n</details>\n\n';

        issueBody += '---\n';
        issueBody += '*이 리포트는 사용자가 수동으로 전송했습니다.*\n';

        // GitHub Issue 생성
        const issueTitle = `[Conversation] ${data.issue.substring(0, 80)}`;

        const { data: issue } = await octokit.issues.create({
          owner: githubSync.owner,
          repo: githubSync.repo,
          title: issueTitle,
          body: issueBody,
          labels: ['conversation-report', 'user-feedback'],
        });

        console.log('[ErrorReporting] Conversation report created:', issue.html_url);

        return {
          success: true,
          message: '대화 리포트가 전송되었습니다.',
          issueUrl: issue.html_url,
        };
      } catch (error: unknown) {
        const err = error as Error;
        console.error('[ErrorReporting] Failed to send conversation report:', err);
        return {
          success: false,
          error: err.message || '대화 리포트 전송 실패',
        };
      }
    }
  );
}
