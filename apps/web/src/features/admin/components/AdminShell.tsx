import { cn } from '@gruenerator/ui';
import { type ComponentType, type ReactNode } from 'react';
import { type IconType } from 'react-icons';
import { NavLink } from 'react-router-dom';

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

/**
 * Seitenleiste plus Inhalt für jede Admin-Fläche. Unter `md` wird die
 * Navigation zu einer umbrechenden Reihe über dem Inhalt — keine zweite
 * Bauform, nur eine andere Anordnung derselben Links.
 */
export default function AdminShell({ heading, nav, navLabel, children }: AdminShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-lg px-md pt-sm pb-xl md:flex-row md:gap-xl md:px-lg">
      <nav
        aria-label={navLabel}
        className="flex shrink-0 flex-col gap-md md:sticky md:top-16 md:w-60 md:self-start"
      >
        <div className="px-2.5">{heading}</div>
        {nav.map((group) => (
          <div key={group.key} className="flex flex-col">
            {group.label && (
              <h2
                id={`admin-nav-${group.key}`}
                className="m-0 px-2.5 pb-1 text-xs font-semibold tracking-wide text-grey-600 uppercase dark:text-grey-400"
              >
                {group.label}
              </h2>
            )}
            <ul
              aria-labelledby={group.label ? `admin-nav-${group.key}` : undefined}
              className="m-0 flex list-none flex-wrap gap-px p-0 md:flex-col md:flex-nowrap"
            >
              {group.items.map(({ to, label, icon: Icon, end, active, badge: Badge }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    className={({ isActive }) => {
                      const on = active ?? isActive;
                      return cn(
                        'flex min-h-11 items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-foreground no-underline transition-colors hover:bg-hover-alt md:min-h-9',
                        on && 'bg-grey-100 font-semibold text-foreground-heading dark:bg-grey-800'
                      );
                    }}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon size={16} className="shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1">{label}</span>
                    {Badge && <Badge />}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-lg">{children}</div>
    </div>
  );
}
