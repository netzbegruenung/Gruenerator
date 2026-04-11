import reactConfig from '@gruenerator/eslint-config/react';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: String(import.meta.dirname),
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
