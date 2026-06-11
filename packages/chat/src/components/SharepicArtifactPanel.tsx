'use client';

import { useMemo } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@gruenerator/ui';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Loader2,
  Pencil,
  SquarePen,
  X,
} from 'lucide-react';

import { useSharepicArtifact } from '../hooks/useSharepicArtifact';
import { useSharepicLiveStore, type ActiveSharepic } from '../stores/sharepicLiveStore';

import type { SharepicVariant } from '../hooks/useChatGraphStream';

/**
 * Docked right-rail artifact view of the sharepic the user marked "active for
 * chat editing". While the inline card scrolls away during an iterative edit
 * session, this panel keeps the artifact pinned — the chat becomes the command
 * line. Renders nothing while no variant is active; hosts decide where (and at
 * which breakpoint) to dock it.
 */
export function SharepicArtifactPanel({ className }: { className?: string }) {
  const active = useSharepicLiveStore((s) => s.activeVariant);
  if (!active) return null;
  // Key by variant so stepper/preview state never leaks across sharepics.
  return <PanelInner key={active.variantId} active={active} className={className} />;
}

function PanelInner({ active, className }: { active: ActiveSharepic; className?: string }) {
  const variant = useMemo<SharepicVariant>(
    () => ({
      id: active.variantId,
      canvasType: active.canvasType,
      initialProps: active.initialProps,
      ...(active.label ? { label: active.label } : {}),
      ...(active.canvasId ? { canvasId: active.canvasId } : {}),
    }),
    [active]
  );

  const {
    imageBase64,
    isRendering,
    renderError,
    headVersion,
    viewVersion,
    showStepper,
    label,
    stepToVersion,
    restoreViewVersion,
    download,
    openInStudio,
  } = useSharepicArtifact(variant);

  const close = () => useSharepicLiveStore.getState().setActiveVariant(null);

  return (
    <aside
      className={
        className ??
        'flex w-[24rem] shrink-0 flex-col overflow-hidden border-l border-border bg-background-alt'
      }
      aria-label={`Aktives Sharepic: ${label}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-white">
            <SquarePen className="h-3 w-3" />
            Sharepic-Modus
          </span>
          <span className="truncate text-sm font-medium text-foreground">{label}</span>
        </div>
        <button
          onClick={close}
          className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
          aria-label="Sharepic-Modus beenden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {renderError ? (
          <div className="rounded-lg border border-border p-4 text-sm text-foreground-muted">
            Sharepic-Vorschau konnte nicht gerendert werden.
            <button onClick={openInStudio} className="ml-2 text-primary hover:underline">
              Im Editor öffnen
            </button>
          </div>
        ) : (
          <div className="group/panelimg relative overflow-hidden rounded-lg border border-border bg-background">
            {isRendering && !imageBase64 && (
              <div className="flex h-72 items-center justify-center">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-foreground-muted" />
                  <span className="text-xs text-foreground-muted">Rendere {label}...</span>
                </div>
              </div>
            )}
            {imageBase64 && (
              <img
                src={imageBase64}
                alt={`${label}-Sharepic`}
                className={
                  isRendering
                    ? 'mx-auto w-full opacity-50 transition-opacity'
                    : 'mx-auto w-full opacity-100 transition-opacity'
                }
              />
            )}
            {imageBase64 && !isRendering && (
              <div className="absolute inset-0 flex items-center justify-center gap-3 bg-black/0 opacity-0 transition-opacity group-hover/panelimg:bg-black/30 group-hover/panelimg:opacity-100 focus-within:bg-black/30 focus-within:opacity-100">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      className="flex size-11 items-center justify-center rounded-full bg-white text-grey-900 shadow-lg transition-transform hover:scale-105"
                      aria-label="Sharepic im Studio bearbeiten"
                    >
                      <Pencil className="h-5 w-5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Im Studio öffnen?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Das Sharepic öffnet sich im Studio-Editor in einem neuen Tab. Änderungen
                        bleiben synchron — du kannst danach hier im Chat weiterarbeiten.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                      <AlertDialogAction onClick={openInStudio}>Im Studio öffnen</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                <button
                  onClick={download}
                  className="flex size-11 items-center justify-center rounded-full bg-white text-grey-900 shadow-lg transition-transform hover:scale-105"
                  aria-label="Sharepic herunterladen"
                >
                  <Download className="h-5 w-5" />
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {showStepper ? (
            <span className="inline-flex items-center gap-0.5 text-xs text-foreground-muted">
              <button
                onClick={() => void stepToVersion(-1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Vorherige Version anzeigen"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              v{viewVersion ?? headVersion}/{headVersion}
              <button
                onClick={() => void stepToVersion(1)}
                className="rounded p-0.5 hover:bg-primary/10 hover:text-foreground"
                aria-label="Nächste Version anzeigen"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </span>
          ) : (
            <span />
          )}
          {viewVersion != null && (
            <button
              onClick={() => void restoreViewVersion()}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-primary hover:bg-primary/10"
              aria-label={`Version ${viewVersion} wiederherstellen`}
            >
              <History className="h-3.5 w-3.5" />
              <span>Wiederherstellen</span>
            </button>
          )}
        </div>

        <p className="text-xs text-foreground-muted">
          Beschreibe Änderungen einfach im Chat — sie landen direkt auf diesem Sharepic.
        </p>
      </div>
    </aside>
  );
}
