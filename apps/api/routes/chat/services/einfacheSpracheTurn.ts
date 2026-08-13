/**
 * Die Einfache-Sprache-Kette: Übertragung → blinde Rückübersetzung → Prüfung.
 *
 * Drei Schritte, drei Kontexte, zwei Modelle. Dieses Modul sequenziert die
 * beiden Prüfschritte, NACHDEM die Übertragung fertig gestromt ist — dieselbe
 * Bauform, mit der `deepResearchTurn.ts` seinen Sonderweg neben dem normalen
 * Antwortpfad hält, statt ihn mit Verzweigungen zu durchsetzen.
 *
 * ── Warum überhaupt eine Kette ──
 *
 * Bis zum 13.08.2026 war das ein einziger Turn: der Agent schrieb Übertragung,
 * Zuordnungstabelle, „Schwierige Wörter" und eine Selbstkontrolle in EINE
 * Generierung. Der erste echte Lauf zeigte, was diese Bauform kostet, und zwar
 * dreifach:
 *
 * 1. **Die Selbstkontrolle war wertlos.** Sie meldete „keine schwierigen
 *    Stellen" und durchgehend „vollständig", während ein Ortsname aus dem
 *    Original fehlte. Wer seinen eigenen Text im eigenen Kontext bewertet,
 *    erinnert sich an seine Absicht statt seine Auslassung zu suchen.
 * 2. **Die Kategorien verschwammen.** Der Systemprompt trug den Rezept-Katalog
 *    mit (`recipes 1141` im Log), und das Modell zog die Nachbarrolle
 *    „Rückübersetzung" in die eigene Ausgabe. Beide Rezepte haben ihr `mention`
 *    deshalb verloren: sie sind jetzt Prompt-Quelle dieser Nodes und stehen in
 *    keinem Katalog mehr.
 * 3. **Die Ausgabe zerfiel.** Nach 10022 Zeichen schlug der Degenerations-Guard
 *    zu (`| ----- |`-Wiederholung, danach begann das Modell den ganzen Text von
 *    vorn). Auslöser war die 20-zeilige Zuordnungstabelle am Ende einer langen
 *    Generierung. Sie wohnt jetzt im Prüfschritt — wo sie inhaltlich ohnehin
 *    hingehört, denn sie IST eine Prüfaussage.
 *
 * ── Was hier NICHT passiert ──
 *
 * Die Kette schreibt die Übertragung nicht um. Findet die Prüfung einen
 * KRITISCH-Befund, steht das im Bericht und der Mensch entscheidet. Eine
 * automatische Korrekturrunde wäre der vierte Schritt und braucht eine eigene
 * Messung — bei einem Text, der als barrierefreie Fassung veröffentlicht wird,
 * ist ein sichtbarer Mangel besser als eine stille Ausbesserung.
 *
 * Fail-open in jedem Schritt: fällt ein Prüfteil aus, bekommt der Nutzer seine
 * Übertragung trotzdem, und der fehlende Teil wird benannt statt verschwiegen.
 */

import { einfacheSprachePruefungNode } from '../../../agents/langgraph/ChatGraph/nodes/einfacheSprachePruefungNode.js';
import { einfacheSpracheRueckuebersetzungNode } from '../../../agents/langgraph/ChatGraph/nodes/einfacheSpracheRueckuebersetzungNode.js';
import { createLogger } from '../../../utils/logger.js';

import type { SSEWriter } from './sseHelpers.js';
import type { ChatGraphState } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('EinfacheSprache');

/**
 * Der Agent, der diese Kette auslöst. F1 (CLAUDE.md): Agenten-Identifier werden
 * nicht umbenannt, deshalb steht er hier als Literal und nicht als Suchmuster.
 */
export const EINFACHE_SPRACHE_AGENT_ID = 'gruenerator-einfache-sprache';

export function isEinfacheSpracheAgent(identifier: string | null | undefined): boolean {
  return identifier === EINFACHE_SPRACHE_AGENT_ID;
}

/**
 * Untergrenze, ab der geprüft wird. Unter ein paar hundert Zeichen hat der
 * Nutzer keinen Fachtext übertragen lassen, sondern eine Frage gestellt oder
 * einen Satz getestet — zwei zusätzliche Modellaufrufe wären dann reine Kosten.
 */
const MIN_ES_CHARS = 400;

/** Trennt die drei Teile sichtbar, damit die Prüfung nicht als Fließtext der
 *  Übertragung gelesen wird. */
const RUECK_HEADING = '\n\n---\n\n## Rückübersetzung (blind erstellt)\n\n';
const PRUEF_HEADING = '\n\n---\n\n## Prüfbericht\n\n';

/**
 * Läuft die beiden Prüfschritte und strömt ihre Ergebnisse an denselben
 * Nachrichtentext an, den die Übertragung schon gefüllt hat.
 *
 * @returns der angehängte Text (leer, wenn nichts geprüft wurde). Der Aufrufer
 *   hängt ihn an `fullText`, damit Persistenz und Neuladen denselben Stand
 *   sehen wie der Bildschirm.
 */
export async function runEinfacheSprachePruefkette(params: {
  state: ChatGraphState;
  sse: SSEWriter;
  /** Die fertig gestromte Fassung in Einfacher Sprache (Schritt 1). */
  esText: string;
  /** Der Ausgangstext, den der Nutzer übertragen lassen wollte. */
  original: string;
}): Promise<string> {
  const { state, sse, esText, original } = params;

  if (esText.trim().length < MIN_ES_CHARS) {
    log.info(
      `[ES] Übertragung nur ${esText.trim().length} Zeichen (< ${MIN_ES_CHARS}) — keine Prüfung`
    );
    return '';
  }
  if (!original.trim()) {
    log.warn('[ES] Kein Original gefunden — keine Prüfung');
    return '';
  }

  let appended = '';
  const emit = (text: string): void => {
    appended += text;
    sse.send('text_delta', { text });
  };

  // ── Schritt 2: blinde Rückübersetzung ──
  sse.send('progress_step', {
    stepId: 'es-rueck',
    toolName: 'einfache_sprache',
    title: 'Rückübersetzung (blind)…',
    status: 'in_progress',
  });
  const rueck = await einfacheSpracheRueckuebersetzungNode(state, esText);
  sse.send('progress_step', {
    stepId: 'es-rueck',
    toolName: 'einfache_sprache',
    title: 'Rückübersetzung (blind)…',
    status: 'completed',
  });
  if (rueck) emit(RUECK_HEADING + rueck);

  // ── Schritt 3: unabhängige Prüfung ──
  sse.send('progress_step', {
    stepId: 'es-pruefung',
    toolName: 'einfache_sprache',
    title: 'Prüfe Vollständigkeit…',
    status: 'in_progress',
  });
  const bericht = await einfacheSprachePruefungNode(state, {
    original,
    esText,
    rueckuebersetzung: rueck,
  });
  sse.send('progress_step', {
    stepId: 'es-pruefung',
    toolName: 'einfache_sprache',
    title: 'Prüfe Vollständigkeit…',
    status: 'completed',
  });

  if (bericht) {
    emit(PRUEF_HEADING + bericht);
  } else {
    // Benannt statt verschwiegen: ohne diesen Satz sähe eine ungeprüfte
    // Übertragung genauso aus wie eine freigegebene.
    emit(
      PRUEF_HEADING +
        'Die Prüfung ist nicht zustande gekommen. Die Fassung oben ist **ungeprüft** — ' +
        'lass sie vor der Veröffentlichung gegenlesen.'
    );
  }

  log.info(
    `[ES] Kette fertig: ES ${esText.length}c, Rück ${rueck?.length ?? 0}c, Bericht ${bericht?.length ?? 0}c`
  );
  return appended;
}
