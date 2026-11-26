import { cn } from '@gruenerator/ui';
import { type ComponentType, type ReactNode, useId, useState } from 'react';
import { type IconType } from 'react-icons';
import { FiChevronDown } from 'react-icons/fi';
import { matchPath, NavLink, useLocation } from 'react-router-dom';

export interface AdminNavItem {
  to: string;
  label: string;
  icon: IconType;
  /** Nur bei exakter Übereinstimmung aktiv (der Überblick unter `/admin`). */
  end?: boolean;
  /** Überschreibt den Aktiv-Zustand des Links, wenn eine URL zwei Einträge bedienen kann. */
  active?: boolean;
  badge?: ComponentType;
}

export interface AdminNavGroup {
  key: string;
  label?: string;
  items: AdminNavItem[];
}

interface AdminShellProps {
  /** Kopf der Navigation: Bereichsname, darunter z. B. Instanz oder Umschalter. */
  heading: ReactNode;
  nav: AdminNavGroup[];
  navLabel: string;
  children: ReactNode;
}

function isItemActive(item: AdminNavItem, pathname: string): boolean {
  if (item.active !== undefined) return item.active;
  return matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null;
}

/**
 * Seitenleiste plus Inhalt für jede Admin-Fläche. Unter `md` klappt die
 * Navigation hinter einen Knopf, der den aktuellen Bereich nennt — dieselben
 * Links, nur zugeklappt, damit der Inhalt nicht unter einer langen Liste steht.
 */
export default function AdminShell({ heading, nav, navLabel, children }: AdminShellProps) {
  const { pathname } = useLocation();
  // Offen gilt nur für den Pfad, auf dem aufgeklappt wurde: ein Klick auf
  // einen Eintrag wechselt den Pfad und klappt die Liste damit wieder zu.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const listId = useId();

  const current = nav.flatMap((group) => group.items).find((item) => isItemActive(item, pathname));
  const CurrentIcon = current?.icon;

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-lg px-md pt-sm pb-xl md:flex-row md:gap-xl md:px-lg">
      <nav
        aria-label={navLabel}
        className="flex shrink-0 flex-col gap-sm md:sticky md:top-16 md:max-h-[calc(100dvh-5rem)] md:w-60 md:gap-md md:self-start md:overflow-y-auto"
      >
        <div className="px-2.5 max-md:pl-12">{heading}</div>

        <button
          type="button"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpenAt(open ? null : pathname)}
          className="flex min-h-11 w-full items-center gap-2.5 rounded-lg border border-grey-200 bg-background px-3 text-left text-sm font-semibold text-foreground-heading md:hidden dark:border-grey-800"
        >
          {CurrentIcon && <CurrentIcon size={16} className="shrink-0" aria-hidden />}
          <span className="min-w-0 flex-1 truncate">{current?.label ?? 'Bereich wählen'}</span>
          <span className="text-xs font-normal text-grey-600 dark:text-grey-400">
            {open ? 'Schließen' : 'Bereiche'}
          </span>
          <FiChevronDown
            size={16}
            aria-hidden
            className={cn('shrink-0 transition-transform', open && 'rotate-180')}
          />
        </button>

        <div
          id={listId}
          className={cn(
            'flex-col gap-md max-md:rounded-lg max-md:border max-md:border-grey-200 max-md:p-1.5 max-md:dark:border-grey-800',
            open ? 'flex' : 'hidden md:flex'
          )}
        >
          {nav.map((group) => (
            <div key={group.key} className="flex flex-col">
              {group.label && (
                <h2
                  id={`admin-nav-${group.key}`}
                  className="m-0 px-2.5 pt-1 pb-1 text-xs font-semibold tracking-wide text-grey-600 uppercase dark:text-grey-400"
                >
                  {group.label}
                </h2>
              )}
              <ul
                aria-labelledby={group.label ? `admin-nav-${group.key}` : undefined}
                className="m-0 flex list-none flex-col gap-px p-0"
              >
                {group.items.map((item) => {
                  const { to, label, icon: Icon, end, badge: Badge } = item;
                  const on = isItemActive(item, pathname);
                  return (
                    <li key={to}>
                      <NavLink
                        to={to}
                        end={end}
                        className={cn(
                          'flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground no-underline transition-colors hover:bg-hover-alt md:min-h-9',
                          on && 'bg-grey-100 font-semibold text-foreground-heading dark:bg-grey-800'
                        )}
                        aria-current={on ? 'page' : false}
                      >
                        <Icon size={16} className="shrink-0" aria-hidden />
                        <span className="min-w-0 flex-1">{label}</span>
                        {Badge && <Badge />}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-lg">{children}</div>
    </div>
  );
}
