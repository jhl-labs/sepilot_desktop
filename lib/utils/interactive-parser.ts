/**
 * Interactive component parser for Markdown content
 *
 * Parses custom blocks like:
 * :::interactive-select
 * title: Choose an action
 * options:
 * - Create file
 * - Edit file
 * - Delete file
 * :::
 */

export interface InteractiveSelectData {
  type: 'interactive-select';
  title?: string;
  options: string[];
}

export interface InteractiveInputData {
  type: 'interactive-input';
  title?: string;
  placeholder?: string;
  multiline?: boolean;
}

export interface ToolResultData {
  type: 'tool-result';
  toolName: string;
  status: 'success' | 'error';
  summary?: string;
  details?: string;
  duration?: number;
}

export interface ToolApprovalData {
  type: 'tool-approval';
  messageId: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
}

export type InteractiveBlock =
  | InteractiveSelectData
  | InteractiveInputData
  | ToolResultData
  | ToolApprovalData;

export interface ParsedContent {
  segments: Array<{
    type: 'text' | 'interactive';
    content: string | InteractiveBlock;
  }>;
}

/**
 * Parse markdown content and extract interactive blocks
 */
export function parseInteractiveContent(markdown: string): ParsedContent {
  const segments: ParsedContent['segments'] = [];
  const blockRegex =
    /:::(interactive-select|interactive-input|tool-result|tool-approval)\n([\s\S]*?):::/g;

  let lastIndex = 0;
  let match;

  while ((match = blockRegex.exec(markdown)) !== null) {
    const blockType = match[1];
    const blockContent = match[2];
    const matchStart = match.index;

    // Add text before this block
    if (matchStart > lastIndex) {
      const textBefore = markdown.substring(lastIndex, matchStart);
      if (textBefore.trim()) {
        segments.push({
          type: 'text',
          content: textBefore,
        });
      }
    }

    // Parse the block based on type
    let parsedBlock: InteractiveBlock | null = null;

    if (blockType === 'interactive-select') {
      parsedBlock = parseInteractiveSelect(blockContent);
    } else if (blockType === 'interactive-input') {
      parsedBlock = parseInteractiveInput(blockContent);
    } else if (blockType === 'tool-result') {
      parsedBlock = parseToolResult(blockContent);
    } else if (blockType === 'tool-approval') {
      parsedBlock = parseToolApproval(blockContent);
    }

    if (parsedBlock) {
      segments.push({
        type: 'interactive',
        content: parsedBlock,
      });
    }

    lastIndex = blockRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < markdown.length) {
    const remainingText = markdown.substring(lastIndex);
    if (remainingText.trim()) {
      segments.push({
        type: 'text',
        content: remainingText,
      });
    }
  }

  // If no interactive blocks found, return original content as text
  if (segments.length === 0) {
    segments.push({
      type: 'text',
      content: markdown,
    });
  }

  return { segments };
}

function parseInteractiveSelect(content: string): InteractiveSelectData {
  const lines = content.trim().split('\n');
  let title: string | undefined;
  const options: string[] = [];

  let inOptions = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('title:')) {
      title = trimmedLine.substring(6).trim();
    } else if (trimmedLine === 'options:') {
      inOptions = true;
    } else if (inOptions && trimmedLine.startsWith('-')) {
      const option = trimmedLine.substring(1).trim();
      if (option) {
        options.push(option);
      }
    }
  }

  return {
    type: 'interactive-select',
    title,
    options,
  };
}

function parseInteractiveInput(content: string): InteractiveInputData {
  const lines = content.trim().split('\n');
  let title: string | undefined;
  let placeholder: string | undefined;
  let multiline = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('title:')) {
      title = trimmedLine.substring(6).trim();
    } else if (trimmedLine.startsWith('placeholder:')) {
      placeholder = trimmedLine.substring(12).trim();
    } else if (trimmedLine.startsWith('multiline:')) {
      const value = trimmedLine.substring(10).trim().toLowerCase();
      multiline = value === 'true' || value === 'yes';
    }
  }

  return {
    type: 'interactive-input',
    title,
    placeholder,
    multiline,
  };
}

function parseToolResult(content: string): ToolResultData {
  const lines = content.trim().split('\n');
  let toolName = '';
  let status: 'success' | 'error' = 'success';
  let summary: string | undefined;
  let details: string | undefined;
  let duration: number | undefined;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('toolName:')) {
      toolName = trimmedLine.substring(9).trim();
    } else if (trimmedLine.startsWith('status:')) {
      const statusValue = trimmedLine.substring(7).trim();
      status = statusValue === 'error' ? 'error' : 'success';
    } else if (trimmedLine.startsWith('summary:')) {
      summary = trimmedLine.substring(8).trim();
    } else if (trimmedLine.startsWith('details:')) {
      details = trimmedLine.substring(8).trim();
    } else if (trimmedLine.startsWith('duration:')) {
      const durationStr = trimmedLine.substring(9).trim();
      const durationNum = parseInt(durationStr, 10);
      if (!isNaN(durationNum)) {
        duration = durationNum;
      }
    }
  }

  return {
    type: 'tool-result',
    toolName,
    status,
    summary,
    details,
    duration,
  };
}

function parseToolApproval(content: string): ToolApprovalData {
  const lines = content.trim().split('\n');
  let messageId = '';
  const toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }> = [];

  let currentToolCall: { id: string; name: string; arguments: Record<string, unknown> } | null =
    null;
  let inArguments = false;
  let argumentsJson = '';

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('messageId:')) {
      messageId = trimmedLine.substring(10).trim();
    } else if (trimmedLine.startsWith('toolCall:')) {
      // Save previous tool call if exists
      if (currentToolCall) {
        // Parse arguments JSON if accumulated
        if (argumentsJson) {
          try {
            currentToolCall.arguments = JSON.parse(argumentsJson);
          } catch {
            currentToolCall.arguments = {};
          }
          argumentsJson = '';
        }
        toolCalls.push(currentToolCall);
      }

      // Start new tool call
      const toolCallStr = trimmedLine.substring(9).trim();
      const [id, name] = toolCallStr.split('|').map((s) => s.trim());
      currentToolCall = {
        id: id || `tool-${Date.now()}`,
        name: name || 'unknown',
        arguments: {},
      };
      inArguments = false;
    } else if (trimmedLine.startsWith('arguments:')) {
      inArguments = true;
      argumentsJson = '';
    } else if (inArguments && trimmedLine) {
      argumentsJson += `${trimmedLine  }\n`;
    }
  }

  // Save last tool call
  if (currentToolCall) {
    if (argumentsJson) {
      try {
        currentToolCall.arguments = JSON.parse(argumentsJson);
      } catch {
        currentToolCall.arguments = {};
      }
    }
    toolCalls.push(currentToolCall);
  }

  return {
    type: 'tool-approval',
    messageId,
    toolCalls,
  };
}
