import { Button, LoadingSection } from '@gruenerator/ui';
import { type JSX } from 'react';
import { Link } from 'react-router-dom';

/** How an own item stands today, shown next to it in the list. */
export type OwnItemBadge = 'private' | 'project' | 'public' | 'review';

const BADGE_LABEL: Record<OwnItemBadge, string> = {
  private: 'Privat',
  project: 'Projekt',
  public: 'Öffentlich',
  review: 'In Prüfung',
};

export interface OwnItem<T> {
  key: string;
  title: string;
  description: string | null;
  badge: OwnItemBadge | null;
  value: T;
}

export interface OwnItemPickerProps<T> {
  items: readonly OwnItem<T>[];
  loading: boolean;
  error: boolean;
  onSelect: (item: OwnItem<T>) => void;
  /** The kind in the plural, for the empty state („Du hast noch keine Agents."). */
  pluralLabel: string;
  /** Where this kind is made — creating happens there, not here. */
  create: { href: string; label: string };
}

/** Step ② of „Element hinzufügen": the person's own items of one kind. */
export function OwnItemPicker<T>({
  items,
  loading,
  error,
  onSelect,
  pluralLabel,
  create,
}: OwnItemPickerProps<T>): JSX.Element {
  if (loading) {
    return <LoadingSection role="status" label="Wird geladen …" />;
  }
  if (error) {
    return (
      <p role="alert" className="m-0 text-sm text-grey-500">
        Deine {pluralLabel} konnten nicht geladen werden.
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-start gap-sm">
        <p className="m-0 text-sm text-grey-500 dark:text-grey-400">
          Du hast noch keine {pluralLabel}.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to={create.href}>{create.label}</Link>
        </Button>
      </div>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-xs p-0">
      {items.map((item) => {
        return (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="flex w-full items-center justify-between gap-sm rounded-lg border border-grey-200 p-md text-left transition-colors hover:border-grey-300 hover:bg-background-alt dark:border-grey-700"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm font-medium text-foreground">{item.title}</span>
                {item.description ? (
                  <span className="truncate text-xs text-grey-500 dark:text-grey-400">
                    {item.description}
                  </span>
                ) : null}
              </span>
              {item.badge ? (
                <span className="shrink-0 rounded-full bg-grey-100 px-sm py-0.5 text-xs text-grey-700 dark:bg-grey-800 dark:text-grey-300">
                  {BADGE_LABEL[item.badge]}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
