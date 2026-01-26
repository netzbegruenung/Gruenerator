import reactConfig from '@gruenerator/eslint-config/react';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: [
            // Config files (local and from repo root)
            'eslint.config.js',
            'apps/web/eslint.config.js',
            // Files not found by tsconfig project service
            'src/components/utils/errorMessages.tsx',
            'apps/web/src/components/utils/errorMessages.tsx',
          ],
        },
      },
    },
  },
  {
    ignores: ['build/**', 'dist/**', 'public/**'],
  },
];
