import { getAgentSlug, getLandesverbandHubs } from '@gruenerator/shared/agents';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@gruenerator/ui';
import { useMemo, type ReactNode } from 'react';
import { PiStarFill } from 'react-icons/pi';

import { useUserAgents } from '../../../features/agents/api';
import useAgentFavoritesStore from '../../../stores/agentFavoritesStore';
import { useAuthStore } from '../../../stores/authStore';

import { getDefaultAgentEntries, getVisibleSystemAgents, getAgentIcon } from './sidebarAgentConfig';
import { menuLinkClass } from './sidebarStyles';

import { cn } from '@/utils/cn';

interface AllAgentsDialogProps {
  onLinkClick: (path: string, title: string) => void;
  titleClass: string;
}

interface AgentListRowProps {
  title: string;
  description?: string;
  avatar: ReactNode;
  onClick: () => void;
  // Omitted for rows that aren't favouritable (e.g. Landesverband hubs).
  star?: {
    active: boolean;
    onToggle?: () => void;
    pinned?: boolean;
  };
}

function AgentListRow({ title, description, avatar, onClick, star }: AgentListRowProps) {
  const starLabel = star?.pinned
    ? 'Standard-Favorit (immer angeheftet)'
    : star?.active
      ? 'Aus Favoriten entfernen'
      : 'Zu Favoriten hinzufügen';

  return (
    <li className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-grey-100 dark:hover:bg-grey-800/60">
      <button
        type="button"
        onClick={onClick}
        className="flex flex-1 min-w-0 items-center gap-3 text-left"
      >
        {avatar}
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-medium truncate">{title}</span>
          {description && (
            <span className="block text-xs text-grey-500 truncate">{description}</span>
          )}
        </span>
      </button>
      {star && (
        <button
          type="button"
          onClick={star.onToggle}
          disabled={star.pinned}
          className={cn(
            'shrink-0 p-1.5 rounded',
            star.pinned ? 'opacity-100 cursor-default' : 'hover:bg-grey-200 dark:hover:bg-grey-700'
          )}
          aria-label={starLabel}
          title={starLabel}
        >
          <PiStarFill
            size={16}
            className={cn(star.active ? 'text-primary-600' : 'text-grey-300')}
          />
        </button>
      )}
    </li>
  );
}

export function AllAgentsDialog({ onLinkClick, titleClass }: AllAgentsDialogProps) {
  const favoriteIdentifiers = useAgentFavoritesStore((s) => s.favoriteIdentifiers);
  const toggle = useAgentFavoritesStore((s) => s.toggle);
  const { data: userAgents = [] } = useUserAgents();
  const userLocale = useAuthStore((state) => state.locale) ?? 'de-DE';
  const defaultAgentEntries = useMemo(() => getDefaultAgentEntries(userLocale), [userLocale]);
  const visibleSystemAgents = useMemo(() => getVisibleSystemAgents(userLocale), [userLocale]);
  const landesverbandHubs = useMemo(() => getLandesverbandHubs(userLocale), [userLocale]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(menuLinkClass(false), 'text-grey-500 hover:text-foreground')}
        >
          <span className="shrink-0 w-6 h-6 flex items-center justify-center text-base">⋯</span>
          <span className={titleClass}>Alle anzeigen</span>
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Alle Agents</DialogTitle>
        </DialogHeader>
        <ul className="list-none m-0 p-0 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {defaultAgentEntries.map((entry) => {
            const Icon = getAgentIcon(entry.identifier);
            return (
              <AgentListRow
                key={entry.key}
                title={entry.label}
                onClick={() =>
                  onLinkClick(`/agents/${getAgentSlug(entry.identifier)}`, entry.label)
                }
                avatar={
                  <span className="shrink-0 w-7 h-7 flex items-center justify-center text-secondary-600">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                }
                star={{ active: true, pinned: true }}
              />
            );
          })}

          <li className="my-2 border-t border-grey-200 dark:border-grey-800" aria-hidden="true" />

          {visibleSystemAgents.map((agent) => {
            const Icon = getAgentIcon(agent.identifier);
            return (
              <AgentListRow
                key={agent.identifier}
                title={agent.title}
                description={agent.description}
                onClick={() =>
                  onLinkClick(`/agents/${getAgentSlug(agent.identifier)}`, agent.title)
                }
                avatar={
                  <span className="shrink-0 w-7 h-7 flex items-center justify-center text-secondary-600">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                }
                star={{
                  active: favoriteIdentifiers.includes(agent.identifier),
                  onToggle: () => toggle(agent.identifier),
                }}
              />
            );
          })}

          {landesverbandHubs.length > 0 && (
            <>
              <li
                className="my-2 border-t border-grey-200 dark:border-grey-800"
                aria-hidden="true"
              />
              <li className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-grey-500">
                Landesverbände
              </li>
              {landesverbandHubs.map((hub) => {
                const Icon = NOTEBOOK_ICONS[hub.notebookId];
                return (
                  <AgentListRow
                    key={hub.slug}
                    title={hub.name}
                    description="Öffentlichkeitsarbeit · Bürger*innenservice"
                    onClick={() => onLinkClick(`/agents/${hub.slug}`, hub.name)}
                    avatar={
                      <span className="shrink-0 w-7 h-7 flex items-center justify-center text-secondary-600">
                        <Icon aria-hidden="true" className="h-5 w-5" />
                      </span>
                    }
                  />
                );
              })}
            </>
          )}

          {userAgents.length > 0 && (
            <>
              <li
                className="my-2 border-t border-grey-200 dark:border-grey-800"
                aria-hidden="true"
              />
              <li className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wider text-grey-500">
                Meine Agent*innen
              </li>
              {userAgents.map((agent) => (
                <AgentListRow
                  key={`ua-${agent.identifier}`}
                  title={agent.title}
                  description={agent.description}
                  onClick={() =>
                    onLinkClick(`/agents/${getAgentSlug(agent.identifier)}`, agent.title)
                  }
                  avatar={
                    <span
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-sm"
                      style={{ backgroundColor: agent.backgroundColor }}
                    >
                      {agent.avatar}
                    </span>
                  }
                  star={{
                    active: favoriteIdentifiers.includes(agent.identifier),
                    onToggle: () => toggle(agent.identifier),
                  }}
                />
              ))}
            </>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
