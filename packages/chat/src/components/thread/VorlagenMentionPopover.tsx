'use client';

import { sharepicVorlageThumbPath, type SharepicVorlage } from '@gruenerator/contracts';
import { useEffect, useMemo, useState } from 'react';

import { useSharepicVorlagenQuery } from '../../hooks/useMentionablesQuery';

import { MentionFloatingPanel } from './MentionFloatingPanel';

interface VorlagenMentionPopoverProps {
  visible: boolean;
  onSelect: (vorlage: SharepicVorlage) => void;
  onDismiss: () => void;
}

export function VorlagenMentionPopover({
  visible,
  onSelect,
  onDismiss,
}: VorlagenMentionPopoverProps) {
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!visible) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets panel state on close (visibility transition), not a render-derived value
      setFilter('');
    }
  }, [visible]);

  const { data, isLoading, isError } = useSharepicVorlagenQuery(visible);
  const vorlagen = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter(
      (v) => v.titel.toLowerCase().includes(q) || v.beschreibung.toLowerCase().includes(q)
    );
  }, [data, filter]);

  return (
    <MentionFloatingPanel
      open={visible}
      onDismiss={onDismiss}
      width="w-[360px]"
      role="dialog"
      ariaLabel="Sharepic-Vorlage auswählen"
    >
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- Escape-only capture inside the already-labeled dialog panel above, not new interactive semantics. */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onDismiss();
          }
        }}
      >
        <div className="border-b border-border px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-foreground-muted/70">
            Sharepic-Vorlage
          </span>
          <div className="mt-2">
            <input
              type="text"
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Vorlagen filtern…"
              className="w-full rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-primary/40"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">Lade Vorlagen…</div>
          ) : isError ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">
              Fehler beim Laden der Vorlagen.
            </div>
          ) : vorlagen.length === 0 ? (
            <div className="px-3 py-4 text-sm text-foreground-muted">Keine Vorlagen gefunden.</div>
          ) : (
            vorlagen.map((vorlage) => (
              <button
                key={vorlage.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelect(vorlage);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm text-foreground-muted transition-colors hover:bg-primary/5"
              >
                <VorlageThumb vorlage={vorlage} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium text-foreground">{vorlage.titel}</span>
                  <span className="line-clamp-2 text-xs">{vorlage.beschreibung}</span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </MentionFloatingPanel>
  );
}

function VorlageThumb({ vorlage }: { vorlage: SharepicVorlage }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="flex h-14 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
      {failed ? (
        <span aria-hidden className="text-base">
          📋
        </span>
      ) : (
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onError reacts to a failed image load, not a user interaction.
        <img
          src={sharepicVorlageThumbPath(vorlage.id, 1, vorlage.thumbVersion)}
          alt=""
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}
