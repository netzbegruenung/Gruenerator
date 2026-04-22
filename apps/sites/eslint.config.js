import reactConfig from '@gruenerator/eslint-config/react';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
      },
    },
  },
  {
    // TODO: Promote back to 'error' after typing the axios/fetch boundaries
    // in apiClient.ts, useSite.ts, useAuth.ts, errorHandler.ts, errorTracking.ts,
    // and consentStore.ts. apps/web (1,214 violations) and apps/mobile (180)
    // ran this cleanup in follow-ups to 0eab5651; apps/sites was skipped.
    // Until then, keep as warn so CI can signal real blocking errors without
    // admin-override merges.
    rules: {
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },
  {
    ignores: ['dist/**'],
  },
];
