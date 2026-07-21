// KaTeX's mhchem contrib ships no type declarations. The chat package's
// `katexCss.ts` does a side-effect `import('katex/contrib/mhchem')` (it registers
// \ce{}/\pu{} on the shared katex module). An ambient `declare module` can't
// cover it here because web's tsconfig has `allowJs: true`, so TS resolves the
// real untyped `mhchem.mjs` — which wins over an ambient declaration and trips
// noImplicitAny. A `paths` mapping to this stub (see apps/web/tsconfig.json)
// makes TS resolve the import here instead. Vite still bundles the real module.
export {};
