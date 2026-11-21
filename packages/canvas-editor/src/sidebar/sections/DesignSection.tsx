/**
 * „Design" tab: the looks of a creator sharepic or carousel, switched without
 * the model — the Studio's options for a finished draft, now in the editor.
 * Navigation (arrow, dots, „2/5"), numbering, colour and the item styles
 * apply to the whole deck in one undo step; the host composes every page
 * afresh and keeps the hand edits that still fit (`CanvasDesignService`).
 */
import { useCanvasEditorServices } from '@ggraphic/editor/host-react';
import { Skeleton } from '@ggraphic/editor/internal/ui/skeleton';
import { cn } from '@ggraphic/editor/internal/utils/cn';
import { useAnnounce, type EditorTabSectionProps } from '@ggraphic/editor/shell';
import { useEffect, useState } from 'react';

import { deckPages } from '../../collab/sharepicSource';
import { designDeckOf } from '../../components/CanvasEditor/designTab';
import '../../grueneratorHostServices';

import type { SharepicTweak, SharepicTweakId } from '../../composer/sharepicTweaks';

const HEADING = 'text-[11px] font-semibold text-foreground-muted uppercase tracking-[0.8px] m-0';

const dropNote = (dropped: number) =>
  dropped === 1
    ? 'Eine Handänderung passte nicht zum neuen Design und wurde verworfen – „Rückgängig" holt sie zurück.'
    : `${dropped} Handänderungen passten nicht zum neuen Design und wurden verworfen – „Rückgängig" holt sie zurück.`;

export function DesignSection({ pages, deck }: EditorTabSectionProps) {
  const { design } = useCanvasEditorServices();
  const announce = useAnnounce();
  const deckId = designDeckOf(pages, deck.getActivePageId());
  const members = deckId ? deckPages(pages, deckId) : [];
  const choice = members[0]?.source.tweaks ?? {};
  // The options follow the deck's spec and choice, not every hand move.
  const key = deckId ? JSON.stringify([deckId, members.map((m) => m.source.slide), choice]) : null;

  const [loaded, setLoaded] = useState<{ key: string; tweaks: SharepicTweak[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!key || !deckId || !design) return;
    let live = true;
    design.options(deck.getPages(), deckId).then(
      (tweaks) => live && setLoaded({ key, tweaks }),
      () => live && setLoaded({ key, tweaks: [] })
    );
    return () => {
      live = false;
    };
  }, [key, deckId, design, deck]);

  if (!design) return null;
  if (!deckId) {
    return (
      <p className="m-0 p-3 text-[13px] text-foreground-muted">
        Design-Optionen gibt es für Sharepics und Karussells aus dem Sharepic-Creator.
      </p>
    );
  }
  // The last list stays up while a new one loads: no flicker after a pick.
  const tweaks = loaded?.tweaks ?? null;

  const pick = async (id: SharepicTweakId, value: string) => {
    setBusy(`${id}:${value}`);
    setStatus(null);
    try {
      const result = await design.apply(deck.getPages, deckId, { ...choice, [id]: value });
      if (!result) throw new Error('the deck is gone');
      deck.replaceDeck(result.ops);
      if (result.dropped > 0) {
        const text = dropNote(result.dropped);
        setStatus({ text, error: false });
        announce(text);
      }
    } catch {
      const text = 'Das Design ließ sich nicht ändern. Bitte versuche es noch einmal.';
      setStatus({ text, error: true });
      announce(text);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-5 p-3" aria-busy={busy !== null}>
      {tweaks === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : tweaks.length === 0 ? (
        <p className="m-0 text-[13px] text-foreground-muted">
          Für dieses Design gibt es keine weiteren Varianten.
        </p>
      ) : (
        tweaks.map((tweak) => (
          <section key={tweak.id} className="flex flex-col gap-2">
            <h3 id={`design-${tweak.id}`} className={HEADING}>
              {tweak.label}
            </h3>
            <div
              role="group"
              aria-labelledby={`design-${tweak.id}`}
              className="flex flex-wrap gap-2"
            >
              {tweak.options.map((option) => {
                const active = option.value === tweak.value;
                const pending = busy === `${tweak.id}:${option.value}`;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    disabled={option.disabled || busy !== null}
                    title={option.label}
                    onClick={() => {
                      if (!active) void pick(tweak.id, option.value);
                    }}
                    className={cn(
                      'inline-flex items-center gap-1.5 min-h-9 px-3 rounded-lg border text-[13px] cursor-pointer transition-colors duration-150',
                      'bg-editor-tile border-editor-border-strong text-editor-text-secondary hover:bg-editor-active-soft hover:border-editor-accent',
                      'disabled:cursor-not-allowed disabled:opacity-60',
                      active && 'bg-editor-active-bg border-editor-accent text-editor-active-fg',
                      pending && 'animate-pulse'
                    )}
                  >
                    {option.swatch && (
                      <span aria-hidden className="flex -space-x-1">
                        {option.swatch.map((hex) => (
                          <span
                            key={hex}
                            className="size-3.5 rounded-full border border-editor-border-strong"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </span>
                    )}
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}
      {status && (
        <p
          role={status.error ? 'alert' : 'status'}
          className={cn(
            'm-0 text-[13px]',
            status.error ? 'text-[var(--editor-danger-fg)]' : 'text-foreground-muted'
          )}
        >
          {status.text}
        </p>
      )}
    </div>
  );
}
