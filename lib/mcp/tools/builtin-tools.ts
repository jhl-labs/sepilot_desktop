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
import { getActiveBrowserView } from '../../../electron/ipc/handlers/browser-control';

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
 * Execute built-in tools
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
    case 'browser_get_interactive_elements':
      return await handleBrowserGetInteractiveElements();
    case 'browser_get_page_content':
      return await handleBrowserGetPageContent();
    case 'browser_click_element':
      return await handleBrowserClickElement(args as { element_id: string });
    case 'browser_type_text':
      return await handleBrowserTypeText(args as { element_id: string; text: string });
    case 'browser_scroll':
      return await handleBrowserScroll(args as { direction: 'up' | 'down'; amount?: number });
    case 'browser_navigate':
      return await handleBrowserNavigate(args as { url: string });
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
 * Browser Get Interactive Elements Tool
 */
export const browserGetInteractiveElementsTool: MCPTool = {
  name: 'browser_get_interactive_elements',
  description: 'Get all interactive elements (buttons, links, inputs) from the current browser page. Returns element IDs that can be clicked or filled.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Browser Get Page Content Tool
 */
export const browserGetPageContentTool: MCPTool = {
  name: 'browser_get_page_content',
  description: 'Get the text content and HTML of the current browser page. Useful for understanding what the page contains.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Browser Click Element Tool
 */
export const browserClickElementTool: MCPTool = {
  name: 'browser_click_element',
  description: 'Click an interactive element on the browser page. Use element ID from browser_get_interactive_elements.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      element_id: {
        type: 'string',
        description: 'ID of the element to click (from browser_get_interactive_elements)',
      },
    },
    required: ['element_id'],
  },
};

/**
 * Browser Type Text Tool
 */
export const browserTypeTextTool: MCPTool = {
  name: 'browser_type_text',
  description: 'Type text into an input field on the browser page. Use element ID from browser_get_interactive_elements.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      element_id: {
        type: 'string',
        description: 'ID of the input element (from browser_get_interactive_elements)',
      },
      text: {
        type: 'string',
        description: 'Text to type into the input field',
      },
    },
    required: ['element_id', 'text'],
  },
};

/**
 * Browser Scroll Tool
 */
export const browserScrollTool: MCPTool = {
  name: 'browser_scroll',
  description: 'Scroll the browser page up or down. Useful for viewing more content.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      direction: {
        type: 'string',
        enum: ['up', 'down'],
        description: 'Direction to scroll',
      },
      amount: {
        type: 'number',
        description: 'Amount to scroll in pixels (default: 500)',
      },
    },
    required: ['direction'],
  },
};

/**
 * Browser Navigate Tool
 */
export const browserNavigateTool: MCPTool = {
  name: 'browser_navigate',
  description: 'Navigate to a URL in the browser. Use this to go to websites directly (e.g., "naver.com", "https://google.com"). Do NOT use search for simple navigation.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to navigate to. Can be with or without protocol (http/https will be added automatically)',
      },
    },
    required: ['url'],
  },
};

/**
 * Handle browser_get_interactive_elements
 */
async function handleBrowserGetInteractiveElements(): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    const elements = await browserView.webContents.executeJavaScript(`
      (function() {
        const interactiveSelectors = [
          'a[href]',
          'button',
          'input',
          'textarea',
          'select',
          '[role="button"]',
          '[role="link"]',
          '[role="textbox"]',
          '[onclick]',
          '[tabindex]'
        ];

        const elements = [];
        const selector = interactiveSelectors.join(', ');
        const nodes = document.querySelectorAll(selector);

        nodes.forEach((node, index) => {
          const rect = node.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 &&
                          window.getComputedStyle(node).visibility !== 'hidden' &&
                          window.getComputedStyle(node).display !== 'none';

          if (isVisible) {
            if (!node.hasAttribute('data-ai-id')) {
              node.setAttribute('data-ai-id', 'ai-element-' + index);
            }

            elements.push({
              id: node.getAttribute('data-ai-id'),
              tag: node.tagName.toLowerCase(),
              type: node.type || null,
              text: (node.textContent || '').trim().substring(0, 100),
              placeholder: node.placeholder || null,
              value: node.value || null,
              href: node.href || null,
              role: node.getAttribute('role') || null,
              ariaLabel: node.getAttribute('aria-label') || null
            });
          }
        });

        return elements;
      })();
    `);

    return JSON.stringify(elements, null, 2);
  } catch (error: any) {
    throw new Error(`Failed to get interactive elements: ${error.message}`);
  }
}

/**
 * Handle browser_get_page_content
 */
async function handleBrowserGetPageContent(): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    const content = await browserView.webContents.executeJavaScript(`
      (function() {
        return {
          title: document.title,
          url: window.location.href,
          text: document.body.innerText.substring(0, 10000) // Limit to 10KB
        };
      })();
    `);

    return JSON.stringify(content, null, 2);
  } catch (error: any) {
    throw new Error(`Failed to get page content: ${error.message}`);
  }
}

/**
 * Handle browser_click_element
 */
async function handleBrowserClickElement(args: { element_id: string }): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    const result = await browserView.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('[data-ai-id="${args.element_id}"]');
        if (!element) {
          return { success: false, error: 'Element not found: ${args.element_id}' };
        }

        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.click();

        return {
          success: true,
          element: {
            tag: element.tagName,
            text: element.textContent?.substring(0, 100)
          }
        };
      })();
    `);

    if (!result.success) {
      throw new Error(result.error);
    }

    return `Successfully clicked element: ${args.element_id} (${result.element.tag}: ${result.element.text})`;
  } catch (error: any) {
    throw new Error(`Failed to click element: ${error.message}`);
  }
}

/**
 * Handle browser_type_text
 */
async function handleBrowserTypeText(args: { element_id: string; text: string }): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    await browserView.webContents.executeJavaScript(`
      (function() {
        const element = document.querySelector('[data-ai-id="${args.element_id}"]');
        if (!element) {
          throw new Error('Element not found: ${args.element_id}');
        }

        element.focus();
        element.value = ${JSON.stringify(args.text)};

        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      })();
    `);

    return `Successfully typed "${args.text}" into element: ${args.element_id}`;
  } catch (error: any) {
    throw new Error(`Failed to type text: ${error.message}`);
  }
}

/**
 * Handle browser_scroll
 */
async function handleBrowserScroll(args: { direction: 'up' | 'down'; amount?: number }): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    const scrollAmount = args.amount || 500;
    const scrollY = args.direction === 'down' ? scrollAmount : -scrollAmount;

    await browserView.webContents.executeJavaScript(`
      window.scrollBy({ top: ${scrollY}, behavior: 'smooth' });
    `);

    return `Successfully scrolled ${args.direction} by ${scrollAmount}px`;
  } catch (error: any) {
    throw new Error(`Failed to scroll: ${error.message}`);
  }
}

/**
 * Handle browser_navigate
 */
async function handleBrowserNavigate(args: { url: string }): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    let validUrl = args.url;
    // Add https:// if no protocol specified
    if (!validUrl.startsWith('http://') && !validUrl.startsWith('https://')) {
      validUrl = 'https://' + validUrl;
    }

    await browserView.webContents.loadURL(validUrl);

    return `Successfully navigated to: ${validUrl}`;
  } catch (error: any) {
    throw new Error(`Failed to navigate: ${error.message}`);
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
    browserGetInteractiveElementsTool,
    browserGetPageContentTool,
    browserClickElementTool,
    browserTypeTextTool,
    browserScrollTool,
    browserNavigateTool,
  ];
}
