import baseConfig from './base.js';
import globals from 'globals';

import noRawErrorToClient from './rules/no-raw-error-to-client.js';

export default [
  ...baseConfig,
  {
    plugins: {
      gruenerator: {
        rules: {
          'no-raw-error-to-client': noRawErrorToClient,
        },
      },
    },
  },
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',

      '@typescript-eslint/no-require-imports': 'off',

      'no-process-exit': 'off',

      // Raw tooling output must never reach a user — see utils/errors/userFacing.ts.
      'gruenerator/no-raw-error-to-client': 'error',
    },
  },
  {
    // Tests and eval harnesses print raw failures on purpose.
    files: ['**/*.vitest.ts', '**/*.test.ts', '**/*-eval.ts', '**/*-eval.vitest.ts'],
    rules: {
      'gruenerator/no-raw-error-to-client': 'off',
    },
  },
];
