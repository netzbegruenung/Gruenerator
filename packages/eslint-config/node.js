import baseConfig from './base.js';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': ['error', { allow: ['warn', 'error'] }],

      '@typescript-eslint/no-require-imports': 'off',

      'no-process-exit': 'off',
    },
  },
];
