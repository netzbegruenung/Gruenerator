import nodeConfig from './packages/eslint-config/node.js';

// Jedes gelintete Paket hat ein eigenes eslint.config.js, und der
// pre-commit-Hook sucht die Config je Datei (`v10_config_lookup_from_file`
// in .lintstagedrc.json) — Hook und CI lesen also dieselbe Datei. Diese
// Wurzel-Config gilt nur noch für Dateien im Repo-Wurzelverzeichnis.
//
// Früher bildete sie die Paket-Configs hier nach und überschrieb dabei
// `files` jedes geerbten Blocks; so galt z. B. no-unsafe-assignment: off
// (gedacht nur für eslint.config.js) im Hook für alle Dateien (#5322).
export default [
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
];
