'use client';

import { memo, useMemo, useState } from 'react';
import { Newspaper, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface PressemitteilungExample {
  id: string;
  title: string;
  body: string;
  lv: string;
  sourceId?: string;
  publishedAt?: string;
  url?: string;
}

interface PressemitteilungExamplesCardProps {
  query: string;
  result: unknown;
}

const LV_LABELS: Record<string, string> = {
  BE: 'Berlin',
  'BE-F': 'Berlin (Fraktion)',
  HH: 'Hamburg',
  TH: 'Thüringen',
  MV: 'Meck-Pomm',
  BB: 'Brandenburg',
  BY: 'Bayern',
  SH: 'Schleswig-Holstein',
};

function lvLabel(lv: string): string {
  if (!lv) return 'Landesverband';
  return LV_LABELS[lv] ?? lv;
}

function formatDate(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const PressemitteilungExamplesCard = memo(function PressemitteilungExamplesCard({
  query,
  result,
}: PressemitteilungExamplesCardProps) {
  const examples = (getArray(result, 'examples') as PressemitteilungExample[] | null) ?? [];
  const message = getString(result, 'message');

  const [isExpanded, setIsExpanded] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);

  const lvSummary = useMemo(() => {
    const seen = new Set<string>();
    const labels: string[] = [];
    for (const ex of examples) {
      const label = lvLabel(ex.lv);
      if (seen.has(label)) continue;
      seen.add(label);
      labels.push(label);
    }
    return labels.join(' · ');
  }, [examples]);

  if (examples.length === 0) {
    return (
      <div className="border-section-border my-2 rounded-lg border bg-surface p-4">
        <div className="flex items-center gap-2 text-sm">
          <Newspaper className="text-secondary-700 h-4 w-4" />
          <span className="font-medium">Pressemitteilungen</span>
        </div>
        <p className="text-foreground-muted mt-2 text-xs">
          {message ?? 'Keine passenden Pressemitteilungen gefunden.'}
        </p>
      </div>
    );
  }

  return (
    <div className="border-section-border my-2 rounded-lg border bg-surface">
      <button
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        className="flex w-full items-center gap-2 rounded-t-lg p-4 text-left transition-colors hover:bg-hover-alt"
        aria-expanded={isExpanded}
      >
        <Newspaper className="text-secondary-700 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {examples.length} Pressemitteilung{examples.length === 1 ? '' : 'en'}
            {query ? ` zu „${query}“` : ''}
          </div>
          {lvSummary && (
            <div className="text-foreground-muted mt-0.5 truncate text-xs">{lvSummary}</div>
          )}
        </div>
        <span className="text-foreground-muted text-xs">{isExpanded ? 'Schließen' : 'Öffnen'}</span>
        <ChevronDown
          className={cn(
            'text-foreground-muted h-4 w-4 shrink-0 transition-transform',
            isExpanded && 'rotate-180'
          )}
        />
      </button>

      {isExpanded && (
        <ul className="border-section-border divide-section-border divide-y border-t">
          {examples.map((ex) => {
            const isOpen = openRow === ex.id;
            const date = formatDate(ex.publishedAt);
            return (
              <li key={ex.id} className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => setOpenRow(isOpen ? null : ex.id)}
                  className="flex w-full items-start gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  <ChevronRight
                    className={cn(
                      'text-foreground-muted mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform',
                      isOpen && 'rotate-90'
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide">
                        {lvLabel(ex.lv)}
                      </span>
                      {date && <span className="text-foreground-muted text-[0.7rem]">{date}</span>}
                    </div>
                    <div className="mt-1 text-sm font-medium leading-snug">{ex.title}</div>
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-3 pl-5">
                    <p className="text-foreground whitespace-pre-wrap text-sm leading-relaxed">
                      {ex.body}
                    </p>
                    {ex.url && (
                      <a
                        href={ex.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-600 hover:text-primary-700 mt-3 inline-flex items-center gap-1 text-xs"
                      >
                        Quelle öffnen
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

function getString(obj: unknown, key: string): string | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return typeof val === 'string' ? val : null;
  }
  return null;
}

function getArray(obj: unknown, key: string): unknown[] | null {
  if (obj && typeof obj === 'object' && key in obj) {
    const val = (obj as Record<string, unknown>)[key];
    return Array.isArray(val) ? val : null;
  }
  return null;
}
