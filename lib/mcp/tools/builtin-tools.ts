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
import {
  handleBrowserGetInteractiveElementsEnhanced,
  handleBrowserGetPageContentEnhanced,
  handleBrowserClickElementEnhanced,
  handleBrowserTypeTextEnhanced,
  handleBrowserSearchElements,
} from './browser-handlers-enhanced';
import {
  captureAnnotatedScreenshot,
  clickCoordinate,
  clickMarker,
  analyzeWithVision,
  getClickableCoordinate,
} from './browser-handlers-vision';
import {
  googleSearchTool,
  googleSearchNewsTool,
  googleSearchScholarTool,
  googleSearchImagesTool,
  googleSearchAdvancedTool,
  googleExtractResultsTool,
  googleGetRelatedSearchesTool,
  googleVisitResultTool,
  googleNextPageTool,
} from './google-search-tools';
import {
  handleGoogleSearch,
  handleGoogleExtractResults,
  handleGoogleGetRelatedSearches,
  handleGoogleVisitResult,
  handleGoogleNextPage,
} from './google-search-handlers';

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
  description:
    'Search for patterns in files using ripgrep (rg). Fast code search across the codebase.',
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
      return await handleGrepSearch(
        args as {
          pattern: string;
          path?: string;
          file_type?: string;
          case_sensitive?: boolean;
        }
      );
    case 'browser_get_interactive_elements':
      return await handleBrowserGetInteractiveElementsEnhanced();
    case 'browser_get_page_content':
      return await handleBrowserGetPageContentEnhanced();
    case 'browser_click_element':
      return await handleBrowserClickElementEnhanced((args as { element_id: string }).element_id);
    case 'browser_type_text':
      return await handleBrowserTypeTextEnhanced(
        (args as { element_id: string; text: string }).element_id,
        (args as { element_id: string; text: string }).text
      );
    case 'browser_search_elements':
      return await handleBrowserSearchElements((args as { query: string }).query);
    case 'browser_scroll':
      return await handleBrowserScroll(args as { direction: 'up' | 'down'; amount?: number });
    case 'browser_navigate':
      return await handleBrowserNavigate(args as { url: string });
    case 'browser_create_tab':
      return await handleBrowserCreateTab(args as { url?: string });
    case 'browser_switch_tab':
      return await handleBrowserSwitchTab(args as { tabId: string });
    case 'browser_close_tab':
      return await handleBrowserCloseTab(args as { tabId: string });
    case 'browser_list_tabs':
      return await handleBrowserListTabs();
    case 'browser_take_screenshot':
      return await handleBrowserTakeScreenshot(args as { fullPage?: boolean });
    case 'browser_get_selected_text':
      return await handleBrowserGetSelectedText();
    // Vision tools
    case 'browser_capture_annotated_screenshot':
      return await captureAnnotatedScreenshot(
        (args as { maxMarkers?: number; includeOverlay?: boolean }) || {}
      );
    case 'browser_click_coordinate':
      return await clickCoordinate(
        (args as { x: number; y: number }).x,
        (args as { x: number; y: number }).y
      );
    case 'browser_click_marker':
      return await clickMarker((args as { marker_label: string }).marker_label);
    case 'browser_get_clickable_coordinate':
      return await getClickableCoordinate((args as { element_id: string }).element_id);
    case 'browser_analyze_with_vision':
      return await analyzeWithVision((args as { user_query?: string }).user_query);
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
async function handleFileList(args: { path?: string; recursive?: boolean }): Promise<string> {
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
  description:
    'Get all interactive elements (buttons, links, inputs) from the current browser page. Returns element IDs that can be clicked or filled.',
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
  description:
    'Get the text content and HTML of the current browser page. Useful for understanding what the page contains.',
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
  description:
    'Click an interactive element on the browser page. Use element ID from browser_get_interactive_elements.',
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
  description:
    'Type text into an input field on the browser page. Use element ID from browser_get_interactive_elements.',
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
  description:
    'Navigate to a URL in the browser. Use this to go to websites directly (e.g., "naver.com", "https://google.com"). Do NOT use search for simple navigation.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description:
          'URL to navigate to. Can be with or without protocol (http/https will be added automatically)',
      },
    },
    required: ['url'],
  },
};

export const browserCreateTabTool: MCPTool = {
  name: 'browser_create_tab',
  description:
    'Create a new browser tab. Opens a new tab with the specified URL or Google homepage.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'Optional URL to open in the new tab. Defaults to Google homepage.',
      },
    },
  },
};

export const browserSwitchTabTool: MCPTool = {
  name: 'browser_switch_tab',
  description:
    'Switch to a specific browser tab by its ID. Use browser_list_tabs to see all available tabs and their IDs.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      tabId: {
        type: 'string',
        description: 'The ID of the tab to switch to',
      },
    },
    required: ['tabId'],
  },
};

export const browserCloseTabTool: MCPTool = {
  name: 'browser_close_tab',
  description: 'Close a specific browser tab by its ID. Cannot close the last remaining tab.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      tabId: {
        type: 'string',
        description: 'The ID of the tab to close',
      },
    },
    required: ['tabId'],
  },
};

export const browserListTabsTool: MCPTool = {
  name: 'browser_list_tabs',
  description:
    'List all open browser tabs with their IDs, titles, and URLs. Shows which tab is currently active.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const browserTakeScreenshotTool: MCPTool = {
  name: 'browser_take_screenshot',
  description:
    'Capture a screenshot of the current browser page and get a text preview. Useful for understanding what the user sees.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      fullPage: {
        type: 'boolean',
        description:
          'Whether to capture the full page or just the visible area. Defaults to visible area.',
      },
    },
  },
};

export const browserGetSelectedTextTool: MCPTool = {
  name: 'browser_get_selected_text',
  description:
    'Get the text that is currently selected/highlighted in the browser. Returns empty if nothing is selected.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

/**
 * Browser Search Elements Tool (NEW)
 */
export const browserSearchElementsTool: MCPTool = {
  name: 'browser_search_elements',
  description:
    'Search for elements on the page using natural language queries (e.g., "search button", "login input", "submit form"). Returns matching elements with their IDs.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Natural language query to search for elements (e.g., "search button", "email input")',
      },
    },
    required: ['query'],
  },
};

/**
 * Browser Capture Annotated Screenshot Tool (VISION)
 */
export const browserCaptureAnnotatedScreenshotTool: MCPTool = {
  name: 'browser_capture_annotated_screenshot',
  description:
    'Capture a screenshot with labeled interactive elements (Set-of-Mark style). Returns base64 image with markers (A, B, C...) overlaid on elements.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      max_markers: {
        type: 'number',
        description: 'Maximum number of elements to mark (default: 30)',
      },
      include_overlay: {
        type: 'boolean',
        description: 'Whether to draw visual overlays on screenshot (default: true)',
      },
    },
  },
};

/**
 * Browser Click Coordinate Tool (VISION)
 */
export const browserClickCoordinateTool: MCPTool = {
  name: 'browser_click_coordinate',
  description:
    'Click at specific pixel coordinates (x, y) on the page. Useful when DOM-based clicking fails or when using vision-based detection.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      x: {
        type: 'number',
        description: 'X coordinate in pixels',
      },
      y: {
        type: 'number',
        description: 'Y coordinate in pixels',
      },
    },
    required: ['x', 'y'],
  },
};

/**
 * Browser Click Marker Tool (VISION)
 */
export const browserClickMarkerTool: MCPTool = {
  name: 'browser_click_marker',
  description:
    'Click an element by its marker label (A, B, C...) from annotated screenshot. Use after browser_capture_annotated_screenshot.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      marker_label: {
        type: 'string',
        description: 'Marker label to click (e.g., "A", "B", "C")',
      },
    },
    required: ['marker_label'],
  },
};

/**
 * Browser Get Clickable Coordinate Tool (VISION)
 */
export const browserGetClickableCoordinateTool: MCPTool = {
  name: 'browser_get_clickable_coordinate',
  description:
    'Get the exact clickable coordinates for an element by its ID. Returns center point and bounding box.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      element_id: {
        type: 'string',
        description: 'Element ID (from browser_get_interactive_elements)',
      },
    },
    required: ['element_id'],
  },
};

/**
 * Browser Analyze With Vision Tool (VISION - Future)
 */
export const browserAnalyzeWithVisionTool: MCPTool = {
  name: 'browser_analyze_with_vision',
  description:
    'Analyze the page using LLM vision model with annotated screenshot. Provides AI-powered understanding of page layout and suggested actions.',
  serverName: 'builtin',
  inputSchema: {
    type: 'object',
    properties: {
      user_query: {
        type: 'string',
        description:
          'Optional: User query to guide vision analysis (e.g., "Find the login button")',
      },
    },
  },
};

/**
 * Handle browser_get_interactive_elements
 */
async function _handleBrowserGetInteractiveElements(): Promise<string> {
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
async function _handleBrowserGetPageContent(): Promise<string> {
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _handleBrowserClickElement(args: { element_id: string }): Promise<string> {
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function _handleBrowserTypeText(args: { element_id: string; text: string }): Promise<string> {
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
async function handleBrowserScroll(args: {
  direction: 'up' | 'down';
  amount?: number;
}): Promise<string> {
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
      validUrl = `https://${validUrl}`;
    }

    await browserView.webContents.loadURL(validUrl);

    return `Successfully navigated to: ${validUrl}`;
  } catch (error: any) {
    throw new Error(`Failed to navigate: ${error.message}`);
  }
}

/**
 * Handle browser_create_tab
 */
async function handleBrowserCreateTab(args: { url?: string }): Promise<string> {
  try {
    const { browserCreateTab } = await import('../../../electron/ipc/handlers/browser-view');
    const url = args.url || 'https://www.google.com';
    const result = await browserCreateTab(url);

    if (result.success && result.data) {
      return `Successfully created new tab (ID: ${result.data.tabId}) with URL: ${url}`;
    } else {
      throw new Error(result.error || 'Failed to create tab');
    }
  } catch (error: any) {
    throw new Error(`Failed to create tab: ${error.message}`);
  }
}

/**
 * Handle browser_switch_tab
 */
async function handleBrowserSwitchTab(args: { tabId: string }): Promise<string> {
  try {
    const { browserSwitchTab } = await import('../../../electron/ipc/handlers/browser-view');
    const result = await browserSwitchTab(args.tabId);

    if (result.success && result.data) {
      return `Successfully switched to tab (ID: ${args.tabId}). Current URL: ${result.data.url}`;
    } else {
      throw new Error(result.error || 'Failed to switch tab');
    }
  } catch (error: any) {
    throw new Error(`Failed to switch tab: ${error.message}`);
  }
}

/**
 * Handle browser_close_tab
 */
async function handleBrowserCloseTab(args: { tabId: string }): Promise<string> {
  try {
    const { browserCloseTab } = await import('../../../electron/ipc/handlers/browser-view');
    const result = await browserCloseTab(args.tabId);

    if (result.success) {
      return `Successfully closed tab (ID: ${args.tabId})`;
    } else {
      throw new Error(result.error || 'Failed to close tab');
    }
  } catch (error: any) {
    throw new Error(`Failed to close tab: ${error.message}`);
  }
}

/**
 * Handle browser_list_tabs
 */
async function handleBrowserListTabs(): Promise<string> {
  try {
    const { browserGetTabs } = await import('../../../electron/ipc/handlers/browser-view');
    const result = browserGetTabs();

    if (result.success && result.data) {
      const { tabs, activeTabId } = result.data;
      const tabList = tabs
        .map(
          (tab) => `${tab.isActive ? '✓' : ' '} [${tab.id}] ${tab.title || 'Untitled'} - ${tab.url}`
        )
        .join('\n');

      return `Total tabs: ${tabs.length}\nActive tab: ${activeTabId}\n\n${tabList}`;
    } else {
      throw new Error(result.error || 'Failed to get tabs');
    }
  } catch (error: any) {
    throw new Error(`Failed to list tabs: ${error.message}`);
  }
}

/**
 * Handle browser_take_screenshot
 */
async function handleBrowserTakeScreenshot(_args: { fullPage?: boolean }): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    // Take screenshot
    const image = await browserView.webContents.capturePage();
    const base64 = image.toDataURL();

    // Get page text for summary
    const textResult = await browserView.webContents.executeJavaScript(`
      document.body.innerText.substring(0, 2000);
    `);

    return `Screenshot captured successfully!\n\nVisible text preview:\n${textResult}\n\nScreenshot: ${base64.substring(0, 100)}... (base64 data)`;
  } catch (error: any) {
    throw new Error(`Failed to take screenshot: ${error.message}`);
  }
}

/**
 * Handle browser_get_selected_text
 */
async function handleBrowserGetSelectedText(): Promise<string> {
  const browserView = getActiveBrowserView();
  if (!browserView) {
    throw new Error('No active browser tab. Please switch to Browser mode first.');
  }

  try {
    const selectedText = await browserView.webContents.executeJavaScript(`
      window.getSelection().toString();
    `);

    if (!selectedText || selectedText.trim() === '') {
      return 'No text is currently selected in the browser.';
    }

    return `Selected text (${selectedText.length} characters):\n\n${selectedText}`;
  } catch (error: any) {
    throw new Error(`Failed to get selected text: ${error.message}`);
  }
}

/**
 * Get all builtin tools
 */
export function getBuiltinTools(): MCPTool[] {
  return [
    // File operations
    fileReadTool,
    fileWriteTool,
    fileEditTool,
    fileListTool,
    // Command execution
    commandExecuteTool,
    grepSearchTool,
    // Browser control
    browserNavigateTool,
    browserGetPageContentTool,
    browserGetInteractiveElementsTool,
    browserClickElementTool,
    browserTypeTextTool,
    browserScrollTool,
    browserSearchElementsTool,
    // Browser tab management
    browserCreateTabTool,
    browserSwitchTabTool,
    browserCloseTabTool,
    browserListTabsTool,
    // Browser advanced
    browserTakeScreenshotTool,
    browserGetSelectedTextTool,
    // Browser vision (NEW)
    browserCaptureAnnotatedScreenshotTool,
    browserClickCoordinateTool,
    browserClickMarkerTool,
    browserGetClickableCoordinateTool,
    browserAnalyzeWithVisionTool,
    // Google Search (NEW)
    googleSearchTool,
    googleSearchNewsTool,
    googleSearchScholarTool,
    googleSearchImagesTool,
    googleSearchAdvancedTool,
    googleExtractResultsTool,
    googleGetRelatedSearchesTool,
    googleVisitResultTool,
    googleNextPageTool,
  ];
}
