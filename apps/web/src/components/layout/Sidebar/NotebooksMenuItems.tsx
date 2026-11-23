import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@gruenerator/ui';
import { type MouseEvent, type ReactNode } from 'react';
import { PiBooks, PiNotebook, PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { OPEN_STATE, shelfEntryLink } from '../../../features/notebook/wissen/shelfLinks';
import { useNotebookShelves } from '../../../features/notebook/wissen/useNotebookShelves';

// Loaded with import() from NotebooksSidebarSection when the menu opens: the shelf
// model (notebook configs, marketplace, profile queries) must stay off the boot path.

const CREATE_PATH = '/notebooks/neu';

/**
 * Menu entry as a real link, so cmd/middle-click opens a new tab. A plain click
 * or Enter goes through the sidebar's navigation instead of the link's own.
 */
function LinkItem({
  to,
  title,
  state = null,
  onOpen,
  children,
}: {
  to: string;
  /** Tab title on the desktop app. */
  title: string;
  state?: typeof OPEN_STATE | null;
  onOpen: (path: string, title: string, state: typeof OPEN_STATE | null) => void;
  children: ReactNode;
}) {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    onOpen(to, title, state);
  };
  return (
    <DropdownMenuItem asChild>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- Link ist auf 'a' gemappt, jsx-a11y prüft dabei nur href statt to; Enter löst über das Menü denselben Klick aus */}
      <Link to={to} state={state} onClick={handleClick}>
        {children}
      </Link>
    </DropdownMenuItem>
  );
}

/**
 * The notebook groups of the menu. Its own component inside the menu content, which
 * Radix mounts only while the menu is open: the three shelf queries (one polls while
 * a notebook indexes, one answers guests with 401) must not run on every page.
 */
function NotebookShelfItems({
  isMobile,
  onOpen,
}: {
  isMobile: boolean;
  onOpen: (path: string, title: string, state: typeof OPEN_STATE | null) => void;
}) {
  // Own notebooks: the shelf has no flag, but `meta` stays null while they load.
  const { shelves } = useNotebookShelves();
  return shelves.map((shelf) => {
    if (shelf.kind === 'notebook')
      return (
        <LinkItem
          key={shelf.id}
          to={shelf.notebook.path}
          title={shelf.title}
          state={OPEN_STATE}
          onOpen={onOpen}
        >
          <PiNotebook className="size-4" />
          <span className="truncate">{shelf.title}</span>
        </LinkItem>
      );
    // No own notebook yet: "Neues Notebook" below covers it, a labelled entry would mislead.
    if (shelf.kind === 'create') return null;
    if (shelf.entries.length === 0)
      return shelf.meta === null ? (
        <div key={shelf.id} className="px-2 py-1.5 text-xs text-grey-500">
          {shelf.title} werden geladen…
        </div>
      ) : null;
    const items = shelf.entries.map((entry) => {
      const { title, to, state } = shelfEntryLink(entry);
      return (
        <LinkItem key={entry.key} to={to} title={title} state={state} onOpen={onOpen}>
          <span className="truncate">{title}</span>
        </LinkItem>
      );
    });
    // On a phone a side flyout would open past the screen edge: the group's
    // notebooks follow inline under their name instead.
    if (isMobile)
      return (
        <DropdownMenuGroup key={shelf.id}>
          <DropdownMenuLabel className="pt-3 text-xs font-semibold text-grey-500">
            {shelf.title}
          </DropdownMenuLabel>
          {items}
        </DropdownMenuGroup>
      );
    return (
      <DropdownMenuSub key={shelf.id}>
        <DropdownMenuSubTrigger>
          <PiNotebook className="size-4" />
          <span className="min-w-0 flex-1 truncate">{shelf.title}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-[60vh] w-64 overflow-y-auto">
          {items}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  });
}

export default function NotebooksMenuItems({
  isMobile,
  onOpen,
}: {
  isMobile: boolean;
  onOpen: (path: string, title: string, state: typeof OPEN_STATE | null) => void;
}) {
  return (
    <>
      <NotebookShelfItems isMobile={isMobile} onOpen={onOpen} />
      <DropdownMenuSeparator />
      <LinkItem to={CREATE_PATH} title="Neues Notebook" onOpen={onOpen}>
        <PiPlus className="size-4" />
        <span>Neues Notebook</span>
      </LinkItem>
      <LinkItem to="/wissen" title="Wissen" onOpen={onOpen}>
        <PiBooks className="size-4" />
        <span>Alle Notebooks</span>
      </LinkItem>
    </>
  );
}
