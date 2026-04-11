import reactConfig from '@gruenerator/eslint-config/react';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: [
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
      // Remaining warn overrides for rules not yet fixed:
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    ignores: ['build/**', 'dist/**', 'public/**', 'scripts/**'],
  },
];
