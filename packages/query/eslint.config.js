import tseslint from 'typescript-eslint';

// Scoped boundary lint: @gruenerator/query holds pure-TS search primitives
// (Qdrant filters, vector/hybrid search, query text normalization) consumed by
// the API and the MCP server. It must stay a dependency-free leaf — importing
// @gruenerator/shared or any feature/domain package would invert the dependency
// direction and defeat the point (the MCP building without all of shared).
const FORBIDDEN_PACKAGES = [
  '@gruenerator/shared',
  '@gruenerator/core',
  '@gruenerator/contracts',
  '@gruenerator/voice',
  '@gruenerator/chat',
  '@gruenerator/canvas-editor',
  '@gruenerator/collab',
  '@gruenerator/sites',
  '@gruenerator/sites-design',
  '@gruenerator/wolke',
  '@gruenerator/docs',
];

export default tseslint.config(
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: FORBIDDEN_PACKAGES.flatMap((pkg) => [pkg, `${pkg}/*`]),
              message:
                '@gruenerator/query must stay a pure, dependency-free leaf: it may not import @gruenerator/shared, core, contracts, or any feature package.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**'],
  }
);
