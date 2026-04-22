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
            'apps/docs/eslint.config.js',
            'apps/desktop/eslint.config.mjs',
            'apps/mobile/shims/isomorphic-webcrypto.js',
            'apps/web/src/components/utils/errorMessages.tsx',
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
      '@typescript-eslint/no-floating-promises': 'error',
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
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',

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
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { allowDefaultCaseForExhaustiveSwitch: true },
      ],
      // TODO: Re-enable as 'error' after fixing existing violations
      'no-case-declarations': 'warn',
    },
  },
  {
    files: ['**/eslint.config.js', '**/eslint.config.mjs'],
    rules: {
      // `tsconfigRootDir: import.meta.dirname` resolves to TS's "error typed"
      // value when linting the config file itself, because Node's import.meta
      // types aren't reliably pulled into the config file's tsconfig scope.
      // The assignment is safe in practice; disable the rule for config files only.
      '@typescript-eslint/no-unsafe-assignment': 'off',
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
      '**/metro.config.js',
    ],
  }
);
