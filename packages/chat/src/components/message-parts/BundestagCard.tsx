'use client';

import { FileText, ExternalLink, Quote } from 'lucide-react';
import {
  dipSearchUrl,
  btpProtokollPdfUrl,
  type BundestagPayload,
  type BtDrucksache,
  type BtSpeech,
  type BtVorgang,
} from '@gruenerator/contracts';

import { BundestagEagleIcon } from './BundestagEagleIcon';

/**
 * Dedicated card for the `bundestag` intent — official DIP documents, plenary
 * speeches and legislative procedures served by the Bundestag Wrapped MCP.
 * Presentational only; the structured payload arrives on the `bundestag` SSE
 * event and is rehydrated from the persisted tool call on reload.
 */

const ACCENT = 'text-[var(--color-collection-bundestag)]';
const ACCENT_BG = 'bg-[var(--color-collection-bundestag-bg)]';

function metaLine(parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' · ');
}

/** Beratungsstand is free DIP text, not an enum — match loosely, default neutral. */
function verfahrensPill(beratungsstand: string | null): { label: string; className: string } {
  const s = (beratungsstand ?? '').toLowerCase();
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium';
  if (/verkünd|angenommen|verabschied|beschlossen/.test(s)) {
    return {
      label: beratungsstand ?? '',
      className: `${base} bg-green-500/15 text-green-700 dark:text-green-400`,
    };
  }
  if (/abgelehnt|zurückgezogen|erledigt|gescheitert/.test(s)) {
    return {
      label: beratungsstand ?? '',
      className: `${base} bg-red-500/15 text-red-700 dark:text-red-400`,
    };
  }
  if (/überwiesen|beratung|beraten|eingebracht|vorgelegt/.test(s)) {
    return {
      label: beratungsstand ?? '',
      className: `${base} bg-amber-500/15 text-amber-700 dark:text-amber-400`,
    };
  }
  return {
    label: beratungsstand ?? 'unbekannt',
    className: `${base} bg-foreground/10 text-foreground-muted`,
  };
}

function LinkChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs text-foreground transition-colors hover:border-primary/50 hover:bg-primary/10"
    >
      {children}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function DrucksacheRow({ d }: { d: BtDrucksache }) {
  const url = d.pdfUrl ?? dipSearchUrl(d.dokumentnummer || d.titel);
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-foreground/5 px-1.5 py-0.5 text-xs font-semibold text-foreground">
            Drucksache {d.dokumentnummer}
          </span>
          {d.drucksachetyp && (
            <span className="text-[11px] text-foreground-muted">{d.drucksachetyp}</span>
          )}
        </div>
        <div className="mt-0.5 truncate text-sm text-foreground">{d.titel}</div>
        <div className="text-[11px] text-foreground-muted">
          {metaLine([d.datum, d.urheber.length > 0 ? `Urheber: ${d.urheber.join(', ')}` : null])}
        </div>
      </div>
      <LinkChip href={url}>{d.pdfUrl ? 'PDF' : 'DIP'}</LinkChip>
    </div>
  );
}

function VorgangRow({ v }: { v: BtVorgang }) {
  const pill = verfahrensPill(v.beratungsstand);
  return (
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={pill.className}>{pill.label}</span>
        {v.vorgangstyp && (
          <span className="text-[11px] text-foreground-muted">{v.vorgangstyp}</span>
        )}
        {v.datum && <span className="text-[11px] text-foreground-muted">{v.datum}</span>}
      </div>
      <div className="mt-0.5 text-sm text-foreground">{v.titel}</div>
    </div>
  );
}

function SpeechItem({ s }: { s: BtSpeech }) {
  const pdf = btpProtokollPdfUrl(s.protokollNummer, s.herausgeber);
  const url = pdf ?? dipSearchUrl(s.topTitle ?? s.speaker);
  return (
    <div className="py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 text-xs text-foreground-muted">
        <span className="font-medium text-foreground">{s.speaker}</span>
        {s.party && <span>{s.party}</span>}
        {s.date && <span>{s.date}</span>}
      </div>
      <blockquote className="mt-1 flex gap-1.5 border-l-2 border-border pl-2 text-sm text-foreground">
        <Quote className="mt-0.5 h-3 w-3 shrink-0 text-foreground-muted" />
        <span className="italic">{s.excerpt}</span>
      </blockquote>
      <div className="mt-1">
        <LinkChip href={url}>
          {s.protokollNummer ? `Plenarprotokoll ${s.protokollNummer}` : 'DIP'}
        </LinkChip>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-foreground-muted">
      {children}
    </div>
  );
}

function cardTitle(data: BundestagPayload): string {
  if (data.kind === 'person' && data.person) {
    const p = data.person.person;
    return p.fraktion ? `${p.name} (${p.fraktion})` : p.name;
  }
  if (data.kind === 'document' && data.document) {
    return `Drucksache ${data.document.drucksache.dokumentnummer}`;
  }
  if (data.kind === 'topic') return 'Bundestag — Rechercheergebnisse';
  return 'Bundestag (DIP)';
}

export function BundestagCard({ data }: { data: BundestagPayload }) {
  return (
    <div
      className="my-2 w-full rounded-lg border border-border bg-background p-3"
      role="group"
      aria-label={`Bundestag: ${cardTitle(data)}`}
    >
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <span
          className={`flex size-7 shrink-0 items-center justify-center rounded-md ${ACCENT_BG} ${ACCENT}`}
        >
          <BundestagEagleIcon className="h-4 w-4" />
        </span>
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {cardTitle(data)}
        </span>
        <span className="ml-auto shrink-0 text-[11px] uppercase tracking-wide text-foreground-muted">
          Bundestag Wrapped · DIP
        </span>
      </div>

      {/* Person */}
      {data.kind === 'person' && data.person && (
        <div>
          {data.person.person.wahlperiode != null && (
            <div className="text-xs text-foreground-muted">
              MdB · Wahlperiode {data.person.person.wahlperiode}
            </div>
          )}
          {data.person.speeches.length > 0 && (
            <>
              <SectionLabel>Reden</SectionLabel>
              <div className="divide-y divide-border/60">
                {data.person.speeches.map((s, i) => (
                  <SpeechItem key={`${s.protokollNummer ?? 'p'}-${i}`} s={s} />
                ))}
              </div>
            </>
          )}
          {data.person.aktivitaeten.length > 0 && (
            <>
              <SectionLabel>Aktivitäten</SectionLabel>
              <ul className="space-y-0.5 text-sm text-foreground">
                {data.person.aktivitaeten.map((a, i) => (
                  <li key={`${a.dokumentnummer ?? 'a'}-${i}`}>
                    <span>{a.typ ? `${a.typ}: ` : ''}</span>
                    {a.titel}
                    <span className="text-[11px] text-foreground-muted">
                      {a.datum ? ` · ${a.datum}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {/* Document */}
      {data.kind === 'document' && data.document && (
        <div>
          <div className="divide-y divide-border/60">
            <DrucksacheRow d={data.document.drucksache} />
          </div>
          {data.document.vorgang && (
            <>
              <SectionLabel>Gesetzgebungsverfahren</SectionLabel>
              <VorgangRow v={data.document.vorgang} />
            </>
          )}
          {data.document.siblings.length > 0 && (
            <>
              <SectionLabel>Verwandte Drucksachen</SectionLabel>
              <div className="divide-y divide-border/60">
                {data.document.siblings.map((d) => (
                  <DrucksacheRow key={d.id} d={d} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Topic */}
      {data.kind === 'topic' && data.topic && (
        <div>
          {data.topic.hits.length > 0 && (
            <div className="divide-y divide-border/60">
              {data.topic.hits.map((h, i) => {
                const url = dipSearchUrl(h.dokumentnummer || h.title);
                return (
                  <div
                    key={`${h.docId}-${i}`}
                    className="flex items-start justify-between gap-3 py-1.5"
                  >
                    <div className="min-w-0">
                      <div className="text-[11px] text-foreground-muted">
                        {h.entityType ?? h.docType}
                      </div>
                      <div className="text-sm text-foreground">{h.title}</div>
                      {h.abstract && (
                        <div className="mt-0.5 line-clamp-2 text-xs text-foreground-muted">
                          {h.abstract}
                        </div>
                      )}
                    </div>
                    <LinkChip href={url}>DIP</LinkChip>
                  </div>
                );
              })}
            </div>
          )}
          {data.topic.speeches.length > 0 && (
            <>
              <SectionLabel>Reden</SectionLabel>
              <div className="divide-y divide-border/60">
                {data.topic.speeches.map((s, i) => (
                  <SpeechItem key={`${s.protokollNummer ?? 'p'}-${i}`} s={s} />
                ))}
              </div>
            </>
          )}
          {data.topic.documents.length > 0 && (
            <>
              <SectionLabel>Drucksachen</SectionLabel>
              <div className="divide-y divide-border/60">
                {data.topic.documents.map((d) => (
                  <DrucksacheRow key={d.id} d={d} />
                ))}
              </div>
            </>
          )}
          {data.topic.vorgaenge.length > 0 && (
            <>
              <SectionLabel>Gesetzgebungsverfahren</SectionLabel>
              <div className="divide-y divide-border/60">
                {data.topic.vorgaenge.map((v) => (
                  <VorgangRow key={v.id} v={v} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Empty */}
      {data.kind === 'none' && (
        <div className="flex items-center gap-1.5 text-sm text-foreground-muted">
          <FileText className="h-4 w-4" />
          Im DIP wurden zu dieser Anfrage keine passenden Dokumente, Reden oder Abgeordneten
          gefunden.
        </div>
      )}

      {/* Notes + source footer */}
      {data.notes.length > 0 && (
        <div className="mt-2 text-[11px] text-foreground-muted">{data.notes.join(' ')}</div>
      )}
      <div className="mt-2 border-t border-border/60 pt-1.5 text-[11px] text-foreground-muted">
        Quelle: Bundestag Wrapped — Dokumentations- und Informationssystem des Bundestags (DIP)
      </div>
    </div>
  );
}
