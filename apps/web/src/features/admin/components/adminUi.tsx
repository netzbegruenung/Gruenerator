import { cn } from '@gruenerator/ui';
import { type ReactNode } from 'react';

/**
 * Die Bausteine, aus denen jede Admin-Seite besteht. Sie halten die Seiten
 * gleich gebaut: eine Kopfzeile, darunter Flächen mit Rahmen. Bewusst ohne
 * Grüntönung im Grund — Grün bleibt Knöpfen, Links und Zahlen vorbehalten.
 */

interface AdminPageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Rechts neben dem Titel, z. B. ein Umschalter oder ein Knopf. */
  actions?: ReactNode;
}

export function AdminPageHeader({ title, description, actions }: AdminPageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-md">
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
        <h1 className="m-0 font-[Raleway] text-2xl font-bold text-foreground-heading md:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="m-0 max-w-[72ch] text-[15px] text-grey-600 dark:text-grey-400">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-sm">{actions}</div>}
    </header>
  );
}

interface AdminPanelProps {
  title?: string;
  description?: ReactNode;
  /** Rechts in der Kopfzeile der Fläche: eine Zahl, ein Link, ein Knopf. */
  aside?: ReactNode;
  /** `flush` lässt den Inhalt bis an den Rand laufen (Tabellen, Listen). */
  flush?: boolean;
  className?: string;
  children: ReactNode;
}

export function AdminPanel({
  title,
  description,
  aside,
  flush = false,
  className,
  children,
}: AdminPanelProps) {
  const hasHead = Boolean(title || aside);
  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-xl border border-grey-200 bg-background dark:border-grey-800',
        className
      )}
    >
      {hasHead && (
        <div className="flex flex-wrap items-baseline gap-sm px-md pt-md">
          {title && (
            <h2 className="m-0 font-[Raleway] text-base font-bold text-foreground-heading">
              {title}
            </h2>
          )}
          {aside && <div className="ml-auto flex items-center gap-xs text-sm">{aside}</div>}
        </div>
      )}
      {description && (
        <p className="m-0 max-w-[72ch] px-md pt-1 text-[13px] text-grey-600 dark:text-grey-400">
          {description}
        </p>
      )}
      <div className={cn(flush ? (hasHead || description ? 'pt-sm' : '') : 'p-md')}>{children}</div>
    </section>
  );
}

interface AdminStatProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}

export function AdminStat({ label, value, hint }: AdminStatProps) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 bg-background px-md py-sm">
      <span className="text-[13px] text-grey-600 dark:text-grey-400">{label}</span>
      <span className="font-[Raleway] text-[26px] font-bold leading-tight text-foreground-heading tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-grey-600 dark:text-grey-400">{hint}</span>}
    </div>
  );
}

/** Kacheln mit Haarlinien dazwischen — eine Zeile Kennzahlen. */
export function AdminStatGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-px overflow-hidden rounded-xl border border-grey-200 bg-grey-200 dark:border-grey-800 dark:bg-grey-800">
      {children}
    </div>
  );
}

export function AdminEmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-xl border border-dashed border-grey-300 px-md py-lg text-center text-sm text-grey-600 dark:border-grey-700 dark:text-grey-400">
      {children}
    </p>
  );
}
