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
    },
  },
  {
    ignores: ['.expo/**', 'android/**', 'ios/**'],
  },
];
