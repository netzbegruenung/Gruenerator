import { getAgentSlug, getSystemAgentsForLocale } from '@gruenerator/shared/agents';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { AgentCard } from '../../agentura/components/cards';

interface NotebookAgentsSectionProps {
  /** Canonical notebook id, e.g. `brandenburg-notebook`. */
  notebookId: string;
  title?: string;
  /** Embedded in the Manuelle-Recherche sub-tab: drop the standalone heading. */
  embedded?: boolean;
}

// LV agents pin themselves to their Landesverband notebook via `defaultNotebookIds`,
// so the notebook's own agents are exactly the system agents whose
// `defaultNotebookIds` include it. Matching on the notebook id (not the identifier)
// also covers the Austria suffix quirk (identifier `…-at`, notebook
// `oesterreich-notebook`).
function useNotebookAgents(notebookId?: string) {
  const locale = useAuthStore((s) => s.locale) ?? 'de-DE';
  return useMemo(
    () =>
      notebookId
        ? getSystemAgentsForLocale(locale).filter((a) =>
            a.defaultNotebookIds?.includes(notebookId)
          )
        : [],
    [locale, notebookId]
  );
}

/** Whether a notebook surfaces any pinned LV agents (drives the Agenten sub-tab). */
export function useNotebookHasAgents(notebookId?: string): boolean {
  return useNotebookAgents(notebookId).length > 0;
}

// Self-hides when nothing matches — user notebooks (UUID id) and Bundes notebooks
// without agents simply render nothing.
export function NotebookAgentsSection({
  notebookId,
  title = 'Agenten für diesen Landesverband',
  embedded = false,
}: NotebookAgentsSectionProps) {
  const navigate = useNavigate();
  const agents = useNotebookAgents(notebookId);

  if (agents.length === 0) return null;

  return (
    <section className="w-full">
      {!embedded && (
        <h2 className="mt-xl mb-md text-xl font-semibold text-foreground-heading">{title}</h2>
      )}
      <div className="grid gap-sm md:grid-cols-2">
        {agents.map((agent) => (
          <AgentCard
            key={agent.identifier}
            agent={agent}
            onSelect={(a) => void navigate(`/agents/${getAgentSlug(a.identifier)}`)}
          />
        ))}
      </div>
    </section>
  );
}
