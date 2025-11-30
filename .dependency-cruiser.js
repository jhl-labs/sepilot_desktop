/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies cause maintenance problems',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan modules are dead code',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$', // dot files
          '\\.d\\.ts$', // TypeScript declaration files
          '(^|/)tsconfig\\.json$', // tsconfig
          '(^|/)(babel|webpack)\\.config\\.(js|cjs|mjs|ts|json)$', // configs
        ],
      },
      to: {},
    },
    {
      name: 'no-deprecated-core',
      severity: 'warn',
      comment: 'Deprecated Node.js core modules',
      from: {},
      to: {
        dependencyTypes: ['core'],
        path: [
          '^(v8/tools/codemap)$',
          '^(v8/tools/consarray)$',
          '^(v8/tools/csvparser)$',
          '^(v8/tools/logreader)$',
          '^(v8/tools/profile_view)$',
          '^(v8/tools/profile)$',
          '^(v8/tools/SourceMap)$',
          '^(v8/tools/splaytree)$',
          '^(v8/tools/tickprocessor-driver)$',
          '^(v8/tools/tickprocessor)$',
          '^(node-inspect/lib/_inspect)$',
          '^(node-inspect/lib/internal/inspect_client)$',
          '^(node-inspect/lib/internal/inspect_repl)$',
        ],
      },
    },
    {
      name: 'not-to-deprecated',
      severity: 'warn',
      comment: 'Dependencies on deprecated npm modules',
      from: {},
      to: {
        dependencyTypes: ['deprecated'],
      },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment: 'Dependencies should be in package.json',
      from: {},
      to: {
        dependencyTypes: ['npm-no-pkg', 'npm-unknown'],
      },
    },
    {
      name: 'not-to-unresolvable',
      severity: 'error',
      comment: 'Dependencies should be resolvable',
      from: {},
      to: {
        couldNotResolve: true,
      },
    },
    {
      name: 'no-duplicate-dep-types',
      severity: 'warn',
      comment: 'Dependencies should be in one place only',
      from: {},
      to: {
        moreThanOneDependencyType: true,
        dependencyTypesNot: ['type-only'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: ['node_modules', 'dist', 'out', '.next', 'coverage', 'test-results', '\\.d\\.ts$'],
    },
    exclude: {
      path: [
        'node_modules',
        'dist',
        'out',
        '.next',
        'coverage',
        'test-results',
        'tests',
        '__tests__',
        '__mocks__',
        '\\.test\\.(ts|tsx|js|jsx)$',
        '\\.spec\\.(ts|tsx|js|jsx)$',
      ],
    },
    includeOnly: ['^app/', '^components/', '^lib/', '^electron/'],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(@[^/]+/[^/]+|[^/]+)',
      },
      archi: {
        collapsePattern: '^(app|components|lib|electron)/[^/]+',
      },
      text: {
        highlightFocused: true,
      },
    },
  },
};
