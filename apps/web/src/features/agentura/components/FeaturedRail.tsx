import { type Agent } from '@gruenerator/shared/agents';
import { CardGrid } from '@gruenerator/ui';
import { PiStar } from 'react-icons/pi';

import { AgentCard } from './cards';

interface FeaturedRailProps {
  agents: Agent[];
  onSelect: (agent: Agent) => void;
  favoriteIdentifiers: string[];
  onToggleFavorite: (identifier: string) => void;
}

/** The storefront "shelf": a small set of recommended agents on a warm sand panel. */
export function FeaturedRail({
  agents,
  onSelect,
  favoriteIdentifiers,
  onToggleFavorite,
}: FeaturedRailProps) {
  if (agents.length === 0) return null;

  return (
    <section className="mb-xl rounded-lg bg-hover-alt p-lg dark:bg-grey-800/40">
      <div className="mb-md flex items-center gap-sm">
        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary-600/15 text-secondary-700 dark:text-secondary-300">
          <PiStar className="h-4 w-4" />
        </span>
        <div>
          <h2 className="m-0 text-lg font-semibold text-foreground-heading">Empfohlen</h2>
          <p className="m-0 text-sm text-foreground-muted">Beliebte Agent*innen zum Einstieg.</p>
        </div>
      </div>
      <CardGrid columns="3" gap="md">
        {agents.map((agent) => (
          <AgentCard
            key={`featured-${agent.identifier}`}
            agent={agent}
            onSelect={onSelect}
            isFavorite={favoriteIdentifiers.includes(agent.identifier)}
            onToggleFavorite={(a) => onToggleFavorite(a.identifier)}
          />
        ))}
      </CardGrid>
    </section>
  );
}
