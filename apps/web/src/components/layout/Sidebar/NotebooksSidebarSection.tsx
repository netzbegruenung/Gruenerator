import { ChevronRight } from 'lucide-react';
import { type MouseEvent, type ReactNode, memo, useCallback, useState } from 'react';
import { PiBooks, PiNotebook, PiPlus } from 'react-icons/pi';
import { Link, useLocation } from 'react-router-dom';

import { type OPEN_STATE, shelfEntryLink } from '../../../features/notebook/wissen/shelfLinks';
import { useNotebookShelves } from '../../../features/notebook/wissen/useNotebookShelves';

import { cn } from '@/utils/cn';

const CREATE_PATH = '/notebooks/neu';
/** Like the chat list's `sidebar-threads-expanded`: the fold survives a reload. */
const EXPANDED_KEY = 'sidebar-notebooks-expanded';

type OpenFn = (path: string, title: string, state: typeof OPEN_STATE | null) => void;

// Same header and row look as the chat list below it (ChatThreadList / ThreadListItem).
const headerClass =
  'flex w-full items-center gap-1.5 px-3 py-1 text-xs font-medium text-grey-500 hover:text-foreground transition-colors';
const rowClass = (active: boolean) =>
  cn(
    'flex w-full min-h-[34px] items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm text-foreground no-underline transition-colors',
    'hover:bg-secondary-50 dark:hover:bg-secondary-800/40',
    active && 'bg-secondary-100 dark:bg-secondary-800/60 font-medium'
  );
const rowIconClass = 'size-4 shrink-0 text-grey-600 dark:text-white';

function readExpanded(): boolean {
  try {
    return localStorage.getItem(EXPANDED_KEY) === '1';
  } catch {
    return false;
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <ChevronRight
      className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-90')}
      aria-hidden="true"
    />
  );
}

/**
 * A real link, so cmd/middle-click opens a new tab. A plain click goes through
 * the sidebar's navigation (the desktop app's tab keeps its route and title).
 */
function RowLink({
  to,
  title,
  state = null,
  onOpen,
  children,
}: {
  to: string;
  title: string;
  state?: typeof OPEN_STATE | null;
  onOpen: OpenFn;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const active = pathname === to;
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(to, title, state);
  };
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Link ist auf 'a' gemappt, jsx-a11y prüft dabei nur href statt to; Enter löst auf dem Link denselben Klick aus
    <Link
      to={to}
      state={state}
      onClick={handleClick}
      className={rowClass(active)}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

/**
 * The open section's rows: the person's own notebooks. Its own component so the shelf queries (one polls
 * while a notebook indexes) run only while the section is unfolded.
 */
function NotebookRows({ onOpen }: { onOpen: OpenFn }) {
  const { shelves } = useNotebookShelves();
  // Only the person's own notebooks (own, shared with them, saved). Landesverbände,
  // Parlamente and the other system notebooks stay on /wissen ("Alle Notebooks").
  const mine = shelves.find((shelf) => shelf.id === 'meine');
  return (
    <>
      <RowLink to={CREATE_PATH} title="Neues Notebook" onOpen={onOpen}>
        <PiPlus aria-hidden="true" className={rowIconClass} />
        <span>Neues Notebook</span>
      </RowLink>
      {mine?.kind === 'group' && mine.entries.length === 0 && mine.meta === null && (
        <div className="px-3 py-1.5 text-xs text-grey-500">Notebooks werden geladen…</div>
      )}
      {mine?.kind === 'group' &&
        mine.entries.map((entry) => {
          const link = shelfEntryLink(entry);
          return (
            <RowLink key={entry.key} {...link} to={link.to} onOpen={onOpen}>
              <PiNotebook aria-hidden="true" className={rowIconClass} />
              <span className="truncate">{link.title}</span>
            </RowLink>
          );
        })}
      <RowLink to="/wissen" title="Wissen" onOpen={onOpen}>
        <PiBooks aria-hidden="true" className={rowIconClass} />
        <span>Alle Notebooks</span>
      </RowLink>
    </>
  );
}

/**
 * "Notebooks ›" above the chat list: folds open into the person's own notebooks.
 */
export const NotebooksSidebarSection = memo(function NotebooksSidebarSection({
  onNavigate,
}: {
  /** The sidebar's navigation: on the desktop app it also keeps the active tab's route and title. */
  onNavigate: OpenFn;
}) {
  const [expanded, setExpanded] = useState(readExpanded);
  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(EXPANDED_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  return (
    <div className="px-2 pt-2">
      <button type="button" onClick={toggle} aria-expanded={expanded} className={headerClass}>
        <span>Notebooks</span>
        <Chevron open={expanded} />
      </button>
      {expanded && <NotebookRows onOpen={onNavigate} />}
    </div>
  );
});
