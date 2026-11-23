import {
  buildGroupPath,
  canShareIntoGroup,
  sortGroups,
  splitArchivedGroups,
} from '@gruenerator/shared/groups';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { type MutableRefObject, memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useGroups } from '../../../features/groups/hooks/useGroups';

import { iconClass, menuLinkClass } from './sidebarStyles';

import { LuFolderCog, PiChatCircle, PiGearSix } from '@/config/shellIcons.generated';

/** So viele Projekte zeigt das Popup; der Rest steht auf /projekte. */
const SIDEBAR_PROJEKTE_LIMIT = 8;
interface ProjekteSidebarSectionProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  onNavigate: (path: string, title: string) => void;
  onClose: () => void;
}

/**
 * "Projekte" entry in the sidebar nav rail. A single trigger that opens a
 * settings-style popup: a quick view of the user's Projekte (personal projects
 * + Gruppen), each with a shortcut to start a new chat filed into it, plus a
 * footer link to the full overview at /projekte.
 */
export const ProjekteSidebarSection = memo(function ProjekteSidebarSection({
  openRef,
  titleClass,
  collapsed,
  onNavigate,
  onClose,
}: ProjekteSidebarSectionProps) {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { userGroups, isLoadingGroups, isErrorGroups } = useGroups({ isActive: true });
  const [open, setOpen] = useState(false);

  // Nur die zuletzt aktiven: die Seitenleiste ist ein Sprungbrett, keine
  // Liste. Alles Weitere (und das Archiv) steht auf /projekte.
  const active = sortGroups(splitArchivedGroups(userGroups ?? []).active, 'activity');
  const projekte = active.slice(0, SIDEBAR_PROJEKTE_LIMIT);
  const hiddenCount = active.length - projekte.length;

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      // Set synchronously (not via an effect) so the sidebar's hover-collapse
      // guard reads the fresh value in the same tick the menu opens.
      openRef.current = isOpen;
    },
    [openRef]
  );

  const openProjekt = useCallback(
    (path: string, name: string) => {
      setOpen(false);
      onNavigate(path, name);
      onClose();
    },
    [onNavigate, onClose]
  );

  const newChatInProjekt = useCallback(
    (groupId: string) => {
      setOpen(false);
      void navigate(`/chat?projekt=${groupId}`);
      onClose();
    },
    [navigate, onClose]
  );

  return (
    // The flex-col wrapper stretches the trigger button to full rail width —
    // buttons don't stretch on their own, so without it the collapsed icon
    // sits left-aligned instead of centered (unlike the other nav entries).
    <div className="flex flex-col gap-0 p-0">
      <DropdownMenu open={open} onOpenChange={handleOpenChange}>
        <DropdownMenuTrigger asChild>
          <button className={menuLinkClass(false, false, collapsed)} type="button">
            <LuFolderCog aria-hidden="true" className={iconClass} />
            <span className={titleClass}>Projekte</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side={isMobile ? 'bottom' : 'right'}
          align="start"
          sideOffset={8}
          className="w-72 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl"
        >
          <DropdownMenuLabel>Projekte</DropdownMenuLabel>
          {isLoadingGroups ? (
            <div className="px-2 py-1.5 text-xs text-grey-500">Wird geladen…</div>
          ) : isErrorGroups ? (
            // Nicht auf „Noch keine Projekte." zurückfallen: `userGroups` ist
            // `query.data ?? []` und damit auch bei einem gescheiterten Abruf
            // leer — der Satz behauptete dann etwas über die Person statt über
            // den Abruf.
            <div className="px-2 py-1.5 text-xs text-grey-500">
              Projekte konnten nicht geladen werden.
            </div>
          ) : projekte.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-grey-500">Noch keine Projekte.</div>
          ) : (
            // Rows are plain buttons (not DropdownMenuItem) so the trailing "Neuer
            // Chat" action can't also trigger a row-select — the two navigations
            // stay independent.
            projekte.map((g) => {
              const path = buildGroupPath(g);
              return (
                <div
                  key={g.id}
                  className="group/projekt flex items-center gap-1 rounded-sm px-1 hover:bg-hover-alt"
                >
                  <button
                    type="button"
                    onClick={() => openProjekt(path, g.name)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[15px] text-foreground"
                  >
                    <LuFolderCog className="size-4 shrink-0 text-grey-500" />
                    <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  </button>
                  {canShareIntoGroup(g) && (
                    <button
                      type="button"
                      aria-label={`Neuer Chat in ${g.name}`}
                      title="Neuer Chat in diesem Projekt"
                      onClick={() => newChatInProjekt(g.id)}
                      className="shrink-0 rounded-md p-1 text-grey-400 opacity-0 transition-opacity hover:bg-hover-alt hover:text-foreground focus-visible:opacity-100 group-hover/projekt:opacity-100"
                    >
                      <PiChatCircle className="size-4" />
                    </button>
                  )}
                </div>
              );
            })
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => openProjekt('/projekte', 'Projekte')}>
            <PiGearSix className="size-4" />
            <span>
              {hiddenCount > 0 ? `Alle ${active.length} Projekte` : 'Alle Projekte'} &amp;
              Einstellungen
            </span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
