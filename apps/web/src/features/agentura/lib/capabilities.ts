import { type Agent } from '@gruenerator/shared/agents';

/**
 * Was ein Grünerator kann, als Zahlen — nicht als Darstellung.
 *
 * Steht hier und nicht in `CapabilityTags`, weil zwei Flächen dieselbe Auskunft
 * geben: die Chip-Reihe auf der Detailseite und die Meta-Zeile der Marktkachel.
 * Zwei Kopien derselben Zählung laufen auseinander, sobald jemand eine davon
 * um `plugins` oder eine weitere Wissensquelle erweitert.
 */
export function toolCount(agent: Pick<Agent, 'enabledTools' | 'plugins'>): number {
  return (agent.enabledTools?.length ?? 0) + (agent.plugins?.length ?? 0);
}

export function hasKnowledge(
  agent: Pick<Agent, 'defaultNotebookIds' | 'toolRestrictions'>
): boolean {
  return Boolean(
    (agent.defaultNotebookIds?.length ?? 0) > 0 ||
    agent.toolRestrictions?.defaultCollection ||
    (agent.toolRestrictions?.allowedCollections?.length ?? 0) > 0
  );
}
