/**
 * Die Zahlen eines notebook-gebundenen Chat-Turns müssen zueinander passen.
 *
 * Sie stehen in vier Dateien — Stufenprofil, `searchNode`, `directSearchExecutors`,
 * `rerankNode` —, und jede einzelne sieht für sich plausibel aus. Kaputt gehen
 * sie nur im Verhältnis, und zwar still: ein zu enges Reranker-Fenster wirft
 * bezahlte Treffer weg, eine zu niedrige Übermaß-Decke lässt die Suche weniger
 * liefern als der Reranker gleich darauf sehen will, und eine Ausgabe über der
 * Prompt-Decke verliert Quellen zwischen Reranker und Systemnachricht. In allen
 * drei Fällen läuft der Turn durch und antwortet — nur mit weniger Material.
 * Genau so hat der LV-Agent 10 statt 18 Quellen bekommen.
 *
 * Deshalb prüft dieser Test keine einzelne Konstante, sondern die Kette.
 */
import { describe, it, expect } from 'vitest';

import { MAX_SOURCES } from '../agents/langgraph/ChatGraph/nodes/citableSources.js';

import { CHAT_NOTEBOOK_DEPTH, getChatNotebookProfile } from './notebookDepthProfiles.js';

/** Spiegelt `OVERFETCH_CEILING` in `routes/chat/agents/directSearchExecutors.ts`.
 *  Nicht importiert, weil die Konstante modul-privat ist und es bleiben soll —
 *  der Wert gehört dorthin, die Zusicherung hierher. */
const OVERFETCH_CEILING = 80;

describe('Chat-Turn an einem gebundenen Notebook', () => {
  const profile = getChatNotebookProfile();

  it('läuft auf der Stufe, die die Notebook-Fläche voreinstellt', () => {
    // `deep` ist dort „Mittel" und der Startwert (DEFAULT_NOTEBOOK_DEPTH).
    // Der Chat hat keinen Regler; Gleichstand mit der Voreinstellung ist die
    // Zusage, nicht „Chat ist die gründlichste Fläche" (das wäre `ultra`, und
    // dessen drei Formulierungen kann im Chat niemand wählen).
    expect(CHAT_NOTEBOOK_DEPTH).toBe('deep');
  });

  it('holt mehr Kandidaten, als es am Ende Quellen gibt — sonst wählt der Reranker nicht aus', () => {
    // Der Kern des Befunds: vorher waren beide Zahlen 10, und ein Reranker,
    // der so viele Kandidaten bekommt, wie er durchlässt, ist ein Durchreicher.
    expect(profile.searchLimit).toBeGreaterThan(profile.rerankOutput);
  });

  it('reicht jeden geholten Kandidaten bis vor den Cross-Encoder durch', () => {
    // Kappe in `searchNode` (sortLimit) und Fenster in `rerankNode` (rerankInput)
    // dürfen nicht unter die Zahl fallen, die eine Sammlung liefert.
    expect(profile.sortLimit.single).toBeGreaterThanOrEqual(profile.searchLimit);
    expect(profile.sortLimit.multi).toBeGreaterThanOrEqual(profile.sortLimit.single);
    expect(profile.rerankInput).toBeGreaterThanOrEqual(profile.searchLimit);
  });

  it('fordert von Qdrant nicht mehr an, als die Übermaß-Decke durchlässt', () => {
    // `executeDirectSearch` fragt mit `limit * 2`, gedeckelt. Liegt die Decke
    // unter dem doppelten searchLimit, kommt stumm weniger zurück als bestellt.
    expect(profile.searchLimit * 2).toBeLessThanOrEqual(OVERFETCH_CEILING);
  });

  it('lässt nicht mehr Quellen überleben, als in den Prompt passen', () => {
    // `buildCitableSources` schneidet bei MAX_SOURCES ab. Was der Reranker
    // darüber hinaus durchlässt, ist bezahlte Rechenzeit für nichts.
    expect(profile.rerankOutput).toBeLessThanOrEqual(MAX_SOURCES);
  });

  it('lässt die STUFE bei einer Formulierung — die zweite kommt aus searchNode', () => {
    // Hält den Preis der Stufe fest: `ultra` sucht dreimal, und diese
    // Entscheidung darf nicht durch die Hintertür in den Chat rutschen.
    //
    // Seit #3121 heisst das NICHT mehr „der Chat sucht mit einer Formulierung":
    // `searchNode` hängt für notebook-gebundene Turns EINE Paraphrase aus
    // `expandQuery` an (searchNode.ts, `keepAlternatives`), also zwei Anfragen
    // je Sammlung. Diese Zahl steht an der Aufrufstelle und nicht im Profil,
    // weil sie den Chat betrifft und nicht die Notebook-Fläche — die läuft
    // weiter mit einer. Gepinnt wird sie in
    // `agents/langgraph/ChatGraph/nodes/searchNodeNotebookExpansion.vitest.ts`.
    expect(profile.queryVariants).toBe(1);
  });
});
