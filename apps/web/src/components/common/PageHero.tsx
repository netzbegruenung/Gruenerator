import { Button, Input } from '@gruenerator/ui';
import { useState } from 'react';
import { HiSearch } from 'react-icons/hi';

import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

export function PageShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="flex w-full justify-center px-[clamp(1rem,4vw,2.5rem)] pt-[clamp(1rem,4vw,2rem)] pb-14 max-md:pt-14">
      <div className={cn('flex w-full min-w-0 flex-col gap-md', !wide && 'max-w-[65rem]')}>
        {children}
      </div>
    </div>
  );
}

interface PageHeroProps {
  title: ReactNode;
  description?: ReactNode;
  /** Icon-Leiste rechts neben dem Titel. */
  toolbar?: ReactNode;
  /** Links in der zweiten Zeile, z. B. Labels. */
  meta?: ReactNode;
  /** Rechts in der zweiten Zeile, z. B. „+ Dateien hochladen". */
  actions?: ReactNode;
  introClassName?: string;
}

export function PageHero({
  title,
  description,
  toolbar,
  meta,
  actions,
  introClassName,
}: PageHeroProps) {
  return (
    <div className="flex flex-col gap-sm">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-md gap-y-1">
        <h1
          className={cn(
            'm-0 text-[clamp(1.375rem,3vw,1.75rem)] leading-tight font-bold text-balance text-foreground-heading',
            introClassName
          )}
        >
          {title}
        </h1>
        {toolbar ? (
          <div className="relative flex shrink-0 items-center gap-1 text-grey-500">{toolbar}</div>
        ) : null}
        {description !== undefined ? (
          <div className={cn('col-span-full max-w-[40rem]', introClassName)}>{description}</div>
        ) : null}
      </div>

      {meta || actions ? (
        <div className="flex flex-wrap items-center justify-between gap-xs">
          {meta ?? <span />}
          {actions ? <div className="flex items-center gap-xs">{actions}</div> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Lupe, die zum Suchfeld aufklappt. Das Feld überlagert die Icons links von
 * ihr; zu geht es mit Escape (leert) oder beim Verlassen, wenn es leer ist.
 */
export function PageHeroSearch({
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
