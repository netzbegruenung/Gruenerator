import {
  getAgentSlug,
  getSystemAgent,
  localizeAgent,
  type LvHub,
} from '@gruenerator/shared/agents';
import { NOTEBOOK_ICONS } from '@gruenerator/shared/notebook-icons';
import { SelectCard } from '@gruenerator/ui';
import { PiArrowRight } from 'react-icons/pi';

import { getNotebookById } from '@/features/notebook/config/notebooksConfig';

interface LandesverbandHubProps {
  hub: LvHub;
  onNavigate: (path: string) => void;
  userLocale: string;
}

/**
 * Landing for a Landesverband's branded link (`/agents/gruene-berlin`). The LV
 * runs two specialist agents — a creative Öffentlichkeitsarbeit agent and a
 * factual Bürger*innenanfragen agent — that stay separate so neither voice is
 * diluted. This hub offers both behind the one link the LV shares, then drops
 * into the chosen agent's chat via its derived slug.
 */
export function LandesverbandHub({ hub, onNavigate, userLocale }: LandesverbandHubProps) {
  const HubIcon = NOTEBOOK_ICONS[hub.notebookId];
  const notebookPath = getNotebookById(hub.notebookId)?.path;

  const cards = (
    [
      { agentId: hub.prAgentId, role: 'Öffentlichkeitsarbeit' },
      { agentId: hub.buergerAgentId, role: 'Bürger*innenservice' },
    ] as const
  ).flatMap(({ agentId, role }) => {
    const agent = getSystemAgent(agentId);
    if (!agent) return [];
    const localized = localizeAgent(agent, userLocale);
    return [{ agentId, role, agent: localized }];
  });

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-lg px-md py-xl">
      <header className="flex items-center gap-md">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-500/10 text-2xl text-primary-600 dark:text-primary-400">
          <HubIcon aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{hub.name}</h1>
          <p className="text-sm text-grey-500">
            Wähle, womit du starten möchtest — beide Agents kennen die Inhalte des Landesverbands.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-sm">
        {cards.map(({ agentId, role, agent }) => (
          <SelectCard
            key={agentId}
            label={role}
            description={agent.description}
            icon={
              <span
                className="flex h-9 w-9 items-center justify-center rounded-full text-base"
                style={{ backgroundColor: agent.backgroundColor }}
              >
                {agent.avatar}
              </span>
            }
            onClick={() => onNavigate(`/agents/${getAgentSlug(agentId)}`)}
          />
        ))}
      </div>

      {notebookPath && (
        <button
          type="button"
          onClick={() => onNavigate(notebookPath)}
          className="inline-flex items-center gap-1 self-start text-sm text-primary-600 hover:underline dark:text-primary-400"
        >
          Wissensdatenbank ansehen
          <PiArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
