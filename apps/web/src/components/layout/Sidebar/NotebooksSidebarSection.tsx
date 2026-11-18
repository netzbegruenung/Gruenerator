import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import {
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
  memo,
  useCallback,
  useState,
} from 'react';
import { PiBooks, PiNotebook, PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { OPEN_STATE, shelfEntryLink } from '../../../features/notebook/wissen/NotebookShelf';
import { useNotebookShelves } from '../../../features/notebook/wissen/useNotebookShelves';

import { iconClass, menuLinkClass } from './sidebarStyles';

const CREATE_PATH = '/notebooks/neu';

interface NotebooksSidebarSectionProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  /** The sidebar's navigation: on the desktop app it also keeps the active tab's route and title. */
  onNavigate: (path: string, title: string, state: typeof OPEN_STATE | null) => void;
}

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
 * "Notebooks" entry in the sidebar nav rail: a popup with the same groups as on
 * /wissen (own notebooks, Landesverbände, Parlamente …). A group opens its
 * notebooks as a submenu, a single notebook opens directly.
 */
export const NotebooksSidebarSection = memo(function NotebooksSidebarSection({
  openRef,
  titleClass,
  collapsed,
  onNavigate,
}: NotebooksSidebarSectionProps) {
  const isMobile = useIsMobile();
  const { shelves } = useNotebookShelves();
  // Own notebooks: the shelf has no flag, but `meta` stays null while they load.
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      // Synchronous, like Projekte: the sidebar's hover-collapse guard reads it in the same tick.
      openRef.current = isOpen;
    },
    [openRef]
  );

  const openEntry = useCallback(
    (path: string, title: string, state: typeof OPEN_STATE | null) => {
      // The prevented click keeps Radix from closing the menu itself.
      handleOpenChange(false);
      onNavigate(path, title, state);
    },
    [handleOpenChange, onNavigate]
  );

  return (
    <div className="flex flex-col gap-0 p-0">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button className={menuLinkClass(false, false, collapsed)} type="button">
            <PiBooks aria-hidden="true" className={iconClass} />
            <span className={titleClass}>Notebooks</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? 'bottom' : 'right'}
          align="start"
          sideOffset={8}
          collisionPadding={8}
          className="max-h-[min(70vh,var(--radix-dropdown-menu-content-available-height))] w-72 max-w-[calc(100vw-1rem)] overflow-y-auto bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl"
        >
          <DropdownMenuLabel>Notebooks</DropdownMenuLabel>
          {shelves.map((shelf) => {
            if (shelf.kind === 'notebook')
              return (
                <LinkItem
                  key={shelf.id}
                  to={shelf.notebook.path}
                  title={shelf.title}
                  state={OPEN_STATE}
                  onOpen={openEntry}
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
                <LinkItem key={entry.key} to={to} title={title} state={state} onOpen={openEntry}>
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
          })}
          <DropdownMenuSeparator />
          <LinkItem to={CREATE_PATH} title="Neues Notebook" onOpen={openEntry}>
            <PiPlus className="size-4" />
            <span>Neues Notebook</span>
          </LinkItem>
          <LinkItem to="/wissen" title="Wissen" onOpen={openEntry}>
            <PiBooks className="size-4" />
            <span>Alle Notebooks</span>
          </LinkItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
