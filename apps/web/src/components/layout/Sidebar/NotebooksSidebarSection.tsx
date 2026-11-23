import { rankByUsage } from '@gruenerator/shared/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { type MutableRefObject, memo, useCallback, useMemo, useState } from 'react';

import { useNotebookCollections } from '../../../features/auth/hooks/useProfileData';
import { useSharedNotebookCollections } from '../../../features/notebook/hooks/useSharedNotebookCollections';
import { collectionSlug } from '../../../features/notebook/wissen/useNotebookShelves';
import { useItemUsage } from '../../../features/usage/useItemUsage';

import { iconClass, menuLinkClass } from './sidebarStyles';

import { PiBooks, PiGearSix } from '@/config/shellIcons.generated';
import { type NotebookCollection } from '@/types/notebook';

/** So viele Notebooks zeigt das Popup; der Rest steht auf /wissen. */
const SIDEBAR_NOTEBOOKS_LIMIT = 8;
const EMPTY: NotebookCollection[] = [];
const isOwned = (c: NotebookCollection) => c.access_source == null || c.access_source === 'owned';
const byName = (a: NotebookCollection, b: NotebookCollection) =>
  a.name.localeCompare(b.name, 'de', { sensitivity: 'base' });

interface NotebooksSidebarSectionProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  onNavigate: (path: string, title: string) => void;
  onClose: () => void;
}

/**
 * "Notebooks" entry in the sidebar nav rail, right below Projekte: a popup with
 * the person's most-used own and shared notebooks (same ranking as Projekte:
 * usage first, then alphabetical) and a footer link to /wissen.
 */
export const NotebooksSidebarSection = memo(function NotebooksSidebarSection({
  openRef,
  titleClass,
  collapsed,
  onNavigate,
  onClose,
}: NotebooksSidebarSectionProps) {
  const isMobile = useIsMobile();
  const { query } = useNotebookCollections({ isActive: true });
  const sharedQuery = useSharedNotebookCollections();
  const { data: usage } = useItemUsage('notebook');
  const [open, setOpen] = useState(false);

  const all = useMemo(() => {
    const own = (query.data ?? EMPTY).filter(isOwned);
    const ownIds = new Set(own.map((c) => c.id));
    const shared = (sharedQuery.data ?? EMPTY).filter((c) => !ownIds.has(c.id));
    return rankByUsage([...own, ...shared], (c) => c.id, usage ?? {}, byName);
  }, [query.data, sharedQuery.data, usage]);
  const notebooks = all.slice(0, SIDEBAR_NOTEBOOKS_LIMIT);
  const hiddenCount = all.length - notebooks.length;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      // Synchronously, so the sidebar's hover-collapse guard sees it in the same tick.
      openRef.current = isOpen;
    },
    [openRef]
  );

  const openNotebook = useCallback(
    (path: string, name: string) => {
      setOpen(false);
      onNavigate(path, name);
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
          className="w-72 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl"
        >
          <DropdownMenuLabel>Notebooks</DropdownMenuLabel>
          {query.isLoading ? (
            <div className="px-2 py-1.5 text-xs text-grey-500">Wird geladen…</div>
          ) : query.isError ? (
            // Wie bei den Projekten: ein gescheiterter Abruf ist keine leere Liste.
            <div className="px-2 py-1.5 text-xs text-grey-500">
              Notebooks konnten nicht geladen werden.
            </div>
          ) : notebooks.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-grey-500">Noch keine eigenen Notebooks.</div>
          ) : (
            notebooks.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onSelect={() => openNotebook(`/notebooks/${collectionSlug(c)}`, c.name)}
              >
                <PiBooks className="size-4 shrink-0 text-grey-500" />
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openNotebook('/wissen', 'Wissen')}>
            <PiGearSix className="size-4" />
            <span>{hiddenCount > 0 ? `Alle ${all.length} Notebooks` : 'Alle Notebooks'}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
