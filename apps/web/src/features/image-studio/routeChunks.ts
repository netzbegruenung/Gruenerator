// Der Canvas-Editor-Chunk, geteilt von seinem `lazy()` in config/routes.ts und
// den Hover-Preloads — ein Import, damit ein Preload genau das wärmt, was die
// Route rendert. Frei von anderen Importen: routes.ts liegt im Entry.
export const loadCanvasStudioPage = () => import('./CollabCanvasStudioPage');
