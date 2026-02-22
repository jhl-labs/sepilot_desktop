/**
 * Extension 진단 명령어
 */

import { getExtensionDiagnostics } from '../../ipc/handlers/extension/extension-diagnostics';
import { isJsonMode, printDiagnostics, printJson } from '../utils/output';
import { CLIError, ExitCode } from '../utils/cli-error';

/**
 * Extension 진단 실행
 * @param detailed - 상세 정보 포함 여부
 */
export async function runDiagnostics(detailed = false): Promise<void> {
  try {
    const diagnostics = getExtensionDiagnostics(detailed);

    // CLI용 데이터 변환
    const cliDiagnostics = {
      environment: {
        platform: diagnostics.environment.platform,
        isPackaged: diagnostics.environment.isPackaged,
        userDataPath: diagnostics.environment.userDataPath,
        extensionsPath: diagnostics.searchPaths[0]?.path || 'N/A',
      },
      loadedExtensions: diagnostics.loadedExtensions.map((ext) => ({
        id: ext.id,
        version: ext.version,
        enabled: ext.enabled,
        source: 'local',
      })),
      registryStats: {
        total: diagnostics.registryStats.totalRegistered,
        enabled: diagnostics.registryStats.enabledCount,
        disabled:
          diagnostics.registryStats.totalRegistered - diagnostics.registryStats.enabledCount,
      },
      errors: diagnostics.recommendations.filter((r) => r.startsWith('❌') || r.startsWith('⚠️')),
    };

    // JSON 모드 확인은 output.ts에서 처리
    if (isJsonMode()) {
      printJson(cliDiagnostics);
    } else {
      printDiagnostics(cliDiagnostics);
    }
  } catch (error) {
    throw new CLIError(
      `Failed to get diagnostics: ${error instanceof Error ? error.message : String(error)}`,
      ExitCode.ERROR
    );
  }
}
