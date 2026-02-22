/**
 * File Language Detection Utility
 *
 * Determines programming language from file extension
 * for syntax highlighting in Monaco Editor.
 */

const LANGUAGE_MAP: Record<string, string> = {
  // JavaScript/TypeScript
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',

  // Web
  json: 'json',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  sass: 'sass',
  less: 'less',

  // Markdown & Text
  md: 'markdown',
  mdx: 'markdown',
  txt: 'plaintext',

  // Python
  py: 'python',
  pyw: 'python',
  pyi: 'python',

  // Java
  java: 'java',
  class: 'java',

  // C/C++
  c: 'c',
  cpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  h: 'c',
  hpp: 'cpp',
  hxx: 'cpp',

  // Go
  go: 'go',

  // Rust
  rs: 'rust',

  // Shell
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',

  // Ruby
  rb: 'ruby',
  erb: 'ruby',

  // PHP
  php: 'php',

  // SQL
  sql: 'sql',

  // YAML
  yml: 'yaml',
  yaml: 'yaml',

  // XML
  xml: 'xml',

  // Other
  dockerfile: 'dockerfile',
  Dockerfile: 'dockerfile',
  gitignore: 'plaintext',
};

/**
 * Get Monaco Editor language from filename
 */
export function getLanguageFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) {
    return 'plaintext';
  }

  return LANGUAGE_MAP[ext] || 'plaintext';
}

/**
 * Get Monaco Editor language from file extension (with dot)
 */
export function getLanguageFromExtension(extension: string): string {
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  return LANGUAGE_MAP[ext.toLowerCase()] || 'plaintext';
}

/**
 * Check if file is a code file (not binary/image)
 */
export function isCodeFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (!ext) {
    return false;
  }

  return !!LANGUAGE_MAP[ext];
}

/**
 * Get file extension from filename
 */
export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  if (parts.length < 2) {
    return '';
  }
  return parts[parts.length - 1].toLowerCase();
}
