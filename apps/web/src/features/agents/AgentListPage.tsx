import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import { AGENT_CATEGORY_LABELS, SYSTEM_AGENTS, type Agent } from '@gruenerator/shared/agents';
import { useState } from 'react';
import { HiShare, HiUserGroup } from 'react-icons/hi';
import { Link, useNavigate } from 'react-router-dom';

import { useGroups, type GroupSummary } from '../groups/hooks/useGroups';

import {
  useDeleteUserAgent,
  useShareSystemAgentWithGroup,
  useSharedSystemAgents,
  useUserAgents,
  type SharedAgentEntry,
} from './api';

function AgentAvatar({ agent }: { agent: Agent }) {
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded text-2xl"
      style={{ backgroundColor: agent.backgroundColor }}
    >
      {agent.avatar}
    </div>
  );
}

function ShareWithGroupButton({
  identifier,
  groups,
}: {
  identifier: string;
  groups: GroupSummary[];
}) {
  const share = useShareSystemAgentWithGroup();
  const [justSharedId, setJustSharedId] = useState<string | null>(null);

  if (groups.length === 0) return null;

  const handleShare = (groupId: string) => {
    share.mutate(
      { groupId, identifier },
      {
        onSuccess: () => {
          setJustSharedId(groupId);
          setTimeout(() => setJustSharedId(null), 2000);
        },
      }
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Mit Gruppe teilen"
          className="flex items-center gap-xs rounded px-sm py-xs text-sm hover:bg-hover-alt"
        >
          <HiShare /> Teilen
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {groups.map((group) => (
          <DropdownMenuItem key={group.id} onClick={() => handleShare(group.id)}>
            <HiUserGroup />
            {justSharedId === group.id ? 'Geteilt!' : group.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SystemAgentRow({ agent, groups }: { agent: Agent; groups: GroupSummary[] }) {
  const navigate = useNavigate();
  return (
    <li className="flex items-center gap-md rounded border border-grey-200 p-md hover:bg-hover-alt dark:border-grey-700">
      <AgentAvatar agent={agent} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{agent.title}</div>
        <div className="truncate text-sm text-foreground-muted">{agent.description}</div>
      </div>
      <button
        type="button"
        className="rounded px-sm py-xs text-sm hover:bg-hover-alt"
        onClick={() => void navigate(`/chat?agent=${agent.identifier}`)}
      >
        Chatten
      </button>
      <ShareWithGroupButton identifier={agent.identifier} groups={groups} />
    </li>
  );
}

function SharedAgentRow({ entry }: { entry: SharedAgentEntry }) {
  const navigate = useNavigate();
  return (
    <li className="flex items-center gap-md rounded border border-grey-200 p-md hover:bg-hover-alt dark:border-grey-700">
      <AgentAvatar agent={entry.agent} />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{entry.agent.title}</div>
        <div className="truncate text-sm text-foreground-muted">{entry.agent.description}</div>
        <div className="mt-xs flex flex-wrap gap-xs">
          {entry.groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center gap-1 rounded-full bg-grey-100 px-2 py-0.5 text-xs text-foreground-muted dark:bg-grey-800"
            >
              <HiUserGroup /> {g.name}
            </span>
          ))}
        </div>
      </div>
      <button
        type="button"
        className="rounded px-sm py-xs text-sm hover:bg-hover-alt"
        onClick={() => void navigate(`/chat?agent=${entry.agent.identifier}`)}
      >
        Chatten
      </button>
    </li>
  );
}

export default function AgentListPage() {
  const navigate = useNavigate();
  const { data: userAgents = [], isLoading, error } = useUserAgents();
  const { data: sharedAgents = [] } = useSharedSystemAgents();
  const { userGroups } = useGroups({ isActive: true });
  const deleteMutation = useDeleteUserAgent();

  // Cast through Agent because SYSTEM_AGENTS is `as const` — entries without
  // hiddenFromInventory have a narrower literal type that doesn't expose it.
  const visibleSystemAgents: Agent[] = (SYSTEM_AGENTS as readonly Agent[]).filter(
    (a) => !a.hiddenFromInventory
  );

  const handleDelete = (identifier: string, title: string) => {
    if (!confirm(`Möchtest du "${title}" wirklich löschen?`)) return;
    deleteMutation.mutate(identifier);
  };

  return (
    <div className="mx-auto max-w-4xl p-md">
      <div className="mb-lg flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agent*innen</h1>
        <Link
          to="/agents/new"
          className="rounded bg-primary-600 px-md py-sm text-white hover:bg-primary-700"
        >
          + Neue*r Agent*in
        </Link>
      </div>

      {sharedAgents.length > 0 && (
        <section className="mb-xl">
          <h2 className="mb-md text-xl font-semibold text-foreground-heading">
            {AGENT_CATEGORY_LABELS.gruppen}
          </h2>
          <ul className="flex flex-col gap-sm">
            {sharedAgents.map((entry) => (
              <SharedAgentRow key={entry.agent.identifier} entry={entry} />
            ))}
          </ul>
        </section>
      )}

      <section className="mb-xl">
        <h2 className="mb-md text-xl font-semibold text-foreground-heading">
          Verfügbare Agent*innen
        </h2>
        <ul className="flex flex-col gap-sm">
          {visibleSystemAgents.map((agent) => (
            <SystemAgentRow key={agent.identifier} agent={agent} groups={userGroups} />
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-md text-xl font-semibold text-foreground-heading">Meine Agent*innen</h2>

        {isLoading && <p>Lade…</p>}
        {error && <p className="text-red-600">Fehler beim Laden.</p>}

        {!isLoading && userAgents.length === 0 && (
          <div className="rounded border border-dashed border-grey-300 p-lg text-center">
            <p className="mb-md text-foreground-muted">
              Du hast noch keine eigenen Agent*innen erstellt.
            </p>
            <Link to="/agents/new" className="text-primary-600 underline hover:text-primary-700">
              Erstelle deine*n erste*n Agent*in
            </Link>
          </div>
        )}

        <ul className="flex flex-col gap-sm">
          {userAgents.map((agent) => (
            <li
              key={agent.identifier}
              className="flex items-center gap-md rounded border border-grey-200 p-md hover:bg-hover-alt dark:border-grey-700"
            >
              <AgentAvatar agent={agent} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{agent.title}</div>
                <div className="truncate text-sm text-foreground-muted">{agent.description}</div>
              </div>
              <button
                type="button"
                className="rounded px-sm py-xs text-sm hover:bg-hover-alt"
                onClick={() => void navigate(`/chat?agent=${agent.identifier}`)}
              >
                Chatten
              </button>
              <button
                type="button"
                className="rounded px-sm py-xs text-sm hover:bg-hover-alt"
                onClick={() => void navigate(`/agents/${agent.identifier}/edit`)}
              >
                Bearbeiten
              </button>
              <button
                type="button"
                className="rounded px-sm py-xs text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => handleDelete(agent.identifier, agent.title)}
                disabled={deleteMutation.isPending}
              >
                Löschen
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
