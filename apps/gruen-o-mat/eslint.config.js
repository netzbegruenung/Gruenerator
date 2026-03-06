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
    ignores: ['dist/**', 'public/**'],
  },
];
