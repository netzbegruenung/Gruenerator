import tseslint from 'typescript-eslint';

// Scoped, single-purpose lint config: enforce the design-system boundary only.
// @gruenerator/ui must stay domain-free so it can be reused outside Grünerator
// (e.g. the dictation feature is injected via a prop, not imported here). We
// deliberately do NOT pull in the strict base/react rule sets — fully linting
// this package is a separate effort; this config exists to stop the layer from
// re-acquiring an upward dependency on a feature package.
const DOMAIN_PACKAGES = [
  '@gruenerator/voice',
  '@gruenerator/chat',
  '@gruenerator/canvas-editor',
  '@gruenerator/collab',
  '@gruenerator/contracts',
  '@gruenerator/sites',
  '@gruenerator/sites-design',
  '@gruenerator/wolke',
  '@gruenerator/docs',
];

export default tseslint.config(
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tseslint.parser,
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: DOMAIN_PACKAGES.flatMap((pkg) => [pkg, `${pkg}/*`]),
              message:
                '@gruenerator/ui must stay domain-free: inject domain behaviour via props/adapters instead of importing a feature package.',
            },
          ],
        },
      ],
    },
  },
  {
    ignores: ['dist/**'],
  }
);
