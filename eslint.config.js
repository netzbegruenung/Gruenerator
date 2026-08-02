import baseConfig from './packages/eslint-config/base.js';
import reactConfig from './packages/eslint-config/react.js';
import reactNativeConfig from './packages/eslint-config/react-native.js';
import nodeConfig from './packages/eslint-config/node.js';

// Web-React (DOM): jsx-a11y greift hier.
const WEB_FILES = [
  'apps/web/**/*.{ts,tsx,js,jsx}',
  'apps/desktop/**/*.{ts,tsx,js,jsx}',
  'apps/gruen-o-mat/**/*.{ts,tsx,js,jsx}',
  'packages/sites/**/*.{ts,tsx,js,jsx}',
  'packages/chat/**/*.{ts,tsx,js,jsx}',
];

// React Native: eigener a11y-Regelsatz (react-native-a11y statt jsx-a11y),
// weil jsx-a11y DOM-Elemente prüft und auf <Pressable> nie feuert.
const NATIVE_FILES = ['apps/mobile/**/*.{ts,tsx,js,jsx}'];

export default [
  // React apps: web, desktop, gruen-o-mat, sites, chat
  {
    files: WEB_FILES,
    ...reactConfig[0],
  },
  ...reactConfig.slice(1).map((config) => ({
    ...config,
    files: WEB_FILES,
  })),

  // React Native app: mobile
  {
    files: NATIVE_FILES,
    ...reactNativeConfig[0],
  },
  ...reactNativeConfig.slice(1).map((config) => ({
    ...config,
    files: NATIVE_FILES,
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
