/**
 * Version Utility Functions
 * Semantic Versioning 관련 유틸리티
 */

/**
 * Semantic Versioning 비교
 *
 * @param v1 첫 번째 버전
 * @param v2 두 번째 버전
 * @returns -1: v1 < v2, 0: v1 === v2, 1: v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('-')[0].split('.').map(Number); // Pre-release 제거
  const parts2 = v2.split('-')[0].split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) {
      return 1;
    }
    if (p1 < p2) {
      return -1;
    }
  }

  return 0;
}

/**
 * Breaking Change 여부 확인 (Major 버전 변경)
 *
 * @param oldVersion 이전 버전
 * @param newVersion 새 버전
 * @returns Major 버전이 올라갔으면 true
 */
export function isBreakingChange(oldVersion: string, newVersion: string): boolean {
  const oldMajor = parseInt(oldVersion.split('.')[0], 10);
  const newMajor = parseInt(newVersion.split('.')[0], 10);

  return newMajor > oldMajor;
}
