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
import { type MutableRefObject, memo, useCallback, useState } from 'react';
import { PiBooks, PiNotebook, PiPlus } from 'react-icons/pi';

import { shelfEntryLink } from '../../../features/notebook/wissen/NotebookShelf';
import { useNotebookShelves } from '../../../features/notebook/wissen/useNotebookShelves';

import { iconClass, menuLinkClass } from './sidebarStyles';

const CREATE_PATH = '/notebooks/neu';

interface NotebooksSidebarSectionProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  onNavigate: (path: string, title: string) => void;
  onClose: () => void;
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
  onClose,
}: NotebooksSidebarSectionProps) {
  const isMobile = useIsMobile();
  const { shelves } = useNotebookShelves();
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      // Synchronous, like Projekte: the sidebar's hover-collapse guard reads it in the same tick.
      openRef.current = isOpen;
    },
    [openRef]
  );

  const go = useCallback(
    (path: string, title: string) => {
      setOpen(false);
      onNavigate(path, title);
      onClose();
    },
    [onNavigate, onClose]
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
                <DropdownMenuItem
                  key={shelf.id}
                  onSelect={() => go(shelf.notebook.path, shelf.title)}
                >
                  <PiNotebook className="size-4" />
                  <span className="truncate">{shelf.title}</span>
                </DropdownMenuItem>
              );
            // „Meine Notebooks" without any notebook yet: a create entry, like the tile on /wissen.
            if (shelf.kind === 'create' || shelf.entries.length === 0)
              return (
                <DropdownMenuItem key={shelf.id} onSelect={() => go(CREATE_PATH, 'Neues Notebook')}>
                  <PiNotebook className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{shelf.title}</span>
                  {shelf.meta && (
                    <span className="text-xs text-grey-500 max-md:hidden">{shelf.meta}</span>
                  )}
                </DropdownMenuItem>
              );
            // On a phone a side flyout would open past the screen edge: the group's
            // notebooks follow inline under their name instead.
            if (isMobile)
              return (
                <DropdownMenuGroup key={shelf.id}>
                  <DropdownMenuLabel className="pt-3 text-xs font-semibold text-grey-500">
                    {shelf.title}
                  </DropdownMenuLabel>
                  {shelf.entries.map((entry) => {
                    const { title, to } = shelfEntryLink(entry);
                    return (
                      <DropdownMenuItem key={entry.key} onSelect={() => go(to, title)}>
                        <span className="truncate">{title}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              );
            return (
              <DropdownMenuSub key={shelf.id}>
                <DropdownMenuSubTrigger>
                  <PiNotebook className="size-4" />
                  <span className="min-w-0 flex-1 truncate">{shelf.title}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-[60vh] w-64 overflow-y-auto">
                  {shelf.entries.map((entry) => {
                    const { title, to } = shelfEntryLink(entry);
                    return (
                      <DropdownMenuItem key={entry.key} onSelect={() => go(to, title)}>
                        <span className="truncate">{title}</span>
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => go(CREATE_PATH, 'Neues Notebook')}>
            <PiPlus className="size-4" />
            <span>Neues Notebook</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => go('/wissen', 'Wissen')}>
            <PiBooks className="size-4" />
            <span>Alle Notebooks</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
