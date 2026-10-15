import { type PublicTextForm, type TextForm } from '@gruenerator/contracts';
import {
  USER_SELECTABLE_TOOLS,
  agentRef,
  getAgentSlug,
  type Agent,
} from '@gruenerator/shared/agents';
import { type RecipeSource } from '@gruenerator/shared/grueneratoren';

import { WEB_ORIGIN } from '../../../services/webOrigin';

type AgentFacts = Pick<
  Agent,
  'id' | 'identifier' | 'enabledTools' | 'plugins' | 'defaultNotebookIds' | 'toolRestrictions'
>;

/** Werkzeuge eines Agents als Beschriftung; unbekannte Schlüssel bleiben roh, doppelte fallen weg. */
export function agentToolLabels(agent: AgentFacts): string[] {
  const labels = [...(agent.enabledTools ?? []), ...(agent.plugins ?? [])].map(
    (key) => USER_SELECTABLE_TOOLS.find((t) => t.key === key)?.label ?? key
  );
  return [...new Set(labels)];
}

/** Notebooks und Sammlungen, die ein Agent als Wissensbasis mitbringt — wie im Web. */
export function agentKnowledge(agent: AgentFacts): string[] {
  return [
    ...(agent.defaultNotebookIds ?? []),
    ...(agent.toolRestrictions?.defaultCollection
      ? [agent.toolRestrictions.defaultCollection]
      : []),
    ...(agent.toolRestrictions?.allowedCollections ?? []),
  ];
}

/**
 * Der Link auf die Web-Detailseite. Immer über `agentRef(…, false)`: der Link
 * ist für jemand anderen, und dessen Liste kennt einen fremden Agent nur per uuid.
 */
export function agentShareUrl(agent: Pick<Agent, 'id' | 'identifier'>): string {
  return `${WEB_ORIGIN}/agentura/agent/${encodeURIComponent(getAgentSlug(agentRef(agent, false)))}`;
}

export function recipeShareUrl(mention: string): string {
  return `${WEB_ORIGIN}/agentura/rezept/${encodeURIComponent(mention)}`;
}

/**
 * Woher eine fremde Rezept-Zeile kommt — dieselbe Formulierung wie
 * `recipeOriginLine` im Web (`apps/web/…/agentura/recipes/recipeMeta.ts`).
 */
export function recipeOriginLine(
  form: { sharedFromGroup: string | null; ownerName: string | null },
  source: RecipeSource
): string | null {
  if (source === 'shared') {
    const group = form.sharedFromGroup ?? 'einem Projekt';
    return `Geteilt aus ${group}${form.ownerName ? ` von ${form.ownerName}` : ''}`;
  }
  if (source === 'public') {
    return `Öffentlich${form.ownerName ? ` · ${form.ownerName}` : ''}`;
  }
  return null;
}

/** Eigene und geteilte Zeilen tragen die Beispiele selbst, öffentliche nur die Zahl. */
export function exampleCountOf(form: TextForm | PublicTextForm): number {
  return 'examples' in form ? form.examples.length : form.exampleCount;
}

export function exampleCountLabel(count: number): string {
  return count === 1 ? '1 Beispiel hinterlegt' : `${count} Beispiele hinterlegt`;
}

/**
 * Verweis für „Zu meinen Grüneratoren" — wie `libraryRefOf` im Web: die Mention
 * bei Katalog-Rezepten, die Zeilen-ID bei fremden. Ein eigenes Rezept steht
 * ohnehin unter „Meine", also `null`.
 */
export function recipeLibraryRef(
  source: RecipeSource,
  mention: string,
  formId: string | null
): string | null {
  if (source === 'system') return mention;
  if (source === 'own') return null;
  return formId;
}
