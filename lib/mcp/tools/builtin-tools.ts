/**
 * Built-in Tools for Coding Agent
 *
 * MCP 서버 없이도 사용 가능한 내장 파일 처리 도구
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { MCPTool } from '../types';
import { getCurrentWorkingDirectory } from '../../llm/streaming-callback';

/**
 * Resolve path relative to working directory
 * If no working directory is set, uses current process directory
 */
function resolvePath(filePath: string): string {
  const workingDir = getCurrentWorkingDirectory();

  // If path is already absolute, return as-is
  if (path.isAbsolute(filePath)) {
    return filePath;
  }

  // If working directory is set, resolve relative to it
  if (workingDir) {
    return path.resolve(workingDir, filePath);
  }

  // Otherwise resolve relative to current process directory
  return path.resolve(process.cwd(), filePath);
}

/**
 * File Read Tool
 */
export const fileReadTool: MCPTool = {
  name: 'file_read',
  description: 'Read file contents from the filesystem',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to read',
      },
    },
    required: ['path'],
  },
};

/**
 * File Write Tool
 */
export const fileWriteTool: MCPTool = {
  name: 'file_write',
  description: 'Write content to a file (overwrites existing content)',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write',
      },
      content: {
        type: 'string',
        description: 'Content to write to the file',
      },
    },
    required: ['path', 'content'],
  },
};

/**
 * File Edit Tool
 */
export const fileEditTool: MCPTool = {
  name: 'file_edit',
  description: 'Edit a file by replacing old text with new text',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to edit',
      },
      old_str: {
        type: 'string',
        description: 'Exact string to replace (must be unique in file)',
      },
      new_str: {
        type: 'string',
        description: 'New string to replace with',
      },
    },
    required: ['path', 'old_str', 'new_str'],
  },
};

/**
 * File List Tool
 */
export const fileListTool: MCPTool = {
  name: 'file_list',
  description: 'List files in a directory',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path to list',
        default: '.',
      },
      recursive: {
        type: 'boolean',
        description: 'Recursively list subdirectories',
        default: false,
      },
    },
  },
};

/**
 * Execute built-in file tools
 */
export async function executeBuiltinTool(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  switch (toolName) {
    case 'file_read':
      return await handleFileRead(args as { path: string });
    case 'file_write':
      return await handleFileWrite(args as { path: string; content: string });
    case 'file_edit':
      return await handleFileEdit(args as { path: string; old_str: string; new_str: string });
    case 'file_list':
      return await handleFileList(args as { path?: string; recursive?: boolean });
    default:
      throw new Error(`Unknown builtin tool: ${toolName}`);
  }
}

/**
 * Handle file_read
 */
async function handleFileRead(args: { path: string }): Promise<string> {
  try {
    const absolutePath = resolvePath(args.path);
    console.log(`[Builtin Tools] Reading file: ${args.path} -> ${absolutePath}`);
    const content = await fs.readFile(absolutePath, 'utf-8');
    return content;
  } catch (error: any) {
    throw new Error(`Failed to read file: ${error.message}`);
  }
}

/**
 * Handle file_write
 */
async function handleFileWrite(args: { path: string; content: string }): Promise<string> {
  try {
    const absolutePath = resolvePath(args.path);
    console.log(`[Builtin Tools] Writing file: ${args.path} -> ${absolutePath}`);

    // Create directory if it doesn't exist
    const dir = path.dirname(absolutePath);
    await fs.mkdir(dir, { recursive: true });

    // Write file
    await fs.writeFile(absolutePath, args.content, 'utf-8');

    return `Successfully wrote ${args.content.length} bytes to ${absolutePath}`;
  } catch (error: any) {
    throw new Error(`Failed to write file: ${error.message}`);
  }
}

/**
 * Handle file_edit
 */
async function handleFileEdit(args: {
  path: string;
  old_str: string;
  new_str: string;
}): Promise<string> {
  try {
    const absolutePath = resolvePath(args.path);
    console.log(`[Builtin Tools] Editing file: ${args.path} -> ${absolutePath}`);

    // Read file
    const content = await fs.readFile(absolutePath, 'utf-8');

    // Check if old_str exists
    if (!content.includes(args.old_str)) {
      throw new Error(`String not found in file: ${args.old_str.substring(0, 50)}...`);
    }

    // Check if old_str is unique
    const occurrences = content.split(args.old_str).length - 1;
    if (occurrences > 1) {
      throw new Error(
        `String appears ${occurrences} times in file. Must be unique for safe replacement.`
      );
    }

    // Replace
    const newContent = content.replace(args.old_str, args.new_str);

    // Write back
    await fs.writeFile(absolutePath, newContent, 'utf-8');

    const linesChanged = args.new_str.split('\n').length;
    return `Successfully edited ${absolutePath} (${linesChanged} lines changed)`;
  } catch (error: any) {
    throw new Error(`Failed to edit file: ${error.message}`);
  }
}

/**
 * Handle file_list
 */
async function handleFileList(args: {
  path?: string;
  recursive?: boolean;
}): Promise<string> {
  const dirPath = args.path || '.';
  const recursive = args.recursive || false;

  try {
    const absolutePath = resolvePath(dirPath);
    console.log(`[Builtin Tools] Listing files: ${dirPath} -> ${absolutePath}`);
    const files = await listFiles(absolutePath, recursive);
    return files.join('\n');
  } catch (error: any) {
    throw new Error(`Failed to list files: ${error.message}`);
  }
}

/**
 * Recursively list files
 */
async function listFiles(dir: string, recursive: boolean): Promise<string[]> {
  const results: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // Skip common directories to ignore
      if (entry.isDirectory()) {
        if (['.git', 'node_modules', '.next', 'dist', 'build'].includes(entry.name)) {
          continue;
        }

        if (recursive) {
          const subFiles = await listFiles(fullPath, true);
          results.push(...subFiles);
        } else {
          results.push(`${fullPath}/`);
        }
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip directories that can't be read
  }

  return results;
}

/**
 * Get all builtin tools
 */
export function getBuiltinTools(): MCPTool[] {
  return [fileReadTool, fileWriteTool, fileEditTool, fileListTool];
}
