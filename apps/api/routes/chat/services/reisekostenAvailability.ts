/**
 * Eine Frage, ein Ort: Geht es in diesem Turn um eine Reisekostenabrechnung?
 *
 * Zwei Entscheidungen hängen daran — ob `reisekosten_abrechnung` montiert wird
 * (`toolCatalog`) und ob der Turn in den Loop geht (`routingStage` →
 * `decideRunAgentic`). Eine Abrechnungsbitte mit angehängten Belegen sieht sonst
 * aus wie ein Schreibauftrag mit eigenem Material und bliebe im Einzeldurchlauf,
 * wo das Werkzeug nicht existiert. Dieselbe Arbeitsteilung wie
 * `pdfFormAvailability`: zwei Kopien des Prädikats liefen dort auseinander.
 *
 * Folge-Turns („Rückkehr war 22 Uhr") nennen das Schlagwort nicht mehr. Ein
 * per Popover angeheftetes Rezept reist mit jedem Turn mit, ein getipptes
 * `/reisekosten-nrw` dagegen nur in seinem eigenen. Deshalb zählen auch frühere
 * Nutzernachrichten: ihre Mention-Tokens stehen dort als „@Reisekosten NRW
 * (Beta)" und treffen das Schlagwort. Ohne das rechnete der Folge-Turn im
 * Einzeldurchlauf ohne Werkzeug — genau das, was der Kern verhindern soll.
 */
import { type ModelMessage } from 'ai';

import { extractTextContent } from './messageHelpers.js';

const REISEKOSTEN_PATTERN = /reise-?kosten|fahrt-?kosten|spesenabrechnung/i;

export function isReisekostenTurn(
  activeSkillMention: string | null | undefined,
  text: string,
  messages: readonly ModelMessage[] = []
): boolean {
  if (activeSkillMention?.startsWith('reisekosten') === true) return true;
  if (REISEKOSTEN_PATTERN.test(text)) return true;
  return messages.some(
    (m) => m.role === 'user' && REISEKOSTEN_PATTERN.test(extractTextContent(m.content))
  );
}
