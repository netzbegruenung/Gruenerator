import { getAgentSlug, getSystemAgentsForLocale } from '@gruenerator/shared/agents';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';
import { AgentCard } from '../../agentura/components/cards';

interface NotebookAgentsSectionProps {
  /** Canonical notebook id, e.g. `brandenburg-notebook`. */
  notebookId: string;
  title?: string;
}

// LV agents pin themselves to their Landesverband notebook via `defaultNotebookId`,
// so the notebook's own agents are exactly the system agents whose
// `defaultNotebookId` matches. Matching on the notebook id (not the identifier)
// also covers the Austria suffix quirk (identifier `…-at`, notebook
// `oesterreich-notebook`). Self-hides when nothing matches — user notebooks (UUID
// id) and Bundes notebooks without agents simply render nothing.
export function NotebookAgentsSection({
  notebookId,
  title = 'Agenten für diesen Landesverband',
}: NotebookAgentsSectionProps) {
  const navigate = useNavigate();
  const locale = useAuthStore((s) => s.locale) ?? 'de-DE';

  const agents = useMemo(
    () => getSystemAgentsForLocale(locale).filter((a) => a.defaultNotebookId === notebookId),
    [locale, notebookId]
  );

  if (agents.length === 0) return null;

  return (
    <section className="w-full">
      <h2 className="mt-xl mb-md text-xl font-semibold text-foreground-heading">{title}</h2>
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
