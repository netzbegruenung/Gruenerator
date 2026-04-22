import baseConfig from './packages/eslint-config/base.js';
import reactConfig from './packages/eslint-config/react.js';
import nodeConfig from './packages/eslint-config/node.js';

export default [
  // React apps: web, sites, docs, mobile, desktop
  {
    files: [
      'apps/web/**/*.{ts,tsx,js,jsx}',
      'apps/sites/**/*.{ts,tsx,js,jsx}',
      'apps/docs/**/*.{ts,tsx,js,jsx}',
      'apps/mobile/**/*.{ts,tsx,js,jsx}',
      'apps/desktop/**/*.{ts,tsx,js,jsx}',
      'apps/gruen-o-mat/**/*.{ts,tsx,js,jsx}',
    ],
    ...reactConfig[0],
  },
  ...reactConfig.slice(1).map((config) => ({
    ...config,
    files: [
      'apps/web/**/*.{ts,tsx,js,jsx}',
      'apps/sites/**/*.{ts,tsx,js,jsx}',
      'apps/docs/**/*.{ts,tsx,js,jsx}',
      'apps/mobile/**/*.{ts,tsx,js,jsx}',
      'apps/desktop/**/*.{ts,tsx,js,jsx}',
      'apps/gruen-o-mat/**/*.{ts,tsx,js,jsx}',
    ],
  })),

  // apps/sites: no-unsafe-* debt deferred (see apps/sites/eslint.config.js TODO).
  // Mirrors the downgrade there so lint-staged (runs from repo root) matches
  // `pnpm --filter @gruenerator/sites lint` (runs from apps/sites/).
  {
    files: ['apps/sites/**/*.{ts,tsx,js,jsx}'],
    rules: {
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
    },
  },

  // Node apps: api, services
  {
    files: ['apps/api/**/*.{ts,tsx,js,jsx}', 'services/**/*.{ts,tsx,js,jsx}'],
    ...nodeConfig[0],
  },
  ...nodeConfig.slice(1).map((config) => ({
    ...config,
    files: ['apps/api/**/*.{ts,tsx,js,jsx}', 'services/**/*.{ts,tsx,js,jsx}'],
  })),

  // Shared packages
  {
    files: ['packages/shared/**/*.{ts,tsx,js,jsx}', 'packages/contracts/**/*.{ts,tsx,js,jsx}'],
    ...baseConfig[0],
  },
  ...baseConfig.slice(1).map((config) => ({
    ...config,
    files: ['packages/shared/**/*.{ts,tsx,js,jsx}', 'packages/contracts/**/*.{ts,tsx,js,jsx}'],
  })),

  // Root-level config files (no type-checking)
  {
    files: ['*.{js,mjs,cjs,ts}'],
    ...nodeConfig[0],
    languageOptions: {
      ...nodeConfig[0]?.languageOptions,
      parserOptions: {
        project: null,
        projectService: false,
      },
    },
  },

  // Global ignores
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/.next/**',
      '**/.expo/**',
      '**/coverage/**',
      'packages/shared/src/tiptap-editor/**',
      '**/public/**',
      '**/metro.config.js',
      'pnpm-lock.yaml',
      'apps/wordpress/**',
      'apps/api/scripts/**',
    ],
  },
];
