import baseConfig from './base.js';
import a11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'jsx-a11y': a11yPlugin,
    },
    settings: {
      react: {
        version: 'detect',
      },
      // Ohne dieses Mapping prüft jsx-a11y nur die nativen Tags. Unsere
      // Bedienelemente kommen aber fast alle aus @gruenerator/ui, also muss der
      // Regelsatz wissen, welches Element dahinter steckt.
      'jsx-a11y': {
        polymorphicPropName: 'as',
        components: {
          Button: 'button',
          IconButton: 'button',
          SubmitButton: 'button',
          Input: 'input',
          Textarea: 'textarea',
          Checkbox: 'input',
          Switch: 'input',
          Label: 'label',
          Link: 'a',
          NavLink: 'a',
          // Kein `Image: 'img'`: Eine <Image>-Komponente gibt es hier nicht,
          // der Name gehört dem lucide-Icon (drei Importe in chat und web).
          // Das Mapping hätte jedes dieser Icons als Bild ohne alt gemeldet.
        },
      },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      ...a11yPlugin.flatConfigs.recommended.rules,

      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/display-name': 'off',

      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // React Compiler rules (added in react-hooks v7) — warn until existing code is migrated
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/set-state-in-render': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/use-memo': 'warn',
      'react-hooks/component-hook-factories': 'warn',
      'react-hooks/error-boundaries': 'warn',
      'react-hooks/globals': 'warn',
      'react-hooks/config': 'warn',
      'react-hooks/gating': 'warn',

      'react/jsx-no-target-blank': 'error',
      'react/jsx-key': 'error',
      'react/no-array-index-key': 'warn',
      'react/self-closing-comp': 'error',
      'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
      // TODO: Re-enable as 'error' after fixing existing violations
      'react/no-unescaped-entities': 'warn',
      // TODO: Re-enable as 'error' after fixing existing violations
      'no-unsafe-optional-chaining': 'warn',

      // --- Barrierefreiheit (WCAG 2.2 AA) -------------------------------
      // Zielstandard und Abarbeitungsplan: docs/barrierefreiheit-audit-plan.md
      //
      // Zwei Stufen: 'error' für alles, was heute schon sauber ist und nicht
      // zurückfallen darf; 'warn' für die Altlast, die Welle 3/4 abträgt. Ein
      // Bestand als 'error' würde nur dazu führen, dass jemand den Regelsatz
      // wieder herausnimmt.
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-proptypes': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/aria-unsupported-elements': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/no-redundant-roles': 'error',
      'jsx-a11y/role-has-required-aria-props': 'error',
      'jsx-a11y/role-supports-aria-props': 'error',
      'jsx-a11y/scope': 'error',

      // Altlast — Zahlen und Zieltermin siehe Plan, Welle 3.
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-static-element-interactions': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      'jsx-a11y/label-has-associated-control': 'warn',
      'jsx-a11y/anchor-is-valid': 'warn',
      'jsx-a11y/media-has-caption': 'warn',

      // In Dialogen ist Autofokus meist richtig (Radix setzt ihn ohnehin
      // selbst). Die Regel dient als Inventarliste, nicht als Verbot.
      'jsx-a11y/no-autofocus': ['warn', { ignoreNonDOM: true }],
    },
  },
  {
    files: ['vite.config.ts', 'vitest.config.ts', '*.config.ts', '*.config.js'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
