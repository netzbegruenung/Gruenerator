import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { type MutableRefObject, Suspense, lazy, memo, useCallback, useState } from 'react';
import { PiBooks } from '@/config/shellIcons.generated';

import { type OPEN_STATE } from '../../../features/notebook/wissen/shelfLinks';

import { iconClass, menuLinkClass } from './sidebarStyles';

// The menu's rows load on first open: the shelf model is too heavy for every page.
const NotebooksMenuItems = lazy(() => import('./NotebooksMenuItems'));

interface NotebooksSidebarSectionProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  /** The sidebar's navigation: on the desktop app it also keeps the active tab's route and title. */
  onNavigate: (path: string, title: string, state: typeof OPEN_STATE | null) => void;
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
          <Suspense
            fallback={
              <div className="px-2 py-1.5 text-xs text-grey-500">Notebooks werden geladen…</div>
            }
          >
            <NotebooksMenuItems isMobile={isMobile} onOpen={openEntry} />
          </Suspense>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
