// Routen-Fallback des Canvas-Editors. Bewusst ohne `@gruenerator/canvas-editor/skeleton`:
// dessen Subpath ist `@ggraphic/editor/shell`, ein Barrel, das den ganzen Editor-Kern in
// den Entry zöge. Layout und Klassen spiegeln `CanvasEditorSkeleton` des Editors
// (Standardformat 4:5, Tab-Leiste, Seitenfläche); bei Änderungen dort hier nachziehen.

const PULSE = 'animate-pulse bg-[var(--editor-tile)]';
const RAIL_TABS = 7;
const MOBILE_TABS = 6;

export function CanvasEditorRouteSkeleton() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Editor wird geladen"
      className="flex flex-col h-[var(--editor-height,100dvh)] min-h-[500px] bg-[var(--editor-bg)]"
    >
      <div className="relative w-full h-[var(--editor-topbar-height)] shrink-0 bg-[image:var(--editor-menubar-gradient)] px-4 flex items-center gap-1 max-canvas-mobile:h-[52px] max-canvas-mobile:px-2.5">
        <div className="size-[34px] rounded-[10px] bg-white/15" />
        <div className="absolute left-1/2 -translate-x-1/2 h-3.5 w-40 rounded animate-pulse bg-white/25" />
        <div className="ml-auto h-8 w-24 rounded-[10px] animate-pulse bg-white/15" />
      </div>
      <div className="flex flex-1 min-h-0 max-canvas-mobile:flex-col">
        <div
          aria-hidden="true"
          className="flex flex-col items-center gap-1 pt-2 shrink-0 w-[76px] h-full bg-[var(--editor-surface)] border-r border-[var(--editor-border)] max-canvas-mobile:hidden"
        >
          {Array.from({ length: RAIL_TABS }, (_, i) => (
            <div key={i} className="w-[62px] py-[9px] flex flex-col items-center gap-1.5">
              <div className={`size-[21px] rounded-md ${PULSE}`} />
              <div className={`h-2 w-9 rounded ${PULSE}`} />
            </div>
          ))}
        </div>
        <div
          aria-hidden="true"
          className="order-2 hidden flex-none h-[calc(64px+env(safe-area-inset-bottom))] pt-2 px-1 pb-[env(safe-area-inset-bottom)] bg-[var(--editor-surface)] border-t border-[var(--editor-border)] max-canvas-mobile:flex"
        >
          {Array.from({ length: MOBILE_TABS }, (_, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-[52px] h-8 rounded-2xl ${PULSE}`} />
              <div className={`h-2 w-8 rounded ${PULSE}`} />
            </div>
          ))}
        </div>
        <div className="flex flex-1 min-h-0 flex-col bg-[var(--editor-canvas-bg)]">
          <div className="h-14 shrink-0 max-canvas-mobile:hidden" />
          <div
            aria-hidden="true"
            className="flex flex-1 min-h-0 w-full items-center justify-center p-lg"
          >
            <div
              className={`max-h-full w-full max-w-[560px] rounded-sm shadow-sm ${PULSE}`}
              style={{ aspectRatio: '4 / 5' }}
            />
          </div>
          <div className="flex shrink-0 justify-end p-sm max-canvas-mobile:hidden">
            <div className="h-9 w-48 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-surface)]/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
