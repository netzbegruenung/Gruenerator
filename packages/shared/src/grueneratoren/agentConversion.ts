/**
 * Umwandeln eines eigenen Agents in ein Rezept oder ein Projekt — was Web und
 * App gleich zeigen: die Bezeichnung je Teil, das Ergebnis und welches Ziel zu
 * einem Agent passt. Die Entscheidung, was mitkommt, trifft der Server
 * (`POST /api/user-agents/:identifier/convert`, Probelauf mit `dryRun`).
 */
import {
  type AgentConversionBody,
  type AgentConversionItem,
  type AgentConversionOutcome,
  type AgentConversionPart,
  type AgentConversionResponse,
  type AgentConversionTarget,
} from '@gruenerator/contracts';

import { type Agent } from '../agents/index.js';
import { apiErrorFromResponse, getContractsClient } from '../api/index.js';

export const AGENT_CONVERSION_PART_LABEL: Record<AgentConversionPart, string> = {
  role: 'Anweisungen',
  examples: 'Beispiele',
  notebooks: 'Notebooks',
  defaultRecipe: 'Standard-Rezept',
  opening: 'Begrüßung und Startfragen',
  groupShares: 'Freigaben in Projekten',
  public: 'Veröffentlichung',
  tools: 'Werkzeug-Auswahl',
  model: 'Modell',
  recurringTasks: 'Wiederkehrende Aufgaben',
};

export const AGENT_CONVERSION_OUTCOME_LABEL: Record<AgentConversionOutcome, string> = {
  carried: 'Kommt mit',
  later: 'Bleibt vorerst am Agent',
  dropped: 'Fällt weg',
};

export const AGENT_CONVERSION_TARGET_LABEL: Record<AgentConversionTarget, string> = {
  recipe: 'Rezept',
  project: 'Projekt',
};

/** Was die Umwandlung vom Agent braucht — ohne `systemRole`, damit auch fremde Ansichten ihn tragen. */
export type ConvertibleAgent = Pick<
  Agent,
  | 'id'
  | 'identifier'
  | 'title'
  | 'defaultNotebookIds'
  | 'defaultRecipeId'
  | 'defaultRecipeMention'
  | 'migratedTo'
>;

/** Notebooks oder ein Standard-Rezept sind mehrere Bausteine — das passt ins Projekt. */
export function recommendedConversionTarget(agent: ConvertibleAgent): AgentConversionTarget {
  const hasNotebooks = (agent.defaultNotebookIds?.length ?? 0) > 0;
  const hasRecipe = !!(agent.defaultRecipeId || agent.defaultRecipeMention);
  return hasNotebooks || hasRecipe ? 'project' : 'recipe';
}

/** Das Ziel, mit dem ein Dialog startet: ein vorhandener Nachfolger, sonst die Empfehlung. */
export function initialConversionTarget(agent: ConvertibleAgent): AgentConversionTarget {
  if (agent.migratedTo?.recipe) return 'recipe';
  if (agent.migratedTo?.project) return 'project';
  return recommendedConversionTarget(agent);
}

export function isAgentConverted(agent: ConvertibleAgent): boolean {
  return !!(agent.migratedTo?.recipe || agent.migratedTo?.project);
}

/** Ob beim Umwandeln dasselbe herauskam wie im Probelauf angekündigt. */
export function sameConversionOutcomes(
  planned: readonly AgentConversionItem[],
  actual: readonly AgentConversionItem[]
): boolean {
  const outcome = new Map(planned.map((i) => [i.part, i.outcome]));
  return actual.every((i) => outcome.get(i.part) === i.outcome);
}

export async function requestAgentConversion(
  identifier: string,
  body: AgentConversionBody,
  fallbackMessage: string
): Promise<AgentConversionResponse> {
  const res = await getContractsClient().userAgents.convert({ params: { identifier }, body });
  if (res.status === 200) return res.body;
  throw apiErrorFromResponse(res, fallbackMessage);
}
