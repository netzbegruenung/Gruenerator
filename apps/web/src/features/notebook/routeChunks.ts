// The notebook route chunks, shared by their `lazy()` in config/routes.ts and
// by hover preloads — one import each, so a preload warms exactly what the
// route will render. Kept free of other imports: routes.ts is in the entry.
export const loadNotebookPage = () => import('./components/NotebookResolver');
export const loadNotebookOverview = () => import('./components/overview/NotebookOverviewPage');
