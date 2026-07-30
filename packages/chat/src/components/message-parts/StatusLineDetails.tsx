'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { CitationList } from '../tool-ui/citation';

import type { SerializableCitation } from '../tool-ui/citation/schema';

interface StatusLineDetailsProps {
  /** The shimmering label element — rendered as-is, never restyled here. */
  children: ReactNode;
  /** The model's thinking so far, if the turn produced any. */
  reasoningText: string | null;
  /** What the retrieval steps have found so far. */
  sources: ReadonlyArray<SerializableCitation>;
}

/**
 * The status line's dropdown. Adds a chevron NEXT to the shimmering label (not
 * around it): the label lives inside Progress{Tracker,Indicator}, which render
 * block markup a `<button>` may not legally contain, and wrapping it would also
 * make the whole line a click target while it is still shimmering past.
 *
 * Both panels are stream-only by design — reasoning is never persisted, and the
 * sources reappear in the message's Quellen-Liste — so the affordance dies with
 * the line the moment the answer text starts. That is the decided behaviour, not
 * an oversight.
 */
export function StatusLineDetails({ children, reasoningText, sources }: StatusLineDetailsProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!reasoningText && sources.length === 0) return <>{children}</>;

  return (
    <div>
      <div className="flex items-center gap-1">
        {children}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={open ? 'Details ausblenden' : 'Details anzeigen'}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-foreground-muted transition-colors hover:bg-primary/10 hover:text-foreground"
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {open && (
        <div id={panelId} className="mt-1 ml-2 space-y-3 border-l-2 border-primary/20 pl-3">
          {reasoningText && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-foreground-muted">
                Grünerators Gedanken
              </p>
              {/* Bottom-anchored while it grows: a live reasoning stream should
                  show its newest sentence, not scroll away from the reader. */}
              <div className="flex max-h-48 flex-col-reverse overflow-y-auto overflow-x-hidden">
                <p className="whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground-muted">
                  {reasoningText}
                </p>
              </div>
            </div>
          )}

          {sources.length > 0 && (
            <div>
              <p className="mb-1 text-[11px] font-medium text-foreground-muted">
                Gefundene Quellen ({sources.length})
              </p>
              <CitationList
                id="status-line-sources"
                citations={sources as SerializableCitation[]}
                variant="default"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
