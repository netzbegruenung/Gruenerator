import { Button, Input } from '@gruenerator/ui';
import { useState } from 'react';
import { HiSearch } from 'react-icons/hi';

import type { ReactNode } from 'react';

/**
 * Lupe, die zum Suchfeld aufklappt. Das Feld überlagert die Icons links von
 * ihr; zu geht es mit Escape (leert) oder beim Verlassen, wenn es leer ist.
 */
export function HubSearch({
  query,
  onQuery,
  placeholder,
}: {
  query: string;
  onQuery: (next: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);

  if (!open && !query) {
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Suchen"
        title="Suchen"
        className="text-grey-500"
        onClick={() => setOpen(true)}
      >
        <HiSearch aria-hidden className="size-[18px]" />
      </Button>
    );
  }

  return (
    <>
      <div className="absolute top-0 right-[calc(100%-2.25rem)] z-10 w-[clamp(11.25rem,30vw,17.5rem)] bg-background">
        <Input
          type="search"
          autoFocus
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onBlur={() => !query && setOpen(false)}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            onQuery('');
            setOpen(false);
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-9"
        />
      </div>
      <span aria-hidden className="size-9 shrink-0" />
    </>
  );
}

export function EmptySources({
  icon,
  title,
  text,
  cta,
  onCta,
}: {
  icon: ReactNode;
  title: ReactNode;
  text: string;
  cta?: string;
  onCta?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-sm rounded-xl border border-dashed border-grey-300 px-lg py-2xl text-center dark:border-grey-700">
      <span
        aria-hidden
        className="inline-flex size-11 items-center justify-center rounded-xl bg-background-alt text-grey-500"
      >
        {icon}
      </span>
      <strong className="text-base">{title}</strong>
      <p className="m-0 max-w-[25rem] text-sm text-pretty text-grey-500">{text}</p>
      {cta && onCta ? (
        <Button variant="outline" size="sm" onClick={onCta}>
          {cta}
        </Button>
      ) : null}
    </div>
  );
}

export function NoMatches({ query }: { query: string }) {
  return (
    <div className="rounded-lg border border-grey-200 px-md py-xl text-center text-sm text-grey-500 dark:border-grey-700">
      Keine Quelle passt zu „{query}“.
    </div>
  );
}

export function filterByTitle<T extends { title: string }>(rows: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  return q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
}
