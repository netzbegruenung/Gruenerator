import reactConfig from '@gruenerator/eslint-config/react';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: [
            // The config file itself
            'eslint.config.js',
            // Files not found by tsconfig project service
            'src/components/utils/errorMessages.tsx',
            'apps/web/src/components/utils/errorMessages.tsx',
          ],
        },
      },
    },
  },
  {
    rules: {
      // no-unsafe-* rules: inherited from base config at 'error' level (1,214 violations fixed 2026-04-11)
      // no-floating-promises: inherited at 'error' level (230 violations fixed 2026-04-12)
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
    },
  },
  {
    // Guard against object-literal type assertions on JSON responses inside the
    // docs feature. These casts (e.g. `(await res.json()) as { documentId: string }`)
    // are smell points: they fake type safety on a wire payload without actually
    // validating it at runtime. The fix is to use a Zod schema from
    // @gruenerator/contracts and call `.parse()`. See packages/contracts/src/schemas/docs.ts.
    files: ['src/features/docs/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSTypeLiteral',
          message:
            'Do not cast wire payloads with object-literal `as { ... }`. Define a Zod schema in @gruenerator/contracts and call `schema.parse()` instead.',
        },
      ],
    },
  },
  {
    ignores: ['build/**', 'dist/**', 'public/**', 'scripts/**'],
  },
];
