export type AssistantDiagnosticKind =
  | 'phase-usage'
  | 'completion-contract'
  | 'interim-output'
  | 'execution-report'

export interface AssistantDiagnosticBlock {
  kind: AssistantDiagnosticKind
  content: string
}

export interface AssistantPresentationContent {
  content: string
  diagnostics: AssistantDiagnosticBlock[]
}

const PHASE_USAGE_HEADING = /^\s*_Phase usage:_\s*$/
const PHASE_USAGE_ROW =
  /^\s*-\s+[^:\r\n]+:\s+\d[\d,]*\s+tokens\s+\(in\s+\d[\d,]*,\s*out\s+\d[\d,]*\)\s*$/
const CRITERION_ROW =
  /^\s*CRITERION\s+[A-Z][A-Z0-9_-]*\s*:\s*(?:MET|UNMET|N\/A)(?:\s*(?:[-—:]\s*)?.*)?\s*$/
const VALIDATION_HEADING = /^\s{0,3}#{1,6}\s+검증 결과\s*#*\s*$/
const ACCEPTANCE_VERDICT_ROW =
  /^\s*(?:[-*]\s+)?AC\d+(?:\s*(?:\/|,)\s*AC\d+)*(?:\s*\([^()\r\n]{1,80}\))?(?:\s*(?::|：)\s*|\s+)(?:MET|UNMET|N\/A|충족|부분|미충족|해당 없음)(?:\s*[-—]\s*.+)?\s*$/
const MARKDOWN_HEADING = /^\s{0,3}#{1,6}\s+\S/
const ANSWER_STEM = /^(?:\s*ANSWER\s*:\s*)+/
const FINAL_REPORT_HEADING = /^\s{0,3}##\s+최종 보고\s*#*\s*$/
const REPORT_BOUNDARY_HEADING = /^\s{0,3}#{1,2}\s+\S/
const REPORT_SUBSECTION_HEADING = /^\s{0,3}###\s+(.+?)\s*#*\s*$/
const MARKDOWN_FENCE = /^\s*(`{3,}|~{3,})/
const FINAL_REPORT_SECTION_TITLES = [
  '구현/시도 내용',
  '관찰된 근거',
  '검증 결과',
  '확인 결과',
] as const

export function presentAssistantContent(rawContent: string): AssistantPresentationContent {
  const lines = rawContent.replace(/\r\n?/g, '\n').split('\n')
  const fencedLines = findFencedLines(lines)
  const diagnostics: AssistantDiagnosticBlock[] = []
  const hidden = new Set<number>()

  collectInterimProtocolOutput(lines, fencedLines, hidden, diagnostics)
  collectLegacyExecutionReports(lines, fencedLines, hidden, diagnostics)
  collectPhaseUsage(lines, fencedLines, hidden, diagnostics)
  collectCriterionRows(lines, fencedLines, hidden, diagnostics)
  collectInternalValidationSections(lines, fencedLines, hidden, diagnostics)

  const visibleLines = lines
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => !hidden.has(index))
    .map(({ line, index }) => ({
      line: fencedLines[index] ? line : line.replace(ANSWER_STEM, ''),
      fenced: fencedLines[index] ?? false,
    }))

  return {
    content: normalizePresentationLines(visibleLines),
    diagnostics,
  }
}

function findFencedLines(lines: readonly string[]): boolean[] {
  let fenceMarker: string | null = null
  return lines.map((line) => {
    const fence = line.match(MARKDOWN_FENCE)?.[1]
    if (fence) {
      if (!fenceMarker) fenceMarker = fence[0] ?? null
      else if (fence[0] === fenceMarker) fenceMarker = null
      return true
    }
    return fenceMarker != null
  })
}

function collectLegacyExecutionReports(
  lines: string[],
  fencedLines: readonly boolean[],
  hidden: Set<number>,
  diagnostics: AssistantDiagnosticBlock[],
): void {
  for (let index = 0; index < lines.length; index += 1) {
    if (
      hidden.has(index) ||
      fencedLines[index] ||
      !FINAL_REPORT_HEADING.test(lines[index] ?? '')
    ) {
      continue
    }

    let reportEnd = index + 1
    while (
      reportEnd < lines.length &&
      (fencedLines[reportEnd] || !REPORT_BOUNDARY_HEADING.test(lines[reportEnd] ?? ''))
    ) {
      reportEnd += 1
    }

    const subsections: Array<{ index: number; title: string }> = []
    for (let cursor = index + 1; cursor < reportEnd; cursor += 1) {
      if (fencedLines[cursor]) continue
      const match = (lines[cursor] ?? '').match(REPORT_SUBSECTION_HEADING)
      if (match?.[1]) subsections.push({ index: cursor, title: match[1].trim() })
    }
    if (
      subsections.length !== FINAL_REPORT_SECTION_TITLES.length ||
      !subsections.every((section, sectionIndex) =>
        section.title === FINAL_REPORT_SECTION_TITLES[sectionIndex])
    ) {
      continue
    }

    const [implementation, , validation, confirmation] = subsections
    if (!implementation || !validation || !confirmation) continue
    const prefaceRows = lines
      .slice(index + 1, implementation.index)
      .filter((line) => line.trim().length > 0)
    const validationRows = lines
      .slice(validation.index + 1, confirmation.index)
      .filter((line) => line.trim().length > 0)
    if (
      prefaceRows.length > 0 ||
      validationRows.length < 2 ||
      !validationRows.every((line) => ACCEPTANCE_VERDICT_ROW.test(line))
    ) {
      continue
    }

    diagnostics.push({
      kind: 'execution-report',
      content: lines.slice(index, confirmation.index).join('\n').trimEnd(),
    })
    for (let cursor = index; cursor <= confirmation.index; cursor += 1) hidden.add(cursor)
    index = confirmation.index
  }
}

function collectInterimProtocolOutput(
  lines: string[],
  fencedLines: readonly boolean[],
  hidden: Set<number>,
  diagnostics: AssistantDiagnosticBlock[],
): void {
  const answerRows = lines
    .map((line, index) => (!fencedLines[index] && ANSWER_STEM.test(line) ? index : -1))
    .filter((index) => index >= 0)
  if (answerRows.length < 2) return

  const finalAnswerIndex = answerRows[answerRows.length - 1]!
  const content = lines.slice(0, finalAnswerIndex).join('\n').trim()
  if (!content) return
  for (let index = 0; index < finalAnswerIndex; index += 1) hidden.add(index)
  diagnostics.push({ kind: 'interim-output', content })
}

function collectPhaseUsage(
  lines: string[],
  fencedLines: readonly boolean[],
  hidden: Set<number>,
  diagnostics: AssistantDiagnosticBlock[],
): void {
  for (let index = 0; index < lines.length; index += 1) {
    if (hidden.has(index) || fencedLines[index]) continue
    if (!PHASE_USAGE_HEADING.test(lines[index] ?? '')) continue

    let end = index + 1
    while (
      end < lines.length &&
      !fencedLines[end] &&
      PHASE_USAGE_ROW.test(lines[end] ?? '')
    ) {
      end += 1
    }
    if (end === index + 1) continue

    const block = lines.slice(index, end).join('\n')
    for (let cursor = index; cursor < end; cursor += 1) hidden.add(cursor)
    diagnostics.push({ kind: 'phase-usage', content: block })
    index = end - 1
  }
}

function collectCriterionRows(
  lines: string[],
  fencedLines: readonly boolean[],
  hidden: Set<number>,
  diagnostics: AssistantDiagnosticBlock[],
): void {
  const rows: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    if (hidden.has(index) || fencedLines[index]) continue
    const line = lines[index] ?? ''
    if (!CRITERION_ROW.test(line)) continue
    hidden.add(index)
    rows.push(line)
  }
  if (rows.length > 0) {
    diagnostics.push({ kind: 'completion-contract', content: rows.join('\n') })
  }
}

function collectInternalValidationSections(
  lines: string[],
  fencedLines: readonly boolean[],
  hidden: Set<number>,
  diagnostics: AssistantDiagnosticBlock[],
): void {
  for (let index = 0; index < lines.length; index += 1) {
    if (hidden.has(index) || fencedLines[index]) continue
    if (!VALIDATION_HEADING.test(lines[index] ?? '')) continue

    let end = index + 1
    while (
      end < lines.length &&
      (fencedLines[end] ||
        (!MARKDOWN_HEADING.test(lines[end] ?? '') &&
          !PHASE_USAGE_HEADING.test(lines[end] ?? '')))
    ) {
      end += 1
    }
    const sectionRows = lines.slice(index + 1, end)
    const nonBlankRows = sectionRows.filter((line) => line.trim().length > 0)
    if (
      nonBlankRows.length < 2 ||
      !nonBlankRows.every((line) => ACCEPTANCE_VERDICT_ROW.test(line))
    ) {
      continue
    }

    const block = lines.slice(index, end).join('\n').trimEnd()
    for (let cursor = index; cursor < end; cursor += 1) hidden.add(cursor)
    diagnostics.push({ kind: 'completion-contract', content: block })
    index = end - 1
  }
}

function normalizePresentationLines(
  entries: Array<{ line: string; fenced: boolean }>,
): string {
  const normalized: string[] = []
  let outsideBlankLines = 0

  for (const entry of entries) {
    if (!entry.fenced && entry.line.trim().length === 0) {
      outsideBlankLines += 1
      if (outsideBlankLines <= 1) normalized.push(entry.line)
      continue
    }
    outsideBlankLines = 0
    normalized.push(entry.line)
  }

  while (normalized[0]?.trim().length === 0) normalized.shift()
  while (normalized[normalized.length - 1]?.trim().length === 0) normalized.pop()
  return normalized.join('\n')
}
