import { logger } from '@/lib/utils/logger';
/**
 * Codebase Analyzer for Coding Agent
 *
 * Analyzes project structure and builds dependency graphs
 */

import * as fs from 'fs';
import * as path from 'path';

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  lines: number;
  imports: string[];
  exports: string[];
}

export interface DirectoryNode {
  path: string;
  name: string;
  type: 'directory' | 'file';
  children?: DirectoryNode[];
  fileInfo?: FileInfo;
}

export interface DependencyGraph {
  nodes: Map<string, FileInfo>;
  edges: Map<string, Set<string>>; // file -> dependencies
  reverseEdges: Map<string, Set<string>>; // file -> dependents
}

export interface ProjectStructure {
  rootPath: string;
  tree: DirectoryNode;
  fileCount: number;
  directoryCount: number;
  totalLines: number;
  filesByExtension: Map<string, number>;
}

export class CodebaseAnalyzer {
  private readonly IGNORE_PATTERNS = [
    'node_modules',
    '.next',
    'dist',
    'build',
    '.git',
    'coverage',
    '.cache',
    'out',
  ];

  private readonly CODE_EXTENSIONS = [
    '.ts',
    '.tsx',
    '.js',
    '.jsx',
    '.py',
    '.java',
    '.go',
    '.rs',
    '.c',
    '.cpp',
    '.h',
  ];

  /**
   * Analyze project structure
   */
  async analyzeStructure(rootPath: string, maxDepth: number = 5): Promise<ProjectStructure> {
    logger.info(`[CodebaseAnalyzer] Analyzing project structure: ${rootPath}`);

    const tree = await this.buildDirectoryTree(rootPath, maxDepth);
    const stats = this.calculateStats(tree);

    return {
      rootPath,
      tree,
      ...stats,
    };
  }

  /**
   * Build directory tree
   */
  private async buildDirectoryTree(
    dirPath: string,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<DirectoryNode> {
    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);

    if (stats.isFile()) {
      const fileInfo = await this.analyzeFile(dirPath);
      return {
        path: dirPath,
        name,
        type: 'file',
        fileInfo,
      };
    }

    const node: DirectoryNode = {
      path: dirPath,
      name,
      type: 'directory',
      children: [],
    };

    if (currentDepth >= maxDepth) {
      return node;
    }

    try {
      const entries = fs.readdirSync(dirPath);

      for (const entry of entries) {
        // Skip ignored patterns
        if (this.shouldIgnore(entry)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry);

        try {
          const childNode = await this.buildDirectoryTree(fullPath, maxDepth, currentDepth + 1);
          node.children!.push(childNode);
        } catch {
          // Skip files that can't be accessed
          continue;
        }
      }

      // Sort: directories first, then files
      node.children!.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error(`[CodebaseAnalyzer] Error reading directory ${dirPath}:`, error);
    }

    return node;
  }

  /**
   * Analyze a single file
   */
  private async analyzeFile(filePath: string): Promise<FileInfo> {
    const stats = fs.statSync(filePath);
    const extension = path.extname(filePath);
    const name = path.basename(filePath);

    const fileInfo: FileInfo = {
      path: filePath,
      name,
      extension,
      size: stats.size,
      lines: 0,
      imports: [],
      exports: [],
    };

    // Only analyze code files
    if (!this.CODE_EXTENSIONS.includes(extension)) {
      return fileInfo;
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      fileInfo.lines = content.split('\n').length;

      // Extract imports and exports (simple regex-based)
      if (
        extension === '.ts' ||
        extension === '.tsx' ||
        extension === '.js' ||
        extension === '.jsx'
      ) {
        fileInfo.imports = this.extractImports(content);
        fileInfo.exports = this.extractExports(content);
      }
    } catch {
      // Skip files that can't be read
    }

    return fileInfo;
  }

  /**
   * Extract import statements
   */
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
    const requireRegex = /require\s*\(\s*['"](.+?)['"]\s*\)/g;

    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    while ((match = requireRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }

    return imports;
  }

  /**
   * Extract export statements
   */
  private extractExports(content: string): string[] {
    const exports: string[] = [];
    const exportRegex =
      /export\s+(?:default\s+)?(?:class|function|const|let|var|interface|type)\s+(\w+)/g;

    let match;
    while ((match = exportRegex.exec(content)) !== null) {
      exports.push(match[1]);
    }

    return exports;
  }

  /**
   * Build dependency graph
   */
  async buildDependencyGraph(rootPath: string): Promise<DependencyGraph> {
    logger.info(`[CodebaseAnalyzer] Building dependency graph: ${rootPath}`);

    const graph: DependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
      reverseEdges: new Map(),
    };

    const files = await this.findAllCodeFiles(rootPath);

    // Add all files as nodes
    for (const filePath of files) {
      const fileInfo = await this.analyzeFile(filePath);
      graph.nodes.set(filePath, fileInfo);
      graph.edges.set(filePath, new Set());
      graph.reverseEdges.set(filePath, new Set());
    }

    // Build edges based on imports
    for (const [filePath, fileInfo] of graph.nodes.entries()) {
      const fileDir = path.dirname(filePath);

      for (const importPath of fileInfo.imports) {
        // Resolve relative imports
        if (importPath.startsWith('.')) {
          const resolvedPath = this.resolveImportPath(fileDir, importPath);
          if (resolvedPath && graph.nodes.has(resolvedPath)) {
            graph.edges.get(filePath)!.add(resolvedPath);
            graph.reverseEdges.get(resolvedPath)!.add(filePath);
          }
        }
      }
    }

    logger.info(`[CodebaseAnalyzer] Built dependency graph with ${graph.nodes.size} nodes`);

    return graph;
  }

  /**
   * Find related files
   */
  findRelatedFiles(filePath: string, graph: DependencyGraph, depth: number = 1): Set<string> {
    const related = new Set<string>();
    const visited = new Set<string>();
    const queue: Array<{ file: string; currentDepth: number }> = [
      { file: filePath, currentDepth: 0 },
    ];

    while (queue.length > 0) {
      const { file, currentDepth } = queue.shift()!;

      if (visited.has(file) || currentDepth > depth) {
        continue;
      }

      visited.add(file);

      if (file !== filePath) {
        related.add(file);
      }

      // Add dependencies
      const deps = graph.edges.get(file);
      if (deps) {
        for (const dep of deps) {
          queue.push({ file: dep, currentDepth: currentDepth + 1 });
        }
      }

      // Add dependents
      const dependents = graph.reverseEdges.get(file);
      if (dependents) {
        for (const dependent of dependents) {
          queue.push({ file: dependent, currentDepth: currentDepth + 1 });
        }
      }
    }

    return related;
  }

  /**
   * Get file recommendations based on task
   */
  recommendFiles(
    taskDescription: string,
    structure: ProjectStructure,
    limit: number = 5
  ): string[] {
    const recommendations: Array<{ path: string; score: number }> = [];

    // Extract keywords from task
    const keywords = taskDescription
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Score files based on relevance
    this.scoreFiles(structure.tree, keywords, recommendations);

    // Sort by score and return top matches
    recommendations.sort((a, b) => b.score - a.score);
    return recommendations.slice(0, limit).map((r) => r.path);
  }

  /**
   * Score files recursively
   */
  private scoreFiles(
    node: DirectoryNode,
    keywords: string[],
    recommendations: Array<{ path: string; score: number }>
  ): void {
    if (node.type === 'file' && node.fileInfo) {
      let score = 0;
      const fileLower = node.path.toLowerCase();

      // Check filename match
      for (const keyword of keywords) {
        if (fileLower.includes(keyword)) {
          score += 10;
        }
      }

      // Check directory match
      const dirName = path.dirname(node.path).toLowerCase();
      for (const keyword of keywords) {
        if (dirName.includes(keyword)) {
          score += 5;
        }
      }

      if (score > 0) {
        recommendations.push({ path: node.path, score });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.scoreFiles(child, keywords, recommendations);
      }
    }
  }

  /**
   * Calculate statistics
   */
  private calculateStats(tree: DirectoryNode): {
    fileCount: number;
    directoryCount: number;
    totalLines: number;
    filesByExtension: Map<string, number>;
  } {
    let fileCount = 0;
    let directoryCount = 0;
    let totalLines = 0;
    const filesByExtension = new Map<string, number>();

    const traverse = (node: DirectoryNode) => {
      if (node.type === 'directory') {
        directoryCount++;
        if (node.children) {
          for (const child of node.children) {
            traverse(child);
          }
        }
      } else if (node.fileInfo) {
        fileCount++;
        totalLines += node.fileInfo.lines;

        const ext = node.fileInfo.extension;
        filesByExtension.set(ext, (filesByExtension.get(ext) || 0) + 1);
      }
    };

    traverse(tree);

    return { fileCount, directoryCount, totalLines, filesByExtension };
  }

  /**
   * Find all code files
   */
  private async findAllCodeFiles(rootPath: string): Promise<string[]> {
    const files: string[] = [];

    const traverse = (dirPath: string) => {
      const entries = fs.readdirSync(dirPath);

      for (const entry of entries) {
        if (this.shouldIgnore(entry)) {
          continue;
        }

        const fullPath = path.join(dirPath, entry);
        const stats = fs.statSync(fullPath);

        if (stats.isDirectory()) {
          traverse(fullPath);
        } else if (this.CODE_EXTENSIONS.includes(path.extname(fullPath))) {
          files.push(fullPath);
        }
      }
    };

    try {
      traverse(rootPath);
    } catch (error) {
      console.error('[CodebaseAnalyzer] Error finding code files:', error);
    }

    return files;
  }

  /**
   * Resolve import path to actual file path
   */
  private resolveImportPath(fromDir: string, importPath: string): string | null {
    const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];

    for (const ext of extensions) {
      const candidate = path.resolve(fromDir, importPath + ext);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Check if path should be ignored
   */
  private shouldIgnore(name: string): boolean {
    return this.IGNORE_PATTERNS.some((pattern) => name.includes(pattern));
  }

  /**
   * Format structure as tree string
   */
  formatAsTree(node: DirectoryNode, prefix: string = '', isLast: boolean = true): string {
    const lines: string[] = [];
    const connector = isLast ? '└── ' : '├── ';
    const name = node.type === 'directory' ? `📁 ${node.name}` : `📄 ${node.name}`;

    lines.push(prefix + connector + name);

    if (node.children && node.children.length > 0) {
      const childPrefix = prefix + (isLast ? '    ' : '│   ');
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const childIsLast = i === node.children.length - 1;
        lines.push(this.formatAsTree(child, childPrefix, childIsLast));
      }
    }

    return lines.join('\n');
  }
}
