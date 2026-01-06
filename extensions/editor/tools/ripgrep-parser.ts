/**
 * Ripgrep JSON 출력 파싱 유틸리티
 *
 * 중복된 ripgrep JSON 파싱 로직을 통합
 */

export interface RipgrepMatch {
  path: string;
  line: number;
  column: number;
  text: string;
  context?: string[];
}

/**
 * ripgrep --json 출력을 파싱하여 매치 결과 반환
 */
export function parseRipgrepOutput(stdout: string, includeContext = false): RipgrepMatch[] {
  const lines = stdout.trim().split('\n');
  const results: RipgrepMatch[] = [];

  for (const line of lines) {
    try {
      const data = JSON.parse(line);
      if (data.type === 'match') {
        results.push({
          path: data.data.path.text,
          line: data.data.line_number,
          column: data.data.submatches[0]?.start || 0,
          text: data.data.lines.text.trim(),
        });
      } else if (includeContext && data.type === 'context') {
        // Context lines
        const lastResult = results[results.length - 1];
        if (lastResult && !lastResult.context) {
          lastResult.context = [];
        }
        if (lastResult?.context) {
          lastResult.context.push(data.data.lines.text);
        }
      }
    } catch {
      // JSON 파싱 실패한 라인 무시
    }
  }

  return results;
}
