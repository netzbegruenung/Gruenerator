import { defineConfig } from 'eslint/config';

import baseConfig from './packages/eslint-config/base.js';
import reactConfig from './packages/eslint-config/react.js';
import reactNativeConfig from './packages/eslint-config/react-native.js';
import nodeConfig from './packages/eslint-config/node.js';

// Web-React (DOM): jsx-a11y greift hier.
const WEB_FILES = [
  'apps/web/**/*.{ts,tsx,js,jsx}',
  'apps/desktop/**/*.{ts,tsx,js,jsx}',
  'apps/gruen-o-mat/**/*.{ts,tsx,js,jsx}',
  'apps/ggraphic-demo/**/*.{ts,tsx,js,jsx}',
  'packages/sites/**/*.{ts,tsx,js,jsx}',
  'packages/chat/**/*.{ts,tsx,js,jsx}',
  'packages/canvas-editor/**/*.{ts,tsx,js,jsx}',
];

// React Native: eigener a11y-Regelsatz (react-native-a11y statt jsx-a11y),
// weil jsx-a11y DOM-Elemente prüft und auf <Pressable> nie feuert.
const NATIVE_FILES = ['apps/mobile/**/*.{ts,tsx,js,jsx}'];

const NODE_FILES = ['apps/api/**/*.{ts,tsx,js,jsx}', 'services/**/*.{ts,tsx,js,jsx}'];
const SHARED_FILES = [
  'packages/shared/**/*.{ts,tsx,js,jsx}',
  'packages/contracts/**/*.{ts,tsx,js,jsx}',
];

// `extends` schneidet `files` mit dem Geltungsbereich jedes geerbten Blocks,
// statt ihn zu überschreiben. Ein `.map(c => ({ ...c, files }))` hatte zuvor
// z. B. den Block für `**/eslint.config.js` (no-unsafe-assignment: off) auf
// ganz apps/api ausgeweitet — der pre-commit-Hook hielt danach jede
// Direktive für die Regel für unbenutzt und strich sie (#5322).
export default defineConfig(
  // React apps: web, desktop, gruen-o-mat, sites, chat, canvas-editor
  { files: WEB_FILES, extends: [reactConfig] },

  // React Native app: mobile
  { files: NATIVE_FILES, extends: [reactNativeConfig] },

  // Node apps: api, services
  { files: NODE_FILES, extends: [nodeConfig] },

  // Shared packages
  { files: SHARED_FILES, extends: [baseConfig] },

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
      'apps/mobile/app.config.js',
      'apps/mobile/babel.config.js',
      'pnpm-lock.yaml',
      'apps/wordpress/**',
      'apps/api/scripts/**',
      'packages/shared/scripts/**',
      'packages/canvas-editor/scripts/**',
    ],
  }
);
