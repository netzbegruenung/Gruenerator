import { Button, Input } from '@gruenerator/ui';

import type { ReactNode } from 'react';

export function SearchRow({
  query,
  onQuery,
  placeholder,
  action,
}: {
  query: string;
  onQuery: (next: string) => void;
  placeholder: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-xs">
      <Input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-9 min-w-0 flex-[1_1_12.5rem]"
      />
      {action}
    </div>
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
