export function detectSigilTokenAtCaret(text: string, caret: number, sigil: string) {
  let start = caret
  while (start > 0 && ![' ', '\t', '\n'].includes(text[start - 1])) start -= 1
  if (text[start] !== sigil) return null
  let end = caret
  while (end < text.length && ![' ', '\t', '\n'].includes(text[end])) end += 1
  return { query: text.slice(start + 1, end), start, end }
}
