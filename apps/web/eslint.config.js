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
      // TODO: Fix ~1,228 violations then promote to 'error' (tracked in typescript-safety-roadmap.md)
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    ignores: ['build/**', 'dist/**', 'public/**', 'scripts/**'],
  },
];
