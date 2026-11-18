import { useAgentStore, useUserProfileStore, type UserRole } from '@gruenerator/chat/stores';
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
import { PiChatCircle } from 'react-icons/pi';

import { NavTooltip } from './NavTooltip';
import { type RoleShortcut, type RoleShortcutLink } from './roleShortcuts';
import { iconClass, menuLinkClass } from './sidebarStyles';

interface RoleShortcutsSidebarSectionProps {
  /** Ein Eintrag je Rolle mit eigener Schnellauswahl (Landesverband, Grüne Jugend). */
  shortcuts: readonly RoleShortcut[];
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  onNavigate: (path: string, title: string) => void;
  onClose: () => void;
}

/**
 * Ein Eintrag je Rolle der Person. Er öffnet eine Schnellauswahl wie „Projekte":
 * - „Neuer Chat mit deiner Rolle" startet einen frischen Chat im Rollenmodus —
 *   derselbe Weg wie die Rollenwahl im Plus-Menü (`setActiveRole`), angewendet
 *   über `resetChatContext`,
 * - jeder Starter (Agent oder Rezept) öffnet einen neuen Chat damit (ohne
 *   Thread in der URL parkt die Laufzeit auf einem Entwurf),
 * - darunter Links (Notebook, Sharepic-Vorlagen).
 */
export const RoleShortcutsSidebarSection = memo(function RoleShortcutsSidebarSection({
  shortcuts,
  openRef,
  titleClass,
  collapsed,
  onNavigate,
  onClose,
}: RoleShortcutsSidebarSectionProps) {
  const isMobile = useIsMobile();
  const [openKey, setOpenKey] = useState<string | null>(null);

  const handleOpenChange = useCallback(
    (key: string, isOpen: boolean) => {
      const next = isOpen ? key : openKey === key ? null : openKey;
      setOpenKey(next);
      // Synchron setzen (nicht per Effekt und nicht im Updater, der erst beim
      // Rendern läuft), damit der Hover-Collapse-Guard der Seitenleiste den
      // frischen Wert im selben Tick liest.
      openRef.current = next !== null;
    },
    [openRef, openKey]
  );

  // Nach einer Navigation den Fokus NICHT an den Trigger zurückgeben: in der
  // eingeklappten Leiste blieben sonst Fokusring und Tooltip über der neuen
  // Seite stehen. Bei Escape bleibt Radix' Rückgabe für die Tastatur erhalten.
  const navigatedRef = useRef(false);

  const go = useCallback(
    (path: string, title: string) => {
      navigatedRef.current = true;
      setOpenKey(null);
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

  const renderLink = (link: RoleShortcutLink) => (
    <DropdownMenuItem key={link.key} onSelect={() => go(link.path, link.title)}>
      <link.Icon aria-hidden="true" className="size-4" />
      <span className="min-w-0 flex-1 truncate">{link.label}</span>
    </DropdownMenuItem>
  );

  return (
    <div className="flex flex-col gap-0 p-0">
      {shortcuts.map((shortcut) => {
        const { role, starters, links } = shortcut;
        return (
          <DropdownMenu
            key={shortcut.key}
            open={openKey === shortcut.key}
            onOpenChange={(isOpen) => handleOpenChange(shortcut.key, isOpen)}
          >
            <NavTooltip label={shortcut.name} collapsed={collapsed}>
              <DropdownMenuTrigger asChild>
                <button className={menuLinkClass(false, false, collapsed)} type="button">
                  <shortcut.Icon aria-hidden="true" className={iconClass} />
                  <span className={titleClass}>{shortcut.name}</span>
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
                <DropdownMenuItem onSelect={() => startRoleChat(role)} title={role.rolle}>
                  <PiChatCircle aria-hidden="true" className="size-4" />
                  <span className="min-w-0 flex-1 truncate">Neuer Chat mit deiner Rolle</span>
                </DropdownMenuItem>
              )}
              {starters.links.length > 0 && (
                <>
                  {role && <DropdownMenuSeparator />}
                  <DropdownMenuLabel>{starters.heading}</DropdownMenuLabel>
                  {starters.links.map(renderLink)}
                </>
              )}
              {links.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  {links.map(renderLink)}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
});
