import { type Agent } from '@gruenerator/shared/agents';
import { PiBookOpenText, PiMapPin, PiWrench } from 'react-icons/pi';

import { isLandesverbandIdentifier, landesverbandLabel } from '../lib/lookups';

interface CapabilityTagsProps {
  agent: Agent;
  /** Show a couple of the agent's free-text tags after the capability chips. */
  showTags?: boolean;
}

interface Chip {
  key: string;
  icon: typeof PiWrench;
  label: string;
}

function toolCount(agent: Agent): number {
  return (agent.enabledTools?.length ?? 0) + (agent.plugins?.length ?? 0);
}

function hasKnowledge(agent: Agent): boolean {
  return Boolean(
    agent.defaultNotebookId ||
    agent.toolRestrictions?.defaultCollection ||
    (agent.toolRestrictions?.allowedCollections?.length ?? 0) > 0
  );
}

/** Subtle "what can this agent do" chips — the Agentura analogue of a product's spec line. */
export function CapabilityTags({ agent, showTags = false }: CapabilityTagsProps) {
  const chips: Chip[] = [];

  const tools = toolCount(agent);
  if (tools > 0) chips.push({ key: 'tools', icon: PiWrench, label: `${tools} Tools` });
  if (hasKnowledge(agent)) chips.push({ key: 'knowledge', icon: PiBookOpenText, label: 'Wissen' });
  if (isLandesverbandIdentifier(agent.identifier)) {
    chips.push({ key: 'region', icon: PiMapPin, label: landesverbandLabel(agent.identifier) });
  }

  const tags = showTags ? agent.tags.slice(0, 2) : [];

  if (chips.length === 0 && tags.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-xs">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <span
            key={chip.key}
            className="inline-flex items-center gap-1 rounded-full bg-secondary-600/10 px-2 py-0.5 text-xs text-secondary-700 dark:text-secondary-300"
          >
            <Icon className="h-3 w-3" />
            {chip.label}
          </span>
        );
      })}
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center rounded-full bg-grey-100 px-2 py-0.5 text-xs text-foreground-muted dark:bg-grey-800"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
