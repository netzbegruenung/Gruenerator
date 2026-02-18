import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import-x';
import globals from 'globals';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2022,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.mjs',
            'apps/web/eslint.config.js',
            'apps/docs/eslint.config.js',
            'apps/mobile/eslint.config.js',
            'apps/desktop/eslint.config.mjs',
            'packages/eslint-config/base.js',
            'packages/eslint-config/react.js',
          ],
        },
      },
    },
    plugins: {
      'import-x': importPlugin,
    },
    rules: {
      // TODO: Re-enable as 'error' after fixing existing violations
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // TODO: Re-enable as 'error' after fixing existing violations
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',

      // TODO: Re-enable as 'error' after fixing existing violations
      'import-x/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import-x/no-duplicates': 'error',

      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      // TODO: Re-enable as 'error' after fixing existing violations
      'no-case-declarations': 'warn',
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.vitest.ts',
    ],
  }
);
