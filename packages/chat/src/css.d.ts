// Side-effect CSS imports (e.g. `import 'katex/dist/katex.min.css'`) — the
// bundler (Vite) processes these; TypeScript just needs the module to exist.
declare module '*.css';

// KaTeX mhchem extension — side-effect import that registers \ce{}/\pu{} on the
// shared katex module. Ships no types.
declare module 'katex/contrib/mhchem';
