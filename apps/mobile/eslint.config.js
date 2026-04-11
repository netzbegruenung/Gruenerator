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
      // TODO: Fix ~215 violations then promote to 'error' (tracked in typescript-safety-roadmap.md)
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
    },
  },
  {
    ignores: ['.expo/**', 'android/**', 'ios/**', 'metro.config.js', 'shims/**'],
  },
];
