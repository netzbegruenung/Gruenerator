import baseConfig from '@gruenerator/eslint-config/base';

export default [
  ...baseConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'src/utils/index.js',
            'src/utils/textNormalization.js',
            'src/search/vector/index.js',
            'src/search/vector/constants.js',
            'src/search/vector/HybridSearch.js',
          ],
        },
      },
    },
  },
  {
    ignores: ['dist/**'],
  },
];
