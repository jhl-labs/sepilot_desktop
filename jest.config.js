/** @type {import('jest').Config} */
const config = {
  // Multi-project configuration
  projects: [
    // Frontend tests (React components, hooks, etc.)
    {
      displayName: 'frontend',
      preset: 'ts-jest',
      testEnvironment: 'jsdom',
      roots: ['<rootDir>/tests/frontend'],
      testMatch: ['**/*.test.tsx', '**/*.test.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
        '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
        '\\.(jpg|jpeg|png|gif|webp|svg)$': '<rootDir>/tests/__mocks__/fileMock.js',
        '^react-syntax-highlighter$': '<rootDir>/tests/__mocks__/react-syntax-highlighter.js',
        '^react-syntax-highlighter/dist/esm/styles/prism$':
          '<rootDir>/tests/__mocks__/react-syntax-highlighter-styles.js',
        '^mermaid$': '<rootDir>/tests/__mocks__/mermaid.js',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
      collectCoverageFrom: [
        'app/**/*.{ts,tsx}',
        'components/**/*.{ts,tsx}',
        '!**/*.d.ts',
        '!**/node_modules/**',
        '!**/.next/**',
      ],
      transform: {
        '^.+\\.tsx?$': [
          'ts-jest',
          {
            tsconfig: {
              jsx: 'react-jsx',
              esModuleInterop: true,
              module: 'commonjs',
              moduleResolution: 'node',
              target: 'ES2020',
              strict: true,
              paths: {
                '@/*': ['./*'],
              },
            },
          },
        ],
      },
      moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/.next/'],
      transformIgnorePatterns: [
        '/node_modules/(?!(@langchain|langchain|react-syntax-highlighter|refractor|mermaid|nanoid)/)',
      ],
    },

    // Backend/Library tests (lib/, utility functions, etc.)
    {
      displayName: 'backend',
      preset: 'ts-jest',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/lib'],
      testMatch: ['**/*.test.ts'],
      moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1',
      },
      setupFilesAfterEnv: ['<rootDir>/tests/setup.backend.ts'],
      collectCoverageFrom: [
        'lib/**/*.ts',
        '!lib/**/*.d.ts',
        '!lib/**/index.ts',
        '!lib/**/types.ts',
        '!**/node_modules/**',
      ],
      transform: {
        '^.+\\.ts$': [
          'ts-jest',
          {
            tsconfig: {
              esModuleInterop: true,
              module: 'commonjs',
              moduleResolution: 'node',
              target: 'ES2020',
              strict: true,
              paths: {
                '@/*': ['./*'],
              },
            },
          },
        ],
      },
      moduleFileExtensions: ['ts', 'js', 'json', 'node'],
      testPathIgnorePatterns: ['/node_modules/', '/dist/', '/langgraph/state.test.ts'],
      transformIgnorePatterns: ['/node_modules/(?!(@langchain|langchain|p-retry|is-network-error)/)'],
    },
  ],

  // Global coverage settings
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html', 'json-summary'],
  coverageThreshold: {
    global: {
      branches: 45,
      functions: 55,
      lines: 55,
      statements: 55,
    },
  },
  verbose: true,

  // Test reporters (JUnit XML for Codecov)
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results',
        outputName: 'junit.xml',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}',
        ancestorSeparator: ' › ',
        usePathForSuiteName: true,
      },
    ],
  ],
};

module.exports = config;
