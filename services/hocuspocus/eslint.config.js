import nodeConfig from '@gruenerator/eslint-config/node';

export default [
  ...nodeConfig,
  {
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: import.meta.dirname,
        projectService: {
          allowDefaultProject: ['eslint.config.js'],
        },
      },
    },
  },
  // Altlast aus der Zeit, als die Wurzel-Config die Regel hier versehentlich
  // abschaltete (#5322); Abbau in #5326, danach fällt der Block weg.
  {
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
];
