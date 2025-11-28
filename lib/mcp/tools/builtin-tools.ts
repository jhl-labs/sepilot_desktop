/**
 * Built-in Tools for Coding Agent
 *
 * MCP 서버 없이도 사용 가능한 내장 파일 처리 도구
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { MCPTool } from '../types';
import { getCurrentWorkingDirectory } from '../../llm/streaming-callback';

const execPromise = promisify(exec);

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
 * Command Execute Tool
 */
export const commandExecuteTool: MCPTool = {
  name: 'command_execute',
  description: 'Execute shell commands (npm, git, etc.). Be careful with destructive commands.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute (e.g., "npm install", "git status")',
      },
      cwd: {
        type: 'string',
        description: 'Working directory for command execution (optional, defaults to project root)',
      },
    },
    required: ['command'],
  },
};

/**
 * Grep Search Tool
 */
export const grepSearchTool: MCPTool = {
  name: 'grep_search',
  description: 'Search for patterns in files using ripgrep (rg). Fast code search across the codebase.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Search pattern (regex supported)',
      },
      path: {
        type: 'string',
        description: 'Directory or file to search in (defaults to current directory)',
        default: '.',
      },
      file_type: {
        type: 'string',
        description: 'File type filter (e.g., "ts", "js", "py")',
      },
      case_sensitive: {
        type: 'boolean',
        description: 'Case-sensitive search',
        default: true,
      },
    },
    required: ['pattern'],
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
    case 'command_execute':
      return await handleCommandExecute(args as { command: string; cwd?: string });
    case 'grep_search':
      return await handleGrepSearch(args as {
        pattern: string;
        path?: string;
        file_type?: string;
        case_sensitive?: boolean;
      });
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
 * Handle command_execute
 */
async function handleCommandExecute(args: { command: string; cwd?: string }): Promise<string> {
  try {
    // Treat empty string as null/undefined
    const cwdArg = args.cwd && args.cwd.trim() !== '' ? args.cwd : null;
    const workingDir = cwdArg || getCurrentWorkingDirectory() || process.cwd();
    console.log(`[Builtin Tools] Executing command: ${args.command} in ${workingDir}`);

    const { stdout, stderr } = await execPromise(args.command, {
      cwd: workingDir,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 300000, // 5 minutes timeout
    });

    let result = '';
    if (stdout) {
      result += `stdout:\n${stdout}`;
    }
    if (stderr) {
      result += `${result ? '\n\n' : ''}stderr:\n${stderr}`;
    }

    return result || 'Command executed successfully (no output)';
  } catch (error: any) {
    // Include both error message and stderr/stdout if available
    let errorMsg = `Failed to execute command: ${error.message}`;
    if (error.stdout) {
      errorMsg += `\n\nstdout:\n${error.stdout}`;
    }
    if (error.stderr) {
      errorMsg += `\n\nstderr:\n${error.stderr}`;
    }
    throw new Error(errorMsg);
  }
}

/**
 * Handle grep_search
 */
async function handleGrepSearch(args: {
  pattern: string;
  path?: string;
  file_type?: string;
  case_sensitive?: boolean;
}): Promise<string> {
  try {
    const searchPath = args.path || '.';
    const absolutePath = resolvePath(searchPath);
    const caseSensitive = args.case_sensitive !== false; // default true

    console.log(
      `[Builtin Tools] Searching pattern: ${args.pattern} in ${searchPath} -> ${absolutePath}`
    );

    // Build rg command
    let rgCommand = 'rg';

    // Case sensitivity
    if (!caseSensitive) {
      rgCommand += ' -i';
    }

    // File type filter
    if (args.file_type) {
      rgCommand += ` -t ${args.file_type}`;
    }

    // Show line numbers and file names
    rgCommand += ' -n';

    // Pattern and path
    rgCommand += ` "${args.pattern.replace(/"/g, '\\"')}" "${absolutePath}"`;

    // Use working directory for execution
    const workingDir = getCurrentWorkingDirectory() || process.cwd();

    const { stdout, stderr } = await execPromise(rgCommand, {
      cwd: workingDir,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 60000, // 1 minute timeout
    });

    if (!stdout && !stderr) {
      return 'No matches found';
    }

    return stdout || stderr;
  } catch (error: any) {
    // rg returns exit code 1 when no matches found
    if (error.code === 1 && !error.stdout && !error.stderr) {
      return 'No matches found';
    }

    // If rg is not installed, provide helpful message
    if (error.message.includes('rg') && error.code === 127) {
      throw new Error(
        'ripgrep (rg) is not installed. Please install it: https://github.com/BurntSushi/ripgrep#installation'
      );
    }

    throw new Error(`Search failed: ${error.message}`);
  }
}

/**
 * Get all builtin tools
 */
export function getBuiltinTools(): MCPTool[] {
  return [
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    fileListTool,
    commandExecuteTool,
    grepSearchTool,
  ];
}
