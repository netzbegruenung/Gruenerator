import { type AgentListItem } from '@gruenerator/chat';
import { type Agent } from '@gruenerator/shared/agents';
import { Badge } from '@gruenerator/ui';
import { type ReactNode } from 'react';
import { PiPencilSimple, PiSparkle, PiStar, PiStarFill, PiTrash } from 'react-icons/pi';

import { type SharedAgentEntry } from '../../agents/api';
import { PhosphorIcon } from '../../agents/icons/PhosphorIcon';

import { CapabilityTags } from './CapabilityTags';

import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';

const CARD_CLASS =
  'group relative flex flex-row bg-background border border-grey-200 dark:border-grey-700 rounded-md overflow-hidden cursor-pointer transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-md';
const ICON_BTN = 'rounded-md p-2 text-secondary-600 transition-colors hover:bg-secondary-600/10';

/**
 * Type badge so a card is recognizable as an agent (chat persona) or a recipe
 * (template). `kind` stays `'skill'` — es ist der Registry-Wert, der auch in
 * `MentionableCategory` und den Mention-Tokens steht; nur die Beschriftung folgt
 * dem Produkt-Wording.
 */
export function TypeBadge({ kind }: { kind: 'agent' | 'skill' }) {
  return kind === 'agent' ? (
    <Badge variant="secondary" className="shrink-0">
      Agent
    </Badge>
  ) : (
    <Badge variant="outline" className="shrink-0">
      Rezept
    </Badge>
  );
}

// Primary action is a stretched <button> over the title: one tab stop opens the
// card, and the favourite/edit/delete controls stay their own siblings (raised
// with `relative z-10`) — no interactive element nested inside another.
const STRETCHED =
  "line-clamp-2 text-left outline-none after:absolute after:inset-0 after:content-[''] after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary-600";

interface SkillCardProps {
  skill: AgentListItem;
  isFavorite: boolean;
  onToggleFavorite: (mention: string) => void;
  onSelect: (skill: AgentListItem) => void;
}

export function SkillCard({ skill, isFavorite, onToggleFavorite, onSelect }: SkillCardProps) {
  const Icon = skill.icon ?? PiSparkle;
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-center px-md text-secondary-600 shrink-0">
        <Icon className="text-2xl" />
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <div className="flex justify-between items-start gap-sm mb-xs">
          <div className="flex min-w-0 items-start gap-xs">
            <h3 className="text-base font-semibold text-foreground-heading m-0 line-clamp-2">
              <button type="button" onClick={() => onSelect(skill)} className={STRETCHED}>
                {skill.title}
              </button>
            </h3>
            <TypeBadge kind="skill" />
          </div>
          <button
            type="button"
            aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
            onClick={() => onToggleFavorite(skill.mention)}
            className={`relative z-10 shrink-0 ${ICON_BTN}`}
          >
            {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-sm text-foreground leading-relaxed m-0 line-clamp-2">
          {skill.description}
        </p>
      </div>
    </div>
  );
}

interface AgentCardProps {
  agent: Agent;
  onSelect: (agent: Agent) => void;
  onEdit?: (agent: Agent) => void;
  onDelete?: (agent: Agent) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (agent: Agent) => void;
  /** Override the icon (user agents render their chosen Phosphor `iconKey`). */
  iconOverride?: ReactNode;
}

export function AgentCard({
  agent,
  onSelect,
  onEdit,
  onDelete,
  isFavorite,
  onToggleFavorite,
  iconOverride,
}: AgentCardProps) {
  const Icon = getAgentIcon(agent.identifier);
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-center px-md text-secondary-600 shrink-0">
        {iconOverride ?? <Icon className="text-2xl" />}
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <div className="flex justify-between items-start gap-sm mb-xs">
          <div className="flex min-w-0 items-start gap-xs">
            <h3 className="text-base font-semibold text-foreground-heading m-0 line-clamp-2">
              <button type="button" onClick={() => onSelect(agent)} className={STRETCHED}>
                {agent.title}
              </button>
            </h3>
            <TypeBadge kind="agent" />
          </div>
          <div className="relative z-10 flex shrink-0 gap-1">
            {onToggleFavorite && (
              <button
                type="button"
                aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite(agent);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className={ICON_BTN}
              >
                {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                aria-label="Bearbeiten"
                onClick={(e) => {
                  e.stopPropagation();
                  onEdit(agent);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className={ICON_BTN}
              >
                <PiPencilSimple className="h-4 w-4" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                aria-label="Löschen"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(agent);
                }}
                onKeyDown={(e) => e.stopPropagation()}
                className="rounded-md p-2 text-red-600 transition-colors hover:bg-red-600/10"
              >
                <PiTrash className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
        <p className="mb-xs text-sm text-foreground leading-relaxed m-0 line-clamp-2">
          {agent.description}
        </p>
        <CapabilityTags agent={agent} />
      </div>
    </div>
  );
}

interface SharedAgentCardProps {
  entry: SharedAgentEntry;
  onSelect: (agent: Agent) => void;
  isFavorite?: boolean;
  onToggleFavorite?: (agent: Agent) => void;
}

export function SharedAgentCard({
  entry,
  onSelect,
  isFavorite,
  onToggleFavorite,
}: SharedAgentCardProps) {
  const { agent, groups } = entry;
  const Icon = getAgentIcon(agent.identifier);
  return (
    <div className={CARD_CLASS}>
      <div className="flex items-center justify-center px-md text-secondary-600 shrink-0">
        <Icon className="text-2xl" />
      </div>
      <div className="flex flex-col flex-1 p-md min-w-0">
        <div className="flex justify-between items-start gap-sm mb-xs">
          <div className="flex min-w-0 items-start gap-xs">
            <h3 className="text-base font-semibold text-foreground-heading m-0 line-clamp-2">
              <button type="button" onClick={() => onSelect(agent)} className={STRETCHED}>
                {agent.title}
              </button>
            </h3>
            <TypeBadge kind="agent" />
          </div>
          {onToggleFavorite && (
            <button
              type="button"
              aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
              onClick={() => onToggleFavorite(agent)}
              className={`relative z-10 shrink-0 ${ICON_BTN}`}
            >
              {isFavorite ? <PiStarFill className="h-4 w-4" /> : <PiStar className="h-4 w-4" />}
            </button>
          )}
        </div>
        <p className="mb-xs text-sm text-foreground leading-relaxed m-0 line-clamp-2">
          {agent.description}
        </p>
        <div className="flex flex-wrap gap-xs">
          {groups.map((g) => (
            <span
              key={g.id}
              className="inline-flex items-center rounded-full bg-grey-100 px-2 py-0.5 text-xs text-foreground-muted dark:bg-grey-800"
            >
              {g.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
