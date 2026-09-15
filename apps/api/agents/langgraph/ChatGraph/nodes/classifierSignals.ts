/**
 * Classifier Signals
 *
 * The patterns and small predicates the classifier tiers decide on: which
 * verdicts never retrieve, what a chat-recall / recurring order / docs-help
 * phrasing looks like, how complex a query is, and which sources it names.
 *
 * Was `classifierParsing.ts` while a 27k-character prompt sat at the end of the
 * tier chain and its JSON had to be parsed and repaired. That prompt is gone
 * (see `classifierNode.ts`), and with it the parser, the three-strategy
 * malformed-JSON recovery and the accept-list that had to be kept in sync with
 * the prompt's own enum line. What is left never talks to a model.
 */

import { type ChatIntentId, intentsWithDisposition } from '@gruenerator/shared/chat-intents';

import type { SearchIntent, SearchSource } from '../types.js';

/**
 * Verdicte des HEURISTIK-TISCHES, für die keine Suchanfrage optimiert wird.
 *
 * Beides an dem Wort „Heuristik-Tisch": die Menge wird ausschliesslich gegen
 * `heuristic.intent` geprüft (zweimal in `classifierNode`, Tier 3), nie gegen
 * das Ergebnis des Turns. Sie beschreibt damit eine POLITIK dieses einen
 * Tisches, keine Eigenschaft der Intents — und wird deshalb nicht aus der
 * Dispositions-Achse abgeleitet.
 *
 * Gemessen gegen sie deckt sie sich auch nicht: `anchor` nur zur Hälfte,
 * `gated` zur Hälfte, dazu `umfragen` — seit der Stilllegung aus `retired`, vor
 * Phase L aus `loop`. Sechs Mitglieder
 * (`image_edit`, `create_recurring_task`, `modify_doc`, `modify_board`, `mcp`,
 * `umfragen`) kann `heuristicClassify` gar nicht liefern — sie sind wirkungslos,
 * aber harmlos.
 *
 * `social_post` und `summary` fehlten und zahlten deshalb den
 * Mehr-Themen-Abschlag wie eine Suche. Gemessen wirkt er nur bei `summary`, und
 * dort ganz: das Verdikt sitzt mit 0,85 exakt auf der Schwelle, ein zweites
 * Glied kostet 0,30, und der Turn fällt an der Tier-3-Rückgabe vorbei. „Fass
 * unser Gespräch hier im Chat zusammen und nenne die wichtigsten offenen
 * Punkte" wurde so von Tier 3.8 zu `produktion` umgedeutet — die
 * Zusammenfassung aus dem Gedächtnis statt aus dem Zusammenfassungs-Zweig.
 * `social_post` liegt mit 0,80 ohnehin unter der Schwelle und ändert keinen
 * Ausgang; es steht mit drin, weil die Menge sonst eine Aussage über den Tisch
 * macht, die für die Hälfte seiner Erzeugungs-Verdikte nicht gilt.
 *
 * `ReadonlySet<ChatIntentId>` statt `Set<string>`: die Literale waren ohne
 * Typschutz, ein Tippfehler wäre schlicht nie Mitglied geworden.
 */
export const NON_SEARCH_INTENTS: ReadonlySet<ChatIntentId> = new Set([
  'produktion',
  // Deprecated as a verdict, still reachable via the heuristic hint — and that
  // means "no retrieval", same as before.
  'direct',
  'greeting',
  'sharepic',
  'image',
  'image_edit',
  'chart',
  'artifact',
  'social_post',
  'summary',
  'compute',
  'save_as_doc',
  'create_sheet',
  'create_presentation',
  'create_pdf',
  'create_recurring_task',
  'modify_doc',
  'modify_board',
  'share_doc',
  'mcp',
  // `bahn`/`reise`/`hotel`/`wetter`/`news` sat here for the same reason
  // `umfragen` still does — their tools take the model's own arguments, so there
  // is no Qdrant query to optimize. They are managed connectors now and never
  // appear as an intent, so there is nothing left for this list to exclude.
  'umfragen',
] as const satisfies readonly ChatIntentId[]);

/**
 * Heuristic verdicts eligible for loop demotion (Tier 3.5): the retrieval
 * family only — every member is in AGENTIC_INTENTS and none is platform-gated.
 * Generation intents (sharepic, social_post, image, ...) and interrupt/confirm
 * intents must keep the rest of the ladder so their gates, HITL and fixed UX
 * contracts stay intact.
 *
 * Eine echte Teilmenge der `loop`-Disposition, aber NICHT sie: `research` und
 * `agentic` sind ausgenommen, und jede Ausnahme sagt etwas anderes. Demotion
 * ersetzt das Verdikt durch `agentic` — wo das Verdikt selbst noch etwas
 * steuert, ist der Tausch also ein Verlust:
 *  - `research` behält seinen eigenen Namen bis ins Residual und damit den
 *    Werkzeug-Zwang aus `NAMED_RETRIEVAL_INTENTS`; früh zu `agentic` zu
 *    wechseln gäbe genau den auf.
 *  - `agentic` ist das Ziel der Demotion.
 * `umfragen` war bis Phase L die dritte Ausnahme („sein Verdikt montiert das
 * Werkzeug"). Der Intent ist stillgelegt (`retired`), das Werkzeug hängt jetzt
 * am Erwähnungs-Pin — die Ausnahme ist damit gegenstandslos, nicht gestrichen.
 * `pressemitteilung_examples` stand umgekehrt MIT in der Menge und ist mit
 * derselben Stilllegung herausgefallen: eine `retired`-Disposition kann keine
 * Teilmenge von `loop` sein.
 * `dispositionSets.vitest.ts` nagelt diese Differenz fest — wer sie ändert,
 * ändert eine Aussage.
 */
export const DEMOTABLE_HEURISTIC_INTENTS: ReadonlySet<ChatIntentId> = new Set([
  'search',
  'web',
  'examples',
  'compare',
  'abgeordnetenwatch',
  'bundestag',
] as const satisfies readonly ChatIntentId[]);

/**
 * Document subtypes the chat may assign.
 *
 * `collaborative_documents_document_subtype_check` rejects anything outside the
 * DB's own set, and a subtype travels as `subtypeOverride` past every other
 * check straight into the insert — so this list is a real gate, not a hint.
 */
export const CLASSIFIER_DOC_SUBTYPES = [
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
  'tabelle',
] as const;

export type DocSubtype = (typeof CLASSIFIER_DOC_SUBTYPES)[number];

/**
 * How much conversation the classifier's resolvers see. Five messages, capped —
 * enough to resolve "dazu"/"das", short enough to stay cheap on every turn.
 */
export const CLASSIFIER_CONTEXT_MESSAGES = 5;
export const CLASSIFIER_CONTEXT_MAX_CHARS = 500;

/**
 * Which document type the user NAMED.
 *
 * Replaces the `documentSubtype` field of the deleted LLM tier. That field was
 * only ever an override HINT: on the generation path the document generator
 * picks (and validates) its own subtype from the finished content, and an
 * unknown override was dropped. The one place it decided anything is the
 * confirm-action payload — "speicher das als Pressemitteilung" wrote
 * `subtype: 'docs'` without it.
 *
 * A word list is the right shape here precisely because it is the user's own
 * noun that matters: the model was being asked to read a word back, not to
 * judge anything. `null` keeps every caller's existing fallback.
 */
const DOC_SUBTYPE_PATTERNS: ReadonlyArray<{ subtype: DocSubtype; pattern: RegExp }> = [
  { subtype: 'pressemitteilung', pattern: /presse(?:mitteilung|erkl[äa]rung|text)|\bPM\b/iu },
  { subtype: 'antrag', pattern: /(?<!\p{L})antrag|antrags(?:text|entwurf)|beschlussvorlage/iu },
  { subtype: 'protokoll', pattern: /(?<!\p{L})protokoll|ergebnisprotokoll|sitzungsprotokoll/iu },
  { subtype: 'redaktionsplan', pattern: /redaktionsplan|redaktionskalender/iu },
  { subtype: 'checkliste', pattern: /(?<!\p{L})check\s?liste|(?<!\p{L})to-?do-?liste/iu },
  { subtype: 'einladung', pattern: /(?<!\p{L})einladung|(?<!\p{L})einladungs\p{L}*/iu },
  { subtype: 'notizen', pattern: /(?<!\p{L})notiz(?:en)?(?!\p{L})/iu },
  { subtype: 'tabelle', pattern: /(?<!\p{L})tabelle(?!\p{L})/iu },
];

export function detectDocumentSubtype(text: string): DocSubtype | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  // LAST mention wins, not list order. Two subtypes in one message is rare and
  // reads one way when it happens: "mach aus dem Protokoll eine
  // Pressemitteilung" names the source first and the target last. The reverse
  // phrasing ("eine PM auf Basis des Protokolls") is a known miss, and a miss
  // costs the generator's own judgement, not a wrong type.
  let best: { subtype: DocSubtype; at: number } | null = null;
  for (const { subtype, pattern } of DOC_SUBTYPE_PATTERNS) {
    const at = t.search(pattern);
    if (at >= 0 && (best == null || at > best.at)) best = { subtype, at };
  }
  return best?.subtype ?? null;
}

/**
 * Verdicts under which nothing is ever looked up. Two rules below used to name
 * `direct` alone; since the split there are three such values, and a rule that
 * checks only one of them stops firing for the other two without ever failing.
 * `agentic` is NOT a member — the loop's own model retrieves.
 *
 * ABGELEITET, nicht aufgeschrieben. Die Menge IST die `prose`-Disposition, und
 * sie hier ein zweites Mal aufzuzählen ist genau die Bauform, an der schon eine
 * Regel hing, die nur `direct` prüfte und für die anderen zwei still aufhörte
 * zu feuern. Ein neuer prose-Intent ist ab jetzt automatisch Mitglied.
 */
export const NO_RETRIEVAL_VERDICTS: ReadonlySet<string> = intentsWithDisposition('prose');

/** Ab dieser Länge ist der Block unter der Anweisung Material, kein Nachsatz. */
const PASTED_BODY_MIN_CHARS = 120;

/**
 * Die Nachricht trägt ihren Gegenstand selbst: eine Anweisung, ein Umbruch,
 * darunter der eingefügte Text („Fasse diese Bürgeranfrage zusammen:\n\n…").
 *
 * Gebraucht, weil die zwei bestehenden Antworten auf „liegt Material vor?" den
 * Fall beide nicht sehen. `turnCarriesOwnMaterial` misst die GESAMTLÄNGE gegen
 * `NOUN_TRIGGER_MAX_LENGTH` (500) — die drei Einfüge-Fälle des Korpus liegen mit
 * 309–489 Zeichen darunter. Und die Materialprüfung des `summary`-Rückstufers
 * zählt nur Anhänge und Dokumentzeilen, die eine eingefügte Bürgeranfrage nicht
 * hat. Ohne diese Regel wird genau ihr Text zur WEB-SUCHANFRAGE — im
 * Sicherheits-Korpus samt der eingebetteten Injektions-Nutzlast.
 *
 * Bewusst formunabhängig (nur Umbruch + Länge): das Erkennungszeichen ist der
 * abgesetzte Block, nicht das Anführungszeichen oder der Doppelpunkt. Ein
 * zweiter Absatz mit eigener Bitte („… zusammen.\n\nMir ist wichtig, dass …")
 * wird dabei mitgenommen — das ist die Richtung, in die der Rückstufer
 * ausdrücklich irren soll: ein falsches Behalten ist das alte Verhalten, eine
 * falsche Rückstufung zerlegt ein funktionierendes Feature.
 */
export function carriesPastedBody(text: string): boolean {
  const at = (text ?? '').indexOf('\n');
  return at >= 0 && text.slice(at).trim().length >= PASTED_BODY_MIN_CHARS;
}

/**
 * Phrases that reference the user's earlier work — a past conversation with the
 * assistant OR one of the user's own office documents (docs/presentations/
 * sheets) OR one of their reels (subtitled videos, matched on the spoken
 * transcript). Used both to add the `chat_history` search source (combined
 * queries) and to defensively upgrade a misclassified `direct` intent to the
 * `chat_history` tool.
 *
 * The reel alternatives are phrased as possessives ("mein reel", "das video in
 * dem ich") on purpose: a bare "reel"/"video" would grab reel CREATION and the
 * reel_edit turns, which are separate branches.
 */
/**
 * References to THIS conversation rather than an earlier one ("vorhin", "in
 * diesem Chat", "deine letzte Antwort"). Those need no retrieval at all — the
 * messages are already in context.
 *
 * Live failure this guards: "Du hast meine Frage nach dem Bundeskanzler vorhin
 * nicht beantwortet … was war meine allererste Frage in diesem Chat?" was
 * classified `chat_history`, ran a Qdrant recall over PAST threads, got 0 hits
 * and answered that no sources were available — while the answer sat a few
 * messages above.
 */
export const CURRENT_THREAD_REFERENCE =
  /\b(?:vorhin|eben\s+gerade|gerade\s+eben|weiter\s+oben|hier\s+im\s+chat|in\s+diesem\s+(?:chat|gespräch|thread|verlauf)|dieses\s+gespräch[s]?|deine[rn]?\s+(?:letzte|vorherige|obige)[rn]?\s+antwort|meine\s+(?:erste|allererste|letzte)\s+frage)\b/i;

export const CHAT_HISTORY_KEYWORDS =
  /\b(letzte[sn]?\s+gespräch|vorher\s+besprochen|letzte\s+woche|gestern\s+besprochen|was\s+haben\s+wir|erinnere?\s+dich|wir\s+hatten|früheres?\s+chat|voriges?\s+gespräch|damals\s+besprochen|da\s+weiter|wo\s+wir\s+aufgehört|mein(e|en)?\s+(dokument|präsentation|tabelle|notiz|antrag|board|kanban|tafel|reel|video|clip)|meine\s+(dokumente|präsentationen|tabellen|notizen|boards|reels|videos|clips)|die\s+tabelle\s+die\s+ich|das\s+dokument\s+das\s+ich|das\s+board\s+das\s+ich|das\s+(reel|video)\s+(das\s+ich|zu(m)?\s|über)|welches\s+(reel|video)|in\s+welchem\s+(reel|video))\b/i;

/**
 * The subset of `CHAT_HISTORY_KEYWORDS` that can decide the turn on its own.
 *
 * Two patterns, two jobs — the distinction this file has paid for before (see
 * `managedSourceTrigger`: "ES IST EIN GITTER, KEIN KLASSIFIKATOR"). `CHAT_HISTORY_
 * KEYWORDS` is the RECALL gate: it may be generous, because a false positive
 * there only costs the turn its Tier-3.5 demotion and sends it one tier further.
 * This one is the PRECISION pattern behind a direct route, where a false
 * positive runs a Qdrant recall over the user's own threads for a question that
 * was never about them — and then answers "keine Quellen gefunden".
 *
 * So the ambiguous alternatives stay OUT and keep today's behaviour (fall
 * through to the LLM tier), namely:
 *  - bare `letzte woche` — "Was war letzte Woche in der Ukraine los?" is news;
 *  - bare `was haben wir` — "was haben wir für Optionen?" is a plain question,
 *    so the verb has to say that a CONVERSATION is meant;
 *  - bare `wir hatten` — usually narration inside an ordinary answer;
 *  - `da weiter` — "mach da weiter" is a plain continuation at least as often
 *    as it is a reference to a finished thread, and the recall runs with
 *    `excludeThreadId: currentThread`, so reading it wrong answers a "carry on"
 *    out of somebody else's conversation.
 *
 * Everything here names either an earlier conversation or a piece of the user's
 * own content, and cannot plausibly mean anything else.
 */
export const CHAT_HISTORY_DIRECT =
  /(?<!\p{L})(letzte[sn]?\s+gespräch|vorher\s+besprochen|gestern\s+besprochen|damals\s+besprochen|erinnere?\s+dich|früheres?\s+chat|voriges?\s+gespräch|unser(?:e[nmrs]?)?\s+(?:chat|gespräch|unterhaltung)|was\s+haben\s+wir\s+(?:\p{L}+\s+){0,4}?(?:besprochen|geredet|gesprochen|erarbeitet|entschieden|festgehalten)|wo\s+wir\s+aufgehört|mein(?:e|en)?\s+(?:dokument|präsentation|tabelle|notiz|antrag|board|kanban|tafel|reel|video|clip)|meine\s+(?:dokumente|präsentationen|tabellen|notizen|boards|reels|videos|clips)|die\s+tabelle\s+die\s+ich|das\s+dokument\s+das\s+ich|das\s+board\s+das\s+ich|das\s+(?:reel|video)\s+(?:das\s+ich|zum?\s|über)|welches\s+(?:reel|video)|in\s+welchem\s+(?:reel|video))(?!\p{L})/iu;

/**
 * A standing order: something that should happen again and again, not once.
 *
 * Deliberately an AND of two independent signals — a cadence AND a delivery
 * verb. Either alone is far too common to route on: "jeden Tag" appears in
 * ordinary prose about anything, and "erinnere mich" without a cadence is a
 * one-off. Requiring both is what makes this affordable as a direct route —
 * since 09/2026 into the loop with the `recurring_tasks` tool pinned (before
 * that onto the `create_recurring_task` intent, which was LLM-only, so every
 * recurring order paid for the 27k prompt).
 *
 * The loop planner fills the actual schedule from the tool schema, so this
 * pattern only has to answer "is a recurrence being asked for", not "what
 * recurrence" — which is why it can stay a regex. The same predicate also
 * mounts the tool (`toolCatalog.ts`).
 */
// `\p{L}*` hinter den Adverbien, nicht bloss das nackte Wort: „eine WÖCHENTLICHE
// Aufgabe" ist die natürliche Formulierung, und die flektierte Form scheiterte am
// abschliessenden `(?!\p{L})` — dieselbe Familie wie die Umlaut-Falle, nur eine
// Silbe weiter hinten.
const RECURRENCE_CADENCE =
  /(?<!\p{L})(jede[nrs]?\s+(?:tag|woche|monat|morgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|t[äa]glich\p{L}*|w[öo]chentlich\p{L}*|monatlich\p{L}*|werkt[äa]glich\p{L}*|alle\s+\d{1,2}\s+(?:tage|wochen|monate)|immer\s+(?:montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags|morgens|abends|mittags)|(?:montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags))(?!\p{L})/iu;

/**
 * Die Zustellung muss AN MICH GERICHTET und ein AUFTRAG sein.
 *
 * Die erste Fassung prüfte nur auf ein Zustellwort irgendwo im Satz, und das
 * war zu wenig: „Was steht täglich im Newsletter-Update?" und „Ich lese jeden
 * Tag den Bericht" erfüllten Takt + Zustellung und legten eine tägliche Aufgabe
 * an, statt die Frage zu beantworten — damals schrieb der Intent OHNE
 * Rückfrage in die Datenbank. Seit 09/2026 legt das Werkzeug nur noch über eine
 * Karte an; ein Fehlalarm kostet jetzt einen Umweg über die Schleife und eine
 * überflüssige Karte, keine Zeile mehr.
 *
 * Deshalb steht das Verb jetzt zusammen mit seinem Objekt: „erinnere MICH",
 * „schick MIR", „melde DICH". Ein blosses „Update" oder „Bericht" genügt nicht.
 *
 * `richt`/`setz` neben `leg`/`erstell`, weil „richte mir eine Erinnerung ein"
 * die naheliegendste Formulierung überhaupt ist und in der ersten Fassung
 * fehlte — gemessen an einem echten Turn, nicht ausgedacht.
 *
 * Zwischen Verb und Objekt steht `[^.!?\n]{0,60}?` statt einer Wortkette: „richte
 * mir bitte gleich jeden Montag um 9 UHR eine Erinnerung ein" enthält eine
 * ZIFFER, und `\p{L}+` bricht dort ab. Dasselbe Fenster-Idiom wie bei
 * `NEGATOR_BEFORE_RE` in `fastPathGuards` — es bleibt innerhalb eines Satzes.
 */
const RECURRENCE_DELIVERY =
  /(?<!\p{L})(erinner\p{L}*\s+mich|schick\p{L}*\s+mir|send\p{L}*\s+mir|melde\p{L}*\s+dich|informier\p{L}*\s+mich|benachrichtig\p{L}*\s+mich|(?:leg|erstell|richt|setz)\p{L}*\s+[^.!?\n]{0,60}?(?:aufgabe|task|erinnerung)\p{L}*)(?!\p{L})/iu;

/**
 * Eine Absage ist keine Bestellung — und eine Frage erst recht nicht.
 *
 * Beides fehlte und beides schlug durch: „Schick mir bitte nicht mehr täglich
 * eine Übersicht" legte eine tägliche Übersicht AN. Die elf Tier-3-Schnellwege
 * tragen alle einen `negatedOrMeta`-Guard; dieser hier hatte keinen.
 */
const RECURRENCE_CANCELLATION =
  /(?<!\p{L})(nicht\s+mehr|kein(?:e|en)?\s+\p{L}+\s+mehr|keine\s+erinnerung\p{L}*|stopp?|beende|beenden|abbestell\p{L}*|abschalt\p{L}*|aufh[öo]ren|deaktivier\p{L}*|l[öo]sch\p{L}*)(?!\p{L})/iu;

/** Eine Frage über etwas Wiederkehrendes bestellt nichts. */
const RECURRENCE_QUESTION = /\?|^(?:was|wer|wann|warum|wieso|welche[rs]?|wo|wie)(?!\p{L})/iu;

/**
 * SATZWEISE, nicht auf die ganze Nachricht.
 *
 * Die erste Fassung prüfte den Gesamttext, und der Frage-Guard schaltete damit
 * die Erkennung für ALLES ab, sobald irgendwo ein „?" stand. Live gemessen:
 * „Wie funktioniert die Erinnerungsfunktion hier eigentlich? Und richte mir
 * bitte gleich jeden Montag um 9 Uhr eine ein." — das Fragezeichen im ERSTEN
 * Satz löschte den echten Dauerauftrag im ZWEITEN. Der Turn fiel in den Loop,
 * der Planer machte null Schritte, und die Antwort erklärte dem Nutzer, das
 * Produkt könne keine Erinnerungen setzen — eine Funktion, die es hat.
 *
 * Ein Satz ist die richtige Einheit: Takt, Zustellung, Verneinung und Frageform
 * beziehen sich alle auf einen Satz, nicht auf einen Absatz. Beansprucht wird
 * der Turn, sobald EIN Satz eine Bestellung ist — die übrigen Sätze beantwortet
 * der Dispatcher ohnehin mit.
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function looksLikeRecurringOrder(raw: string): boolean {
  const t = (raw ?? '').trim();
  if (!t) return false;
  // Eine Absage gilt für den ganzen Turn: „Beende das, schick mir stattdessen
  // jeden Montag …" ist ein Grenzfall, den ein Modell entscheiden soll, kein
  // Regex — und die sichere Richtung ist, nichts anzulegen.
  if (RECURRENCE_CANCELLATION.test(t)) return false;
  return splitSentences(t).some(
    (sentence) =>
      !RECURRENCE_QUESTION.test(sentence) &&
      RECURRENCE_CADENCE.test(sentence) &&
      RECURRENCE_DELIVERY.test(sentence)
  );
}

/**
 * "How do I …?" — an INSTRUCTIONAL question about operating the Grünerator,
 * not a command to do the thing.
 *
 * The `ich` is what makes this safe: a user issuing a command writes "Erstelle
 * ein Sharepic", never "Wie erstelle ich ein Sharepic". Without that distinction
 * the generation heuristics win the turn and the assistant BUILDS a sharepic for
 * someone who only asked how sharepics work.
 *
 * Matched as "wie … ich" within a two-word window rather than an explicit verb
 * list — German separable verbs ("wie lege ich ein Notebook an") make an
 * enumeration endless, and the feature-noun requirement in
 * {@link looksLikeDocsHelpQuestion} is what actually keeps this precise.
 */
export const INSTRUCTIONAL_QUESTION =
  /\bwie\s+(?:\w+\s+){0,2}?ich\b|\bwie\s+(geht\s+das|funktioniert)\b|\bwo\s+(finde|stelle)\s+ich\b/i;

/**
 * An explicit request for documentation, by name.
 */
export const HELP_ANCHOR =
  /\b(anleitung\w*|tutorial\w*|handbuch|dokumentation|doku|hilfeseite\w*|faq|schritt[- ]f[üu]r[- ]schritt)\b/i;

/**
 * Grünerator-specific feature nouns. Required alongside a how-question so
 * generic instructional asks ("wie kann ich die Energiewende erklären") stay
 * out of the docs intent — that is a content question, not a product question.
 *
 * `notizb[üu]ch\w*` sits next to `notebooks?` on purpose: the product word is
 * Notebook since 27.08.2026, but this net reads what people TYPE. Detectors
 * over user input keep the old spelling.
 */
export const GRUENERATOR_FEATURE_NOUN =
  /\b(gr[üu]nerator\w*|agentura|gr[üu]n[- ]?o[- ]?mat|sharepics?|reels?|untertitel|notebooks?|notizb[üu]ch\w*|wolke|nextcloud|konnektor\w*|mcp[- ]?server\w*|wissenssammlung\w*|monitor|sonntagsfrage|sharepic[- ]studio|composer|grüneratoren)\b/i;

/**
 * Gate for the `hilfe` intent (docs lookup). High precision, deliberately low
 * recall: everything it misses still reaches the LLM tier, and a `hilfe` turn
 * enters the agentic loop where the full tool catalog is mounted — so a false
 * positive is cheap (the model just picks another tool) while a false negative
 * on a generation-shaped question is not (it builds the artifact instead).
 */
export function looksLikeDocsHelpQuestion(text: string): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;
  const hasFeature = GRUENERATOR_FEATURE_NOUN.test(t);
  if (HELP_ANCHOR.test(t) && (hasFeature || INSTRUCTIONAL_QUESTION.test(t))) return true;
  return INSTRUCTIONAL_QUESTION.test(t) && hasFeature;
}

/**
 * Eine GELTUNGSFRAGE: Gilt eine Norm, Frist oder Regelung JETZT noch?
 *
 * Die Klasse ist nicht „Rechtsfrage", und der Unterschied ist der ganze Punkt.
 * „Was steht in § 184k StGB?" ist eine Rechtsfrage und braucht keine Suche — der
 * Normtext ist stabil. „Gilt das Verbrenner-Aus ab 2035 noch?" fragt nach einem
 * JETZT-Zustand, und dessen richtige Antwort veraltet in Wochen. Der Code kennt
 * die Klasse längst und zählt sie in `synthPrompt.ts` selbst auf („Amt, Mandat,
 * Mitgliedschaft, Preis, Stand eines Verfahrens"); es fehlte nur der Detektor.
 *
 * Zweifaktorig wie `search.party_position`: die FRAGEFORM allein trifft zu viel
 * („Gilt das auch für mein Dokument?"), der GEGENSTAND allein trifft jede
 * Gesetzesnennung. Erst beides zusammen beschreibt den Fall.
 *
 * Das Fenster zwischen „gilt" und „noch" ist mit 160 Zeichen weit, aber durch
 * `[^.?!]` auf EINEN Satz begrenzt. 60 waren zu wenig: „Gilt das
 * Klimaschutzgesetz, das im Sommer nach monatelangen Verhandlungen verabschiedet
 * wurde, eigentlich noch?" reisst die Klammer mit über 100 Zeichen auf, ohne den
 * Satz zu verlassen — und ein Relativsatz zwischen Norm und Frage ist im
 * Rechtsregister der Normalfall, nicht die Ausnahme. Die Weite ist billig, weil
 * der Gegenstand (Faktor B) ohnehin danebenstehen muss.
 *
 * Warum ein Erstellungsauftrag ausgeschlossen ist: die Regel, die dieses
 * Prädikat im Heuristik-Tisch bedient, steht VOR den Erstellungsregeln und würde
 * sie sonst verdecken — „Schreibe eine PM zum Gesetz, das 2026 in Kraft tritt"
 * ist ein Schreibauftrag, keine Frage nach dem Stand.
 */
const VALIDITY_FORM_RE =
  /\b(gilt|gelten|gälte|galt|gültig|gueltig)\b[^.?!]{0,160}?\bnoch\b|\bnoch\b[^.?!]{0,160}?\b(gilt|gelten|gültig|gueltig|in\s+kraft)\b|\b(außer|ausser)\s+kraft\b|\bin\s+kraft\b|\brechts(stand|lage|akt)\w*\b|\bgesetzeslage\b|\bverfahrensstadium\b|\b(schon|bereits)\s+(beschlossen|verabschiedet|in\s+kraft)\b|\bbeschlossen\s+oder\b|\b(gekippt|aufgehoben|abgeschafft|zurückgenommen|zurueckgenommen)\b|\bstand\s+(des|der)\s+(verfahrens?|gesetzgebung|beratung|verhandlung\w*)\b/i;

/**
 * Der Gegenstand, dessen Geltung gefragt sein kann — eine Norm, eine Frist, ein
 * Verfahren, oder schlicht eine Jahreszahl. Ohne ihn ist „gilt … noch" eine
 * Rückfrage zum Gespräch und keine Recherche.
 *
 * Der Stamm muss an einer KOMPOSITUM-NAHT sitzen — am Wortanfang oder am
 * Wortende, nicht irgendwo in der Mitte.
 *
 * Beide Hälften sind gemessen. Nur eine führende Wortgrenze (`\bgesetz`) fand
 * „das Gesetz" und verfehlte „Lieferkettengesetz", „Klimaschutzgesetz",
 * „Heizungsgesetz" — also gerade die Normen, nach denen wirklich gefragt wird;
 * dieselbe Begründung steht an `parliamentaryKeywords` weiter unten. Gar keine
 * Grenze traf dafür mitten hinein: `gesetz` in „vorausge**setz**t", `frist` in
 * „be**frist**et", `verbot` in „un**verbot**ene". Die Naht-Regel nimmt das
 * Kompositum und lässt die Wortmitte liegen.
 *
 * Der Zusatz `(?!t\b)` an `gesetz` fängt den einen Rest, den die Naht nicht
 * fängt: das blosse Partizip „gesetzt" beginnt mit einer echten Wortgrenze.
 *
 * Bewusst NICHT gelöst: „sich verfahren" und die literarische „Novelle" tragen
 * denselben Stamm wie Verwaltungsverfahren und Gesetzesnovelle. Lexikalisch ist
 * das nicht trennbar; der Preis eines Treffers ist ein überflüssiger Abruf, und
 * Faktor A muss zusätzlich passen.
 */
const NORM_STEMS =
  'gesetz(?!t\\b)|verordnung|richtlinie|beschluss|beschlüsse|regelung|vorschrift|verbot|frist|verfahren|novelle|reform|statut|satzung|paragra(?:f|ph)|abkommen|moratorium';
const NORM_SUBJECT_RE = new RegExp(`\\b(?:${NORM_STEMS})|(?:${NORM_STEMS})\\b`, 'i');

/** Eine Jahreszahl trägt den Gegenstand allein — „gilt das ab 2035 noch". */
const YEAR_OR_ARTICLE_RE = /§|\bartikel\s*\d+|\b(19|20)\d\d\b/i;

/**
 * Ein Schreibauftrag ist keine Frage nach dem Stand — aber nur ein ECHTER.
 *
 * Unverankert war dieser Wächter der gefährlichste Teil des Detektors, weil er
 * ihn abschaltet, bevor irgendetwas anderes geprüft wird: `verfass\w*` trifft
 * „Verfassung", „Verfassungsänderung", „verfasst"; `formulier\w*` trifft
 * „Formulierung"; `erstell\w*` trifft „Erstellung". „Ist die Verordnung, die
 * 2019 verfasst wurde, noch gültig?" fiel damit still durch — dieselbe
 * Fehlerform wie #2949, nur durch die Reparatur selbst erzeugt.
 *
 * Ein Auftrag steht am Anfang der Nachricht, höchstens hinter einer Höflichkeit.
 * Genau das prüft der Anker.
 */
const CREATIVE_ORDER_RE =
  /^(?:bitte\s+|kannst\s+du\s+(?:bitte\s+)?|könntest\s+du\s+(?:bitte\s+)?|kannst\s+du\s+mir\s+(?:bitte\s+)?)?(?:schreib|erstell|formulier|verfass|entwirf|entwerfe)\w*/i;

/** Fragen ohne Fragezeichen — der Satz beginnt mit dem Frageverb. */
const QUESTION_OPENER_RE =
  /^(gilt|gelten|ist|sind|hat|haben|wurde|wurden|was|wie|welche[rsnm]?|wann|steht|stimmt)\b/i;

/**
 * Gate für die Geltungsfrage. Hohe Präzision, bewusst niedrige Trefferquote:
 * was durchfällt, verhält sich exakt wie heute. Was greift, kostet einen
 * erzwungenen Abruf — und der ist bei einer falsch-positiven Frage nur langsam,
 * während eine falsch-negative eine plausibel aussehende, veraltete Auskunft
 * durchlässt, der niemand ansieht, wann sie stimmte.
 */
export function looksLikeGeltungsfrage(raw: string): boolean {
  const t = (raw ?? '').trim();
  if (!t) return false;
  if (CREATIVE_ORDER_RE.test(t)) return false;
  if (!t.includes('?') && !QUESTION_OPENER_RE.test(t)) return false;
  return VALIDITY_FORM_RE.test(t) && (NORM_SUBJECT_RE.test(t) || YEAR_OR_ARTICLE_RE.test(t));
}

/**
 * Explicit requests for depth. The umlaut-free spellings are not padding: users
 * type `ausfuehrlich` routinely, and without them an explicit request for detail
 * was silently downgraded — the user asked for more and the answer rule stayed
 * on the middle tier.
 */
const DETAIL_REQUEST_RE =
  /\b(detailliert|ausführlich|ausfuehrlich|umfassend|gründlich|gruendlich|tiefgehend|vollständig|vollstaendig)\b/i;

/**
 * OPEN questions: the answer is a portrait, not a fact. "Wer war X", "Was ist Y",
 * "Erkläre Z" — all short to ask and long to answer.
 *
 * Past tense included deliberately. The old pattern listed only `wer ist`, so
 * every question about a historical person fell through to the length rule.
 */
const OPEN_LOOKUP_RE =
  /^(wer|was)\s+(ist|war|sind|waren)\b|^(erkläre|erklär|erklaere|erzähl|erzaehl|beschreib)/i;

/** CLOSED lookups: a place or a date is one fact, however it is phrased. */
const CLOSED_LOOKUP_RE = /^(wo\s+(ist|liegt|war)|wann)\b/i;

/**
 * Detect query complexity using heuristic patterns.
 * Determines whether a query needs simple, moderate, or complex research depth.
 *
 * The ordering below is the substance of this function, not housekeeping.
 *
 * A length shortcut (`q.length < 30 → simple`) used to run FIRST, which made the
 * question's length a proxy for the answer's scope — and the two are close to
 * inverted. "wer war marilyn monroe" is 22 characters; it produced a two-sentence
 * answer that named her birth date and nothing else, while the same question
 * with "ausführlich" appended produced four sections including her films. The
 * cap was doing that, not the model and not the sources.
 *
 * It also made the pattern list below unreachable for exactly the queries it
 * described: every `was ist X` short enough to match it had already returned.
 *
 * So openers are classified by whether the QUESTION is open or closed, before
 * length is consulted at all. Length survives only as the last resort, for input
 * that matches no shape — a bare topic word ("Klimaschutz").
 *
 * Consumers other than the answer-format rule: `briefGeneratorNode` and
 * `intentExecutionService` group `moderate` with `complex`, so an open lookup
 * that also carries `intent === 'research'` now plans before it searches. That
 * is the intended reading — an open research question deserves a plan.
 * `searchDepth.ts` deliberately stopped taking `complexity` as a parameter, so
 * nothing here can buy the expensive engine tier.
 */
export function detectComplexity(query: string): 'simple' | 'moderate' | 'complex' {
  const q = query.toLowerCase();
  const trimmed = q.trim();

  // Complex: comparison, multi-topic, or explicit detail requests
  if (
    /\b(vergleich|unterschied|pro\s+und\s+contra|gegenüber|im\s+vergleich|versus|vs\.?)\b/i.test(q)
  ) {
    return 'complex';
  }
  if (DETAIL_REQUEST_RE.test(q)) {
    return 'complex';
  }
  // Multi-clause: "und" connecting distinct topics (not just filler)
  if (/\b(einerseits|andererseits|sowohl|als\s+auch)\b/i.test(q)) {
    return 'complex';
  }

  // Greetings are genuinely closed, at any length.
  if (/^(hallo|hi|hey|guten|servus|moin|danke)/i.test(trimmed)) {
    return 'simple';
  }

  // Shape before length — this is the fix.
  if (OPEN_LOOKUP_RE.test(trimmed)) {
    return 'moderate';
  }
  if (CLOSED_LOOKUP_RE.test(trimmed)) {
    return 'simple';
  }

  // Last resort: no recognisable shape. A bare topic word is a simple ask.
  if (q.length < 30) {
    return 'simple';
  }

  return 'moderate';
}

/**
 * Ein Akteur mit Vor- und Nachnamen, in einem Rahmen, der ihn als Akteur ausweist.
 *
 * Die dritte Tür zum DIP-Zweig neben `partyKeywords` und
 * `bundestagFactionKeywords` — und die, ohne die die Menge asymmetrisch war:
 * „Recherchiere, wie die SPD beim Heizungsgesetz abgestimmt hat" bekam
 * `documents+bundestag`, dieselbe Frage nach Renate Künast bekam nichts.
 * Gemessen am `research`-Verdikt, dem Pfad, auf dem `searchSources` wirklich
 * gelesen wird (der Loop wählt seine Werkzeuge selbst und liest das Feld nie).
 *
 * Gegen den ROHEN Text, nicht gegen die kleingeschriebene Kopie: Grossschreibung
 * IST hier das Signal. `PERSON_PATTERNS` in `PersonDetectionService` löst
 * dieselbe Aufgabe, taugt hier aber nicht — es ist async (MP-Cache +
 * DIP-Abfrage), und sein `/i` macht `[A-ZÄÖÜ]` zu keiner Grossschreibungsprüfung
 * mehr.
 *
 * Zwei Wächter, beide gemessen und nicht geschätzt:
 *
 *  - **Der Rahmen ist Pflicht.** Zwei grossgeschriebene Wörter allein treffen im
 *    Deutschen jedes Nomenpaar. Ein Vorwort oder eine Anrede davor macht daraus
 *    einen Akteur — zusammen mit der Parlaments-Bedingung an der Aufrufstelle.
 *  - **Der Name darf keine Institution sein.** „Gesetzentwurf mit Kleiner
 *    Anfrage" passiert den Rahmen (`mit` + zwei grosse Wörter) und ist keine
 *    Person. Geprüft werden BEIDE Namensteile, weil der Fehlgriff mal vorne
 *    („Deutschen Bundestag") und mal hinten sitzt („Kleiner Anfrage").
 *
 * Mindestens zwei Namensteile, damit „von Bayern" keine*n Abgeordnete*n ergibt.
 */
const PERSON_FRAME =
  /(?:\b[Ww]ie(?:\s+(?:hat|haben))?|\b[Vv]on|\b[Dd]urch|\b[Mm]it|\b[Aa]bgeordnete[rn]?|\bMdB|\b(?:Dr|Prof)\.)\s+([A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)\s+([A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?)/;

/** Wörter, die im Rahmen stehen können, ohne je ein Personenname zu sein. */
const NOT_A_NAME =
  /^(bundestag\w*|bundesrat\w*|drucksache\w*|plenar\w*|plenum|gesetzentw(urf|ürf)\w*|anfrage\w*|antr(a|ä)g\w*|fraktion\w*|ausschuss\w*|partei\w*|regierung\w*|ministerium\w*|union|linke\w*|gr(ü|u)ne\w*|deutsch\w*|kleine\w*|gro(ß|ss)e\w*)$/i;

function namesAPerson(query: string): boolean {
  const m = PERSON_FRAME.exec(query);
  if (!m) return false;
  return !NOT_A_NAME.test(m[1] ?? '') && !NOT_A_NAME.test(m[2] ?? '');
}

/**
 * Detect whether a query needs multiple search sources (documents + web).
 * Returns an array of search sources to query in parallel.
 * Empty array means single-source mode (backward compatible, uses intent-based routing).
 */
export function detectSearchSources(query: string, intent: SearchIntent): SearchSource[] {
  // Only applies to search-type intents
  if (!['search', 'web', 'research'].includes(intent)) {
    return [];
  }

  const q = query.toLowerCase();

  const partyKeywords =
    /\b(grüne|grünen|partei|programm|position|wahlprogramm|beschluss|grundsatzprogramm|fraktion|bundestagsfraktion|antrag)\b/i;
  const temporalKeywords =
    /\b(aktuell|aktuelle|aktuellen|entwicklung|entwicklungen|nachrichten|news|heute|kürzlich|neueste|neuste|jüngste|letzte|momentan|derzeit|gegenwärtig)\b/i;
  const comparativePattern =
    /\b(und\s+(was|wie|welche)\s+(sind|ist|gibt|waren)|und\s+(aktuelle|die\s+aktuellen?)|sowie\s+(aktuelle|die))\b/i;

  const hasPartyKeywords = partyKeywords.test(q);
  const hasTemporalKeywords = temporalKeywords.test(q);
  const hasComparative = comparativePattern.test(q);

  // Parliamentary process named alongside party content → collections + DIP.
  // Deliberately narrow: only wording that points at the parliamentary RECORD
  // (Drucksache, Plenardebatte, Gesetzgebungsverfahren), not the mere word
  // "Bundestag" — "was sagen die Grünen im Bundestag zum Klimaschutz" is a
  // question about positions, and pairing it with DIP would spend a second
  // retrieval round on documents nobody asked for. `bundestagsfraktion` is
  // excluded for the same reason: it names our own collection, not the DIP.
  // Suffixes are `\w*`, not `\b`, because German inflects: "der Stand des
  // GesetzentwurfS", "in den DrucksachEN". A word-boundary-only pattern matched
  // the nominative and quietly missed every declined form.
  const parliamentaryKeywords =
    /\b(drucksache\w*|drs\.?|plenar\w*|plenum|gesetzentw(urf|ürf)\w*|gesetzgebungsverfahren\w*|bundestagsdebatte\w*|debattiert|kleine anfrage\w*|große anfrage\w*|abgestimmt|beratungsstand\w*|antrag im bundestag|im bundestag (debattiert|beschlossen|eingebracht|beraten))\b/i;
  // Fremdfraktionen öffnen denselben Zweig. Bewusst NICHT in `partyKeywords`:
  // der Satz oben schaltet vier weitere Zweige, und in jedem von ihnen stünde
  // `documents` — unsere eigenen Sammlungen — als Fundstelle für eine Frage über
  // eine andere Partei. „Wie hat die SPD abgestimmt" braucht das Parlamentsprotokoll,
  // nicht unser Wahlprogramm.
  //
  // Der Zuschnitt folgt der Quelle, die er aufsperrt: aufgenommen ist, was im
  // Bundestag Fraktion war oder ist — die DIP reicht über die laufende
  // Wahlperiode zurück, deshalb stehen FDP und BSW mit drin. Österreichische
  // Parteien gehören nicht hierher: zur DIP gibt es für sie kein Gegenstück,
  // ein Treffer würde eine AT-Frage an den deutschen Bundestag schicken.
  const bundestagFactionKeywords =
    /\b(spd|cdu|csu|afd|fdp|bsw|unionsfraktion|linksfraktion|linkspartei)\b|\b(die|der|den)\s+(linken?|union)\b/i;
  if (
    (hasPartyKeywords || bundestagFactionKeywords.test(q) || namesAPerson(query)) &&
    parliamentaryKeywords.test(q)
  ) {
    return ['documents', 'bundestag'];
  }

  // Party content + temporal/current context → both sources
  if (hasPartyKeywords && (hasTemporalKeywords || hasComparative)) {
    return ['documents', 'web'];
  }

  // Party content + examples request → documents + examples
  const examplesKeywords = /\b(beispiel|vorlage|post|tweet|instagram|social\s*media)\b/i;
  if (hasPartyKeywords && examplesKeywords.test(q)) {
    return ['documents', 'examples'];
  }

  // References to past conversations → include chat_history source
  if (CHAT_HISTORY_KEYWORDS.test(q)) {
    const base: SearchSource[] = hasPartyKeywords
      ? ['documents', 'chat_history']
      : ['chat_history'];
    return base;
  }

  return [];
}
