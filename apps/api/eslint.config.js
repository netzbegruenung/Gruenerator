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
  // Prompt-Sammelmodul: `require()` auf JSON liefert zwangsläufig `any`, die
  // Regel ist dort nicht erfüllbar. Als Datei-Ausnahme statt als
  // Kommentar-Direktive, weil `eslint --fix` im pre-commit-Hook die Direktive
  // als unbenutzt einstuft und wieder herauslöscht.
  {
    files: ['prompts/**/index.js'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
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
    ],
  },
];
