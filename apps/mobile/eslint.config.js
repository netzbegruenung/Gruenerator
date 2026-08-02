// react-native statt react: derselbe Satz, aber mit dem
// react-native-a11y-Gitter statt jsx-a11y (das DOM-Elemente prüft und auf
// <Pressable> nie feuern würde). Siehe docs/barrierefreiheit-audit-plan.md.
import reactNativeConfig from '@gruenerator/eslint-config/react-native';
import globals from 'globals';

export default [
  ...reactNativeConfig,
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
    // Tool configs are CommonJS and outside the TS project service, same as
    // metro.config.js — the typed-lint parser cannot resolve them.
    ignores: [
      '.expo/**',
      'android/**',
      'ios/**',
      'metro.config.js',
      'babel.config.js',
      'jest.config.js',
      'shims/**',
      'plugins/**',
    ],
  },
];
