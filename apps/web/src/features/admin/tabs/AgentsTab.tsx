import { Badge, Input, Skeleton, Switch } from '@gruenerator/ui';
import { useId, useState } from 'react';

import { AdminEmptyState, AdminPanel } from '../components/adminUi';
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
  const [query, setQuery] = useState('');
  const searchId = useId();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-md">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!agents || agents.length === 0) {
    return <AdminEmptyState>Diese Instanz führt keine Agents.</AdminEmptyState>;
  }

  const needle = query.trim().toLowerCase();
  const visibleAgents = needle
    ? agents.filter((a) =>
        `${a.title} ${a.slug ?? ''} ${a.identifier}`.toLowerCase().includes(needle)
      )
    : agents;
  const hiddenCount = agents.filter((a) => a.hidden).length;

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="w-full sm:max-w-sm">
          <label htmlFor={searchId} className="sr-only">
            Agents durchsuchen
          </label>
          <Input
            id={searchId}
            type="search"
            placeholder="Agent suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="m-0 text-sm text-grey-600 dark:text-grey-400" aria-live="polite">
          {agents.length - hiddenCount} sichtbar · {hiddenCount} ausgeblendet
        </p>
      </div>

      {visibleAgents.length === 0 ? (
        <AdminEmptyState>Keine Agents für „{query.trim()}“.</AdminEmptyState>
      ) : (
        <AdminPanel flush>
          <ul className="m-0 flex list-none flex-col divide-y divide-grey-200 border-t border-grey-200 p-0 dark:divide-grey-800 dark:border-grey-800">
            {visibleAgents.map((agent) => (
              <li
                key={agent.identifier}
                className="flex items-center justify-between gap-md px-md py-sm"
              >
                <div className="min-w-0">
                  <p className="m-0 truncate text-sm font-medium text-foreground-heading">
                    {agent.title}
                  </p>
                  <p className="m-0 truncate text-xs text-grey-600 dark:text-grey-400">
                    {agent.slug ? `/agents/${agent.slug}` : agent.identifier}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-sm">
                  {agent.hidden && <Badge variant="outline">instanzweit ausgeblendet</Badge>}
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
              </li>
            ))}
          </ul>
        </AdminPanel>
      )}
    </div>
  );
}
