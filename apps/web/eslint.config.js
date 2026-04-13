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
    ignores: ['build/**', 'dist/**', 'public/**', 'scripts/**'],
  },
];
