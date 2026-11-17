import { type ReactNode } from 'react';

import { cn } from '@/utils/cn';

/** Left padding that lines content under a row up with its text (30px mark + 16px gap). */
export const ROW_TEXT_INDENT = 'pl-[46px]';

interface SettingsListRowProps {
  /** Small icon or an initial, shown in a 30px rounded square. */
  mark: ReactNode;
  name: ReactNode;
  /** Muted second line under the name. */
  meta?: ReactNode;
  badge?: { label: ReactNode; tone?: 'primary' | 'neutral' };
  /** Let a long name wrap instead of truncating (free text such as memories). */
  wrapName?: boolean;
  /** Buttons and switches on the right; below the text on narrow screens. */
  actions?: ReactNode;
  /** Opens underneath the row (edit form, confirmation, folder browser). */
  children?: ReactNode;
  /** Passed to the `<li>`, e.g. `data-settings-id` for search. */
  id?: string;
}

// One flat list row: mark, text, optional badge, actions. Rows sit in a
// `<SettingsList>` (a `<ul>` with hairlines). Reference: the Antragsgrün rows.
export const SettingsListRow = ({
  mark,
  name,
  meta,
  badge,
  wrapName = false,
  actions,
  children,
  id,
}: SettingsListRowProps) => (
  <li data-settings-id={id} className="flex scroll-mt-4 flex-col gap-sm py-3">
    <div className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-x-md gap-y-sm sm:grid-cols-[30px_minmax(0,1fr)_auto]">
      <span
        aria-hidden
        className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg bg-primary-100 text-[13px] font-bold text-primary-700 dark:bg-primary-950 dark:text-primary-200"
      >
        {mark}
      </span>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-xs">
          <div
            className={cn(
              'min-w-0 text-sm text-foreground',
              wrapName ? '[overflow-wrap:anywhere]' : 'truncate'
            )}
          >
            {name}
          </div>
          {badge && (
            <span
              className={cn(
                'shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs',
                badge.tone === 'neutral'
                  ? 'bg-grey-100 text-grey-600 dark:bg-grey-800 dark:text-grey-300'
                  : 'bg-primary-100 text-primary-700 dark:bg-primary-950 dark:text-primary-200'
              )}
            >
              {badge.label}
            </span>
          )}
        </div>
        {meta && (
          <div className="mt-0.5 text-[13px] text-grey-600 dark:text-grey-400 [overflow-wrap:anywhere]">
            {meta}
          </div>
        )}
      </div>
      {actions && (
        <div className="col-start-2 flex flex-wrap items-center gap-xs sm:col-start-3">
          {actions}
        </div>
      )}
    </div>
    {children}
  </li>
);

interface SettingsListProps {
  children: ReactNode;
  /** Shown instead of the list when there are no rows; plain muted text. */
  empty?: ReactNode;
  isEmpty?: boolean;
}

export const SettingsList = ({ children, empty, isEmpty = false }: SettingsListProps) =>
  isEmpty ? (
    <p className="m-0 py-3 text-sm text-grey-600 dark:text-grey-400">{empty}</p>
  ) : (
    <ul className="m-0 list-none divide-y divide-grey-200 p-0 dark:divide-grey-800">{children}</ul>
  );

export default SettingsListRow;
