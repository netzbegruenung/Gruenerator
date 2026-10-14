import { type AgentListItem } from '@gruenerator/chat';
import { type PublicTextForm, type RecurringTask, type TextForm } from '@gruenerator/contracts';
import { agentRef } from '@gruenerator/shared/agents';
import { sortByUsage, type UsageMap } from '@gruenerator/shared/utils';
import { type ReactNode } from 'react';
import { PiSparkle } from 'react-icons/pi';

import { PhosphorIcon } from '../../agents/icons/PhosphorIcon';

import type { AgenturaSort } from './categories';
import type { ForeignAgent } from '../../agents/api';
import type { Agent, SkillCategory } from '@gruenerator/shared/agents';

import { getAgentIcon } from '@/components/layout/Sidebar/sidebarAgentConfig';

export function matchesQuery(haystack: string[], q: string): boolean {
  return haystack.some((v) => v.toLowerCase().includes(q));
}

/**
 * Reorder a list per the active sort. `empfohlen` (the default) ranks by the
 * user's own usage when a `usage` option is supplied — most-recently/most-used
 * first, registry order for never-used — otherwise keeps registry order.
 */
export function sortBy<T>(
  items: T[],
  sort: AgenturaSort,
  title: (t: T) => string,
  usage?: { getId: (t: T) => string; map: UsageMap }
): T[] {
  if (sort === 'az') return [...items].sort((a, b) => title(a).localeCompare(title(b)));
  if (usage) return sortByUsage(items, usage.getId, usage.map);
  return items;
}

/** Icon node for an agent chip — user agents use their chosen Phosphor `iconKey`. */
export function AgentIcon({ agent, isUser }: { agent: ForeignAgent; isUser?: boolean }) {
  if (isUser) return <PhosphorIcon name={agent.iconKey ?? 'PiSparkle'} />;
  const Icon = getAgentIcon(agent.identifier);
  return <Icon />;
}

/** Only own agents carry the prompt, so only they can be edited or duplicated. */
export type AgentEntry =
  | { agent: Agent; isUser: true; editable: true }
  | { agent: ForeignAgent; isUser: false; editable: false };

export const ownEntry = (agent: Agent): AgentEntry => ({ agent, isUser: true, editable: true });
export const foreignEntry = (agent: ForeignAgent): AgentEntry => ({
  agent,
  isUser: false,
  editable: false,
});

/**
 * One shape for every recipe card, whether it comes from the shipped catalogue
 * (`AgentListItem`) or from a user's own/shared/public row (`TextForm` /
 * `PublicTextForm`). `id` is `null` for catalogue skills — they have no row of
 * their own. `shareLabel` is the muted origin line ("Geteilt aus …" / "Von der
 * Basis …"), rendered in the card footer; `null` for one's own and for
 * catalogue skills.
 */
export interface RecipeEntry {
  mention: string;
  title: string;
  description: string;
  icon: ReactNode;
  editable: boolean;
  id: string | null;
  shareLabel: string | null;
  /** Nur Katalog-Rezepte tragen einen Gang; eigene Rezepte haben keinen. */
  skillCategory?: SkillCategory;
  onDelete?: () => void;
}

/** A catalogue skill as a recipe card — never editable, no share label. */
export function recipeFromSkill(skill: AgentListItem): RecipeEntry {
  const Icon = skill.icon ?? PiSparkle;
  return {
    mention: skill.mention,
    title: skill.title,
    description: skill.description,
    icon: <Icon />,
    editable: false,
    id: null,
    shareLabel: null,
    skillCategory: skill.skillCategory ?? 'sonstiges',
  };
}

/** A user recipe row (own, shared or public) as a recipe card. */
export function recipeFromForm(
  form: TextForm | PublicTextForm,
  opts: { editable: boolean; shareLabel: string | null; onDelete?: () => void }
): RecipeEntry {
  return {
    mention: form.mention,
    title: form.title,
    description: form.description ?? '',
    icon: <PhosphorIcon name={form.iconKey ?? 'PiSparkle'} />,
    editable: opts.editable,
    id: form.id,
    shareLabel: opts.shareLabel,
    onDelete: opts.onDelete,
  };
}

/**
 * Eine Kachel im flachen Raster. Diskriminierte Union — nicht destrukturieren,
 * sonst verliert der Compiler die Verengung in den Zweigen.
 */
export type MarketItem =
  | { kind: 'agent'; isFavorite: boolean; entry: AgentEntry; fromLibrary?: boolean }
  | { kind: 'recipe'; isFavorite: boolean; entry: RecipeEntry; fromLibrary?: boolean }
  | { kind: 'task'; isFavorite: boolean; task: RecurringTask };

/** Was eine Suche an einer Kachel liest — eine Fassung für Übersicht und Agentura. */
export function marketItemText(item: MarketItem): string[] {
  if (item.kind === 'agent')
    return [item.entry.agent.title, item.entry.agent.identifier, item.entry.agent.description];
  if (item.kind === 'recipe') return [item.entry.title, item.entry.mention, item.entry.description];
  return [item.task.title, item.task.instruction];
}

/**
 * Unter welchem Verweis „Zu meinen Grüneratoren" eine Kachel führt: bei Agents
 * der agentRef, bei Rezepten die Zeilen-id — die Mention eines Nutzer-Rezepts
 * ist nur pro Besitzer eindeutig. Katalog-Rezepte haben keine Zeile und führen
 * ihre Mention, die im Katalog eindeutig ist.
 */
export function libraryRefOf(item: MarketItem): string | null {
  if (item.kind === 'agent') return agentRef(item.entry.agent, item.entry.isUser);
  if (item.kind === 'recipe') return item.entry.id ?? item.entry.mention;
  return null;
}
