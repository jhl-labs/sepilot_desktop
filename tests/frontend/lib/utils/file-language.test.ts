/**
 * file-language 유틸리티 테스트
 */

import {
  getLanguageFromFilename,
  getLanguageFromExtension,
  isCodeFile,
  getFileExtension,
} from '@/lib/utils/file-language';

describe('file-language utilities', () => {
  describe('getLanguageFromFilename', () => {
    it('should detect TypeScript files', () => {
      expect(getLanguageFromFilename('app.ts')).toBe('typescript');
      expect(getLanguageFromFilename('Component.tsx')).toBe('typescript');
    });

    it('should detect JavaScript files', () => {
      expect(getLanguageFromFilename('script.js')).toBe('javascript');
      expect(getLanguageFromFilename('Component.jsx')).toBe('javascript');
      expect(getLanguageFromFilename('module.mjs')).toBe('javascript');
      expect(getLanguageFromFilename('config.cjs')).toBe('javascript');
    });

    it('should detect Python files', () => {
      expect(getLanguageFromFilename('script.py')).toBe('python');
      expect(getLanguageFromFilename('app.pyw')).toBe('python');
      expect(getLanguageFromFilename('types.pyi')).toBe('python');
    });

    it('should detect web files', () => {
      expect(getLanguageFromFilename('index.html')).toBe('html');
      expect(getLanguageFromFilename('page.htm')).toBe('html');
      expect(getLanguageFromFilename('styles.css')).toBe('css');
      expect(getLanguageFromFilename('data.json')).toBe('json');
    });

    it('should detect markdown files', () => {
      expect(getLanguageFromFilename('README.md')).toBe('markdown');
      expect(getLanguageFromFilename('doc.mdx')).toBe('markdown');
    });

    it('should detect Java files', () => {
      expect(getLanguageFromFilename('Main.java')).toBe('java');
      expect(getLanguageFromFilename('App.class')).toBe('java');
    });

    it('should detect C/C++ files', () => {
      expect(getLanguageFromFilename('main.c')).toBe('c');
      expect(getLanguageFromFilename('app.cpp')).toBe('cpp');
      expect(getLanguageFromFilename('code.cc')).toBe('cpp');
      expect(getLanguageFromFilename('program.cxx')).toBe('cpp');
      expect(getLanguageFromFilename('header.h')).toBe('c');
      expect(getLanguageFromFilename('header.hpp')).toBe('cpp');
    });

    it('should detect Go files', () => {
      expect(getLanguageFromFilename('main.go')).toBe('go');
    });

    it('should detect Rust files', () => {
      expect(getLanguageFromFilename('lib.rs')).toBe('rust');
    });

    it('should detect shell scripts', () => {
      expect(getLanguageFromFilename('script.sh')).toBe('shell');
      expect(getLanguageFromFilename('setup.bash')).toBe('shell');
      expect(getLanguageFromFilename('config.zsh')).toBe('shell');
    });

    it('should detect Ruby files', () => {
      expect(getLanguageFromFilename('app.rb')).toBe('ruby');
      expect(getLanguageFromFilename('view.erb')).toBe('ruby');
    });

    it('should detect PHP files', () => {
      expect(getLanguageFromFilename('index.php')).toBe('php');
    });

    it('should detect SQL files', () => {
      expect(getLanguageFromFilename('schema.sql')).toBe('sql');
    });

    it('should detect YAML files', () => {
      expect(getLanguageFromFilename('config.yml')).toBe('yaml');
      expect(getLanguageFromFilename('docker-compose.yaml')).toBe('yaml');
    });

    it('should detect XML files', () => {
      expect(getLanguageFromFilename('config.xml')).toBe('xml');
    });

    it('should detect Dockerfile', () => {
      expect(getLanguageFromFilename('Dockerfile')).toBe('dockerfile');
      expect(getLanguageFromFilename('app.dockerfile')).toBe('dockerfile');
    });

    it('should handle case insensitivity', () => {
      expect(getLanguageFromFilename('APP.JS')).toBe('javascript');
      expect(getLanguageFromFilename('Script.PY')).toBe('python');
    });

    it('should return plaintext for unknown extensions', () => {
      expect(getLanguageFromFilename('file.xyz')).toBe('plaintext');
      expect(getLanguageFromFilename('binary.exe')).toBe('plaintext');
    });

    it('should return plaintext for files without extension', () => {
      expect(getLanguageFromFilename('README')).toBe('plaintext');
      expect(getLanguageFromFilename('LICENSE')).toBe('plaintext');
    });

    it('should handle files with multiple dots', () => {
      expect(getLanguageFromFilename('app.test.ts')).toBe('typescript');
      expect(getLanguageFromFilename('config.production.js')).toBe('javascript');
    });
  });

  describe('getLanguageFromExtension', () => {
    it('should detect language from extension with dot', () => {
      expect(getLanguageFromExtension('.ts')).toBe('typescript');
      expect(getLanguageFromExtension('.js')).toBe('javascript');
      expect(getLanguageFromExtension('.py')).toBe('python');
    });

    it('should detect language from extension without dot', () => {
      expect(getLanguageFromExtension('ts')).toBe('typescript');
      expect(getLanguageFromExtension('js')).toBe('javascript');
      expect(getLanguageFromExtension('py')).toBe('python');
    });

    it('should handle case insensitivity', () => {
      expect(getLanguageFromExtension('.TS')).toBe('typescript');
      expect(getLanguageFromExtension('JS')).toBe('javascript');
    });

    it('should return plaintext for unknown extensions', () => {
      expect(getLanguageFromExtension('.xyz')).toBe('plaintext');
      expect(getLanguageFromExtension('unknown')).toBe('plaintext');
    });
  });

  describe('isCodeFile', () => {
    it('should return true for code files', () => {
      expect(isCodeFile('app.ts')).toBe(true);
      expect(isCodeFile('script.js')).toBe(true);
      expect(isCodeFile('main.py')).toBe(true);
      expect(isCodeFile('index.html')).toBe(true);
      expect(isCodeFile('styles.css')).toBe(true);
    });

    it('should return false for non-code files', () => {
      expect(isCodeFile('image.png')).toBe(false);
      expect(isCodeFile('video.mp4')).toBe(false);
      expect(isCodeFile('archive.zip')).toBe(false);
    });

    it('should return false for files without extension', () => {
      expect(isCodeFile('README')).toBe(false);
      expect(isCodeFile('LICENSE')).toBe(false);
    });

    it('should handle case insensitivity', () => {
      expect(isCodeFile('APP.JS')).toBe(true);
      expect(isCodeFile('Script.PY')).toBe(true);
    });
  });

  describe('getFileExtension', () => {
    it('should extract file extension', () => {
      expect(getFileExtension('app.ts')).toBe('ts');
      expect(getFileExtension('script.js')).toBe('js');
      expect(getFileExtension('main.py')).toBe('py');
    });

    it('should handle files with multiple dots', () => {
      expect(getFileExtension('app.test.ts')).toBe('ts');
      expect(getFileExtension('config.production.js')).toBe('js');
    });

    it('should return empty string for files without extension', () => {
      expect(getFileExtension('README')).toBe('');
      expect(getFileExtension('LICENSE')).toBe('');
      expect(getFileExtension('Dockerfile')).toBe('');
    });

    it('should handle case conversion to lowercase', () => {
      expect(getFileExtension('APP.JS')).toBe('js');
      expect(getFileExtension('Script.PY')).toBe('py');
    });

    it('should handle hidden files', () => {
      expect(getFileExtension('.gitignore')).toBe('gitignore');
      expect(getFileExtension('.env')).toBe('env');
    });
  });
});
