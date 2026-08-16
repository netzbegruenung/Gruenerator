/**
 * Zwei Entscheidungen, die beide am ersten Schritt des Planers hängen: ob ein
 * Werkzeugaufruf ABVERLANGT wird — und die Fähigkeitsfrage, die genau das
 * verhindert.
 */
import { forcesLoopLane } from '@gruenerator/shared/chat-intents';

import { NAMED_RETRIEVAL_INTENTS } from './intents.js';
import { looksLikeExplicitResearchOrder } from './routing.js';

/**
 * Darf der Loop dem Planer einen Werkzeugaufruf ABVERLANGEN (`toolChoice: required`)?
 *
 * Fünf Wege sind über die Zeit hier eingezogen, jeder aus einem eigenen Live-
 * Ausfall — die Kommentare an den Zweigen nennen sie. Herausgezogen, weil eine
 * fünfstellige Oder-Kette mit acht Eingaben mitten in einer 1.700-Zeilen-Funktion
 * nicht prüfbar ist: bis hierher gab es keinen einzigen Test darauf, welcher Weg
 * bei welchem Turn feuert.
 */
export function shouldForceFirstToolCall(input: {
  researchBanned: boolean;
  intent: string | null | undefined;
  hasMcpScope: boolean;
  isMcpCapabilityQuestion: boolean;
  mcpToolCount: number;
  lastUserText: string;
  loopDemotedFromRetrieval: boolean;
  classifierContradictedResearch: boolean;
  /** Der Turn bringt seinen Stoff selbst mit — dieselbe Zahl, die dem SCHREIBER
   *  den Werkzeugkatalog entzieht (`materialDominatesTurn`). */
  materialHeavy: boolean;
}): boolean {
  // Der Bann vetoed alles. `toolChoice: 'required'` ist kein Vorschlag, den das
  // Modell gegen den Satz des Nutzers abwägen kann — unter „ohne neue Recherche"
  // sind die verbleibenden Werkzeuge die falschen.
  if (input.researchBanned) return false;

  // MCP mit gesetztem Server-Scope: eine Fähigkeitsfrage (WS-5 beschreibt die
  // Werkzeuge) braucht keinen Aufruf, alles andere schon.
  if (
    input.intent === 'mcp' &&
    input.hasMcpScope &&
    !input.isMcpCapabilityQuestion &&
    input.mcpToolCount > 0
  ) {
    return true;
  }

  // Ein ausdrückliches „recherchiere das" muss auch suchen. Die Demotion schiebt
  // solche Turns nach `agentic`, wo der Planer gar nichts rufen kann — live als
  // steps=0-Antworten beobachtet, die die eben bestellte Recherche anboten.
  // `direct_response` bleibt der Notausgang (searchTools.ts).
  if (looksLikeExplicitResearchOrder(input.lastUserText)) return true;

  // Derselbe Ausfall ohne das Verb: eine schlichte Faktenfrage, von der Heuristik
  // längst als Abruf erkannt („wer ist aktuell Bundeskanzler in Österreich" →
  // web@0.80), demotiert und dann mit dem Ehrlichkeitshinweis statt einer
  // Nachschlage beantwortet. Das Verdikt des Klassifikators ist das Signal; ein
  // `direct`, das bloß werkzeugfähig aussah, setzt das Flag nicht.
  //
  // …ausser der Turn bringt seinen Stoff selbst mit. Gemessen auf test am
  // 13.08.2026, Turn 4 einer Übersetzungs-Prüfaufgabe: `looksMultiTopic` zog
  // einer 739-Zeichen-Prüfliste 0,30 ab (0,65 → 0,35), die Demotion setzte das
  // Flag, und der Planer MUSSTE suchen — nach dem Artikel, der zwei Nachrichten
  // weiter oben vollständig im Kontext stand. Die acht Snippets landen über
  // `buildSynthSystem` im Prompt des Schreibers, der damit zwei verschiedene
  // „Originale" gegeneinander las: er beanstandete eine vorhandene Überschrift
  // und zitierte „Pflanzen spendeten", während er zugleich Präsens im Original
  // behauptete.
  //
  // Dem Schreiber den Katalog zu entziehen und dem Planer im selben Turn einen
  // Abruf abzuverlangen, waren zwei entgegengesetzte Urteile über denselben Turn.
  // Der Zwang fällt weg, die Möglichkeit bleibt: der Planer DARF suchen, wenn die
  // Aufgabe es verlangt. Das ausdrückliche „recherchiere das" oben ist unberührt.
  if (input.loopDemotedFromRetrieval && !input.materialHeavy) return true;

  // Dritter Weg: die LLM-Stufe sagte „braucht Recherche" und schrieb im selben
  // Atemzug `direct` — ihre eigene Begründung benannte die Suche, die dann nie
  // lief, und die Antwort war vollständig erfunden.
  if (input.classifierContradictedResearch) return true;

  // Vierter Weg, der bis zuletzt keinen hatte: der Klassifikator hat einen
  // Recherche-Intent AUSDRÜCKLICH benannt. Live: „Wie komme ich am Montag früh
  // von Wien nach Graz?" → Auflöser `bahn`, für de-AT nicht verfügbar,
  // Degradierung auf `web` — und dann steps=0 sources=0, Antwort samt einer
  // erfundenen Aussage über den Nutzer aus dem Modellgedächtnis. Ein Intent,
  // dessen ganzer Zweck das Abrufen ist, darf nicht nichts abrufen.
  return NAMED_RETRIEVAL_INTENTS.has(input.intent ?? '');
}

/**
 * WELCHES Werkzeug der erste Schritt rufen muss — oder `null`, wenn die Wahl
 * beim Planer bleibt.
 *
 * `toolChoice: 'required'` garantiert nur IRGENDEINEN Aufruf. Für einen Turn,
 * den eine @-Erwähnung in die Schleife geschoben hat, ist das zu wenig: der
 * Erwähnungstext wird vor dem Modell entfernt (`sanitizeMessageMentions`), das
 * Modell sieht die Wahl also gar nicht und greift zur generischen Suche. Genau
 * dieses Argument steht schon an `guards.emptyResultFallback` — dort ist es der
 * Grund, das Ausweich-Werkzeug zu benennen statt es zu erbitten.
 *
 * Die Regel braucht keine gepflegte Zuordnung Intent→Werkzeug: für die Intents,
 * um die es geht, HEISST das Werkzeug wie der Intent (`bundestag`,
 * `abgeordnetenwatch`, `umfragen`). Wo das nicht zutrifft, greift die Regel
 * nicht und es bleibt bei `required` — `hilfe` etwa montiert
 * `gruenerator_docs_search`, und `mcp` ist überhaupt kein einzelnes Werkzeug.
 *
 * Der Montage-Test ist nicht optional: die Locale-Gitter in `buildChatToolCatalog`
 * lassen `bundestag`/`abgeordnetenwatch` für de-AT weg, und ein Zwang auf ein
 * nicht montiertes Werkzeug bricht den Aufruf.
 */
export function pinnedFirstTool(input: {
  /** Der von einer Erwähnung festgezurrte Intent (`mentionPinnedIntent`). */
  pinnedIntent: string | null;
  /** Der Intent, unter dem der Turn tatsächlich läuft. */
  intent: string | null | undefined;
  isMounted: (toolName: string) => boolean;
}): string | null {
  const pinned = input.pinnedIntent;
  // Eine spätere Stufe darf den Intent umgeschrieben haben; dann war die
  // Erwähnung nicht das letzte Wort und ihr Werkzeug ist nicht mehr gemeint.
  if (!pinned || pinned !== input.intent) return null;
  if (!forcesLoopLane(pinned)) return null;
  return input.isMounted(pinned) ? pinned : null;
}

// A "what can this connector do?" question. When the turn is scoped to one MCP
// server, the answer must be grounded in that server's ACTUAL tools (WS-5), and
// we must NOT force a tool call (the honest answer is a description, not an
// action). Broader than productKnowledge.isMcpMetaQuestion (which needs the
// literal word "mcp"): "was kann @sally" arrives with the mention stripped.
export const MCP_CAPABILITY_QUESTION =
  /\b(was\s+kann\w*|was\s+kannst|welche\s+(?:tools?|funktion\w*|f(?:ä|ae)higkeit\w*|m(?:ö|oe)glichkeit\w*)|wie\s?viele?\s+tools?|wozu|wof(?:ü|ue)r)\b/iu;

/**
 * A "what can this connector do?" question — see {@link MCP_CAPABILITY_QUESTION}.
 */
export function isMcpCapabilityQuestion(text: string): boolean {
  return MCP_CAPABILITY_QUESTION.test(text);
}
