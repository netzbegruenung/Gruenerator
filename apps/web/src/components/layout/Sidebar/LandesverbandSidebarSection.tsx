import { useAgentStore, useUserProfileStore, type UserRole } from '@gruenerator/chat/stores';
import { getAgentSlug, landesverbandIdsForRoles, type LvHub } from '@gruenerator/shared/agents';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  useIsMobile,
} from '@gruenerator/ui';
import { type MutableRefObject, memo, useCallback, useRef, useState } from 'react';
import { PiBooks, PiChatCircle } from 'react-icons/pi';

import { NavTooltip } from './NavTooltip';
import { getAgentIcon } from './sidebarAgentConfig';
import { iconClass, menuLinkClass } from './sidebarStyles';

import { landesverbandHubCards } from '@/features/chat/landesverbandHubCards';
import { getNotebookById } from '@/features/notebook/config/notebooksConfig';

interface LandesverbandSidebarSectionProps {
  /** Die Hubs der Landesverbände, für die die Person eine Landesgeschäftsstellen-Rolle hat. */
  hubs: readonly LvHub[];
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  onNavigate: (path: string, title: string) => void;
  onClose: () => void;
}

/**
 * Ein Eintrag je Landesverband der Person (aus ihren Profilrollen). Er öffnet
 * eine Schnellauswahl wie „Projekte":
 * - „Neuer Chat mit deiner Rolle" startet einen frischen Chat im Rollenmodus mit
 *   der Landesgeschäftsstellen-Rolle — derselbe Weg wie die Rollenwahl im
 *   Plus-Menü (`setActiveRole`), angewendet über `resetChatContext`.
 * - jeder Agent des LV startet einen neuen Chat mit ihm (`/agents/<slug>` — ohne
 *   Thread in der URL parkt die Laufzeit auf einem Entwurf),
 * - darunter das Notebook des LV.
 */
export const LandesverbandSidebarSection = memo(function LandesverbandSidebarSection({
  hubs,
  openRef,
  titleClass,
  collapsed,
  onNavigate,
  onClose,
}: LandesverbandSidebarSectionProps) {
  const isMobile = useIsMobile();
  const roles = useUserProfileStore((s) => s.roles);
  const userLocale = useUserProfileStore((s) => s.locale);
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (slug: string, isOpen: boolean) => {
      const next = isOpen ? slug : openSlug === slug ? null : openSlug;
      setOpenSlug(next);
      // Synchron setzen (nicht per Effekt und nicht im Updater, der erst beim
      // Rendern läuft), damit der Hover-Collapse-Guard der Seitenleiste den
      // frischen Wert im selben Tick liest.
      openRef.current = next !== null;
    },
    [openRef, openSlug]
  );

  // Nach einer Navigation den Fokus NICHT an den Trigger zurückgeben: in der
  // eingeklappten Leiste blieben sonst Fokusring und Tooltip über der neuen
  // Seite stehen. Bei Escape bleibt Radix' Rückgabe für die Tastatur erhalten.
  const navigatedRef = useRef(false);

  const go = useCallback(
    (path: string, title: string) => {
      navigatedRef.current = true;
      setOpenSlug(null);
      openRef.current = false;
      onNavigate(path, title);
      onClose();
    },
    [onNavigate, onClose, openRef]
  );

  const startRoleChat = useCallback(
    (role: UserRole) => {
      // Die Rolle wird Kontovoreinstellung (wie im Plus-Menü); `resetChatContext`
      // nimmt den Agent heraus und legt sie über `draftRoleState` auf den Entwurf.
      // Herkunft `default`: nichts wird in einen gerade offenen Thread geschrieben.
      useUserProfileStore.getState().setActiveRole({ ebene: role.ebene, rolle: role.rolle });
      const store = useAgentStore.getState();
      store.resetChatContext();
      store.setChatViewMode('overview');
      go('/chat', 'Chat');
    },
    [go]
  );

  return (
    <div className="flex flex-col gap-0 p-0">
      {hubs.map((hub) => {
        const HubIcon = NOTEBOOK_ICONS[hub.notebookId];
        const notebookPath = getNotebookById(hub.notebookId)?.path;
        const cards = landesverbandHubCards(hub, userLocale);
        const role = roles.find((r) =>
          landesverbandIdsForRoles([r], userLocale).includes(hub.lvId)
        );
        return (
          <DropdownMenu
            key={hub.slug}
            open={openSlug === hub.slug}
            onOpenChange={(isOpen) => handleOpenChange(hub.slug, isOpen)}
          >
            <NavTooltip label={hub.name} collapsed={collapsed}>
              <DropdownMenuTrigger asChild>
                <button className={menuLinkClass(false, false, collapsed)} type="button">
                  <HubIcon aria-hidden="true" className={iconClass} />
                  <span className={titleClass}>{hub.name}</span>
                </button>
              </DropdownMenuTrigger>
            </NavTooltip>
            <DropdownMenuContent
              side={isMobile ? 'bottom' : 'right'}
              align="start"
              sideOffset={8}
              onCloseAutoFocus={(event) => {
                if (navigatedRef.current) event.preventDefault();
                navigatedRef.current = false;
              }}
              className="w-72 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl"
            >
              {role && (
                <>
                  <DropdownMenuItem onSelect={() => startRoleChat(role)} title={role.rolle}>
                    <PiChatCircle aria-hidden="true" className="size-4" />
                    <span className="min-w-0 flex-1 truncate">Neuer Chat mit deiner Rolle</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel>Neuer Chat mit Agent</DropdownMenuLabel>
              {cards.map(({ agentId, role }) => {
                const AgentIcon = getAgentIcon(agentId);
                return (
                  <DropdownMenuItem
                    key={agentId}
                    onSelect={() => go(`/agents/${getAgentSlug(agentId)}`, role)}
                  >
                    <AgentIcon aria-hidden="true" className="size-4" />
                    <span className="min-w-0 flex-1 truncate">{role}</span>
                  </DropdownMenuItem>
                );
              })}
              {notebookPath && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => go(notebookPath, hub.name)}>
                    <PiBooks aria-hidden="true" className="size-4" />
                    <span>Notebook</span>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
});
