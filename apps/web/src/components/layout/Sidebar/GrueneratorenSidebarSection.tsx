import { getAgentSlug, getSystemAgent } from '@gruenerator/shared/agents';
import { sortByUsage } from '@gruenerator/shared/utils';
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
import { PiGearSix, PiSparkle } from 'react-icons/pi';
import { RiSpyLine } from 'react-icons/ri';

import { useUserAgents } from '../../../features/agents/api';
import { useItemUsage } from '../../../features/usage/useItemUsage';
import useAgentFavoritesStore from '../../../stores/agentFavoritesStore';

import { getAgentIcon } from './sidebarAgentConfig';
import { iconClass, menuLinkClass } from './sidebarStyles';

import type { IconType } from 'react-icons';

const MAX_QUICK_ITEMS = 8;

interface GrueneratorenSidebarSectionProps {
  openRef: MutableRefObject<boolean>;
  titleClass: string;
  collapsed: boolean;
  onNavigate: (path: string, title: string) => void;
  onClose: () => void;
}

/**
 * "Grüneratoren" entry in the sidebar nav rail — same structure as the
 * Projekte entry: a single trigger that opens a quick-view popup listing the
 * user's Grüneratoren (favourites + own agents, most-used first), plus a
 * footer link to the full Agentura overview at /agentura.
 */
export const GrueneratorenSidebarSection = memo(function GrueneratorenSidebarSection({
  openRef,
  titleClass,
  collapsed,
  onNavigate,
  onClose,
}: GrueneratorenSidebarSectionProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const favoriteIdentifiers = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const { data: userAgents = [] } = useUserAgents();
  const { data: agentUsage = {} } = useItemUsage('agent');

  // Favourites (system + user agents) first, then remaining own agents;
  // most-recently/most-used float to the top, never-used keep their add order.
  const agents = useMemo(() => {
    const rows: { identifier: string; title: string; Icon: IconType }[] = [];
    const seen = new Set<string>();
    for (const identifier of favoriteIdentifiers) {
      const sys = getSystemAgent(identifier);
      if (sys) {
        rows.push({ identifier, title: sys.title, Icon: getAgentIcon(identifier) });
        seen.add(identifier);
        continue;
      }
      const ua = userAgents.find((a) => a.identifier === identifier);
      if (ua) {
        rows.push({ identifier, title: ua.title, Icon: PiSparkle });
        seen.add(identifier);
      }
    }
    for (const ua of userAgents) {
      if (!seen.has(ua.identifier)) {
        rows.push({ identifier: ua.identifier, title: ua.title, Icon: PiSparkle });
      }
    }
    return sortByUsage(rows, (r) => r.identifier, agentUsage).slice(0, MAX_QUICK_ITEMS);
  }, [favoriteIdentifiers, userAgents, agentUsage]);

  const handleOpenChange = useCallback(
    (isOpen: boolean) => {
      setOpen(isOpen);
      // Set synchronously (not via an effect) so the sidebar's hover-collapse
      // guard reads the fresh value in the same tick the menu opens.
      openRef.current = isOpen;
    },
    [openRef]
  );

  const openPath = useCallback(
    (path: string, title: string) => {
      setOpen(false);
      onNavigate(path, title);
      onClose();
    },
    [onNavigate, onClose]
  );

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button className={menuLinkClass(false, false, collapsed)} type="button">
          <RiSpyLine aria-hidden="true" className={iconClass} />
          <span className={titleClass}>Grüneratoren</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? 'bottom' : 'right'}
        align="start"
        sideOffset={8}
        className="w-72 bg-background/85 supports-[backdrop-filter]:bg-background/70 backdrop-blur-xl"
      >
        <DropdownMenuLabel>Grüneratoren</DropdownMenuLabel>
        {agents.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-grey-500">Noch keine Grüneratoren.</div>
        ) : (
          agents.map((a) => (
            <DropdownMenuItem
              key={a.identifier}
              onSelect={() => openPath(`/agents/${getAgentSlug(a.identifier)}`, a.title)}
            >
              <a.Icon className="size-4 shrink-0 text-grey-500" />
              <span className="min-w-0 flex-1 truncate">{a.title}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => openPath('/agentura', 'Grüneratoren')}>
          <PiGearSix className="size-4" />
          <span>Alle Grüneratoren &amp; Verwaltung</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
