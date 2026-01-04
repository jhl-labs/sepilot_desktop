const js = require('@eslint/js');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const typescriptParser = require('@typescript-eslint/parser');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const nextPlugin = require('@next/eslint-plugin-next');

module.exports = [
  // Ignore patterns (기존 .eslintignore 내용)
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      'electron/**',
      'tests/**',

      'scripts/**',
      'public/**',
      'types/**/*.js',
      'coverage/**',
      'lib/**/*.js',
      'hooks/**/*.js',
      'eslint.config.js',
      'jest.config.js',
      'next.config.js',
      'tailwind.config.ts',
      'hooks/use-confirm-dialog.ts',
      '.dependency-cruiser.js',
      'backstop.json',
      'lighthouserc.json',
      'components/_deprecated/**',
      'extensions/**',
    ],
  },

  // Base JavaScript recommended
  js.configs.recommended,

  // TypeScript 및 React 파일 설정
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.json',
      },
      globals: {
        // TypeScript globals
        React: 'readonly',
        JSX: 'readonly',
        NodeJS: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        sessionStorage: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        FormData: 'readonly',
        FileReader: 'readonly',
        Blob: 'readonly',
        // Node.js globals
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        module: 'readonly',
        require: 'readonly',
        global: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': typescriptEslint,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
    },
    rules: {
      // TypeScript rules
      ...typescriptEslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',

      // React rules
      ...reactPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // Next.js doesn't require React import
      'react/prop-types': 'off', // TypeScript handles prop types

      // React Hooks rules
      ...reactHooksPlugin.configs.recommended.rules,
      'react-hooks/exhaustive-deps': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/set-state-in-effect': 'off',

      // Next.js rules
      '@next/next/no-html-link-for-pages': 'error',

      // General rules
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
      'no-throw-literal': 'error',
      'prefer-template': 'warn',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
];
