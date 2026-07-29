import baseConfig from './packages/eslint-config/base.js';
import reactConfig from './packages/eslint-config/react.js';
import nodeConfig from './packages/eslint-config/node.js';

export default [
  // React apps: web, mobile, desktop
  {
    files: [
      'apps/web/**/*.{ts,tsx,js,jsx}',
      'apps/mobile/**/*.{ts,tsx,js,jsx}',
      'apps/desktop/**/*.{ts,tsx,js,jsx}',
      'apps/gruen-o-mat/**/*.{ts,tsx,js,jsx}',
      'packages/sites/**/*.{ts,tsx,js,jsx}',
      'packages/chat/**/*.{ts,tsx,js,jsx}',
    ],
    ...reactConfig[0],
  },
  ...reactConfig.slice(1).map((config) => ({
    ...config,
    files: [
      'apps/web/**/*.{ts,tsx,js,jsx}',
      'apps/mobile/**/*.{ts,tsx,js,jsx}',
      'apps/desktop/**/*.{ts,tsx,js,jsx}',
      'apps/gruen-o-mat/**/*.{ts,tsx,js,jsx}',
      'packages/sites/**/*.{ts,tsx,js,jsx}',
      'packages/chat/**/*.{ts,tsx,js,jsx}',
    ],
  })),

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

  // Prompt-Sammelmodul: `require()` auf JSON liefert zwangsläufig `any`, die
  // Regel ist dort nicht erfüllbar. Als Datei-Ausnahme statt als
  // Kommentar-Direktive, weil `eslint --fix` im pre-commit-Hook die Direktive
  // als unbenutzt einstuft und wieder herauslöscht.
  {
    files: ['apps/api/prompts/**/index.js'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
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
      'packages/shared/scripts/**',
    ],
  },
];
