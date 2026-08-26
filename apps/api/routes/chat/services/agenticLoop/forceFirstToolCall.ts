/**
 * Zwei Entscheidungen, die beide am ersten Schritt des Planers hängen: ob ein
 * Werkzeugaufruf ABVERLANGT wird — und die Fähigkeitsfrage, die genau das
 * verhindert.
 */
import { NAMED_RETRIEVAL_INTENTS } from './intents.js';
import { isReferentialFollowup, looksLikeExplicitResearchOrder } from './routing.js';

/**
 * Darf der Loop dem Planer einen Werkzeugaufruf ABVERLANGEN (`toolChoice: required`)?
 *
 * Sieben Wege sind über die Zeit hier eingezogen, jeder aus einem eigenen Live-
 * Ausfall oder — beim Werkzeug-Pin — aus einer Stilllegung; die Kommentare an den
 * Zweigen nennen sie. Herausgezogen, weil eine mehrstellige Oder-Kette mit neun
 * Eingaben mitten in einer 1.700-Zeilen-Funktion nicht prüfbar ist: bis hierher
 * gab es keinen einzigen Test darauf, welcher Weg bei welchem Turn feuert.
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
  /** Eine @-Erwähnung hat ein Werkzeug benannt (`mentionPinnedTool`). */
  pinnedTool: string | null;
  /** Der Thread hat in Reichweite der Werkzeug-Wiedergabe schon INFORMATION
   *  geholt (`priorTurnRetrieved` — dieselben Schritte, die als Beobachtungen
   *  in den Kontext gespielt werden). Der Abrufkontext dieses Turns steht damit
   *  im Thread, nicht in seinem eigenen Verdikt. */
  priorTurnRetrieved: boolean;
  /** Der Turn hat angehängte Dokumente (`retrievableAttachedSources`). */
  hasAttachedDocuments?: boolean;
  /** Die Nachricht bittet um eine Zusammenfassung (`isSummaryAsk`). */
  summaryAsk?: boolean;
  /** Der Vorab-Abruf hat für DIESEN Turn Passagen aus den angehängten
   *  Dokumenten in die Quellenregistry gelegt (`seedAttachedDocuments`). */
  attachedSeedDelivered?: boolean;
}): boolean {
  // Der Bann vetoed alles. `toolChoice: 'required'` ist kein Vorschlag, den das
  // Modell gegen den Satz des Nutzers abwägen kann — unter „ohne neue Recherche"
  // sind die verbleibenden Werkzeuge die falschen.
  if (input.researchBanned) return false;

  // Fünfter Weg: die Person hat ein Werkzeug BENANNT. Er steht neben dem
  // Intent-Weg unten und nicht in ihm, weil ein Pin keinen Intent mehr braucht —
  // `@umfragen` läuft seit der Stilllegung als `agentic`, und `agentic` ist aus
  // `NAMED_RETRIEVAL_INTENTS` ausgenommen (es IST der Auffangwert). Ohne diesen
  // Zweig verlöre genau diese Erwähnung den Werkzeugzwang, den sie vorher hatte.
  if (input.pinnedTool != null) return true;

  // Achter Weg: eine Zusammenfassung eines ANGEHÄNGTEN Dokuments. Steht neben
  // dem Intent-Weg unten, weil der Intent hier nicht verlässlich ist — der
  // Klassifikator schiebt Dokument-Turns nach `search`, kann aber auch `summary`
  // oder `agentic` schreiben, und `agentic` ist aus `NAMED_RETRIEVAL_INTENTS`
  // ausgenommen. Welches Werkzeug es sein muss, steht in `pinnedFirstTool`:
  // `summarize` liest den Volltext, alles andere sieht nur Passagen.
  if (input.hasAttachedDocuments && input.summaryAsk) return true;

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

  // Siebter Weg: die rückbezügliche Anschlussfrage nach einem Abruf-Turn.
  //
  // Gemessen am 20.08.2026 mit einer Zwei-Turn-Sonde auf `classifierNode`
  // (`followup-bundestag-scope`, der Messpunkt, der über zwei Abnahmeläufe
  // fünfmal fünf verschiedene Werkzeugwahlen ergab):
  //
  //   t0 „Wie hat die SPD zum Heizungsgesetz abgestimmt?"
  //      → abgeordnetenwatch@0.65, demotiert, loopDemotedFromRetrieval=TRUE
  //   t1 „Und die FDP?"
  //      → direct@0.25, demotiert, loopDemotedFromRetrieval=FALSE
  //
  // t0 trägt der Demotions-Zweig. t1 trug bis hier NIEMAND: das Abruf-Verdikt steht
  // im Turn davor, dieser Turn nennt nur noch die Differenz. `agentic` ist der
  // Auffangwert und darf nicht zwingen — deshalb entschied allein der Planer,
  // ob er nachschlägt, und genau das ist die Streuung. Die Korpus-Notiz führte
  // sie auf den Planer-Host zurück; die Sonde zeigt, dass der Zwang ihn für
  // diesen Turn nie erreicht hat.
  //
  // Drei Bedingungen, und alle drei sind nötig:
  //  - der Abrufkontext liegt im THREAD (der vorige Turn holte Information),
  //  - der Turn ist der Auffangwert (`agentic`); ein benanntes Abruf-Verdikt
  //    trägt der `NAMED_RETRIEVAL_INTENTS`-Zweig, ein demotiertes der
  //    `loopDemotedFromRetrieval`-Zweig,
  //  - der Text ist eine Anschlussfrage und keine Meta-Anweisung über die
  //    vorige ANTWORT (`isReferentialFollowup`; „fasse das kürzer" ist
  //    ebenfalls kurz und rückbezüglich und darf hier nie ankommen).
  //
  // Eigenes Material sticht auch hier, aus demselben Grund wie beim
  // Demotions-Zweig.
  if (
    input.priorTurnRetrieved &&
    input.intent === 'agentic' &&
    !input.materialHeavy &&
    isReferentialFollowup(input.lastUserText)
  ) {
    return true;
  }

  // Vierter Weg, der bis zuletzt keinen hatte: der Klassifikator hat einen
  // Recherche-Intent AUSDRÜCKLICH benannt. Live: „Wie komme ich am Montag früh
  // von Wien nach Graz?" → Auflöser `bahn`, für de-AT nicht verfügbar,
  // Degradierung auf `web` — und dann steps=0 sources=0, Antwort samt einer
  // erfundenen Aussage über den Nutzer aus dem Modellgedächtnis. Ein Intent,
  // dessen ganzer Zweck das Abrufen ist, darf nicht nichts abrufen.
  //
  // …es sei denn, für diesen Turn ist bereits abgerufen worden. Der Vorab-Seed
  // holt die Passagen der angehängten Dokumente, BEVOR der Planer seinen ersten
  // Zug macht, und legt sie dem Schreiber als zitierbare Quellen hin. Damit ist
  // die Bedingung dieses Zweigs erfüllt — es wird nicht nichts abgerufen — und
  // der Zwang fordert nur noch einen Aufruf um des Aufrufs willen. Dasselbe
  // Argument wie bei `materialHeavy` an den zwei Zweigen darüber; es ist bloss
  // ein anderer Kanal, über den der Stoff hereinkommt (Quellenregistry statt
  // Nachrichten), weshalb `materialHeavy` ihn nicht sieht.
  //
  // Zwei Live-Ausfälle, beide mit demselben Bau: Zwang + nichts Sinnvolles mehr
  // zu rufen = der Planer greift daneben.
  //  - 23.08.2026: `media` gerufen, ein FREMDES Dokument zusammengefasst. Damals
  //    mit einem Pin behandelt (`pinnedFirstTool` → `summarize`) — der deckt
  //    genau die Zusammenfassungsfrage ab.
  //  - 24.08.2026, Thread 4517d0d9, „erstelle daraus eine tabelle": keine
  //    Zusammenfassungsfrage, also kein Pin, also freie Wahl unter `required` —
  //    `read_pdf_form` auf eine Datenschutzerklärung, ein Schritt und rund 4 s
  //    von 13,6 s für „Es ist kein PDF-Formular angehängt".
  //
  // Der Zwang fällt weg, die Möglichkeit bleibt: `toolChoice` ist dann `auto`,
  // der Planer DARF weiter nachfassen (`dokumente_lesen` mit einer anderen
  // Frage, `summarize` für den Volltext), er muss es nur nicht mehr blind.
  //
  // Bewusst NUR an diesem Zweig. Die drei Zweige darüber, die auch noch feuern
  // könnten, meinen etwas anderes als „hol den Stoff dieses Turns":
  // `looksLikeExplicitResearchOrder` ist ein ausdrücklicher Auftrag („recherchiere
  // dazu aktuelle Zahlen" ist mit Passagen aus dem Anhang NICHT erledigt),
  // `classifierContradictedResearch` ist ein Widerspruch im Verdikt, und die
  // beiden Material-Zweige prüfen ihre eigene Bedingung bereits selbst.
  if (input.attachedSeedDelivered) return false;

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
 * WELCHES Werkzeug gemeint ist, steht in der Registry an der Erwähnung
 * (`IntentMention.pinsTool`) und kommt als `mentionPinnedTool` hier an — diese
 * Funktion entscheidet nur noch, ob der Pin auch trägt. Erwähnungen ohne
 * einzelnes Zielwerkzeug pinnen nichts und bleiben bei `required`: `@notion`
 * ist ein ganzer Server.
 *
 * Der Montage-Test ist nicht optional: die Locale-Gitter in `buildChatToolCatalog`
 * lassen `bundestag`/`abgeordnetenwatch` für de-AT weg, und ein Zwang auf ein
 * nicht montiertes Werkzeug bricht den Aufruf.
 *
 * Dass eine spätere Stufe die Wahl überholt haben kann, prüft diese Funktion
 * NICHT mehr — das tat sie, solange der Pin ein Intent war und sich mit
 * `state.intent` vergleichen liess. Wer den Intent überschreibt, löscht den Pin
 * jetzt ausdrücklich (`forcedIntentStage`).
 */
export function pinnedFirstTool(input: {
  /** Das von einer Erwähnung festgezurrte Werkzeug (`mentionPinnedTool`). */
  pinnedTool: string | null;
  /** Der Turn hat angehängte Dokumente (`retrievableAttachedSources`). */
  hasAttachedDocuments?: boolean;
  /** Die Nachricht bittet um eine Zusammenfassung (`isSummaryAsk`). */
  summaryAsk?: boolean;
  isMounted: (toolName: string) => boolean;
}): string | null {
  const pinned = input.pinnedTool;
  if (pinned) return input.isMounted(pinned) ? pinned : null;

  // Zweiter Grund, ein Werkzeug zu BENENNEN: „fasse das PDF zusammen" mit einem
  // angehängten Dokument. Der Vorab-Seed hat die Passagen geholt, die zur Frage
  // ähnlich sind — für eine Zusammenfassung ist das der falsche Stoff: sie soll
  // aus dem VOLLTEXT entstehen, und das kann nur `summarize`
  // (getMultipleDocumentsFullText, Map-Reduce). Ohne den Pin überlässt
  // `toolChoice: 'required'` die Wahl dem Planer — der am 23.08.2026 `media`
  // rief und ein fremdes Dokument zusammenfasste.
  if (input.hasAttachedDocuments && input.summaryAsk && input.isMounted('summarize')) {
    return 'summarize';
  }
  return null;
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
