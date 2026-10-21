import { type AgenturaType } from './agenturaCategories.js';

/** Was eine Marktkachel für den Typ-Filter über sich wissen muss — mehr nicht. */
export interface AgenturaFilterable {
  kind: 'agent' | 'recipe' | 'task';
  isFavorite: boolean;
}

/**
 * Greift der Typ-Filter auf diese Kachel?
 *
 * Liegt in `shared`, weil Web und Mobile denselben Regler zeigen und zwei
 * Kopien dieser vier Zeilen genau dann auseinanderlaufen, wenn jemand eine
 * sechste Gattung einführt. `fav` ist bewusst kein `kind`, sondern eine
 * Markierung quer über alle drei — deshalb steht es nicht in der Union.
 */
export function matchesAgenturaType(type: AgenturaType, item: AgenturaFilterable): boolean {
  if (type === 'all') return true;
  if (type === 'fav') return item.isFavorite;
  return item.kind === type;
}

/**
 * Die Meta-Zeile einer Marktkachel („Agent · 5 Tools · Wissen").
 *
 * Nimmt die Teile so, wie die Aufrufer sie haben, und wirft Leeres weg — sonst
 * steht bei einem Grünerator ohne Tools ein nacktes „Agent · " auf der Karte.
 */
export function agenturaMetaLine(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' · ');
}
