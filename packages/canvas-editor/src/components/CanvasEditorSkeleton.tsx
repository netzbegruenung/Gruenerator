import { getCanvasFormatOrDefault } from '../formats';

import type { ReactNode } from 'react';

// Nur leichte Importe (kein Editor-Barrel): die Datei ist als eigener Subpath
// (`@gruenerator/canvas-editor/skeleton`) der Suspense-Fallback der Route und
// darf Konva & Co. nicht ins Entry-Bundle ziehen.

const pulse = 'animate-pulse bg-[var(--editor-tile)]';

// Solange das Format unbekannt ist (Route-Fallback, Dokument lädt noch), das
// Standardformat zeigen — die meisten Vorlagen sind 4:5, nicht quadratisch.
const defaultFormat = getCanvasFormatOrDefault(null);
const DEFAULT_ASPECT_RATIO = defaultFormat.width / defaultFormat.height;

const RAIL_TABS = 7;
const MOBILE_TABS = 6;

export function CanvasTabRailSkeleton() {
  return (
    <>
      <div
        aria-hidden="true"
        className="flex flex-col items-center gap-1 pt-2 shrink-0 w-[76px] h-full bg-[var(--editor-surface)] border-r border-[var(--editor-border)] max-canvas-mobile:hidden"
      >
        {Array.from({ length: RAIL_TABS }, (_, i) => (
          <div key={i} className="w-[62px] py-[9px] flex flex-col items-center gap-1.5">
            <div className={`size-[21px] rounded-md ${pulse}`} />
            <div className={`h-2 w-9 rounded ${pulse}`} />
          </div>
        ))}
      </div>
      <div
        aria-hidden="true"
        className="order-2 hidden flex-none h-[calc(64px+env(safe-area-inset-bottom))] pt-2 px-1 pb-[env(safe-area-inset-bottom)] bg-[var(--editor-surface)] border-t border-[var(--editor-border)] max-canvas-mobile:flex"
      >
        {Array.from({ length: MOBILE_TABS }, (_, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className={`w-[52px] h-8 rounded-2xl ${pulse}`} />
            <div className={`h-2 w-8 rounded ${pulse}`} />
          </div>
        ))}
      </div>
    </>
  );
}

interface CanvasPageSkeletonProps {
  /** Seitenverhältnis Breite/Höhe der Vorlage; ohne Angabe das Standardformat. */
  aspectRatio?: number;
}

export function CanvasPageSkeleton({
  aspectRatio = DEFAULT_ASPECT_RATIO,
}: CanvasPageSkeletonProps) {
  return (
    <div aria-hidden="true" className="flex flex-1 min-h-0 w-full items-center justify-center p-lg">
      <div
        className={`max-h-full w-full max-w-[560px] rounded-sm shadow-sm ${pulse}`}
        style={{ aspectRatio }}
      />
    </div>
  );
}

interface CanvasEditorSkeletonProps {
  /** Echter Zurück-Button des Hosts, damit man schon während des Ladens raus kann. */
  chromeLeft?: ReactNode;
  aspectRatio?: number;
}

export function CanvasEditorSkeleton({ chromeLeft, aspectRatio }: CanvasEditorSkeletonProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Editor wird geladen"
      className="flex flex-col h-dvh min-h-[500px] bg-[var(--editor-bg)]"
    >
      <div className="relative w-full h-[var(--editor-topbar-height)] shrink-0 bg-[image:var(--editor-menubar-gradient)] px-4 flex items-center gap-1 max-canvas-mobile:h-[52px] max-canvas-mobile:px-2.5">
        {chromeLeft ?? <div className="size-[34px] rounded-[10px] bg-white/15" />}
        <div className="absolute left-1/2 -translate-x-1/2 h-3.5 w-40 rounded animate-pulse bg-white/25" />
        <div className="ml-auto h-8 w-24 rounded-[10px] animate-pulse bg-white/15" />
      </div>
      <div className="flex flex-1 min-h-0 max-canvas-mobile:flex-col">
        <CanvasTabRailSkeleton />
        <div className="flex flex-1 min-h-0 flex-col bg-[var(--editor-canvas-bg)]">
          <div className="h-14 shrink-0 max-canvas-mobile:hidden" />
          <CanvasPageSkeleton aspectRatio={aspectRatio} />
          <div className="flex shrink-0 justify-end p-sm max-canvas-mobile:hidden">
            <div className="h-9 w-48 rounded-xl border border-[var(--editor-border)] bg-[var(--editor-surface)]/80" />
          </div>
        </div>
      </div>
    </div>
  );
}
