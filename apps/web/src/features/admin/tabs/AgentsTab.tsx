import { Skeleton, Switch } from '@gruenerator/ui';

import { useAdminAgents, useSetAgentHidden } from '../hooks/useAdminAgents';

/**
 * Aufgezählt wird, was die Instanz führt — die Liste kommt bereits gefiltert
 * vom Server (`getCuratableSystemAgents`). Die Landesverbands-Spezialisten
 * fehlen dort bewusst: sie werden über die Instanz-Registry kuratiert, nicht
 * einzeln.
 */
export default function AgentsTab() {
  const { data: agents, isLoading } = useAdminAgents(true);
  const setHiddenMutation = useSetAgentHidden();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return (
      <p className="text-sm text-grey-500 dark:text-grey-400 py-lg text-center">
        Diese Instanz führt keine Agenten.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {agents.map((agent) => (
        <div
          key={agent.identifier}
          className="flex items-center justify-between gap-md rounded-md border border-grey-200 dark:border-grey-700 px-md py-sm"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground-heading m-0 truncate">
              {agent.title}
            </p>
            <p className="text-xs text-grey-500 m-0 truncate">
              {agent.slug ? `/agents/${agent.slug}` : agent.identifier}
            </p>
          </div>
          <Switch
            checked={!agent.hidden}
            disabled={
              setHiddenMutation.isPending &&
              setHiddenMutation.variables?.identifier === agent.identifier
            }
            onCheckedChange={(checked) =>
              setHiddenMutation.mutate({ identifier: agent.identifier, hidden: !checked })
            }
            aria-label={`${agent.title} ${agent.hidden ? 'einblenden' : 'ausblenden'}`}
          />
        </div>
      ))}
    </div>
  );
}
