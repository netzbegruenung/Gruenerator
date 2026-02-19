import nodeConfig from '@gruenerator/eslint-config/node';

export default [
  ...nodeConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      'dist/**',
      'uploads/**',
      'test/**',
      'tests/**',
      'scripts/**',
      'eslint.config.js',
      '**/test-*.ts',
      'services/comfyui/**',
    ],
  },
];
