/**
 * Zwei Entscheidungen, die beide am ersten Schritt des Planers hängen: ob ein
 * Werkzeugaufruf ABVERLANGT wird — und die Fähigkeitsfrage, die genau das
 * verhindert.
 */
import { loopToolsFor, RESEARCH_LOOP_TOOLS } from '@gruenerator/shared/chat-intents';
import { type ModelMessage, type ToolSet } from 'ai';

import { NOUN_TRIGGER_MAX_LENGTH } from '../../../../agents/langgraph/ChatGraph/nodes/analyzedMessage.js';
import {
  isSummaryAsk,
  isTabularComputeQuestion,
} from '../../../../agents/langgraph/ChatGraph/nodes/classifierHeuristics.js';
import { looksLikeMemoryRequest } from '../../../../services/memory/memoryRequest.js';
import { type McpCatalog } from '../../agents/mcpCatalog.js';
import { quotesSharepicText } from '../../agents/sharepicLoopTools.js';
import { extractTextContent } from '../messageHelpers.js';
import { orderText } from '../orderText.js';
import { looksLikeSharepicOrder } from '../sharepicEditHeuristics.js';
import { resolveLoopSharepicTarget } from '../sharepicLoopTarget.js';
import { type ThreadToolHistory } from '../threadPersistenceService.js';

import { materialReaderTools, type TurnMaterial } from './attachedDocuments.js';
import { isLookupTool, priorToolNames } from './catalogAssembly.js';
import { NAMED_RETRIEVAL_INTENTS } from './intents.js';
import { owedToolName } from './loopGuarantees.js';
import {
  asksAboutSuppliedMaterial,
  isReferentialFollowup,
  looksLikeExplicitResearchOrder,
  looksLikeFactCheckOrder,
  reworksSuppliedText,
} from './routing.js';
import { DEFERRABLE_GROUPS } from './toolScope.js';
import { type ForceScopeSummary } from './turnSummary.js';
import { type PersistedStep } from './types.js';

import type { ChatGraphState } from '../../../../agents/langgraph/ChatGraph/types.js';

/**
 * WARUM der erste Schritt einen Aufruf verlangt — je ein Wert pro Weg unten.
 * Der Grund entscheidet, WELCHE Werkzeuge der Schritt sehen darf
 * (`forcedFirstStepTools`); ein blosses `true` wusste das nicht mehr.
 */
export type ForceReason =
  | 'pinned'
  | 'attached_summary'
  | 'mcp_scope'
  | 'research_order'
  | 'demoted_retrieval'
  | 'contradicted'
  | 'named_intent'
  | 'sharepic_order'
  | 'artifact_edit_order'
  | 'tabular_decision'
  | 'material_order';

/**
 * Darf der Loop dem Planer einen Werkzeugaufruf ABVERLANGEN (`toolChoice: required`)?
 *
 * Acht Wege sind über die Zeit hier eingezogen, jeder aus einem eigenen Live-
 * Ausfall oder — beim Werkzeug-Pin — aus einer Stilllegung; die Kommentare an den
 * Zweigen nennen sie. Herausgezogen, weil eine mehrstellige Oder-Kette mit neun
 * Eingaben mitten in `streamAgenticResponse` nicht prüfbar ist: bis hierher
 * gab es keinen einzigen Test darauf, welcher Weg bei welchem Turn feuert.
 * Der Rückgabewert benennt den Weg (`ForceReason`), damit der erste Schritt
 * daran seinen Werkzeug-Zuschnitt ableiten kann.
 */
/** Rechenfrage, `compute`-Intent oder Anschlussfrage an die vorige Rechnung. */
function asksAboutTheTable(intent: string | null | undefined, text: string): boolean {
  return (
    intent === 'compute' ||
    isTabularComputeQuestion(text.toLowerCase()) ||
    isReferentialFollowup(text)
  );
}

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
  /** Im Prompt dieses Turns steht mitgebrachter Text — ein Anhang, ein
   *  weitergetragener Paste-Chip oder eine lange Nachricht im Verlauf. Anders als
   *  `materialHeavy` fragt das nicht, ob er den Prompt dominiert, nur ob er da ist. */
  carriesMaterial?: boolean;
  /** Eine @-Erwähnung hat ein Werkzeug benannt (`mentionPinnedTool`). */
  pinnedTool: string | null;
  /** Der Turn hat angehängte Dokumente (`retrievableAttachedSources`). */
  hasAttachedDocuments?: boolean;
  /** Die Nachricht bittet um eine Zusammenfassung (`isSummaryAsk`). */
  summaryAsk?: boolean;
  /** Die Sharepic-Werkzeuge hängen und der Auftrag meint das Sharepic (`looksLikeSharepicOrder`). */
  sharepicOrder?: boolean;
  /** Der Klassifikator hat einen Auftrag an ein vorhandenes Artefakt erkannt (`artifactEditOrder`). */
  artifactEditOrder?: boolean;
  /** Der Vorab-Abruf hat für DIESEN Turn Material in die Quellenregistry
   *  gelegt — Dokumente, Cloud-Dateien oder @link-Seiten (`seedTurnMaterial`). */
  attachedSeedDelivered?: boolean;
  /** Der Zug wird fortgesetzt (Freigabe, Client-Werkzeug, Rückfrage —
   *  `resumeApproval`): sein erster Schritt lief schon vor der Pause. */
  resumesSuspendedTurn?: boolean;
  /** `tabelle_auswerten` hängt im Katalog: der Turn rechnet über eine Tabelle. */
  tabularToolMounted?: boolean;
  /** Ein bestelltes Artefakt über gewähltem Material oder ein frisch gewähltes
   *  Material mit Text (`readsPickedMaterial`), dessen Lesewerkzeug hängt
   *  (`materialReaderTools`). */
  materialOrder?: boolean;
}): ForceReason | null {
  // Der Bann vetoed alles. `toolChoice: 'required'` ist kein Vorschlag, den das
  // Modell gegen den Satz des Nutzers abwägen kann — unter „ohne neue Recherche"
  // sind die verbleibenden Werkzeuge die falschen.
  if (input.researchBanned) return null;

  // Eine Fortsetzung hat ihren ersten Schritt schon hinter sich. Erneut zu
  // zwingen kostete je Pause eine zusätzliche Suche plus Planer-Runde (live
  // 27.10.2026: „erzwungener erster Aufruf (named_intent)" nach jeder Freigabe).
  if (input.resumesSuspendedTurn) return null;

  // Fünfter Weg: die Person hat ein Werkzeug BENANNT. Er steht neben dem
  // Intent-Weg unten und nicht in ihm, weil ein Pin keinen Intent mehr braucht —
  // `@umfragen` läuft seit der Stilllegung als `agentic`, und `agentic` ist aus
  // `NAMED_RETRIEVAL_INTENTS` ausgenommen (es IST der Auffangwert). Ohne diesen
  // Zweig verlöre genau diese Erwähnung den Werkzeugzwang, den sie vorher hatte.
  if (input.pinnedTool != null) return 'pinned';

  // Neunter Weg: ein Auftrag an das Sharepic des Threads, und die
  // Sharepic-Werkzeuge hängen. Ohne Zwang beantwortete der Ausweich-Planer
  // (mistral-small, wenn gemma als „zäh" gilt) „Schreib noch „…" mit drauf"
  // werkzeuglos — live 11.10.2026. WELCHES der drei, entscheidet der Planer.
  if (input.sharepicOrder) return 'sharepic_order';

  // Zehnter Weg: ein Auftrag an eine Tabelle, Präsentation, ein Explainable
  // oder Dokument des Threads. Live 11.10.2026: „Da fehlt noch Marburg in der
  // Tabelle" erreichte den Loop mit edit_sheet, und gemma antwortete
  // werkzeuglos „kann ich hier nicht vornehmen".
  if (input.artifactEditOrder) return 'artifact_edit_order';

  // Achter Weg: eine Zusammenfassung eines ANGEHÄNGTEN Dokuments. Steht neben
  // dem Intent-Weg unten, weil der Intent hier nicht verlässlich ist — der
  // Klassifikator schiebt Dokument-Turns nach `search`, kann aber auch `summary`
  // oder `agentic` schreiben, und `agentic` ist aus `NAMED_RETRIEVAL_INTENTS`
  // ausgenommen. Welches Werkzeug es sein muss, steht in `pinnedFirstTool`:
  // `summarize` liest den Volltext, alles andere sieht nur Passagen.
  if (input.hasAttachedDocuments && input.summaryAsk) return 'attached_summary';

  // MCP mit gesetztem Server-Scope: eine Fähigkeitsfrage (WS-5 beschreibt die
  // Werkzeuge) braucht keinen Aufruf, alles andere schon. Hing bis #4043 am
  // Intent `mcp`; der ist stillgelegt, ein Konnektor-Turn ist `agentic` mit
  // Scope, und der Scope allein entscheidet. `mcpToolCount > 0` heisst zugleich
  // „montiert" — `catalogAssembly` montiert nur an `agentic` (und am
  // gespeicherten `mcp` eines pausierten Freigabe-Zugs).
  if (input.hasMcpScope && !input.isMcpCapabilityQuestion && input.mcpToolCount > 0) {
    return 'mcp_scope';
  }

  // Ein ausdrückliches „recherchiere das" muss auch suchen. Die Demotion schiebt
  // solche Turns nach `agentic`, wo der Planer gar nichts rufen kann — live als
  // steps=0-Antworten beobachtet, die die eben bestellte Recherche anboten.
  // Einen Notausgang hat der erzwungene Schritt nicht; ab Schritt 1 ist die Wahl wieder frei.
  //
  // Nicht, wenn der Auftrag nur an mitgebrachtem Text arbeitet („rechtschreibung
  // korrigieren" unter einem eingefügten Newsletter): ein „Suche" IM Newsletter
  // ist kein Auftrag (#3903). Ein Recherche-Verb im Auftrag selbst schliesst
  // `reworksSuppliedText` aus, der Zweig bleibt dafür scharf.
  //
  // Gefragt wird der Auftrag, nicht der Stoff (`orderText`): „die Suche" im
  // Newsletter über „schreib daraus einen Instagram-Post" ist keiner (#3912).
  // Eine Faktenprüfung ist auch einer — „prüf die Fakten darin und korrigiere
  // falsche Angaben" unter einer Behauptung antwortete sonst aus dem
  // Modellgedächtnis (#3915). Bewusst hier und nicht in
  // `looksLikeExplicitResearchOrder`: die trägt auch `looksLikeCompoundEdit` und
  // die Recherche-Signale des Klassifikators.
  const reworksOwnText = reworksSuppliedText(input.lastUserText);
  const order = orderText(input.lastUserText);
  if ((looksLikeExplicitResearchOrder(order) || looksLikeFactCheckOrder(order)) && !reworksOwnText)
    return 'research_order';

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
  // `buildRepairSystem` im Prompt des Schreibers, der damit zwei verschiedene
  // „Originale" gegeneinander las: er beanstandete eine vorhandene Überschrift
  // und zitierte „Pflanzen spendeten", während er zugleich Präsens im Original
  // behauptete.
  //
  // Dem Schreiber den Katalog zu entziehen und dem Planer im selben Turn einen
  // Abruf abzuverlangen, waren zwei entgegengesetzte Urteile über denselben Turn.
  // Der Zwang fällt weg, die Möglichkeit bleibt: der Planer DARF suchen, wenn die
  // Aufgabe es verlangt. Das ausdrückliche „recherchiere das" oben ist unberührt.
  //
  // Dasselbe gilt für einen Auftrag, der nur an mitgebrachtem Text arbeitet
  // („rechtschreibung korrigieren" unter einem eingefügten Newsletter), auch wenn
  // der Stoff zu kurz ist, um `materialHeavy` zu setzen (#3903).
  //
  // Und für eine Frage ÜBER den mitgebrachten Text („Welche vier Maßnahmen stehen
  // im Antrag?"), auch wenn er in einem früheren Turn kam (#4789). Die Heuristik
  // liest „im Antrag" als Parteiposition, und der Zwang holte 10–20 fremde
  // Web-Treffer, die als Quellen unter der Antwort standen und in die
  // Folge-Turns weitergetragen wurden. `materialHeavy` sieht das nicht: es misst,
  // ob der Stoff den Prompt DOMINIERT, und ein Antrag von 1.300 Zeichen neben dem
  // Systemprompt tut das nie.
  const asksAboutOwnMaterial =
    input.carriesMaterial === true && asksAboutSuppliedMaterial(input.lastUserText);
  if (
    input.loopDemotedFromRetrieval &&
    !input.materialHeavy &&
    !reworksOwnText &&
    !asksAboutOwnMaterial
  )
    return 'demoted_retrieval';

  // Dritter Weg: die LLM-Stufe sagte „braucht Recherche" und schrieb im selben
  // Atemzug `direct` — ihre eigene Begründung benannte die Suche, die dann nie
  // lief, und die Antwort war vollständig erfunden.
  if (input.classifierContradictedResearch) return 'contradicted';

  // Ein Tabellen-Turn holt nichts nach: die Daten liegen im Anhang, gerechnet
  // wird mit `tabelle_auswerten`. Ein Zwang auf die Suchwerkzeuge liess den
  // Planer hängen oder im Web suchen (live 27.10.2026, named_intent/followup).
  // Ganz ohne Zwang schwieg er dagegen bei Anschlussfragen, und der Schreiber
  // rechnete aus dem Auszug (#5042) — also eine Wahl zwischen zwei Werkzeugen.
  // Nur, wenn der Turn die Tabelle meint: ein Themenwechsel („Kurz was anderes:
  // Was fordert das Grundsatzprogramm …") rechnete sonst die vorige Aufgabe im
  // Browser noch einmal, bevor er suchte (live 08.11.2026, +30 s).
  if (input.tabularToolMounted && asksAboutTheTable(input.intent, input.lastUserText)) {
    return 'tabular_decision';
  }

  // Eine Anschlussfrage nach einem Abruf-Turn („Und die FDP?") erzwingt
  // nichts mehr: ob sie nachschlägt, entscheidet das Modell mit dem Verlauf.
  // Der frühere `followup`-Zwang (≤ 8 Wörter + Abruf im Thread) zwang auch
  // ein „yes" auf ein Sharepic-Angebot in die Suche (Alfter, 09.11.2026).

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
  if (input.attachedSeedDelivered) return null;

  // Elfter Weg: ein bestelltes Artefakt über gewähltem Material — oder seit
  // 06.11.2026 jedes frisch gewählte Material mit Text, das der Klassifikator
  // nicht mehr in die Zwangssuche schickt —, und der Vorab-Abruf hat nichts
  // geliefert. Der Klassifikator schickt diesen Turn als
  // `agentic` statt in die Zwangssuche (`tier2_material_create_order`), also
  // greift der Intent-Weg darunter nicht mehr — ohne Zwang liesse der Planer
  // das Material liegen, und `forceCompoundGeneration` baute das Artefakt aus
  // dem Auftragssatz allein. Der Zwang gilt nur den Lesewerkzeugen des
  // Materials, nicht der Recherche (#3888).
  if (input.materialOrder) return 'material_order';

  return NAMED_RETRIEVAL_INTENTS.has(input.intent ?? '') ? 'named_intent' : null;
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

/**
 * Welche Werkzeuge der erzwungene erste Schritt SEHEN darf, oder `null`,
 * wenn der Katalog ungeschnitten bleibt.
 *
 * `toolChoice: 'required'` über den ganzen Katalog hat den Planer dreimal in
 * ein unpassendes Werkzeug laufen lassen (#3880: `media`, `read_pdf_form`,
 * `summarize`). Jeder Weg in `shouldForceFirstToolCall` heisst „dieser Turn
 * muss Information holen" — der Zuschnitt sagt dem Schritt, welche.
 *
 * Gilt NUR für Schritt 0; danach sieht der Planer wieder den vollen Umfang.
 * Deshalb darf die Menge eng sein: ein falsch klassifizierter Turn kostet
 * einen Schritt, nie eine Fähigkeit — dasselbe Argument wie beim Lader in
 * toolScope.ts.
 *
 * Nie leer: eine leere `activeTools`-Liste unter `required` bräche den
 * Aufruf. Leer heisst `null`, und der Aufrufer protokolliert es.
 */
export function forcedFirstStepTools(input: {
  reason: ForceReason;
  intent: string | null | undefined;
  /** Alles, was dieser Turn montiert hat (`Object.keys(wrapped)`). */
  mounted: readonly string[];
  /** Die Werkzeuge der verbundenen MCP-Server dieses Turns. */
  mcpToolNames: readonly string[];
  /** Die Werkzeuge früherer Turns dieses Threads (`priorToolNames`, ohne Verbindungs-Schritte). */
  priorToolNames: readonly string[];
  isLookupTool: (name: string) => boolean;
  /** Die MONTIERTEN Werkzeuge, die das Material dieses Turns nachlesen
   *  (`materialReaderTools`, gefiltert auf den Katalog), leer ohne Material.
   *  Ungefiltert hiesse ein nicht montiertes `cloud_files` unten eine leere
   *  Menge — und damit gar keinen Zuschnitt statt des Rückfalls auf den Intent. */
  materialTools: readonly string[];
  /** Der Text der Person ohne Erwähnungs-Label — derselbe, den `createToolScope` liest. */
  userText: string;
  /** Der Thread arbeitet mit einem Notebook (`notebookForPrompt`). */
  threadNotebook?: boolean;
}): readonly string[] | null {
  // Der Klassifikator schiebt jeden Dokument-Turn nach `search`. Hat der
  // Vorab-Abruf nichts geliefert, müsste Schritt 0 sonst die Parteiprogramme
  // nach dem eigenen PDF der Person durchsuchen — der Ausfall vom 23.08.2026 an
  // neuer Stelle, und am 02.11.2026 mit einer gewählten Wolke-Datei (#5266).
  // Nicht für `research_order` (ein ausdrücklicher Auftrag geht nach draussen)
  // und nicht für `mcp_scope` (der Server-Scope ist der Auftrag).
  const material = input.materialTools;
  // „Such in meinen Dokumenten nach …" feuert `research_order` und braucht
  // `documents`/`find_content`/… — dasselbe Signal, das in `createToolScope` die
  // Gruppe offen hält, damit der scharfe Umfang und diese Menge sich nie widersprechen.
  // Gruppen mit `opensOn` (Parlament) tragen Folgewerkzeuge eines Einstiegs und gehören nicht hierher.
  const ownContent = DEFERRABLE_GROUPS.filter(
    (g) => !('opensOn' in g) && g.hint.test(input.userText)
  ).flatMap((g) => g.tools);
  let candidates: readonly string[];
  switch (input.reason) {
    case 'pinned':
    case 'attached_summary':
      return null;
    case 'mcp_scope':
      candidates = input.mcpToolNames;
      break;
    case 'sharepic_order':
      candidates = ['edit_sharepic', 'read_sharepic', 'check_sharepic'];
      break;
    case 'tabular_decision':
      candidates = ['tabelle_auswerten', 'direkt_antworten'];
      break;
    case 'material_order':
      candidates = material;
      break;
    case 'artifact_edit_order':
      candidates = [
        'edit_sheet',
        'read_sheet',
        'edit_presentation',
        'read_presentation',
        'edit_explainable',
        'read_explainable',
        'edit_document_text',
        'read_document',
      ];
      break;
    case 'named_intent':
      // Mit Anhang erreicht dieser Weg den Zwang nur, wenn der Seed nichts
      // geliefert hat (`attachedSeedDelivered` sperrt ihn vorher). Neben dem
      // Dokument griff der Planer dann in einem von fünf Läufen zu
      // `gruenerator_search` (#3888). „Vergleiche mit dem Wahlprogramm" kostet
      // das einen Schritt, die Suche ist ab Schritt 1 wieder frei.
      // Im Notebook-Thread gehören dessen Quellen dazu: „Analysiere die neuesten
      // Beiträge zum Thema Verkehr" nach einer Quellenliste sah sonst nur Suche
      // und Web (Eval nbtool-berlin-thread-followup-content, 12.10.2026).
      // Eine Connect-Datei hat kein Lesewerkzeug und fällt auf den Intent zurück.
      candidates =
        material.length > 0
          ? material
          : [
              ...loopToolsFor(input.intent ?? ''),
              ...(input.threadNotebook ? ['notebook_quellen'] : []),
            ];
      break;
    case 'research_order':
    case 'demoted_retrieval':
    case 'contradicted':
      // Dazu die Nachschlage-Werkzeuge des Threads: „finde es" nach zwei
      // gescheiterten `notebooks`-Aufrufen (#3778) feuert `research_order`,
      // und die Recherche-Menge kennt `notebooks` nicht — der
      // erzwungene Schritt könnte das richtige Werkzeug nicht mehr wiederholen.
      candidates = [
        ...RESEARCH_LOOP_TOOLS,
        ...input.priorToolNames.filter(input.isLookupTool),
        ...ownContent,
        ...(input.reason === 'research_order' ? [] : material),
      ];
      break;
  }
  const mounted = new Set(input.mounted);
  // Die Lader (`meine_inhalte_laden` u. a.) öffnen nur eine Gruppe, sie holen nichts.
  const loaders = new Set<string>(DEFERRABLE_GROUPS.map((g) => g.loaderTool));
  const scoped = [...new Set(candidates)].filter((t) => mounted.has(t) && !loaders.has(t));
  if (scoped.length === 0) return null;
  // Ist der Grund `named_intent`, hat der Klassifikator den Turn schon als
  // Auftrag erkannt, und der Prompt sagt „rufe ZUERST `rezept_laden`" (Katalog
  // und Werkzeug entstehen zusammen in catalogAssembly). Ein erzwungener Schritt
  // ohne das Werkzeug widerspricht ihm, und darauf antwortet Gemma unter
  // `required` gar nicht: „Mach daraus bitte einen Instagram-Post" mit Anhang
  // hing auf Melious UND Cortecs 3 von 3 Mal über 50 s, mit `rezept_laden`
  // daneben kamen alle sechs Läufe nach 5 s (#4785). Der Zustand entscheidet,
  // kein Wort: auf Recherche-Aufträge griff der Planer unter `required` zum
  // Rezept statt zur Suche (#3880), deshalb bleibt es dort draussen.
  const offersRecipe = input.reason === 'named_intent' && mounted.has('rezept_laden');
  return offersRecipe ? [...scoped, 'rezept_laden'] : scoped;
}

export interface FirstStepDecision {
  forceFirstToolCall: boolean;
  firstToolName: string | null;
  firstStepTools: readonly string[] | null;
  forceScope: ForceScopeSummary | null;
  /** Was der Turn noch schuldet — liest die lebende `steps`-Liste bei jedem Aufruf. */
  owedTool: () => string | null;
}

/** Ob, womit und mit welchem Zuschnitt der erste Schritt einen Aufruf abverlangt. */
export async function decideFirstStep(ctx: {
  state: ChatGraphState;
  /** Der gewrappte Katalog — „montiert" heisst: steht hier drin. */
  tools: ToolSet;
  messages: readonly ModelMessage[];
  lastUserText: string;
  threadId: string | null | undefined;
  researchBanned: boolean;
  mcpCapabilityQuestion: boolean;
  mcpCatalog: McpCatalog | null;
  toolHistory: ThreadToolHistory | null | undefined;
  materialHeavy: boolean;
  carriedMaterialChars: number;
  material: TurnMaterial;
  attachedSeedDelivered: boolean;
  resumesSuspendedTurn: boolean;
  threadNotebook: boolean;
  /** Lebende Referenz: füllt sich, während der Loop läuft. */
  steps: readonly PersistedStep[];
  onInfo: (message: string) => void;
  onWarn: (message: string) => void;
}): Promise<FirstStepDecision> {
  const { state, tools, lastUserText } = ctx;
  const isMounted = (name: string): boolean => name in tools;

  // Beide Werte fliessen in ZWEI Entscheidungen (ob ein Werkzeug abverlangt
  // wird, und welches) — einmal berechnet, damit die zwei nicht auseinander-
  // laufen können.
  // Ohne die Dokumente, die ein Ganzdokument-Turn ganz im Prompt hat
  // (`resolveTurnMaterial`): dann fasst der Schreiber selbst zusammen, kein
  // erzwungenes `summarize` (live 06.11.2026 41 s und verworfen).
  const hasAttachedDocuments = ctx.material.qdrantDocs.length > 0;
  const summaryAsk = isSummaryAsk(lastUserText);

  // Ein Merk-Auftrag benennt sein Werkzeug so eindeutig wie eine
  // @-Erwähnung. Ohne Zwang liess der kleine Planer ein montiertes Werkzeug
  // in 2 von 5 Fällen liegen (toolScope-Rundlauf) — und eine Speicherung, die
  // die Antwort bestätigt, aber nie stattfand, ist die teuerste Ausfallform.
  // Nur pinnen, wenn das Werkzeug wirklich montiert ist: ein benanntes
  // Werkzeug, das nicht in `activeTools` steht, verlangt einen Aufruf, dessen
  // Definition nie mitgeschickt wird.
  const memoryPin =
    state.mentionPinnedTool == null && isMounted('memory') && looksLikeMemoryRequest(lastUserText)
      ? 'memory'
      : null;
  const pinnedTool = state.mentionPinnedTool ?? memoryPin;

  // Ein Auftrag ans Sharepic: er nennt es, oder er zitiert einen Text, der
  // darauf steht (die Abfrage nur, wenn überhaupt etwas zitiert wird).
  const isSharepicOrder = async (): Promise<boolean> => {
    if (!isMounted('edit_sharepic')) return false;
    const order = orderText(lastUserText);
    if (looksLikeSharepicOrder(order)) return true;
    if (!ctx.threadId || !/[„"»“‚]/.test(order)) return false;
    const target = await resolveLoopSharepicTarget(ctx.threadId, state.currentSharepic);
    return target != null && quotesSharepicText(order, target.props.creatorSpec);
  };
  const forceReason = shouldForceFirstToolCall({
    researchBanned: ctx.researchBanned,
    intent: state.intent,
    hasMcpScope: state.mcpServerScope != null,
    isMcpCapabilityQuestion: ctx.mcpCapabilityQuestion,
    mcpToolCount: ctx.mcpCatalog?.labels.size ?? 0,
    lastUserText,
    loopDemotedFromRetrieval: state.loopDemotedFromRetrieval === true,
    classifierContradictedResearch: state.classifierContradictedResearch === true,
    materialHeavy: ctx.materialHeavy,
    carriesMaterial:
      ctx.carriedMaterialChars > 0 ||
      ctx.messages.some(
        (m) => m.role === 'user' && extractTextContent(m.content).length > NOUN_TRIGGER_MAX_LENGTH
      ),
    pinnedTool,
    hasAttachedDocuments,
    summaryAsk,
    sharepicOrder: await isSharepicOrder(),
    artifactEditOrder: state.artifactEditOrder === true,
    attachedSeedDelivered: ctx.attachedSeedDelivered,
    resumesSuspendedTurn: ctx.resumesSuspendedTurn,
    tabularToolMounted: isMounted('tabelle_auswerten'),
    materialOrder:
      (state.compoundGenerationOrdered === true || state.readsPickedMaterial === true) &&
      materialReaderTools(ctx.material).some(isMounted),
  });
  // Was der Turn noch schuldet (bestelltes Artefakt, erzwungene Bearbeitung):
  // als benannter Schritt im Strom, damit die Antwort erst nach dem
  // Werkzeugergebnis kommt. Erzwingt der Turn ohnehin einen ersten Aufruf
  // (etwa die Recherche vor dem Sharepic), kommt das Geschuldete im nächsten
  // Schritt (`forcedToolForStep`).
  const owedTool = (): string | null =>
    owedToolName(
      state,
      lastUserText,
      isMounted,
      ctx.steps.map((step) => step.toolName)
    );
  const owedAtStart = forceReason === null ? owedTool() : null;
  const forceFirstToolCall = forceReason !== null || owedAtStart !== null;

  // WELCHES Werkzeug der erste Schritt ruft, wenn eine @-Erwähnung eines
  // benannt hat. `required` allein garantiert nur irgendeinen Aufruf — und der
  // Erwähnungstext ist zu diesem Zeitpunkt aus der Nachricht entfernt.
  const firstToolName =
    owedAtStart ??
    (forceReason
      ? pinnedFirstTool({ pinnedTool, hasAttachedDocuments, summaryAsk, isMounted })
      : null);
  // Ohne benanntes Werkzeug bekommt der erzwungene Schritt nur die Werkzeuge,
  // die seinen Grund erfüllen (#3880) — sonst wählt der Planer unter zwanzig.
  const userText = state.lastUserTextNoMentions ?? lastUserText;
  const firstStepTools =
    forceReason && !firstToolName
      ? forcedFirstStepTools({
          reason: forceReason,
          intent: state.intent,
          mounted: Object.keys(tools),
          mcpToolNames: Object.keys(ctx.mcpCatalog?.tools ?? {}),
          priorToolNames: priorToolNames(ctx.toolHistory),
          isLookupTool,
          materialTools: materialReaderTools(ctx.material).filter(isMounted),
          userText,
          threadNotebook: ctx.threadNotebook,
        })
      : null;
  if (firstToolName) {
    ctx.onInfo(`[Agentic] ${firstToolName} ist als erster Werkzeugaufruf festgelegt`);
  } else if (firstStepTools) {
    ctx.onInfo(
      `[Agentic] erzwungener erster Aufruf (${forceReason}) sieht nur [${firstStepTools.join(', ')}]`
    );
  } else if (forceReason) {
    ctx.onWarn(
      `[Agentic] erzwungener erster Aufruf (${forceReason}) ohne passendes Werkzeug — voller Katalog`
    );
  }
  if (owedAtStart) ctx.onInfo(`[Agentic] geschuldetes ${owedAtStart} ist der erste Aufruf`);
  return {
    forceFirstToolCall,
    firstToolName,
    firstStepTools,
    forceScope: forceReason
      ? { reason: forceReason, tools: firstStepTools, named: firstToolName }
      : null,
    owedTool,
  };
}
