import reactConfig from '@gruenerator/eslint-config/react';

export default [
  ...reactConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: [
            // The config file itself
            'eslint.config.js',
            // Files not found by tsconfig project service
            'src/components/utils/errorMessages.tsx',
            'apps/web/src/components/utils/errorMessages.tsx',
          ],
        },
      },
    },
  },
  {
    rules: {
      // no-unsafe-* rules: inherited from base config at 'error' level (1,214 violations fixed 2026-04-11)
      // no-floating-promises: inherited at 'error' level (230 violations fixed 2026-04-12)
      '@typescript-eslint/switch-exhaustiveness-check': 'warn',
    },
  },
  {
    // Guard against object-literal type assertions on JSON responses inside the
    // docs feature. These casts (e.g. `(await res.json()) as { documentId: string }`)
    // are smell points: they fake type safety on a wire payload without actually
    // validating it at runtime. The fix is to use a Zod schema from
    // @gruenerator/contracts and call `.parse()`. See packages/contracts/src/schemas/docs.ts.
    files: ['src/features/docs/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSAsExpression > TSTypeLiteral',
          message:
            'Do not cast wire payloads with object-literal `as { ... }`. Define a Zod schema in @gruenerator/contracts and call `schema.parse()` instead.',
        },
      ],
    },
  },
  {
    // The board is the biggest surface the mobile app embeds in its pinned
    // WebView (`EMBEDDABLE_PATH_PREFIXES` in
    // apps/api/plugins/webViewHandoffRedirect.ts). Embedded, `RouteComponent`
    // forces `noChrome` on every route, so a navigation to a hub renders a
    // page with no navigation and no way back — the user is stuck until they
    // hit the host's close button. Three such navigations existed here.
    //
    // The way out of an embeddable surface is `useHostAwareBack`, which asks
    // the host to close instead. Actions that only make sense outside the app
    // (`/chat` from a card) belong behind `isEmbedded()`.
    //
    // Scoped to the board rather than to every embeddable surface: a feature
    // directory holds its hub as well as its editor, and for the others the
    // two are not separable by glob. PublicBoardPage is out — `/boards/public/:id`
    // is a share link rendered without chrome anyway, never opened by the app.
    files: ['src/features/boards/**/*.{ts,tsx}'],
    ignores: ['src/features/boards/PublicBoardPage.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='navigate'] > Literal[value=/^\\/(workplace|office|notebooks|chat|studio|arbeiten)?$/]",
          message:
            'Diese Fläche kann in der Mobile-App eingebettet sein — eingebettet ist ein Hub-Pfad eine Sackgasse ohne Navigation. useHostAwareBack() benutzen, oder die Aktion hinter isEmbedded() verbergen.',
        },
      ],
    },
  },
  {
    ignores: ['build/**', 'dist/**', 'public/**', 'scripts/**'],
  },
];
