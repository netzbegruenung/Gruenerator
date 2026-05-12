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
      '**/*.test.ts',
      '**/*.vitest.ts',
      '**/*.manual-test.ts',
      '**/__tests__/**',
      '**/__manual_tests__/**',
      // Top-level CLI scripts (run via tsx, stdout is the artifact)
      'scrape-*.ts',
      'backfill-*.ts',
      'diagnose-*.ts',
      'patch-*.ts',
      'sync-*.ts',
      'aggregate-*.ts',
      'generate-*.ts',
      'update-all-content.ts',
    ],
  },
];
