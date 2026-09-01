/**
 * Classifier Heuristics
 *
 * Pattern-matching "fast path" for intent classification.
 * High-confidence patterns skip the LLM call entirely.
 *
 * Die Entscheidung selbst steht als TABELLE am Ende der Datei
 * (`HEURISTIC_RULES`), nicht als `if`-Kaskade: die Reihenfolge der Einträge ist
 * die Präzedenz, und der Negations-/Meta-Wächter ist ein Feld, das der Läufer
 * anwendet, statt einer Zeile, die eine Regel vergessen kann. Der obere Teil der
 * Datei sind die Muster und Hilfsprädikate, die die Regeln benutzen — viele
 * davon werden auch anderswo im Klassifikator gebraucht und sind deshalb
 * exportiert.
 */

import { findBestMatch, isCloudShareUrl } from '@gruenerator/shared/utils';

import { escapeRegExp } from '../../../../services/BaseSearchService/textUtils.js';
import { createLogger } from '../../../../utils/logger.js';

import {
  analyzeMessage,
  runRules,
  NOUN_TRIGGER_MAX_LENGTH,
  type AnalyzedMessage,
  type ClassifierRule,
} from './analyzedMessage.js';
import {
  CLASSIFIER_CONTEXT_MESSAGES,
  CLASSIFIER_CONTEXT_MAX_CHARS,
  looksLikeGeltungsfrage,
} from './classifierSignals.js';
import {
  creationOrderPattern,
  dictatesInlineTableColumns,
  hasExplicitSharepicWord,
  isNegatedArtifactRequest,
  negatedOrMeta,
  stripQuotedSpans,
} from './fastPathGuards.js';

import type { SearchIntent, SocialTextPlatform, ClassificationResult } from '../types.js';
import type { ModelMessage } from 'ai';

// Generation intents reachable via the fuzzy keyword fallback (only `image`,
// via 'grafik'/'illustration'); negated/meta artifact words must not match them.
// Politik dieses Rückfalls, keine Eigenschaft der Intents: welche
// Generierungs-Intents eine unscharfe Stichwortübereinstimmung überhaupt
// auslösen darf.
const GENERATION_FUZZY_INTENTS: ReadonlySet<SearchIntent> = new Set([
  'image',
] as const satisfies readonly SearchIntent[]);

const log = createLogger('ChatGraph:Classifier');

// ── Social-Post-Vokabular ───────────────────────────────────────────────────
// Shared by the heuristic fast-path and the classifier's dedicated branches so
// escape hatches and platform detection can't drift between tiers.

/**
 * Der Auftrag nennt ein POST-Nomen und nicht nur ein Sharepic ("Post mit
 * Sharepic"). Er gehört damit dem Schreibzweig, nicht der Sharepic-Route.
 *
 * Bis 08/2026 hiess die Begründung „`social_post` trägt die Sharepic-Hälfte
 * selbst" — das Verdikt ist stillgelegt, die Vorfahrt bleibt: der Text ist
 * bestellt, die Grafik ist ein eigener Auftrag.
 */
export const POST_NOUN_PATTERN = /\b(post(ing)?|beitrag|tweet|caption)\b/i;

/**
 * "Grafik"/"Kachel" name three different products in this app: a branded
 * sharepic template, a free AI image, and a data chart. Each costs a
 * generation, so guessing is wrong about two thirds of the time.
 */
const AMBIGUOUS_GRAPHIC_NOUN = /\b(grafik(en)?|kachel(n)?)\b/i;

/** Words that already say WHICH kind is meant — no question needed. */
const GRAPHIC_KIND_DISAMBIGUATOR =
  /\b(diagramm\w*|chart|graph|torte|balken|kreis|kurve|statistik\w*|daten|zahlen|werte|male|mal\s|zeichne\w*|illustrier\w*|foto\w*|bild\w*|logo|karte|infografik\w*)\b/i;

/** Only a CREATION ask needs disambiguating; a question about graphics does not. */
const GRAPHIC_CREATE_VERB =
  /\b(erstell|generier|mach|bau|entwirf|entwerf|brauch|erzeug|gestalte?|hätte?\s+gern|will|möchte)\w*/i;

/**
 * True when the user asked for a "Grafik"/"Kachel" without saying which of the
 * three kinds they mean. Naming a sharepic, a chart type, or a drawing verb
 * answers the question already, so those keep their existing routes.
 */
export function isAmbiguousGraphicRequest(text: string): boolean {
  const t = stripQuotedSpans(text ?? '');
  if (!AMBIGUOUS_GRAPHIC_NOUN.test(t)) return false;
  if (hasExplicitSharepicWord(t)) return false;
  if (GRAPHIC_KIND_DISAMBIGUATOR.test(t)) return false;
  if (!GRAPHIC_CREATE_VERB.test(t)) return false;
  return !negatedOrMeta(t, AMBIGUOUS_GRAPHIC_NOUN);
}

const INSTAGRAM_PLATFORM_PATTERN = /\b(instagram|insta|reels?|story)\b/i;
const FACEBOOK_PLATFORM_PATTERN = /\b(facebook|fb|fb-?post|fb-?beitrag)\b/i;
// Mastodon/Bluesky share Twitter's 280-char budget (see prompts/social.json).
const TWITTER_PLATFORM_PATTERN = /\b(twitter|tweets?|tweete\w*|x-?post|bluesky|mastodon)\b/i;
const LINKEDIN_PLATFORM_PATTERN = /\blinked-?in\b/i;

/**
 * Platform hint from the user prompt. Null = no platform named (generic).
 * Instagram/Facebook win over Twitter/LinkedIn to preserve the pre-existing
 * two-platform detection order.
 */
export function detectSocialPlatform(text: string): SocialTextPlatform | null {
  if (INSTAGRAM_PLATFORM_PATTERN.test(text)) return 'instagram';
  if (FACEBOOK_PLATFORM_PATTERN.test(text)) return 'facebook';
  if (TWITTER_PLATFORM_PATTERN.test(text)) return 'twitter';
  if (LINKEDIN_PLATFORM_PATTERN.test(text)) return 'linkedin';
  return null;
}

/** Creation verb: user wants a post WRITTEN, not examples shown. */
export const SOCIAL_CREATE_VERB_PATTERN =
  /\b(erstell|schreib|mach|generier|verfass|formulier|entwirf|entwerf|bastel|produzier|dichte|tweete)\w*/i;

/** Bare noun-phrase prompts ("Instagram-Post zu Tempo 30") carry no verb. */
export const SOCIAL_BARE_NOUN_PATTERN =
  /^\s*(bitte\s+)?(ein(en)?\s+)?((insta(gram)?|facebook|fb|linkedin|twitter|x|tiktok)[-\s]?)?(post(ing)?|beitrag|tweet|reels?|caption|social[-\s]?media[-\s]?post)\b/i;

/** Question-shaped messages must not trigger post creation. */
export const SOCIAL_META_QUESTION_PATTERN = /^\s*(wie|was|wer|warum|wieso|welche|wann|wo)\b/i;

/**
 * Die Paste-Schwelle wohnt jetzt bei der Analyse-Vorstufe, die sie auswertet
 * (`analyzedMessage.ts`). Hier bleibt sie exportiert, weil `classifierNode` sie
 * seit jeher von dieser Datei bezieht — und weil „lang genug, um sein eigenes
 * Thema mitzubringen" im ganzen Klassifikator EINE Zahl bleiben muss.
 */
export { NOUN_TRIGGER_MAX_LENGTH };

// Hoisted 'g' copy for matchAll (which clones internally, so sharing is safe).
const SOCIAL_CREATE_VERB_PATTERN_G = new RegExp(SOCIAL_CREATE_VERB_PATTERN.source, 'gi');

/**
 * True when `nounPattern` matches within `window` chars of a creation verb.
 * Guards verb+noun rules against pairing the instruction's verb ("schreibe …")
 * with a noun hundreds of chars away inside pasted material.
 */
export function nounNearCreateVerb(text: string, nounPattern: RegExp, window = 120): boolean {
  // Nouns are the rare token — bail before the verb scan for the common case.
  if (!nounPattern.test(text)) return false;
  const verbIndices = [...text.matchAll(SOCIAL_CREATE_VERB_PATTERN_G)].map((m) => m.index ?? 0);
  if (verbIndices.length === 0) return false;
  for (const noun of text.matchAll(new RegExp(nounPattern.source, 'gi'))) {
    const nounIndex = noun.index ?? 0;
    if (verbIndices.some((v) => Math.abs(nounIndex - v) <= window)) return true;
  }
  return false;
}

/** Trigger nouns for the heuristic social rules below (narrower than the classifier's SOCIAL_NOUN_PATTERN). */
const SOCIAL_TRIGGER_NOUN_PATTERN = /\b(social\s*media|post|tweet|instagram)\b/i;

/**
 * Keywords for fuzzy matching in heuristic fallback.
 * Maps intents to their trigger keywords.
 *
 * Der `Exclude<…>`-Schlüsseltyp ist der Wächter, nicht Zierrat: ein neuer
 * Intent steht nicht in der Ausschlussliste, wird damit zum PFLICHTfeld dieses
 * Records und bricht den Build (verifiziert: TS2741). Wer keine Stichwörter
 * geben will, muss den Intent hier ausdrücklich ausschliessen und begründen —
 * genau das tun die Zeilen unten. Stillschweigend stichwortlos geht nicht.
 */
export const INTENT_KEYWORDS: Record<
  Exclude<
    SearchIntent,
    | 'direct'
    // Decided by GREETING_PREFIX_PATTERN, not by keyword scoring.
    | 'greeting'
    // Decided by the creative-task branches, not by keyword scoring.
    | 'produktion'
    | 'image_edit'
    | 'sharepic'
    | 'save_as_doc'
    | 'create_sheet'
    // edit_sheet is decided deterministically by Tier 2.7 (lastToolContext +
    // modification keywords), never keyword-scored here.
    | 'edit_sheet'
    | 'create_presentation'
    | 'create_pdf'
    // create_recurring_task is retired (09/2026): Tier 3.4 answers a recurring
    // order with `agentic` + pin on the `recurring_tasks` tool. Kept in the
    // union only because the enum value stays.
    | 'create_recurring_task'
    | 'modify_doc'
    | 'edit_current_doc'
    | 'modify_board'
    | 'edit_current_board'
    | 'share_doc'
    // scrape_url is detected by URL presence in the message (extractUrls), not keywords.
    | 'scrape_url'
    // artifact is detected by a dedicated pattern (noun + create imperative), not keywords.
    | 'artifact'
    // compute is detected by dedicated count/math/unit/date patterns, not keywords.
    | 'compute'
    // agentic is a router disposition (loop demotion), never keyword-matched.
    | 'agentic'
    // Stillgelegt (08/2026): ein Social-Post ist eine Textsorte, kein Verdikt.
    // Die Regel, die einmal hierher zeigte, liefert heute `produktion`.
    | 'social_post'
    // chat_history is detected by the dedicated past-conversation regex, not keywords.
    | 'chat_history'
    // mcp (EXPERIMENTAL) is gated via the @mcp mention + conservative LLM prose,
    // never keyword-classified (would misfire on generic "tool"/"server" words).
    | 'mcp'
    // Retired. These were excluded as "LLM-classified only, because bare
    // keywords like bahn/wetter/news would hijack policy queries (Bahnreform,
    // Klimapolitik)". They are not classified at all now — as managed connectors
    // they are selected by vocabulary in the router (`managedSourceTrigger`),
    // which carries exactly that policy-vs-data boundary in its word endings.
    // The exclusion stays: this Record is total over the union, and a retired
    // intent has no keywords to give it.
    | 'bahn'
    | 'reise'
    | 'hotel'
    | 'wetter'
    | 'news'
    | 'umfragen'
    // Ebenfalls stillgelegt, aber nie keyword-klassifiziert gewesen: die
    // PM-Beispiele hingen immer an einer Erwähnung bzw. am Zweig für
    // Inhalte-Agenten. `@pressemitteilungen` zurrt heute Werkzeug und Rezept
    // fest (`pinsTool`/`activatesSkill`), das Verdikt gibt es nicht mehr.
    | 'pressemitteilung_examples'
    // hilfe is detected by the dedicated instructional-question gate
    // (looksLikeDocsHelpQuestion, classifier Tier 2.9). Bare keywords like
    // "hilfe"/"anleitung" would hijack content queries ("hilf mir bei ...").
    | 'hilfe'
  >,
  string[]
> = {
  research: ['recherchiere', 'recherche', 'untersuche', 'analysiere', 'erforsche'],
  // 'compare' is upgraded post-classification (≥2 doc sources + compare verbs);
  // keep this list empty so the heuristic doesn't fire it on single-doc queries.
  compare: [],
  image: ['visualisiere', 'zeichne', 'illustriere', 'grafik', 'illustration'],
  web: ['internet', 'netz', 'online', 'aktuell', 'nachricht', 'news'],
  search: ['wahlprogramm', 'beschluss', 'grundsatzprogramm'],
  examples: ['beispiel', 'vorlage', 'tweet', 'instagram', 'social'],
  abgeordnetenwatch: [
    // Die Verbform steht neben den Substantiven, weil die natürliche Frageform
    // sie benutzt: "Wie hat die SPD zum Heizungsgesetz abgestimmt?" traf keines
    // der Substantive, fiel auf `direct@0.50` und wurde deshalb OHNE
    // `loopDemotedFromRetrieval` demotiert — der Planer rief kein Werkzeug und
    // antwortete mit dem Ehrlichkeitshinweis (Nightly-Eval 18.08.2026,
    // `followup-bundestag-scope` t0). Der Fuzzy-Abgleich deckt darüber auch
    // "gestimmt" ab. "Wie stimmte die FDP…" bleibt bewusst ungedeckt: mit
    // 'stimmte' in der Liste kippten vier harmlose Sätze mit ("Stimmt die
    // Aussage, dass…", "stimme den Text auf die Zielgruppe ab", "die Stimmung
    // stimmte nicht") in einen erzwungenen Abruf. Gemessen, nicht geschätzt.
    'abgestimmt',
    'abstimmungsverhalten',
    'nebentätigkeit',
    'nebentätigkeiten',
    'nebeneinkünfte',
    'namentliche abstimmung',
  ],
  bundestag: [
    'drucksache',
    'bt-drs',
    'plenarprotokoll',
    'plenardebatte',
    'bundestagsdebatte',
    'bundestagsrede',
    'gesetzentwurf',
    'kleine anfrage',
    'große anfrage',
    'gesetzgebungsverfahren',
  ],
  summary: ['zusammenfassung', 'zusammenfassen', 'kurzfassung', 'überblick'],
  chart: ['diagramm', 'balkendiagramm', 'kreisdiagramm', 'liniendiagramm', 'chart', 'statistik'],
};

// `image_edit` is intentionally NOT in INTENT_KEYWORDS: a bare "bearbeite" with
// no image context (attachment or explicit noun) means "edit the text", not
// "edit a picture". Routing to `image_edit` requires combining the verb match
// below with an image signal that only classifierNode sees, so we expose the
// predicates separately instead of letting fuzzyMatchIntent fire on its own.
//
// We anchor with `(?:^|\W)` instead of `\b` because JS `\b` is ASCII-only —
// a space-then-`ä` pair is non-word→non-word and yields no boundary, so
// `\bändere` would silently fail. `(?:^|\W)` consumes the space (or matches
// start-of-string) and works for both ASCII and umlaut alternatives.
const IMAGE_EDIT_VERB_PATTERN =
  /(?:^|\W)(bearbeit|editier|modifizier|transformier|umwandl|ändere|ändern|aender|mach\s+\S.{0,40}?\s+(?:rein|dazu|hinein|drauf)|f(?:ü|ue)g(?:e)?\s+\S.{0,40}?\s+hinzu|edit|change)/i;

const IMAGE_NOUN_PATTERN =
  /(?:^|\W)(bild|bilds|foto|fotos|image|images|picture|pictures|photo|photos)(?:$|\W)/i;

// Bare image-generation nouns, for the negation/meta guard on the image fast path
// and for IMAGE_CREATE_PATTERN below — one list, two readers.
const IMAGE_GEN_NOUN_SRC = 'bild|grafik|illustration|foto|image|poster';
const IMAGE_GEN_NOUN_PATTERN = new RegExp(`\\b(?:${IMAGE_GEN_NOUN_SRC})\\b`, 'i');

// Regenerate-the-last-image phrasings that carry no edit verb/noun ("nochmal,
// aber abends", "neue Version", "mach es wärmer"). Used ONLY with an image
// lastToolContext so it can't hijack unrelated turns.
const IMAGE_REGEN_PATTERN =
  /(?:^|\W)(nochmal[s]?|noch ?(?:ein(?:e?s)?|mal)\b|neue[srn]?\s+(?:version|variante)|neu\s+(?:generier|erstell)\w*|anders(?![a-zäöüß])|stattdessen|andere[srn]?\s+(?:stil|farbe|version|variante|hintergrund)|mach\s+(?:es|das|ihn|sie)\s+\w+er\b|(?:lieber|besser)\s+(?:mit|ohne|als)\b)/i;

// "nochmal" can also mean repeat-the-ANSWER — explain/repeat verbs keep the
// prose path. Question-initial messages ("Was war nochmal der Prompt?") too.
const ANSWER_REPEAT_PATTERN =
  /(?:^|\W)(erkl(?:ä|ae)r|erz(?:ä|ae)hl|beschreib|wiederhol|begr(?:ü|ue)nd|zusammenfass|fass\b|antwort|sag\s+(?:mir|es|das)|warum|wieso|weshalb)/i;

/**
 * True when a follow-up asks to regenerate the last image (not edit it, not
 * repeat the answer). Caller must gate on an image lastToolContext.
 */
export function isImageRegenRequest(text: string): boolean {
  if (/^\s*(was|wie|wer|warum|wieso|welche|wann|wo)\b/i.test(text)) return false;
  return IMAGE_REGEN_PATTERN.test(text) && !ANSWER_REPEAT_PATTERN.test(text);
}

/**
 * True when the user's text contains an image-edit verb (e.g. "bearbeite",
 * "ändere", "mach mehr Bäume rein").
 */
export function hasImageEditVerb(text: string): boolean {
  return IMAGE_EDIT_VERB_PATTERN.test(text);
}

/**
 * True when the user's text mentions a picture/photo/image noun, used to
 * recognise the no-attachment edit case ("bearbeite das Foto").
 */
export function mentionsImageNoun(text: string): boolean {
  return IMAGE_NOUN_PATTERN.test(text);
}

// ─── Folgeauftrag auf ein erzeugtes Bild ────────────────────────────────
//
// Die beiden Prädikate oben decken zusammen genau zwei Formen ab: das
// ausdrückliche Bearbeiten-Verb ("bearbeite das Foto") und das Neu-Würfeln
// ("nochmal, aber abends"). Die häufigste Form fehlte — die vergleichende
// Anweisung mit benanntem Bildteil: „Mach den Hintergrund dunkler", „Entferne
// das Logo", „Das Motiv etwas kleiner". Solange die LLM-Stufe darunter lag,
// fing sie diese Turns auf; ohne sie fielen alle sechs gemessenen Formulierungen
// ins Residual und wurden mit Prosa beantwortet, obwohl ein Bild zum Bearbeiten
// dalag. Derselbe Bauform-Fehler wie beim Sharepic-Folgeauftrag, nur eine
// Artefaktart weiter.
//
// Eigenes Vokabular statt Mitbenutzung von `sharepicEditHeuristics`: dessen
// Nomen beschreiben eine Vorlage (zeile, balken, karussell, folie), nicht ein
// Foto, und die Bildteile hier (licht, himmel, gesicht, stil) kennt es nicht.
// Die Geschwister-Module (`socialPostEditHeuristics`, `reelEditHeuristics`)
// halten es genauso — ein Vokabular pro Artefaktart.
//
// `(?<!\p{L})` statt `\b`, weil JS-`\b` nur ASCII kennt: vor „ä" gibt es keine
// Wortgrenze, `\bändere` matcht nie.
//
// Die Hinzufüge-Verben (`setz`, `füg`, `ergänz`, `pack`) stehen mit drin, weil
// ihr Fehlen beim Sharepic schon einmal einen ganzen Turn gekostet hat: etwas zu
// einem vorhandenen Artefakt hinzuzufügen ist eine Bearbeitung, das Muster
// konnte nur ÄNDERN und ENTFERNEN.
const IMAGE_EDIT_INSTRUCTION_VERB_PATTERN =
  /(?<!\p{L})(mach|änder|aender|entfern|ersetz|tausch|verschieb|vergrößer|vergroesser|verklein|größer|groesser|kleiner|heller|dunkler|wärmer|waermer|kälter|kaelter|schärfer|schaerfer|weniger|mehr|ohne|statt|setz|füg|fueg|ergänz|ergaenz|pack)/iu;

// Bildteile, die eine Anweisung benennen kann. BEWUSST getrennt von
// `IMAGE_NOUN_PATTERN`: das gattet Tier 1, wo ein blosses „Text"/„Hintergrund"
// ohne jedes Bild `image_edit` erzwingen würde. Hier hat der Aufrufer bereits
// festgestellt, dass das letzte Artefakt des Threads ein Bild IST — das Nomen
// muss nur noch sagen, WAS sich ändert.
//
// `plakat`/`poster` stehen mit dabei, weil sie hier dasselbe benennen wie
// `bild`/`motiv`: das ganze Artefakt. „Mach das Plakat heller" fiel ohne sie ins
// Residual. `poster` traf vorher nur durch Zufall — `IMAGE_REGEN_PATTERN` sucht
// „mach das …er", und „Poster" endet auf -er. Ein Wort, das die Prüfung nur
// wegen seiner letzten zwei Buchstaben besteht, ist nicht abgedeckt.
const IMAGE_ELEMENT_NOUN_PATTERN =
  /(?<!\p{L})(bild|foto|motiv|plakat|poster|hintergrund|vordergrund|text|schrift|logo|farb|licht|beleuchtung|himmel|person|gesicht|detail|stil|ausschnitt|perspektive)/iu;

// „Mach mir ein neues Bild" ist kein Folgeauftrag, sondern ein neuer Auftrag —
// Verb und Nomen sind dieselben. Unterschieden wird am unbestimmten Artikel,
// dieselbe Idiomatik wie in `sharepicEditHeuristics.NEW_ARTIFACT_PATTERN`.
// Höchstens ein Adjektiv dazwischen, sonst verschluckt der Wächter echte
// Bearbeitungen („setz eine Sonnenblume ins Bild").
const NEW_IMAGE_REQUEST_PATTERN =
  /(?<!\p{L})(?:ein(?:e|en|em)?|neue[srn]?)(?:\s+neue[srn]?)?\s+(?:bild|foto|grafik|illustration|poster)(?!\p{L})/iu;

// Wer um einen Vorschlag bittet, erteilt keinen Auftrag — „Mach mal einen
// Vorschlag, wie der Hintergrund besser wirken könnte" trägt Verb und Bildteil
// wie eine Bearbeitung und meint das Gegenteil: eine Antwort in Prosa. Ohne
// diesen Wächter lädt der Router das letzte Bild nach und schickt es an FLUX,
// der Nutzer bekommt ein verändertes Bild statt einer Meinung.
//
// Die Frageform-Wächter darunter reichen dafür nicht: diese Bitten fangen mit
// einem Imperativ an ("Mach mal …", "Gib mir …"), nicht mit einem Fragewort.
const ADVICE_REQUEST_PATTERN =
  /(?<!\p{L})(vorschlag|vorschl(?:ä|ae)ge|idee|ideen|tipp|tipps|empfehlung|ratschlag|meinung|feedback|findest du|h(?:ä|ae)ltst du|meinst du|(?:k(?:ö|oe)nnte|kann)\s+man)/iu;

/**
 * True when a follow-up reads like an instruction to change the image that was
 * just generated. Only meaningful with an image `lastToolContext` — the caller
 * checks that, which is why a bare element noun is allowed to carry the turn.
 */
export function isImageEditInstruction(text: string): boolean {
  if (NEW_IMAGE_REQUEST_PATTERN.test(text)) return false;
  if (ANSWER_REPEAT_PATTERN.test(text)) return false;
  if (ADVICE_REQUEST_PATTERN.test(text)) return false;
  if (/^\s*(was|wie|wer|warum|wieso|welche|wann|wo)(?!\p{L})/iu.test(text)) return false;
  return IMAGE_EDIT_INSTRUCTION_VERB_PATTERN.test(text) && IMAGE_ELEMENT_NOUN_PATTERN.test(text);
}

// Verbs that ask to SEE something that already exists, as opposed to having it
// made. Kept separate from SEARCH_LOOKUP_VERB_PATTERN below: that one gates a
// scope restriction and may under-fire safely, while this one decides whether we
// pay for image hits, so it lists the showing verbs ("zeig", "hast du") that a
// search-verb pattern has no reason to know about.
const IMAGE_LOOKUP_VERB_PATTERN =
  /\b(?:zeig\w*|find\w*|such\w*|schick\w*|gib\s+mir|hast\s+du|gibt\s+es|gibts|existier\w*|recherchier\w*|google\w*)\b/i;

// Verbs that ask for a NEW image. Their presence vetoes the lookup reading even
// when a showing verb is also there ("such ein Motiv und erstell daraus ein
// Bild") — buying stock links for a generation request is the expensive mistake,
// and the image intent already owns that turn.
const IMAGE_CREATE_VERB_PATTERN =
  /\b(?:erstell\w*|generier\w*|erzeug\w*|zeichne\w*|male\w*|mal\s|illustrier\w*|entwirf\w*|entwerf\w*|bau\w*)\b/i;

// "Bilder von der Demo" as a whole message: a bare noun phrase with no verb at
// all is still unambiguously a request to see them. Anchored at the start so it
// cannot match the noun buried in prose ("… erklärt das Bild von der Demo").
const BARE_IMAGE_REQUEST_PATTERN =
  /^\s*(?:bitte\s+)?(?:bilder|fotos|photos|images|pictures|aufnahmen)\b/i;

// Image nouns INCLUDING their German plurals, for the lookup gate below.
//
// Deliberately not `IMAGE_NOUN_PATTERN`/`IMAGE_GEN_NOUN_PATTERN`: both of those
// stop at "bild" and "foto" and reject "Bilder"/"Fotos", because their alternation
// is followed by a boundary assertion and "bild" inside "bilder" has none. Those
// two patterns gate the image-EDIT and image-GENERATION paths, where the singular
// is what people write ("bearbeite das Foto"), so widening them would change
// routing that has nothing to do with this feature. Here the plural is the
// dominant phrasing — nobody asks for "ein Bild von der Demo" when they mean
// several — so the gate needs its own pattern, and using the SAME one for the
// presence check and the negation check is what keeps those two from drifting
// apart (a noun the gate accepts but the negation guard cannot see is a hole).
const IMAGE_LOOKUP_NOUN_PATTERN =
  /\b(?:bild(?:er)?|foto(?:s)?|photo(?:s)?|image(?:s)?|picture(?:s)?|aufnahme(?:n)?)\b/i;

/**
 * True when the user wants to SEE existing images from the web, not to have one
 * generated — the only signal that may switch `includeImages` on.
 *
 * This distinction is the whole reason the function exists. "Erstell ein Bild von
 * einem Windrad" and "zeig mir Bilder von Windrädern" share every noun and differ
 * only in the verb, yet they route to entirely different subsystems: one to image
 * generation, the other to the web search. Getting it wrong in the expensive
 * direction means paying for stock links on a generation turn; getting it wrong in
 * the cheap direction means the user sees no images and asks again.
 *
 * Deliberately narrow. Images are never a default (a factual question would pay
 * for pictures nobody looks at), so an under-firing heuristic costs one clarifying
 * turn while an over-firing one costs money on every turn that happens to mention
 * a photo. The `bilder: true` tool argument is the escape hatch for the phrasings
 * this misses — in the loop, the model can say what it wants directly.
 */
export function wantsImageResults(text: string): boolean {
  if (!IMAGE_LOOKUP_NOUN_PATTERN.test(text)) return false;
  // "ohne Bilder" / "keine Fotos" — a refusal must never be read as a request.
  // Fed the SAME pattern as the gate above: with the singular-only pattern this
  // guard was a no-op on exactly the phrasings the gate accepts, so "zeig mir
  // keine Fotos" passed straight through it.
  //
  // Only the NEGATION half, not `negatedOrMeta`. The meta-question half stands
  // every artifact fast path down when the message opens with a question word,
  // because "Was macht ein gutes Sharepic aus?" must not build a sharepic. For a
  // LOOKUP that reasoning inverts: "gibt es Fotos von dem Protest?" is the
  // request, and `gibt es` is literally one of the openings that pattern rejects.
  if (isNegatedArtifactRequest(text, IMAGE_LOOKUP_NOUN_PATTERN)) return false;
  if (IMAGE_CREATE_VERB_PATTERN.test(text)) return false;
  if (hasImageEditVerb(text)) return false;
  return IMAGE_LOOKUP_VERB_PATTERN.test(text) || BARE_IMAGE_REQUEST_PATTERN.test(text);
}

// Document mutation verbs — used by classifierNode to route `edit_current_doc`
// (open doc in editor) and `modify_doc` (collaborative doc mention) intents.
// Same `(?:^|\W)` anchor reasoning as IMAGE_EDIT_VERB_PATTERN above: JS `\b` is
// ASCII-only and silently fails before an umlaut. We list both umlaut and
// ASCII-folded stems because `userContent` is NOT folded before testing.
//
// Separable-verb constructions ("füge X ein", "passe X an", "schreib X um")
// use the `\S.{0,40}?` intervening-words window from IMAGE_EDIT_VERB_PATTERN.
//
// Strategy: this regex is the **fast path** that catches ~85% of explicit
// edit requests with zero latency. The classifier pairs it with an LLM
// tiebreak (see `docsIntentTiebreak.ts`) for the residual cases (indirect
// phrasings, comparative imperatives like "mach das knackiger", colloquial
// or English requests). DO NOT try to make this regex exhaustive — that's
// the LLM's job. Only add stems for verbs frequent enough to justify
// bypassing the LLM call.
export const DOC_MODIFY_PATTERN =
  /(?:^|\W)(aender|änder|bearbeit|ergaenz|ergänz|aktualisier|ueberarbeit|überarbeit|f(?:ü|ue)g(?:e)?\s+\S.{0,40}?\s+(?:hinzu|ein)|einf(?:ü|ue)g|vereinfach|umschreib|schreib\s+\S.{0,40}?\s+(?:um|neu)|kuerz|kürz|erweiter|verläng|verlaenger|ersetz|umformulier|formulier\s+\S.{0,40}?\s+(?:um|neu)|verbesser|korrigier|anpass|pass\s+\S.{0,40}?\s+an|entfern|loesch|lösch|streich|(?:ü|ue)bersetz|mach\s+\S.{0,40}?\s+(?:k(?:ü|ue)rzer|l(?:ä|ae)nger|pr(?:ä|ae)ziser|kompakter|pr(?:ä|ae)gnanter|knackiger|schlagkr(?:ä|ae)ftiger|verst(?:ä|ae)ndlicher|freundlicher|formeller|pers(?:ö|oe)nlicher|fett|kursiv|unterstrichen|durchgestrichen|gr(?:ö|oe)(?:ss|ß)er|kleiner|farbig|bunt(?:er)?)|(?:fett|kursiv|unterstrichen|durchgestrichen|gr(?:ö|oe)(?:ss|ß)er|kleiner|farbig|bunt(?:er)?)\s+mach)/i;

/**
 * Board mutation verbs — the boards counterpart of {@link DOC_MODIFY_PATTERN}.
 *
 * Imperative edit verbs only. Uses `-e`/`-en` imperative/infinitive endings
 * (NOT bare stems) so participles/nouns in QUESTIONS don't misfire — e.g.
 * "was wurde geändert/gelöscht/markiert?", "welche Labels gibt es?",
 * "wie ist es sortiert?" must NOT route to an edit. Noun keywords (label,
 * status, …) only count when preceded by an edit verb (füge … hinzu /
 * erstelle / setze … / weise … zu).
 * Leading `(?<![\p{L}])` (not `\b`) so umlaut-initial verbs (ändere,
 * überarbeite) match after a space — `\b` fails there since ä/ü aren't ASCII
 * word chars. `u` flag enables \p{L}.
 *
 * Two readers, and they must agree: the classifier's `edit_current_board`
 * fast-path, and the loop's edit guarantee (`loopGuarantees.createAfterGather`),
 * which forces `edit_document` when the planner skipped it. A copy in the second
 * place would drift, and the failure is silent — the turn ends with the generic
 * "keine passende Antwort" instead of the edit the user asked for.
 */
export const BOARD_MODIFY_PATTERN =
  /(?<![\p{L}])(f(?:ü|ue)ge?\s+\S.{0,40}?\s+hinzu|neue[rs]?\s+(karte|aufgabe|spalte|feld|ansicht)|erstelle\s+\S.{0,40}?\s*(aufgabe|karte|spalte|ansicht|feld)|erstelle\s+(aufgabe|karte|spalte|ansicht|feld)|aktualisiere|(?:ä|ae)ndere|erg(?:ä|ae)nze|(?:ü|ue)berarbeite|vereinfache|(?:um)?strukturiere?|l(?:ö|oe)sche?|entferne|verschiebe|sortiere?|kommentiere|markiere|weise\s+\S.{0,40}?\s+zu\b|setze?\s+\S.{0,40}?\s+(?:f(?:ä|ae)llig|frist|status|zust(?:ä|ae)ndig|als|auf|zu\b)|setze?\s+(f(?:ä|ae)llig|frist|status|zust(?:ä|ae)ndig))/iu;

/**
 * Find intent using fuzzy (Levenshtein-based) matching.
 * Returns the intent if a word matches a keyword with similarity >= threshold.
 */
export function fuzzyMatchIntent(word: string, threshold = 0.75): SearchIntent | null {
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const match = findBestMatch(word, keywords, threshold);
    if (match) {
      log.debug(
        `[Fuzzy] Matched "${word}" to "${match.match}" (${intent}) with score ${match.score.toFixed(2)}`
      );
      return intent as SearchIntent;
    }
  }
  return null;
}

/**
 * Strip German task instruction prefixes from a query to extract just the topic.
 * E.g. "Schreib eine Pressemitteilung über die Klimapolitik" → "Klimapolitik"
 */
export function extractSearchTopic(query: string): string {
  // Strip leading task verbs + article/filler words + content type nouns + prepositions
  // Note: preposition alternatives are ordered longest-first to prevent partial matches
  //
  // Two gaps closed on 20.08.2026, both visible in one live query — the refiner
  // had failed, and the fallback handed the embedding search
  // "schreibe darauf basierend einen antrag für mehr hitzeschtutz für alfter",
  // typo and all, because nothing in the pattern matched:
  //   1. `darauf basierend` / `auf dieser basis` are fillers of the same kind as
  //      "bitte" — they point back at material already in the prompt and say
  //      nothing about the topic;
  //   2. the noun list is the user's OWN word, so it has to carry the party's
  //      actual Textsorten. `antrag`, `beschluss` and `resolution` were missing.
  //      Longest-first, so `antragstext` is not eaten by `antrag`.
  //
  // The noun group ends on `(?![a-zäöüß])` because the alternatives are prefixes
  // of real words: without it `beschluss` matches inside "Beschlussempfehlung"
  // and the topic starts at "empfehlung". Longest-first only orders the listed
  // words against each other; it says nothing about words that are NOT listed.
  // Failing the whole pattern is the better outcome — the untouched query is the
  // documented fallback, a truncated noun is a silently wrong search.
  const stripped = query
    .replace(
      /^(schreib|erstell|formulier|verfass|generier|mach|bereite|entwirf|erstelle|schreibe|formuliere|verfasse)[etn]*\s*(mir\s+)?(bitte\s+)?(darauf\s+basierend\s+|auf\s+dieser\s+basis\s+|auf\s+basis\s+(davon|dessen)\s+|daraus\s+)?(mir\s+)?(bitte\s+)?(eine?[nrms]?\s+)?(kurze[nrms]?\s+|lange[nrms]?\s+|ausführliche[nrms]?\s+)?(pressemitteilung|pressemeldung|pm|antragsentwurf|antragstext|antrag|beschlussvorlage|beschluss|resolution|artikel|beitrag|blogpost|rede|ansprache|statement|argumentation|argumente|faktencheck|analyse|bericht|report|text|entwurf|zusammenfassung|post|tweet)(?![a-zäöüß])\s*(über das thema|zu dem thema|zum thema|bezüglich|betreffend|über|für|zum|zur|zu)?\s*/i,
      ''
    )
    .trim();

  // If we stripped meaningful content and have a result, use it
  const result = stripped.length > 3 && stripped.length < query.length * 0.9 ? stripped : query;

  // Cap search queries — long queries dilute semantic similarity and waste embedding tokens
  const MAX_SEARCH_QUERY_LENGTH = 500;
  if (result.length > MAX_SEARCH_QUERY_LENGTH) {
    const truncated = result.slice(0, MAX_SEARCH_QUERY_LENGTH);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > MAX_SEARCH_QUERY_LENGTH * 0.8 ? truncated.slice(0, lastSpace) : truncated;
  }

  return result;
}

/**
 * Extract text content from a message, handling both string and AI SDK v6 parts format.
 */
export function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && typeof p === 'object' && (p as Record<string, unknown>).type === 'text')
      .map((p) => (p as { text: string }).text)
      .join('');
  }
  return String(content || '');
}

/** The user's RAW last message. Preferred over searchQuery: when the router's
 *  regex gate fires on a search-classified follow-up, searchQuery holds the
 *  retrieval-optimized rewrite (or null for direct/summary/chart intents) —
 *  consumers must judge against the actual question. */
export function lastUserText(state: { messages?: ModelMessage[] }): string {
  const messages = state.messages ?? [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg?.role === 'user') return extractMessageText(msg.content);
  }
  return '';
}

/**
 * Detect http(s) URLs in user-typed text. Ported from the frontend's
 * `urlDetection.ts` regex (web/api boundary forbids a cross-import). Used by the
 * classifier to route pasted links to the `scrape_url` intent so their page
 * content becomes chat context. Strips trailing sentence punctuation and dedupes.
 */
const URL_PATTERN =
  /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&/=]*)/gi;

export function extractUrls(text: string): string[] {
  if (!text) return [];
  const matches = text.match(URL_PATTERN);
  if (!matches) return [];
  const seen = new Set<string>();
  for (const raw of matches) {
    // Trim trailing punctuation that commonly follows a URL in prose.
    const cleaned = raw.replace(/[.,;:!?)\]}'"]+$/, '');
    if (cleaned) seen.add(cleaned);
  }
  return [...seen];
}

/**
 * URLs, die zum Crawlen taugen.
 *
 * Ein Nextcloud-Freigabe-Link (`…/s/<token>`) taugt NICHT: dahinter liegt eine
 * Single-Page-App, ein GET auf die Adresse liefert deren Hülle und keinen
 * Ordnerinhalt — der Inhalt kommt nur über WebDAV. Bis hierher landete genau
 * der Satz „füge diesen Wolke-Link hinzu: https://…/s/…" auf `scrape_url` und
 * bekam Markup statt Dateien. Das Werkzeug `cloud_files` ist dafür zuständig;
 * es liest den Link aus dem Nachrichtentext, der unverändert im Kontext steht.
 */
export function crawlableUrls(text: string): string[] {
  return extractUrls(text).filter((url) => !isCloudShareUrl(url));
}

/** Domains to include/exclude when the caller wires them into Linkup's
 *  `includeDomains`/`excludeDomains`. Both keys are always present, possibly empty. */
export interface DomainScope {
  include: string[];
  exclude: string[];
}

// A "bare" domain — no scheme, unlike URL_PATTERN above. Requires a
// letters-only TLD (2-6 chars): this is what keeps IP-ish text ("192.168")
// and version numbers ("3.14") out for free, since their last segment is
// digits, not letters — no separate numeric check needed.
const BARE_DOMAIN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,6}\b/gi;

// TLD-shaped strings that are actually file extensions ("bericht.pdf",
// "index.ts"), not domains. Checked against the matched TLD segment only.
const NON_DOMAIN_EXTENSIONS = new Set([
  'pdf',
  'csv',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'md',
  'rtf',
  'jpg',
  'jpeg',
  'png',
  'gif',
  'svg',
  'webp',
  'bmp',
  'ico',
  'mp3',
  'mp4',
  'mov',
  'avi',
  'wav',
  'ogg',
  'webm',
  'zip',
  'rar',
  'tar',
  'gz',
  '7z',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'c',
  'cpp',
  'h',
  'php',
  'sh',
  'json',
  'xml',
  'yml',
  'yaml',
  'css',
  'scss',
  'html',
  'htm',
  'exe',
  'dll',
  'log',
  'ini',
  'cfg',
  'conf',
  'bak',
  'tmp',
]);

// Only messages that actually ask to search/look something up may use a
// preposition to scope that search. Without this gate, "die Zeit hat AUF
// zeit.de berichtet" would read the "auf" in front of "zeit.de" as an
// include marker even though nothing here is a search request — the
// sentence has no search verb anywhere, which is exactly what this pattern
// tests for. It is intentionally coarse (message-wide, not clause-local):
// this file's heuristics are pattern proxies, not a parser, and a coarse
// gate that occasionally under-fires is the safer failure mode per rule 4
// below (nothing detected beats a wrongly narrowed search).
const SEARCH_LOOKUP_VERB_PATTERN =
  /\b(?:such\w*|durchsuch\w*|recherchier\w*|informier\w*|nachschau\w*|nachschlag\w*|google\w*)\b|\b(?:schau|guck)\w*\s+nach\b/i;

// Include-marker prepositions (rule 3). "nur auf"/"nur bei" are listed
// separately from "auf"/"bei" only so a shared-end tie against an exclude
// phrase resolves by length, not because their polarity differs.
const INCLUDE_MARKER_PATTERNS: readonly RegExp[] = [
  /\bausschlie(?:ss|ß)lich\b/gi,
  /\bnur\s+auf\b/gi,
  /\bnur\s+bei\b/gi,
  /\bauf\b/gi,
  /\bbei\b/gi,
  /\bin\b/gi,
  /\bvia\b/gi,
  /\bvon\b/gi, // ambiguous alone; SEARCH_LOOKUP_VERB_PATTERN above is the guard against it firing on plain prose.
];

// Exclude-marker prepositions (rule 3). Each of "nicht von"/"nicht auf"/
// "abgesehen von" fully contains an include marker ("von"/"auf") ending at
// the same position — the tie-break in findMarkerHits (longest match wins
// on an end-index tie) is what makes the exclude phrase win there.
const EXCLUDE_MARKER_PATTERNS: readonly RegExp[] = [
  /\bnicht\s+von\b/gi,
  /\bnicht\s+auf\b/gi,
  /\babgesehen\s+von\b/gi,
  /\bohne\b/gi,
  /\b(?:ausser|außer)\b/gi,
  /\bkeine[nrs]?\b/gi,
];

// How far back (in characters) a marker may sit before the domain it scopes.
// Generous enough for "nur auf der Webseite von" plus a couple of filler
// words, capped so it can't reach past the previous domain match.
const MARKER_WINDOW_CHARS = 60;

interface MarkerHit {
  end: number;
  length: number;
  polarity: 'include' | 'exclude';
}

/** All include/exclude marker matches inside `window`, for picking the closest one. */
function findMarkerHits(window: string): MarkerHit[] {
  const hits: MarkerHit[] = [];
  for (const pattern of INCLUDE_MARKER_PATTERNS) {
    for (const m of window.matchAll(pattern)) {
      hits.push({ end: (m.index ?? 0) + m[0].length, length: m[0].length, polarity: 'include' });
    }
  }
  for (const pattern of EXCLUDE_MARKER_PATTERNS) {
    for (const m of window.matchAll(pattern)) {
      hits.push({ end: (m.index ?? 0) + m[0].length, length: m[0].length, polarity: 'exclude' });
    }
  }
  return hits;
}

/** True when the gap between two domains is only "und"/"oder"/"sowie"/commas —
 *  an enumeration continuation, not a new clause that needs its own marker. */
function isConnectorOnly(window: string): boolean {
  const stripped = window.replace(/[,;]/g, ' ').trim().toLowerCase();
  return stripped === '' || /^(?:und|oder|sowie)$/.test(stripped);
}

/**
 * Detect a domain search scope from free text ("such auf zeit.de und
 * spiegel.de nach X" → include zeit.de + spiegel.de), for wiring into
 * Linkup's `includeDomains`/`excludeDomains`.
 *
 * Two deliberate exclusions, each with its own failure-mode reasoning:
 *
 * - **Rule 2 (URL collision):** a domain that also appears as a full URL in
 *   the same message is dropped from the scope entirely. A full URL is a
 *   "read/scrape this specific page" instruction (→ `scrape_url`); a bare
 *   domain is a "restrict search to this site" instruction. The two are
 *   different actions on the same string, so on collision the more specific
 *   one (the URL) wins and the domain does not also narrow the search.
 *
 * - **Rule 4 (no marker → nothing):** a domain with no recognisable
 *   preposition/marker in front of it, or no search-verb anywhere in the
 *   message (see SEARCH_LOOKUP_VERB_PATTERN), yields neither include nor
 *   exclude for that domain. "Die Zeit hat auf zeit.de berichtet, was
 *   hältst du davon?" must not silently scope every later search in this
 *   turn to zeit.de — a scope that persists on a false read is worse than
 *   no scope at all, so ambiguous cases are dropped rather than guessed.
 *
 * On a same-domain conflict (mentioned once as include, once as exclude)
 * exclude wins: an exclusion is the more specific signal, and under-scoping
 * a search is the safer wrong answer than over-scoping it.
 */
export function extractDomainScope(text: string): DomainScope {
  const empty: DomainScope = { include: [], exclude: [] };
  if (!text) return empty;
  if (!SEARCH_LOOKUP_VERB_PATTERN.test(text)) return empty;

  const fullUrlHosts = new Set<string>();
  for (const url of extractUrls(text)) {
    try {
      const hostname = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
      if (hostname) fullUrlHosts.add(hostname);
    } catch {
      // extractUrls already anchors on https?://, so this should be rare —
      // skip rather than let a malformed URL abort extraction.
    }
  }

  const candidates: Array<{ normalized: string; start: number; end: number }> = [];
  for (const m of text.matchAll(BARE_DOMAIN_PATTERN)) {
    const raw = m[0];
    const start = m.index ?? 0;
    const tld = raw.slice(raw.lastIndexOf('.') + 1).toLowerCase();
    if (NON_DOMAIN_EXTENSIONS.has(tld)) continue;
    const normalized = raw.toLowerCase().replace(/^www\./, '');
    if (fullUrlHosts.has(normalized)) continue;
    candidates.push({ normalized, start, end: start + raw.length });
  }

  const tagged: Array<{ domain: string; polarity: 'include' | 'exclude' }> = [];
  let prevEnd = 0;
  let prevPolarity: 'include' | 'exclude' | null = null;
  for (const { normalized, start, end } of candidates) {
    const windowStart = Math.max(prevEnd, start - MARKER_WINDOW_CHARS, 0);
    const windowText = text.slice(windowStart, start);
    const hits = findMarkerHits(windowText);
    let polarity: 'include' | 'exclude' | null = null;
    if (hits.length > 0) {
      hits.sort((a, b) => b.end - a.end || b.length - a.length);
      polarity = hits[0].polarity;
    } else if (prevPolarity && isConnectorOnly(windowText)) {
      polarity = prevPolarity;
    }
    if (polarity) tagged.push({ domain: normalized, polarity });
    prevPolarity = polarity;
    prevEnd = end;
  }

  const exclude = new Set(tagged.filter((t) => t.polarity === 'exclude').map((t) => t.domain));
  const include = new Set(
    tagged.filter((t) => t.polarity === 'include' && !exclude.has(t.domain)).map((t) => t.domain)
  );

  return { include: [...include], exclude: [...exclude] };
}

/**
 * Format prior conversation messages as context for the classifier LLM.
 * Returns null for single-message conversations (no context needed).
 * Caps to last 5 messages at 500 chars each to keep classifier prompt lean.
 */
export function formatConversationHistory(messages: ModelMessage[]): string | null {
  if (messages.length <= 1) return null;

  const priorMessages = messages.slice(0, -1).slice(-CLASSIFIER_CONTEXT_MESSAGES);

  const formatted = priorMessages
    .map((m) => {
      const role = m.role === 'user' ? 'Nutzer' : 'Assistent';
      let text = extractMessageText(m.content);
      if (text.length > CLASSIFIER_CONTEXT_MAX_CHARS) {
        text = text.slice(0, CLASSIFIER_CONTEXT_MAX_CHARS) + '…';
      }
      return `${role}: ${text}`;
    })
    .join('\n\n');

  return `GESPRÄCHSVERLAUF:\n${formatted}`;
}

/**
 * Detect whether a query likely contains multiple distinct topics that need decomposition.
 * Returns true when both sides of a conjunction have substantial content (≥2 words each),
 * which indicates the LLM should handle sub-query splitting instead of the heuristic path.
 */
export function looksMultiTopic(query: string): boolean {
  if (query.length < 40) return false;

  const q = query.toLowerCase();

  // Split on conjunctions: "und", "sowie", "als auch"
  const conjunctions = /\b(?:und|sowie|als\s+auch)\b/;
  const match = q.match(conjunctions);
  if (!match || match.index === undefined) return false;

  const left = q.slice(0, match.index).trim();
  const right = q.slice(match.index + match[0].length).trim();

  // Each side must have ≥2 substantial words (length ≥ 2 chars)
  const leftWords = left.split(/\s+/).filter((w) => w.length >= 2);
  const rightWords = right.split(/\s+/).filter((w) => w.length >= 2);

  return leftWords.length >= 2 && rightWords.length >= 2;
}

// Unit conversion needs a TARGET unit after the preposition — a bare
// "in"/"als" matches everyday German ("Tempo 30 in der Innenstadt",
// "35 °C in Berlin") and hijacked post creation into compute. "in" is also
// not a source unit (inches are never written "30 in" in German). The unit
// boundary is `(?![a-zäöüß0-9])`, not `\b` — JS \b is ASCII-only, so `fuß\b`
// before a space can never match. Module scope: new RegExp compiles per
// call, unlike regex literals.
// Finished PDFs, incl. letterhead and fillable forms. The nouns are deliberately
// qualified ("als PDF", "ein PDF", "PDF-Dokument") rather than a bare "pdf": a
// bare noun plus a nearby creation verb also describes work ON an existing file
// ("erstell eine Zusammenfassung des PDFs").
const PDF_CREATE_PATTERN = creationOrderPattern(
  'als\\s+pdf|ein\\s+pdf|pdf[\\s-]?(?:dokument|datei|formular|vorlage)|briefkopf' +
    '|offiziell[a-zäöü]*\\s+(?:brief|schreiben|anschreiben)' +
    '|(?:ausfüllbar|ausfuellbar)[a-zäöü]*\\s+(?:formular|vorlage|dokument)' +
    '|formular\\s+zum\\s+ausfüllen|fragebogen|anmeldebogen|antragsformular|anmeldeformular',
  { extraVerbs: 'schreib', forward: 60 }
);

const PRESENTATION_NOUN_SRC = 'präsentation|foliensatz|folien|slides?|pitch[\\s-]?deck';
const PRESENTATION_CREATE_PATTERN = creationOrderPattern(PRESENTATION_NOUN_SRC);

const SHEET_NOUN_SRC = 'tabelle|spreadsheet|sheets?|kalkulation(?:stabelle)?';
const SHEET_CREATE_PATTERN = creationOrderPattern(SHEET_NOUN_SRC, { extraVerbs: 'leg' });

// Images replace the core verb list instead of extending it: `mach`, `bau` and
// `gestalte` are how an image EDIT is phrased ("Mach das Foto heller"), and the
// edit path — which owns those turns via lastToolContext — sits behind this one.
const IMAGE_CREATE_PATTERN = creationOrderPattern(IMAGE_GEN_NOUN_SRC, {
  verbs: 'erstell|erzeug|generier|entwirf|visualisier|zeichne|male|illustrier',
  forward: 20,
});

// "erstell mir das als Dokument" / "das als Notiz anlegen". The noun stays
// qualified by "als" for the same reason as the PDF one: a bare "Dokument" near
// a creation verb is usually a reference to material the turn works FROM
// ("erstell eine Zusammenfassung des Dokuments"), not the artifact to produce.
// The save-verb branches below cover "speicher das als Dokument" separately.
const DOC_CREATE_AS_PATTERN = creationOrderPattern(
  'als\\s+(?:neues\\s+)?(?:dokument|protokoll|notiz|checkliste)',
  { extraVerbs: 'schreib|leg|anleg', forward: 60 }
);

const UNIT_ALTERNATION =
  '(?:mm|cm|m|km|zoll|inch(?:es)?|ft|feet|fu(?:ß|ss)|yd|mi|miles?|meilen?|meter|kilometer|mg|g|kg|t|gramm|kilogramm|lbs?|pfund|oz|s|min|h|std|sekunden?|minuten?|stunden?|tage?|kb|mb|gb|tb|°?[cf]|grad|celsius|fahrenheit|kelvin)';
const UNIT_CONVERT_PATTERN = new RegExp(
  `\\b\\d+(?:[.,]\\d+)?\\s*(${UNIT_ALTERNATION})(?![a-zäöüß0-9])[\\s\\S]*?\\b(?:in|to|nach|als)\\s+(${UNIT_ALTERNATION})(?![a-zäöüß0-9])`,
  'i'
);

/**
 * "2 Grad Erwärmung, gemessen in Grad Celsius" repeats one unit — that is
 * prose, not a conversion ask. A real conversion names two different units.
 */
export function isUnitConversion(text: string): boolean {
  const m = UNIT_CONVERT_PATTERN.exec(text);
  return !!m && m[1].toLowerCase() !== m[2].toLowerCase();
}

/**
 * Heuristic result with confidence score.
 * Used to decide whether to skip LLM classification.
 */
export interface HeuristicResult extends ClassificationResult {
  confidence: number; // 0-1, higher = more certain
}

/**
 * Consumes the share trigger plus any article and the filler word "Gruppe", so
 * what remains starts at the group name itself. Deliberately does NOT eat the
 * `AG`/`KV`/`OV` prefix — that is part of the name ("AG Umwelt"), even though
 * the intent-detection pattern above uses it as a trigger token.
 */
const SHARE_TARGET_TRIGGER =
  /\b(?:teil[e]?\s+(?:das\s+)?(?:mit|an)|share\s+mit|freigeben\s+f(?:ü|ue)r|send[e]?\s+an)\s+(?:der|die|das|den|dem|meiner|meinem|unserer|unserem)?\s*(?:gruppe\s+)?/i;

/** Trailing clause that is no longer part of the name ("… und gib ihnen Rechte"). */
const SHARE_TARGET_TAIL = /\s+(?:und|sowie|damit|zum|als|mit)\b.*$/i;

/**
 * Pull the group name out of a share request.
 *
 * The LLM tier gets `targetGroupName` from the prompt, but this heuristic fires
 * at 0.88 and skips the LLM entirely — without this the name was dropped and
 * handleShareDoc asked "mit welcher Gruppe?" while the group sat in the very
 * sentence that triggered the intent.
 *
 * Extraction only has to be close: the consumer fuzzy-matches against the
 * user's own group list (`findBestMatch(..., 0.5)`), and an unmatched name
 * still lists the available groups rather than failing blindly.
 */
export function extractShareTargetGroup(text: string): string | null {
  const trigger = SHARE_TARGET_TRIGGER.exec(text);
  if (!trigger) return null;
  const name = text
    .slice(trigger.index + trigger[0].length)
    .split(/[,;.!?\n]/)[0]
    .replace(SHARE_TARGET_TAIL, '')
    .trim();
  return name.length >= 2 && name.length <= 60 ? name : null;
}

/**
 * Confidence threshold for skipping LLM.
 * Above this value, we trust heuristics and save an LLM call.
 */
export const HEURISTIC_CONFIDENCE_THRESHOLD = 0.85;

// Leading greeting/thanks token(s) — strippable prefix. The trailing separator
// class eats punctuation/whitespace/commas so "Hallo! ", "Danke dir, " are
// consumed. `+` allows stacked greetings ("Hi, guten Morgen!").
const GREETING_PREFIX_PATTERN =
  /^\s*(?:(?:hallo|hi|hey|servus|moin|guten(?:\s+(?:morgen|tag|abend))?|danke(?:\s+(?:dir|euch|sch(?:ö|oe)n|sehr))?|vielen\s+dank)\b[\s,.!:;–—-]*)+/i;

// Remainders after a greeting that are still pure small-talk (assistant-directed,
// no real task) — these keep the greeting@0.95 fast path.
const SMALLTALK_REMAINDER_PATTERN =
  /^(wie geht(?:'?s|\s+es)?(?:\s+(?:dir|euch|ihnen))?\s*\??|wer bist du\s*\??|was kannst du(?:\s+alles)?\s*\??|kannst du (?:mir\s+)?(?:bitte\s+)?helfen\s*\??|alles (?:klar|gut)\s*[!?.]*|(?:das\s+)?passt(?:\s+so)?\s*[!.]*|(?:sehr\s+)?(?:gut|super|toll|perfekt|klasse)(?:\s+gemacht)?\s*[!.]*)$/i;

const CONTENT_TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /\b(pressemitteilung|pressemeldung|pm)\b/i, type: 'pressemitteilung' },
  { pattern: /\b(artikel|beitrag|blogpost)\b/i, type: 'artikel' },
  { pattern: /\b(rede|ansprache|statement)\b/i, type: 'rede' },
  { pattern: /\b(argumentation|argumente)\b/i, type: 'argumentation' },
  { pattern: /\b(tweet|post)\b/i, type: 'tweet' },
  { pattern: /\b(slogan|motto|claim)\b/i, type: 'slogan' },
];

export function detectContentType(query: string): string | null {
  for (const { pattern, type } of CONTENT_TYPE_PATTERNS) {
    if (pattern.test(query)) return type;
  }
  return null;
}

/**
 * Heuristic classification with confidence scoring.
 * Returns both the classification and a confidence score (0-1).
 *
 * High confidence (0.9+): Very clear patterns like greetings, explicit requests
 * Medium confidence (0.7-0.9): Keyword matches with some ambiguity
 * Low confidence (<0.7): Fuzzy matches or unclear patterns
 */
/**
 * Aggregation/calculation question over tabular data (Summe, Durchschnitt,
 * "pro X", Anteile …). Shared by the classifier fast path AND the contract
 * router's run_python gate: multi-turn confidence penalties (vague follow-up)
 * can push the heuristic below threshold, so the router re-checks the raw
 * question text — otherwise follow-ups like "durchschnittlicher umsatz pro
 * region?" silently fall back to the legacy prompt-guidance path.
 */
export function isTabularComputeQuestion(text: string): boolean {
  // Text-metric questions (Zeichen/Wörter zählen) belong to the plain-JS
  // computeNode even with a spreadsheet attached — counting characters of a
  // pasted text has nothing to do with `df` (beta regression: the run_python
  // gate hijacked "wie viele zeichen sind das hier").
  if (
    /(zeichen|buchstaben|w(?:ö|oe)rter|worte|wortanzahl|zeilen|vokale|silben|abs(?:ä|ae)tze)/i.test(
      text
    )
  ) {
    return false;
  }
  // Chart/visualization/sharepic requests keep their own intents even when
  // they mention aggregations ("balkendiagramm der umsätze pro monat").
  if (/(diagramm|\bchart|\bgraph|visualisier|sharepic|spruchbild|zitatbild)/i.test(text)) {
    return false;
  }
  // Verbs/measure words are bound to a word START — JS \b is ASCII-only and
  // 'zähl' must not fire inside 'erzähl'. Noun stems may sit inside German
  // compounds (jahresumsatz, gesamtgewinn), so they match anywhere.
  const wordStart =
    /(?:^|[^a-zäöüß])(summ|zähl|anzahl|anteil|filter|sortier|median|mittelwert|durchschnitt|prozent|maxim|minim|meist|häufigst|beste[rns]?\b|top ?\d|ausreißer|quartil|pivot|prognos|wie ?viel|pro\s+\w+)/i;
  const nounStem = /(umsatz|gewinn|erlös|gesamtsumme|gesamtwert|höchst|niedrigst)/i;
  return wordStart.test(text) || nounStem.test(text);
}

// Words that contain a fill verb but mean something else. Checked before the
// verb patterns because both split forms below would otherwise match
// "Füllwörter aus dem Text entfernen" (füll… + …aus).
const FILL_FALSE_FRIENDS = /(f(?:ü|ue)llw(?:ö|oe)rt|f(?:ü|ue)llmaterial|f(?:ü|ue)lltext)/i;

// Closed fill verbs. Word-start bound (JS \b is ASCII-only) so 'erfüllen',
// 'auffüllen', 'Betrag', 'Beitrag', 'Antrag' and 'Auftrag' never match.
const FILL_VERB =
  /(?:^|[^a-zäöüß])(ausf(?:ü|ue)ll|auszuf(?:ü|ue)ll|ausgef(?:ü|ue)llt|bef(?:ü|ue)ll|eintrag|einzutragen|eingetragen|einsetz|einzusetzen|(?:ü|ue)bertrag(?:e|en|)\b|erg(?:ä|ae)nz|vervollst(?:ä|ae)ndig)/i;

// "schreib die Werte in die Tabelle" — a write ask that names its target. The
// target noun is required: "schreib einen Text über die Tabelle" is prose.
const FILL_WRITE_INTO =
  /(?:^|[^a-zäöüß])schreib\w*\b[\s\S]{0,60}?\bin\s+(?:die|das|der|den)\s+(tabelle|spalte|zelle|vorlage|formular|liste|felder?)\b/i;

// Split verb forms: "füll das Formular aus", "trag die Werte ein", "setz die
// Zahlen ein". The particle must follow within a short window so a fill verb
// early in a long paste can't pair with an unrelated 'aus' much later.
const FILL_SPLIT =
  /(?:^|[^a-zäöüß])(f(?:ü|ue)ll\w*|trag\w*|setz\w*)\b[\s\S]{0,60}?(?:^|[^a-zäöüß])(aus|ein)\b/i;

/**
 * "Fill this in for me" over an attached spreadsheet — the write counterpart to
 * `isTabularComputeQuestion`. Shared by the classifier fast path AND the
 * contract router's run_python gate, which picks the openpyxl codegen mode from
 * it. Checked BEFORE the aggregation heuristic so "trag die Summe ein" writes
 * the value into the sheet instead of only reporting it.
 */
export function isSheetFillRequest(text: string): boolean {
  if (FILL_FALSE_FRIENDS.test(text)) return false;
  // Visualization requests keep their own intents even when phrased as "trag
  // die Werte in ein Diagramm ein".
  if (/(diagramm|\bchart|\bgraph|visualisier|sharepic|spruchbild|zitatbild)/i.test(text)) {
    return false;
  }
  return FILL_VERB.test(text) || FILL_SPLIT.test(text) || FILL_WRITE_INTO.test(text);
}

// ── Muster der Regeln unten ─────────────────────────────────────────────────
// Vorher lagen diese als lokale `const` IM Funktionsrumpf und wurden bei jedem
// Aufruf neu kompiliert (ein Regex-Literal im Modulraum wird einmal gebaut, im
// Funktionsraum pro Aufruf). Auf Modulebene ist das erledigt — und sie sind
// benannt, statt anonym in einer `if`-Bedingung zu stehen.

/** Foliensatz-Nomen. Eine Quelle für die Deck-Regel UND deren Ausschluss in create_pdf. */
const PRESENTATION_NOUN_PATTERN = new RegExp(`\\b(?:${PRESENTATION_NOUN_SRC})\\b`, 'i');
const DECK_NOUN_PATTERN = PRESENTATION_NOUN_PATTERN;
const SHEET_NOUN_PATTERN = new RegExp(`\\b(?:${SHEET_NOUN_SRC})\\b`, 'i');

const SAVE_IMPERATIVE_PATTERN =
  /\b(speicher|abspeicher|sicher|exportier|ableg|festhalt|merk)[etns]*\b/i;
const SAVE_AS_BARE_PATTERN = /\bals\s+(neues\s+)?(dokument|protokoll|notiz|checkliste)\b/i;
const DOC_WITH_VERB_PATTERN =
  /\b(dokument|protokoll|notiz|checkliste)\s+(erstellen|speichern|anlegen|abspeichern|exportieren)\b/i;
const MACH_DARAUS_PATTERN =
  /\bmach[etn]*\b.{0,15}\b(dokument|protokoll|notiz|checkliste)\s+daraus\b/i;
const DOC_ARTIFACT_NOUN_PATTERN = /\b(dokument|protokoll|notiz|checkliste)\b/i;

const SHARE_DOC_TRIGGER_PATTERN =
  /\b(teil[e]?\s+(das\s+)?(mit|an)\s+|share\s+mit|freigeben\s+für|send[e]?\s+an\s+(gruppe|ag\s|kv\s|ov\s))/i;

const SUMMARY_KEYWORDS_PATTERN =
  /\b(fass[e]?\s+(?:\S[^.!?\n]{0,60}?\s+)?zusammen\b|zusammenfass|zusammenfassung|kurzfassung|überblick\s+erstell)/i;

/**
 * „Fasse das zusammen" — dieselbe Vokabel, die den `summary`-Auflöser auslöst.
 *
 * Exportiert, damit der Loop den Zusammenfassungs-Turn erkennen kann, ohne die
 * Regex ein zweites Mal zu schreiben: eine Kopie wäre genau die Bauform, an der
 * die Klassifikator-Taxonomie schon einmal auseinandergelaufen ist.
 */
export function isSummaryAsk(text: string): boolean {
  return SUMMARY_KEYWORDS_PATTERN.test(text);
}

const CHART_TYPE_NOUN_PATTERN =
  /\b(diagramm|balkendiagramm|kreisdiagramm|liniendiagramm|tortendiagramm|chart|graph)\b/i;
const CHART_CREATE_IMPERATIVE_PATTERN =
  /\b(erstell|generier|mach|bau|baue|visualisier|zeig|zeichn|erzeug|stell)[etn]*\b/i;
const DATA_VISUALIZE_PATTERN = /\bvisualisier.{0,15}(daten|statistik|chart|werte|zahlen)\b/i;

const ARTIFACT_NOUN_PATTERN =
  /\b(html|svg|webseite|website|landingpage|landing-page|mockup|prototyp|vektorgrafik)\b/i;
const ARTIFACT_CREATE_IMPERATIVE_PATTERN =
  /\b(erstell|generier|mach|bau|baue|erzeug|schreib|gestalt|entwirf|entwickl)[etn]*\b/i;

const COUNT_PATTERN =
  /\b(z(?:ä|ae)hl\w*|anzahl|wie\s+viele?|wie\s+lang)\b[\s\S]*\b(zeichen|buchstaben|w(?:ö|oe)rter|worte|wortanzahl|zeilen|vokale|silben|absätze|abs(?:ä|ae)tze)\b/i;
const PURE_EXPR_PATTERN = /^(?=[\s\S]*[+\-*/%^×÷])[\s\d().,+\-*/%^×÷]+[=?]?$/;
// `[nt]?` and not `\w*`: "rechnest"/"berechnest" is how a message talks ABOUT
// calculating rather than ordering it, and „Stelle eine Rückfrage, bevor du
// rechnest" was classified `compute` on 03.08.2026 — the node then logged
// `operation=unsupported produced no result` after 1,6 s.
//
// The percent branch is the counterpart: „erhöhe das Schulungsbudget pro
// Standort um 10 %" IS deterministic arithmetic and reached no compute rule at
// all, so the turn went to the loop instead of the arithmetic engine.
const MATH_PATTERN =
  /(\d+\s*%\s*(von|of)\s*\d+)|\b(rechne|berechne)[nt]?\b|\bwie\s?viel\s+(ist|sind|macht)\b|\bwas\s+(ist|sind|ergibt)\s+\d|\b(erh(?:ö|oe)h|reduzier|senk|k(?:ü|ue)rz|steiger|verringer)\w*\b[^.!?\n]{0,60}?\bum\s+\d+(?:[.,]\d+)?\s*(%|prozent)/i;
const DATE_MATH_PATTERN = /\b(wie\s+viele?\s+tage|tage\s+(bis|zwischen)|datum\s+in\s+\d)/i;

const EXPLICIT_WEB_SEARCH_PATTERN =
  /\b(such|suche|durchsuche|finde?)\s*(im|das|den|die|in)?\s*(netz|internet|web|online)\b/i;
const RESEARCH_NOUN_PATTERN = /\b(recherchiere|recherche|recherchier)\b/i;

const QUESTION_WORD_PATTERN =
  /\b(was|wie|welche[rsnm]?|wo|wann|warum|gibt\s+es|haben\s+die|sagen\s+die)\b/i;
const PARTY_TOPIC_PATTERN =
  /\b(grüne|partei|programm|position|wahlprogramm|beschluss|antrag|grundsatzprogramm)\b/i;
const CURRENT_EVENTS_PATTERN = /\b(aktuell|heute|gestern|news|nachricht|kürzlich)\b/i;
const PERSON_QUERY_PATTERN = /\bwer (ist|war|sind)\b/i;

const EXAMPLE_NOUN_PATTERN = /\b(beispiel|vorlage)\b/i;
const EXAMPLES_ACTION_VERB_PATTERN = /\b(zeig|such|find|erstell|schreib|mach|generier)[etn]*/i;

const CREATIVE_VERB_PATTERN = /\b(schreib|erstell|formulier|verfass)[etn]*/i;
const RESEARCH_HINT_PATTERN = /\b(recherch|such|find|info)\b/i;

/** Ein Schreibauftrag, der nicht zugleich nach Nachschlagen verlangt. */
function isCreativeTask(lower: string): boolean {
  return CREATIVE_VERB_PATTERN.test(lower) && !RESEARCH_HINT_PATTERN.test(lower);
}

const FACT_BASED_CONTENT_PATTERN =
  /\b(pressemitteilung|pressemeldung|pm|artikel|beitrag|blogpost|rede|ansprache|statement|argumentation|argumente|faktencheck|analyse|bericht|report)\b/i;
const TOPIC_MARKER_PATTERN = /(?:^|\s)(über|zu|zum|zur|bezüglich|betreffend|thema)(?:\s|$)/i;

/**
 * „abstimmen" hat im Parteialltag zwei Bedeutungen, und nur eine davon ist ein
 * Votum: die Fraktion stimmt über ein Gesetz ab — die Pressestelle stimmt einen
 * Text mit der Fraktion ab. Ohne diese Unterscheidung erzwingt „Haben wir das
 * Layout schon abgestimmt?" einen Parlaments-Abruf.
 *
 * Das Votum fragt nach dem WIE: „Wie hat die SPD … abgestimmt?". Die Absprache
 * fragt danach, OB etwas erledigt ist („Wurde … abgestimmt?", „Ist … mit der
 * Fraktion abgestimmt?") — und redet von uns. Deshalb beide Bedingungen:
 * Frageform `wie hat/haben`, und keine erste Person im Satz.
 *
 * Nicht gedeckt bleibt „Wie stimmte die FDP…" — siehe die Stichwortliste oben.
 */
const VOTE_VERB_PATTERN = /\b(abgestimmt|gestimmt)\b/i;
const VOTE_QUESTION_PATTERN = /\bwie\s+(hat|haben)\b[^?]*\b(abgestimmt|gestimmt)\b/i;
const FIRST_PERSON_PATTERN = /\b(wir|uns|unser\w*)\b/i;

function isVoteQuestion(text: string): boolean {
  return VOTE_QUESTION_PATTERN.test(text) && !FIRST_PERSON_PATTERN.test(text);
}

/**
 * Der Tippfehler-Fänger: ein Wort, das einem Intent-Stichwort ähnlich genug
 * sieht. Absichtlich die LETZTE Regel und weit unter der Schwelle — sie rät.
 *
 * Ein verneintes oder gefragtes Artefakt-Wort („keine Grafik", „was ist eine
 * Grafik?") darf nicht auf seinen Generierungs-Intent fuzzy-matchen; deshalb
 * läuft für diese Intents der Wächter über die Stichwortliste selbst. Für die
 * Abstimmungs-Verben steht daneben der Bedeutungs-Wächter oben — dieselbe Form
 * von Fehlgriff, nur aus Wortsinn statt aus Verneinung.
 */
function fuzzyHit(m: AnalyzedMessage): SearchIntent | null {
  for (const word of m.lower.split(/\s+/).filter((w) => w.length >= 4)) {
    const fuzzyIntent = fuzzyMatchIntent(word);
    if (!fuzzyIntent) continue;
    if (GENERATION_FUZZY_INTENTS.has(fuzzyIntent)) {
      const kw = INTENT_KEYWORDS[fuzzyIntent as keyof typeof INTENT_KEYWORDS] ?? [];
      if (kw.length > 0) {
        const nounRe = new RegExp(`\\b(?:${kw.map(escapeRegExp).join('|')})`, 'i');
        if (negatedOrMeta(m.stripped, nounRe)) continue;
      }
    }
    if (
      fuzzyIntent === 'abgeordnetenwatch' &&
      VOTE_VERB_PATTERN.test(word) &&
      !isVoteQuestion(m.stripped)
    ) {
      continue;
    }
    return fuzzyIntent;
  }
  return null;
}

/**
 * Die Regeln der Heuristik, in Präzedenzreihenfolge.
 *
 * Vorher waren das ~25 geordnete `if`-Zweige über 470 Zeilen, und ihre
 * Reihenfolge — also die halbe Logik — stand ausschliesslich in Kommentaren
 * („Checked BEFORE save_as_doc", „Placed AFTER chart"). Als Liste ist die
 * Präzedenz sichtbar, und der Negations-/Meta-Wächter ist ein FELD statt einer
 * Zeile, die eine Regel vergessen kann (siehe `analyzedMessage.ts`).
 *
 * Die Muster selbst sind unverändert übernommen. Wer hier etwas ändert, ändert
 * Verhalten; wer eine Regel verschiebt, ändert Präzedenz. Beides sieht die
 * Dispositions-Zählung (`apps/api/evals/`).
 *
 * Welche Sicht eine Regel liest, ist Absicht und kein Zufall: `stripped` für
 * alles Nomen-Getriebene (Zitate sind fremde Rede), `lower` dort, wo die
 * bisherige Regel es so tat, `raw` nur, wo die Original-Grossschreibung zählt
 * (der Gruppenname in `share_doc` wird dem Nutzer zurückgezeigt).
 */
const HEURISTIC_RULES: ReadonlyArray<ClassifierRule<HeuristicResult>> = [
  // "Füll mir das aus" über einer angehängten Tabelle. VOR der Aggregation, damit
  // "trag die Summe ein" den Wert schreibt statt ihn nur zu berichten.
  {
    id: 'compute.sheet_fill',
    longPaste: 'allow',
    requiresTabularAttachment: true,
    guard: 'none',
    match: (m) => isSheetFillRequest(m.lower),
    result: (m) => ({
      intent: 'compute',
      searchQuery: m.raw,
      reasoning: 'Fill request with attached spreadsheet',
      confidence: 0.92,
    }),
  },
  // Aggregationsfrage über einer angehängten Tabelle → pandas-Code im
  // run_python-Interrupt statt einer Antwort aus der Prosa.
  {
    id: 'compute.tabular',
    longPaste: 'allow',
    requiresTabularAttachment: true,
    guard: 'none',
    match: (m) => isTabularComputeQuestion(m.lower),
    result: (m) => ({
      intent: 'compute',
      searchQuery: m.raw,
      reasoning: 'Tabular aggregation question with attached spreadsheet',
      confidence: 0.92,
    }),
  },
  // Sharepic — eine gebrandete Vorlage mit Text, KEIN freies KI-Bild. Vor der
  // Bildregel, die es sonst schluckt. "Post MIT Sharepic" nennt ein Post-Nomen
  // und gehört deshalb der Schreibregel darunter. Eigener Wächter:
  // `hasExplicitSharepicWord` prüft Zitat, Negation und Meta-Frage bereits
  // selbst (und satzweise, nicht über die ganze Nachricht).
  {
    id: 'sharepic',
    longPaste: 'skip',
    guard: 'none',
    match: (m) => hasExplicitSharepicWord(m.stripped) && !POST_NOUN_PATTERN.test(m.stripped),
    result: () => ({
      intent: 'sharepic',
      searchQuery: null,
      reasoning: 'Sharepic request detected',
      confidence: 0.93,
    }),
  },
  // Freies KI-Bild. Das Fenster zwischen Verb und Nomen kann eine Verneinung
  // verschlucken ("erstell daraus bitte KEINE Grafik") — deshalb der Wächter.
  {
    id: 'image',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: IMAGE_GEN_NOUN_PATTERN,
    match: (m) => IMAGE_CREATE_PATTERN.test(m.stripped),
    result: () => ({
      intent: 'image',
      searchQuery: null,
      reasoning: 'Image generation request detected',
      confidence: 0.92,
    }),
  },
  // Fertiges PDF inkl. Briefkopf und ausfüllbarer Formulare. VOR save_as_doc,
  // damit "mach ein PDF-Dokument daraus" nicht von machDaraus gestohlen wird.
  // Deck-Nomen ausgenommen: "Präsentation als PDF" baut weiterhin einen Foliensatz.
  {
    id: 'create_pdf',
    longPaste: 'skip',
    guard: 'none',
    match: (m) => PDF_CREATE_PATTERN.test(m.lower) && !DECK_NOUN_PATTERN.test(m.lower),
    result: () => ({
      intent: 'create_pdf',
      searchQuery: null,
      reasoning: 'PDF creation request detected',
      confidence: 0.9,
    }),
  },
  // Antwort als Dokument sichern. Das blosse "als Dokument" braucht einen
  // Speicher-Imperativ, sonst lösen Prosa-Erwähnungen aus ("gilt als Protokoll").
  {
    id: 'save_as_doc',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: DOC_ARTIFACT_NOUN_PATTERN,
    match: (m) =>
      (SAVE_AS_BARE_PATTERN.test(m.stripped) && SAVE_IMPERATIVE_PATTERN.test(m.stripped)) ||
      DOC_CREATE_AS_PATTERN.test(m.stripped) ||
      DOC_WITH_VERB_PATTERN.test(m.stripped) ||
      MACH_DARAUS_PATTERN.test(m.stripped),
    result: () => ({
      intent: 'save_as_doc',
      searchQuery: null,
      reasoning: 'Save as document request detected',
      confidence: 0.9,
    }),
  },
  // Foliensatz. Das Zwischenmodell ist bei diesem jüngeren Intent unzuverlässig,
  // deshalb bekommt die eindeutige Formulierung einen eigenen schnellen Weg.
  {
    id: 'create_presentation',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: PRESENTATION_NOUN_PATTERN,
    match: (m) => PRESENTATION_CREATE_PATTERN.test(m.stripped),
    result: () => ({
      intent: 'create_presentation',
      searchQuery: null,
      reasoning: 'Presentation creation request detected',
      confidence: 0.9,
    }),
  },
  // Dokument mit einer Gruppe teilen. Der Gruppenname kommt aus `raw`: er wird
  // dem Nutzer in handleShareDoc zurückgezeigt, also zählt die Grossschreibung.
  {
    id: 'share_doc',
    longPaste: 'skip',
    guard: 'none',
    match: (m) => SHARE_DOC_TRIGGER_PATTERN.test(m.lower),
    result: (m) => {
      const targetGroupName = extractShareTargetGroup(m.raw);
      return {
        intent: 'share_doc',
        searchQuery: null,
        reasoning: 'Share document request detected',
        confidence: 0.88,
        ...(targetGroupName != null && { targetGroupName }),
      };
    },
  },
  // Zusammenfassung. Der `fass … zusammen`-Zweig lässt ein begrenztes Objekt
  // zwischen trennbarem Verb und Partikel zu; ohne ihn ging die Formulierung an
  // das temperatur-0,1-Modell und wurde dort zur Lotterie.
  {
    id: 'summary',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: SUMMARY_KEYWORDS_PATTERN,
    match: (m) => SUMMARY_KEYWORDS_PATTERN.test(m.stripped),
    result: () => ({
      intent: 'summary',
      searchQuery: null,
      reasoning: 'Summary keywords detected',
      confidence: 0.85,
    }),
  },
  // Datenvisualisierung. Blosse Diagramm-Nomen brauchen einen Erstell-Imperativ,
  // sonst lösen "Im Diagramm sehen wir…" und "Erkläre mir das Chart" aus.
  {
    id: 'chart',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: CHART_TYPE_NOUN_PATTERN,
    match: (m) =>
      (CHART_TYPE_NOUN_PATTERN.test(m.stripped) &&
        CHART_CREATE_IMPERATIVE_PATTERN.test(m.stripped)) ||
      DATA_VISUALIZE_PATTERN.test(m.stripped),
    result: (m) => ({
      intent: 'chart',
      searchQuery: m.raw,
      reasoning: 'Chart/visualization request detected',
      confidence: 0.88,
    }),
  },
  // Eigenständige rechnende Tabelle. NACH chart ("erstell ein Diagramm aus der
  // Tabelle" bleibt chart) und VOR compute ("berechne die Tabelle" bleibt
  // compute — keines dieser Erstell-Verben ist ein Rechen-Verb).
  {
    id: 'create_sheet',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: SHEET_NOUN_PATTERN,
    // Columns spelled out with pipes mean the table is wanted IN the answer —
    // see `dictatesInlineTableColumns`.
    match: (m) => SHEET_CREATE_PATTERN.test(m.stripped) && !dictatesInlineTableColumns(m.stripped),
    result: () => ({
      intent: 'create_sheet',
      searchQuery: null,
      reasoning: 'Spreadsheet creation request detected',
      confidence: 0.9,
    }),
  },
  // Darstellbares HTML/SVG. Nomen plus Erstell-Imperativ, damit Prosa ("erklär
  // mir HTML") nicht auslöst. Nach chart, damit Diagramme Diagramme bleiben.
  {
    id: 'artifact',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: ARTIFACT_NOUN_PATTERN,
    match: (m) =>
      ARTIFACT_NOUN_PATTERN.test(m.stripped) && ARTIFACT_CREATE_IMPERATIVE_PATTERN.test(m.stripped),
    result: (m) => ({
      intent: 'artifact',
      searchQuery: m.raw,
      reasoning: 'Generic HTML/SVG artifact request detected',
      confidence: 0.85,
    }),
  },
  // Deterministisches Rechnen und Zählen. Absichtlich eng: jedes Teilmuster
  // benennt eine konkrete Operation, damit Prosa ("erklär mir Prozentrechnung")
  // nicht auslöst. `longPaste: 'allow'` ist der Kern der Regel — die Zeichen
  // eines eingefügten Textes zu zählen IST ihr Hauptzweck.
  {
    id: 'compute',
    longPaste: 'allow',
    guard: 'none',
    match: (m) =>
      COUNT_PATTERN.test(m.raw) ||
      PURE_EXPR_PATTERN.test(m.raw.trim()) ||
      MATH_PATTERN.test(m.lower) ||
      isUnitConversion(m.lower) ||
      DATE_MATH_PATTERN.test(m.lower),
    result: (m) => ({
      intent: 'compute',
      searchQuery: m.raw,
      reasoning: 'Deterministic computation/counting request detected',
      confidence: 0.9,
    }),
  },
  // Ausdrückliche Websuche. Nur der Meta-Wächter: "Wie suche ich im Netz?" ist
  // eine Frage darüber, aber eine Verneinung gibt es hier praktisch nicht.
  {
    id: 'web.explicit',
    longPaste: 'skip',
    guard: 'meta',
    guardNoun: EXPLICIT_WEB_SEARCH_PATTERN,
    match: (m) => EXPLICIT_WEB_SEARCH_PATTERN.test(m.stripped),
    result: (m) => ({
      intent: 'web',
      searchQuery: m.raw,
      reasoning: 'Explicit web search request',
      confidence: 0.9,
    }),
  },
  // Ausdrückliche Recherche.
  {
    id: 'research.explicit',
    longPaste: 'skip',
    guard: 'meta',
    guardNoun: RESEARCH_NOUN_PATTERN,
    match: (m) => RESEARCH_NOUN_PATTERN.test(m.stripped),
    result: (m) => ({
      intent: 'research',
      searchQuery: m.raw,
      reasoning: 'Explicit research request',
      confidence: 0.88,
    }),
  },
  // Frage nach Parteipositionen. Nur bei einer FRAGE — Parteistichworte allein
  // lösen nie eine Suche aus.
  {
    id: 'search.party_position',
    longPaste: 'allow',
    guard: 'none',
    match: (m) => QUESTION_WORD_PATTERN.test(m.lower) && PARTY_TOPIC_PATTERN.test(m.lower),
    result: (m) => ({
      intent: 'search',
      searchQuery: m.raw,
      reasoning: 'Question about party positions detected',
      confidence: 0.82,
    }),
  },
  // Aktuelles Geschehen.
  {
    id: 'web.current_events',
    longPaste: 'allow',
    guard: 'none',
    match: (m) => CURRENT_EVENTS_PATTERN.test(m.lower),
    result: (m) => ({
      intent: 'web',
      searchQuery: m.raw,
      reasoning: 'Current events query',
      confidence: 0.8,
    }),
  },
  // Geltungsfragen: „gilt X noch", „ist X in Kraft", „wurde X gekippt".
  //
  // Steht hinter `web.current_events`, weil beide dieselbe Sorte Turn bedienen —
  // eine Auskunft, deren richtige Antwort altert. `CURRENT_EVENTS_PATTERN` sieht
  // sie nur, wenn das Wort „aktuell" fällt; eine Geltungsfrage kommt ohne aus.
  //
  // `web` und nicht `agentic`: das Verdikt steht in `DEMOTABLE_HEURISTIC_INTENTS`,
  // Tier 3.5 setzt daraufhin `loopDemotedFromRetrieval`, und erst DAS lässt
  // `shouldForceFirstToolCall` (Weg 4) einen Abruf abverlangen. Ohne den Umweg
  // bliebe das Verdikt `direct`, der Turn liefe als gewöhnlicher agentischer
  // Turn, und der Planer dürfte weiterhin gar nichts rufen — genau der Zustand
  // aus #2949: zwei Läufe, `tools=[]`, sechs Sekunden, Antwort aus dem
  // Modellwissen.
  //
  // Liest `stripped`: eine zitierte Passage ist fremde Rede. „Er schrieb: ‚Gilt
  // das Gesetz noch?'" fragt nicht nach dem Stand, sondern handelt von einem
  // fremden Satz.
  {
    id: 'web.geltungsfrage',
    longPaste: 'allow',
    guard: 'none',
    match: (m) => looksLikeGeltungsfrage(m.stripped),
    result: (m) => ({
      intent: 'web',
      searchQuery: m.raw,
      reasoning: 'Legal/procedural validity question — the answer is a NOW-state',
      confidence: 0.8,
    }),
  },
  // "Wer ist …" — Personenfragen an die Websuche.
  {
    id: 'web.person',
    longPaste: 'allow',
    guard: 'none',
    match: (m) => PERSON_QUERY_PATTERN.test(m.lower),
    result: (m) => ({
      intent: 'web',
      searchQuery: m.raw,
      reasoning: 'Person query routed to web search',
      confidence: 0.78,
    }),
  },
  // Social-Media-Post ERSTELLEN (nur Text, solange kein Sharepic genannt ist).
  // Verb und Nomen müssen nah beieinander stehen — "schreibe eine
  // Produktvorstellung … [Paste erwähnt Instagram]" ist kein Post-Auftrag.
  // Browse-Verben gehören der examples-Regel darunter.
  //
  // Das Verdikt hiess bis 08/2026 `social_post` und ist mit ihm auf
  // `produktion` gewechselt: die Textsorte trägt das Rezept, nicht der Intent.
  // Die REGEL bleibt trotzdem stehen, und zwar wegen der Regel direkt darunter:
  // `examples` zählt `schreib`/`erstell`/`mach` zu ihren Aktionsverben, würde
  // einen Schreibauftrag also als Stöberei nehmen. Der Vorrang hier ist das,
  // was die beiden auseinanderhält.
  {
    id: 'social_post',
    longPaste: 'skip',
    guard: 'negatedOrMeta',
    guardNoun: SOCIAL_TRIGGER_NOUN_PATTERN,
    match: (m) =>
      nounNearCreateVerb(m.stripped, SOCIAL_TRIGGER_NOUN_PATTERN) &&
      !EXAMPLE_NOUN_PATTERN.test(m.stripped),
    result: (m) => ({
      intent: 'produktion',
      searchQuery: m.raw,
      reasoning: 'Social media post creation',
      confidence: 0.8,
    }),
  },
  // Vorlagen/Beispiele ANSEHEN — Plattform-Stichwort plus irgendein Aktionsverb.
  {
    id: 'examples',
    longPaste: 'skip',
    guard: 'none',
    match: (m) =>
      (EXAMPLE_NOUN_PATTERN.test(m.lower) || SOCIAL_TRIGGER_NOUN_PATTERN.test(m.lower)) &&
      EXAMPLES_ACTION_VERB_PATTERN.test(m.lower),
    result: (m) => ({
      intent: 'examples',
      searchQuery: m.raw,
      reasoning: 'Social media examples query',
      confidence: 0.8,
    }),
  },
  // Schreibauftrag MIT mitgeliefertem Material. `longPaste: 'require'` ist hier
  // die Regel selbst: derselbe Satz ohne Paste ist ein anderer Fall (darunter),
  // weil dann die Substanz fehlt.
  {
    id: 'produktion.with_material',
    longPaste: 'require',
    guard: 'none',
    match: (m) => isCreativeTask(m.lower),
    result: (m) => ({
      intent: 'produktion',
      searchQuery: null,
      reasoning: 'Creative task with substantial user-provided context',
      contentType: detectContentType(m.lower),
      confidence: 0.82,
    }),
  },
  // Derselbe Auftrag ohne Material. Bleibt unter der Schwelle und ist damit nur
  // ein Hinweis: Tier 3.5 demotiert genau diese Form in den Loop, wo ein Planer
  // suchen kann, statt sie aus dem Gedächtnis des Modells zu schreiben.
  {
    id: 'produktion.no_material',
    longPaste: 'allow',
    guard: 'none',
    match: (m) => isCreativeTask(m.lower),
    result: (m) => ({
      intent: 'produktion',
      searchQuery: null,
      reasoning: 'Creative task without research need',
      contentType: detectContentType(m.lower),
      confidence: 0.75,
    }),
  },
  // Sachtext-Gattung plus Themenmarker. Ein Text ÜBER die Welt, dessen Substanz
  // nie mitgeliefert wurde, lässt sich nicht wahrheitsgemäss aus dem Gedächtnis
  // des Modells schreiben — deshalb bleibt der Wert unter der Schwelle und
  // Tier 3.5 gibt den Turn an den Loop.
  {
    id: 'produktion.fact_based',
    longPaste: 'allow',
    guard: 'none',
    match: (m) => FACT_BASED_CONTENT_PATTERN.test(m.lower) && TOPIC_MARKER_PATTERN.test(m.lower),
    result: (m) => ({
      intent: 'produktion',
      searchQuery: null,
      reasoning: 'Fact-based content type detected (creative task, not research)',
      contentType: detectContentType(m.lower),
      confidence: 0.68,
    }),
  },
  // Tippfehler-Fänger, ganz zum Schluss und ohne Anspruch auf Sicherheit.
  {
    id: 'fuzzy_keyword',
    longPaste: 'allow',
    guard: 'none',
    match: (m) => fuzzyHit(m) !== null,
    result: (m) => {
      const intent = fuzzyHit(m) as SearchIntent;
      return {
        intent,
        searchQuery: intent === 'image' ? null : m.raw,
        reasoning: `Fuzzy matched to ${intent}`,
        confidence: 0.65,
      };
    },
  },
];

/** Der Rest: nichts hat gegriffen. Siehe Kommentar an `heuristicClassify`. */
const RESIDUAL_RESULT: HeuristicResult = {
  intent: 'direct',
  searchQuery: null,
  reasoning: 'No clear search intent detected',
  confidence: 0.5,
};

export function heuristicClassify(
  userContent: string,
  opts?: { hasTabularAttachment?: boolean }
): HeuristicResult {
  // Der Gruss ist Ablaufsteuerung, keine Regel: er entscheidet nicht nur über
  // sich selbst, sondern kann den Rest der Nachricht ERNEUT zur Klassifikation
  // schicken. Eine Tabelle, deren Einträge sich gegenseitig aufrufen, wäre keine
  // Tabelle mehr — deshalb steht er davor.
  //
  // Ein Gruss-PRÄFIX darf keinen echten Auftrag verschlucken ("Hallo! Wie hat
  // die CDU abgestimmt?"): abschneiden und den Rest klassifizieren.
  const trimmed = userContent.toLowerCase().trim();
  const greet = GREETING_PREFIX_PATTERN.exec(trimmed);
  if (greet) {
    const rest = trimmed.slice(greet[0].length).trim();
    const restWords = rest ? rest.split(/\s+/).filter(Boolean).length : 0;
    if (
      rest.length === 0 ||
      SMALLTALK_REMAINDER_PATTERN.test(rest) ||
      (restWords <= 3 && !rest.includes('?'))
    ) {
      return {
        intent: 'greeting',
        searchQuery: null,
        reasoning: 'Greeting detected',
        confidence: 0.95,
      };
    }
    // Die Präfixlänge ist gross-/kleinschreibungsstabil, also gilt derselbe
    // Versatz im Originaltext. Das `+` im Präfix frisst alle führenden Grüsse,
    // deshalb terminiert die Rekursion.
    return heuristicClassify(userContent.trim().slice(greet[0].length).trim(), opts);
  }

  const analyzed = analyzeMessage(userContent, opts);
  const hit = runRules(HEURISTIC_RULES, analyzed);
  if (hit) {
    log.debug(`[Heuristik] Regel "${hit.rule.id}" → ${hit.result.intent}`);
    return hit.result;
  }

  // Nichts hat gegriffen. Bleibt `direct` — dieses Verdikt erreicht nie die
  // Leitung (0,50 liegt weit unter HEURISTIC_CONFIDENCE_THRESHOLD), es speist
  // nur Tier 3.5 und wird dann von der LLM-Stufe überschrieben. `produktion`
  // hiesse zu behaupten, der Nutzer habe Substanz mitgeliefert, die wir nie
  // erkannt haben; `agentic` würde Tier 3.5 blind machen und das ganze unklare
  // Band zurück an den 27k-Prompt geben. Der Residualwert, den der NUTZER sieht,
  // wandert eine Ebene höher, in Regel 12 des Prompts.
  return RESIDUAL_RESULT;
}
