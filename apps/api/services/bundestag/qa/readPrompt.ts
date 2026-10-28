/**
 * Prompt der Stufe „read": das Modell sieht nur den Auftrag und EIN Fenster
 * samt Kopf — nie andere Dokumente, nie Antwort-Entwürfe.
 */
import { type BundestagAuftrag } from '@gruenerator/contracts';

import { MAX_POINTS_PER_WINDOW } from './budget.js';

const BASE = `Du liest einen Ausschnitt aus einem Dokument des Deutschen Bundestags und meldest belegte Aussagen.
Regeln:
- Jedes "zitat" ist wörtlich aus dem Ausschnitt übernommen (keine Kürzung mit „…", keine Umformulierung) und belegt seine "aussage".
- Keine Punkte ohne Beleg. Was nicht im Ausschnitt steht, meldest du nicht.
- Relevant ist, was in der Sache zum Thema der Frage gehört, auch wenn der Ausschnitt es mit anderen Worten sagt (Synonyme, die zugrunde liegende Regelung; z. B. Regelaltersgrenze oder Renteneintrittsalter zu „Rente mit 70").
- Höchstens ${MAX_POINTS_PER_WINDOW} Punkte. "relevant" ist false, wenn der Ausschnitt nichts zum Auftrag beiträgt; dann ist "punkte" leer.`;

const SUMMARY_FOCUS = `
Auftrag ist eine Zusammenfassung. Achte auf: Ziel, Maßnahmen, Kosten und Fristen, Begründung.`;

export function readSystem(auftrag: BundestagAuftrag): string {
  return auftrag === 'zusammenfassung' ? BASE + SUMMARY_FOCUS : BASE;
}

export interface WindowHeader {
  ref: string;
  typ: string;
  datum: string;
  urheber: string[];
  teil: number;
  teile: number;
}

export function readPrompt(
  question: string,
  auftrag: BundestagAuftrag,
  header: WindowHeader,
  window: string
): string {
  const label = auftrag === 'zusammenfassung' ? 'Auftrag' : 'Frage';
  const kopf = [
    `Ref: ${header.ref}`,
    `Typ: ${header.typ}`,
    `Datum: ${header.datum}`,
    `Urheber: ${header.urheber.join(', ') || 'unbekannt'}`,
    `Teil ${header.teil}/${header.teile}`,
  ].join('\n');
  return `${label}: ${question}\n\n--- Ausschnitt ---\n${kopf}\n\n${window}`;
}
