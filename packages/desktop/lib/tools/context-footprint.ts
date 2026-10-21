export interface ToolSchemaForContext {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface ToolContextFootprint {
  characters: number
  utf8Bytes: number
  estimatedTokens: number
}

const DEFAULT_CHARS_PER_TOKEN = 4
const TOKENS_PER_TOOL = 4

export function calculateToolContextFootprint(
  tools: readonly ToolSchemaForContext[],
  charsPerToken: number = DEFAULT_CHARS_PER_TOKEN,
): ToolContextFootprint {
  if (tools.length === 0) {
    return { characters: 0, utf8Bytes: 0, estimatedTokens: 0 }
  }

  const serialized = JSON.stringify(tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })))
  const safeRatio = Number.isFinite(charsPerToken) && charsPerToken > 0
    ? charsPerToken
    : DEFAULT_CHARS_PER_TOKEN

  return {
    characters: serialized.length,
    utf8Bytes: new TextEncoder().encode(serialized).byteLength,
    estimatedTokens: Math.ceil(serialized.length / safeRatio) + tools.length * TOKENS_PER_TOOL,
  }
}
