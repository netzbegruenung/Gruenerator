import tseslint from 'typescript-eslint';

// Scoped, single-purpose lint config: enforce the platform-layer boundary only.
// @gruenerator/core holds generic, domain-free infrastructure (avatar, models, …)
// extracted from @gruenerator/shared. It must NOT import feature/domain packages
// or contracts — that upward dependency is exactly what makes the layer reusable
// outside Grünerator. We deliberately do NOT pull in the strict base/react rule
// sets here; fully linting this package is a separate effort.
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
  '@gruenerator/shared',
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
                '@gruenerator/core must stay domain-free: it may not import feature packages, contracts, or @gruenerator/shared (that would invert the dependency direction).',
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
