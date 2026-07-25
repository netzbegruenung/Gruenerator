// KaTeX's mhchem contrib ships no type declarations. The chat package's
// `katexCss.ts` does a side-effect `import('katex/contrib/mhchem')` and
// gruen-o-mat compiles that source through the `@gruenerator/chat` path map.
// A `paths` mapping to this stub (see apps/gruen-o-mat/tsconfig.json) makes TS
// resolve the import here instead of the real untyped `mhchem.mjs`. Vite still
// bundles the real module at build time.
export {};
