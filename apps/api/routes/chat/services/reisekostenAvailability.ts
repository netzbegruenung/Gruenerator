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
 * Das angeheftete Rezept trägt die Folge-Turns („Rückkehr war 22 Uhr"), die
 * das Schlagwort nicht mehr enthalten; der Client schickt es mit jedem Turn.
 */
const REISEKOSTEN_PATTERN = /reise-?kosten|fahrt-?kosten|spesenabrechnung/i;

export function isReisekostenTurn(activeSkillMention: string | null | undefined, text: string) {
  return activeSkillMention?.startsWith('reisekosten') === true || REISEKOSTEN_PATTERN.test(text);
}
