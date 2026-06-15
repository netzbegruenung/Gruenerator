import reactConfig from '@gruenerator/eslint-config/react';
import globals from 'globals';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
  },
  {
    rules: {
      'react/react-in-jsx-scope': 'off',
      // no-unsafe-* rules: inherited from base config at 'error' level (180 violations fixed 2026-04-11)
      // no-floating-promises: inherited at 'error' level (70 violations fixed 2026-04-12)
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
    },
  },
  {
    ignores: ['.expo/**', 'android/**', 'ios/**', 'metro.config.js', 'shims/**', 'plugins/**'],
  },
];
