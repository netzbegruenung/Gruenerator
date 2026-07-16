'use client';

import { CalendarDays, TrainFront } from 'lucide-react';
import { type BahnPayload, type BahnEntry } from '@gruenerator/contracts';

/**
 * Dedicated card for the `bahn` intent — a condensed Deutsche-Bahn departure
 * board (system MCP source, DB IRIS timetables). Presentational only; the
 * payload arrives on the `bahn` SSE event and is rehydrated from the persisted
 * tool step on reload. Visual language from the "Deutsche Bahn MCP Chat"
 * Claude-Design draft, mapped onto the chat theme tokens.
 */

const MAX_ROWS = 8;

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('de-DE', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function trainLabel(e: BahnEntry): string {
  return e.line ?? `${e.category} ${e.number}`.trim();
}

function EntryRow({ e }: { e: BahnEntry }) {
  const via = e.via.filter((v) => v !== e.destination);
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-12 shrink-0 text-center">
        <div className="text-base font-bold leading-none text-foreground">
          {e.departureTime ?? e.arrivalTime ?? '–'}
        </div>
        {(e.departurePlatform ?? e.arrivalPlatform) && (
          <div className="mt-0.5 text-[11px] text-foreground-muted">
            Gl. {e.departurePlatform ?? e.arrivalPlatform}
          </div>
        )}
      </div>
      <span className="shrink-0 rounded-md border border-border bg-foreground/5 px-1.5 py-0.5 text-[11px] font-semibold text-foreground">
        {trainLabel(e)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-foreground">{e.destination ?? '—'}</div>
        {via.length > 0 && (
          <div className="truncate text-[11px] text-foreground-muted">über {via.join(' · ')}</div>
        )}
      </div>
    </div>
  );
}

export function BahnCard({ data }: { data: BahnPayload }) {
  const date = formatDate(data.date);
  const shown = data.entries.slice(0, MAX_ROWS);
  const hidden = data.entries.length - shown.length;

  return (
    <div
      className="my-2 w-full rounded-lg border border-border bg-background p-3"
      role="group"
      aria-label={`Deutsche Bahn: Abfahrten ${data.station}`}
    >
      {/* Header */}
      <div className="mb-1 flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-[#EC0016] text-[11px] font-extrabold tracking-tight text-white">
          DB
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {data.station}
          {data.hour ? ` · Abfahrten ab ${data.hour} Uhr` : ' · Abfahrten'}
        </span>
        {date && (
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] text-foreground-muted">
            <CalendarDays className="h-3 w-3" />
            {date}
          </span>
        )}
      </div>

      {/* Departures */}
      {shown.length > 0 ? (
        <div className="divide-y divide-border/60">
          {shown.map((e) => (
            <EntryRow key={e.id} e={e} />
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-1.5 py-2 text-sm text-foreground-muted">
          <TrainFront className="h-4 w-4" />
          Keine Züge im abgefragten Zeitfenster gefunden.
        </div>
      )}
      {hidden > 0 && (
        <div className="pt-1 text-[11px] text-foreground-muted">+ {hidden} weitere Züge</div>
      )}

      {/* Source footer */}
      <div className="mt-2 border-t border-border/60 pt-1.5 text-[11px] text-foreground-muted">
        Quelle: Deutsche Bahn (IRIS-Fahrplandaten) · Sollzeiten ohne Gewähr
      </div>
    </div>
  );
}
