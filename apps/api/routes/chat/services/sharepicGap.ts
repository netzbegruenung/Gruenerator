import { hasTermin } from '../../../services/sharepicCreator/briefFacts.js';

import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';
import type { SharepicBerichtEintrag } from '@gruenerator/contracts';

/**
 * Die Antwort auf eine Lücke, die das letzte Sharepic gemeldet hat: es ließ den
 * Termin weg („fehlt"), und der Turn liefert einen Tag nach („Do., 20.11., 18 Uhr").
 */
export function fillsSharepicGap(
  bericht: readonly SharepicBerichtEintrag[] | null,
  order: string
): boolean {
  return (
    bericht?.some((e) => e.art === 'fehlt' && e.fakt === 'termin') === true && hasTermin(order)
  );
}

/** Der Thread hält ein Sharepic — dieselbe Frage im Router und in den frühen Handlern. */
export function stateHasSharepic(state: ChatGraphState): boolean {
  return (
    state.currentSharepic != null ||
    state.lastTurnEditables?.includes('sharepic') === true ||
    state.threadArtifacts?.some((a) => a.kind === 'sharepic') === true
  );
}
