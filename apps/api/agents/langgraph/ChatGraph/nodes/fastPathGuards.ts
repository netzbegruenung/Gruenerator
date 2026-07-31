/**
 * Shared guards for the Tier-3 keyword fast paths (classifierHeuristics.ts) and
 * the Tier-2 social block (classifierNode.ts). Each generation fast path fires
 * on a bare artifact noun ("Sharepic", "Grafik", "Tabelle") at confidence ≥ 0.85
 * and skips the LLM. Three cases must NOT fire generation:
 *   - the noun is negated       ("KEIN Sharepic", "ohne Bild", "keine Grafik")
 *   - the message is a question  ABOUT the artifact ("Was macht ein gutes … aus?")
 *   - the noun sits in a quote   (reported speech: „Erstell ein Sharepic")
 * Leaf module (no imports from the classifier) so both callers can share it and
 * it unit-tests in isolation (fastPathGuards.vitest.ts).
 */

/**
 * Quoted spans are reported speech, not the user's own ask. Straight single
 * quotes are deliberately NOT stripped — they collide with German apostrophes
 * ("geht's", "wie viele Fuß"). The 240-char cap bounds work and skips
 * degenerate unbalanced quotes.
 */
const QUOTED_SPAN_PATTERNS: readonly RegExp[] = [
  /„[^“”„"]{0,240}["“”]/g, // German „…" (curly or sloppy straight closer)
  /»[^«»]{0,240}«/g, // guillemets »…«
  /«[^«»]{0,240}»/g, // French-style «…» (Swiss usage)
  /"[^"\n]{0,240}"/g, // straight double quotes
  /‚[^‘’]{0,240}[‘’]/g, // German single ‚…'
];

/** Replace quoted spans with a space so noun tests don't fire on reported speech. */
export function stripQuotedSpans(text: string): string {
  let out = text;
  for (const p of QUOTED_SPAN_PATTERNS) out = out.replace(p, ' ');
  return out;
}

// Negator immediately before the noun ("KEIN Sharepic", "ohne Bild", "nicht als
// Tabelle"). Anchored to end-of-window so it sits close to the noun; [^.!?\n]
// keeps it inside one sentence ("Nicht schlecht! Erstell ein Sharepic" is not a
// negation). `statt`/`anstelle` are deliberately excluded: they take an object
// between the negator and the target ("statt eines Posts ein Sharepic" negates
// Post, not Sharepic), which no bounded window can disambiguate — excluding
// them avoids false stand-downs at the cost of missing the rarer "statt einer
// Grafik" shape (which then just keeps today's behavior).
const NEGATOR_BEFORE_RE = /\b(kein\w{0,2}|nicht|ohne|nie(?:mals)?)\b[^.!?\n]{0,20}$/i;
// Negator shortly after the noun ("ein Sharepic will ich nicht"). A contrastive
// conjunction between noun and negator stops it: in "Erstelle ein Dokument, aber
// keine Tabelle" the "keine" belongs to what FOLLOWS the "aber", so reading it
// as a negation of the document refuses the very artifact that was asked for.
const NEGATOR_AFTER_RE =
  /^(?![^.!?\n]{0,30}?\b(?:aber|jedoch|sondern|allerdings|dafür|stattdessen)\b)[^.!?\n]{0,30}?\b(nicht|kein\w{0,2})\b/i;

/**
 * True when an occurrence of `nounPattern` is negated within a sentence-bounded
 * window. Per-noun-family: "statt eines Posts ein Sharepic" negates `post`, not
 * `sharepic`, so passing each branch its own noun yields correct routing.
 */
export function isNegatedArtifactRequest(text: string, nounPattern: RegExp): boolean {
  const g = new RegExp(
    nounPattern.source,
    nounPattern.flags.includes('g') ? nounPattern.flags : `${nounPattern.flags}g`
  );
  for (const m of text.matchAll(g)) {
    const i = m.index ?? 0;
    const end = i + m[0].length;
    if (NEGATOR_BEFORE_RE.test(text.slice(Math.max(0, i - 30), i))) return true;
    if (NEGATOR_AFTER_RE.test(text.slice(end, end + 30))) return true;
  }
  return false;
}

// A question-word-initial message that mentions the artifact noun is a question
// ABOUT the artifact ("Was macht ein gutes Sharepic aus?"), not a request to
// create one. Generalizes SOCIAL_META_QUESTION_PATTERN (classifierHeuristics.ts).
const META_QUESTION_START_RE =
  /^\s*(was|wie|wer|warum|wieso|weshalb|welche[rsnm]?|wann|wo|woran|wodurch|gibt\s+es)\b/i;

/** True when the message opens with a question word and mentions the noun. */
export function isMetaQuestionAbout(text: string, nounPattern: RegExp): boolean {
  return META_QUESTION_START_RE.test(text) && nounPattern.test(text);
}

/** The single conjunct a guarded fast path adds: true ⇒ stand down (defer/other). */
export function negatedOrMeta(text: string, nounPattern: RegExp): boolean {
  return isNegatedArtifactRequest(text, nounPattern) || isMetaQuestionAbout(text, nounPattern);
}

/**
 * The artifact families a turn can be told NOT to touch. Keyed so the caller
 * passes the family it is about to act on — per-noun on purpose: "Erstelle ein
 * Dokument, aber keine Tabelle" forbids the table and must still write the
 * document.
 */
export type ForbiddableArtifact = 'document' | 'sheet' | 'presentation' | 'pdf' | 'board' | 'image';

export const ARTIFACT_NOUN_BY_KIND: Readonly<Record<ForbiddableArtifact, RegExp>> = {
  document:
    /\b(dokument\w*|protokoll\w*|notiz\w*|checkliste\w*|schriftst[üu]ck\w*|textdokument\w*)\b/i,
  sheet: /\b(tabelle\w*|kalkulation\w*|spreadsheet\w*|sheet\w*)\b/i,
  presentation: /\b(pr[äa]sentation\w*|folien?|slides?)\b/i,
  pdf: /\bpdf\w*\b/i,
  board: /\b(board\w*|kanban\w*|karten?|aufgaben?|tasks?)\b/i,
  image: /\b(bild\w*|foto\w*|grafik\w*|illustration\w*)\b/i,
};

/**
 * An ACTION-LEVEL prohibition: "nichts speichern", "keine Dokumentaktion",
 * "nur antworten", "das Dokument unverändert lassen". These carry no artifact
 * noun the per-noun negation guard could bind to, which is exactly why they
 * used to pass through every gate untouched.
 *
 * `änderung` is deliberately absent from the noun list: "keine großen
 * Änderungen" is an instruction about HOW to edit, not a refusal to edit, and
 * it is common enough in ordinary edit turns to make the guard misfire.
 */
const ACTION_PROHIBITION_RE = new RegExp(
  [
    // "keine Aktion", "keine Dokumentaktion", "keine Speicher- oder
    // Aktualisierungsaktion" — the lazy gap keeps the negator in the same clause.
    String.raw`\bkein\w{0,2}\b[^.!?\n]{0,30}?\w*(?:aktion|aktualisierung|speicherung)\w*`,
    String.raw`\bnichts?\s+(?:ab)?(?:speicher|anleg|ablege|sicher)\w*`,
    String.raw`\bnicht\b[^.!?\n]{0,25}?\b(?:speichern|abspeichern|anlegen|aktualisieren|[üu]berschreiben|fortschreiben)\b`,
    String.raw`\bnur\s+(?:im\s+chat|hier(?:\s+im\s+chat)?|antworten|als\s+antwort|in\s+der\s+antwort)\b`,
    String.raw`\bunver[äa]ndert\s+(?:lassen|bleiben)\b`,
  ].join('|'),
  'i'
);

/**
 * True when the turn explicitly forbids creating, saving or updating a
 * persistent artifact.
 *
 * Why this exists: negation was already guarded — `negatedOrMeta` sits at
 * eleven Tier-3 fast paths. It sat at the wrong eleven. The two routes that
 * actually fire in a long thread (the Tier-2.7 `lastToolContext` follow-up and
 * the Tier-4 LLM, nudged by the tool-context hint) had no negation check at
 * all, so "Erstelle diesmal kein Dokument" reliably produced a document action.
 *
 * Pass `nounPattern` when acting on a specific family so an unrelated
 * prohibition in the same message doesn't stand the turn down.
 */
export function forbidsPersistentAction(text: string, nounPattern?: RegExp): boolean {
  const t = stripQuotedSpans(text ?? '');
  if (ACTION_PROHIBITION_RE.test(t)) return true;
  return nounPattern ? isNegatedArtifactRequest(t, nounPattern) : false;
}

/**
 * An explicit ban on looking anything up in THIS turn: "ohne neue Recherche",
 * "keine weitere Suche", "nur aus dem Chat".
 *
 * Why a predicate and not a prompt line: the ban used to lose an argument
 * against our own instructions. Four tool descriptions open with "Recherchiere
 * ZUERST die Fakten (gruenerator_search)", the loop's cardinal rule says a
 * factual follow-up "verlangt einen ERNEUTEN Tool-Aufruf", and — the sharpest
 * edge — `looksLikeCompoundGeneration` reads the word "Recherche" as a research
 * SIGNAL, so "ohne neue Recherche eine Vergleichstabelle" is precisely the
 * phrase that mounted the search tools in the first place. One user sentence
 * cannot outvote that. A tool the catalog never mounts cannot be called.
 *
 * Deliberately narrow — an EXPLICIT negation, not an inference. "Kannst du das
 * aus dem Kopf?" is a preference; "ohne neue Recherche" is an instruction.
 */
const RESEARCH_BAN_RE = new RegExp(
  [
    // "keine (neue/weitere/erneute) Recherche/Suche/Websuche"
    String.raw`\bkein\w{0,5}\s+(?:neue\w{0,2}\s+|weitere\w{0,2}\s+|erneute\w{0,2}\s+|zus[äa]tzliche\w{0,2}\s+)?(?:recherche\w*|(?:web|internet|online|quellen)?such\w*|nachforschung\w*)\b`,
    // "ohne (neue) Recherche/Suche" — the wording the QA run actually used.
    String.raw`\bohne\s+(?:neue\w{0,2}\s+|weitere\w{0,2}\s+|erneute\w{0,2}\s+)?(?:recherche\w*|(?:web|internet|online)?such\w*|nachzuschlagen)\b`,
    // "nicht noch mal recherchieren/googeln/im Netz suchen". The bare verb
    // "such" is NOT in here: "ich weiß nicht, wonach ich suchen soll" is not a
    // ban, and a 25-char window cannot tell the two apart.
    String.raw`\bnicht\b[^.!?\n]{0,25}?\b(?:recherchier\w*|nachschlag\w*|google\w*|googel\w*|im\s+(?:web|internet|netz)\s+such\w*|neu\s+such\w*|nochmals?\s+such\w*)\b`,
    // The same instruction with the verb first: "Such nicht nochmal",
    // "Recherchiere bitte nicht". The negator must FOLLOW immediately (one
    // optional filler word) — a wider window swallows "Suche nach Quellen, die
    // nicht älter als 2020 sind", which asks for research rather than refusing it.
    String.raw`\b(?:such\w*|recherchier\w*|google\w*|googel\w*|nachschlag\w*)\s+(?:bitte\s+|jetzt\s+|dazu\s+|dafür\s+)?nicht\b`,
    // "nur aus dem Chat / nur mit den gespeicherten Fakten"
    String.raw`\bnur\s+(?:aus|mit|auf\s+basis)\s+(?:dem|den|der|des)?\s*(?:bisherigen|gespeicherten|vorhandenen|bekannten)?\s*(?:chat\w*|gespr[äa]ch\w*|verlauf\w*|faktenbasis|fakten|daten|angaben)\b`,
    // "ausschließlich die gespeicherte Faktenbasis verwenden"
    String.raw`\bausschlie[ßs]lich\b[^.!?\n]{0,40}?\b(?:gespeicherte\w*|bisherige\w*|vorhandene\w*|bereits\b)`,
    String.raw`\brechercheverbot\w*\b`,
  ].join('|'),
  'gi'
);

/**
 * A negator in front of the ban flips it back: "das geht nicht ohne Recherche"
 * ASKS for research. Without this the guard would read the opposite of the
 * sentence — the one failure mode worse than missing the ban entirely.
 */
const BAN_REVERSER_RE = /\b(nicht|kaum|schwer\w*|unm[öo]glich)\b[^.!?\n]{0,15}$/i;

/** True when the turn explicitly forbids looking anything up. */
export function forbidsNewResearch(text: string): boolean {
  const t = stripQuotedSpans(text ?? '');
  for (const m of t.matchAll(RESEARCH_BAN_RE)) {
    const i = m.index ?? 0;
    if (!BAN_REVERSER_RE.test(t.slice(Math.max(0, i - 30), i))) return true;
  }
  return false;
}

/**
 * A creation order in BOTH German word orders. Every artifact heuristic used to
 * spell out only the verb-first one ("mach mir ein PDF daraus") and was blind to
 * the verb-final one ("das bitte schön als PDF erstellen") — the subordinate and
 * infinitive phrasings, which is how a good half of real asks are worded. The
 * two that DID attempt the second order got it wrong in opposite ways: the image
 * alternate forgot the inflection suffix (`(erstell|…)\b` matches "Bild mach",
 * never "Bild erstellen"), and save_as_doc spelled its mirror out by hand for a
 * hand-picked four verbs. One builder means a phrasing gap can no longer be
 * closed for one artifact and stay open for the other five.
 *
 * The verb sets differ only where the product does: text products take
 * `schreib`, sheets take "leg … an", images take the drawing verbs. Merging
 * those too would widen each intent into its neighbours.
 *
 * Verb-final position is restricted to infinitive/imperative on purpose. That is
 * what a REQUEST looks like at the end of a German clause ("… als PDF
 * erstellen"); a participle in that slot is narration about something that
 * already exists ("… die Präsentation, die ich erstellt habe"). Without the
 * restriction the second word order would turn every mention of an existing
 * artifact into an order to build a new one.
 *
 * Callers build their patterns at MODULE scope: new RegExp compiles per call,
 * unlike a regex literal.
 */
export const CREATION_VERB_CORE = 'erstell|erzeug|generier|mach|bau|entwirf|entwerf|gestalte';

/** Any core creation verb, any inflection, anywhere — "is this an order at all?" */
export const CREATION_VERB_RE = new RegExp(`\\b(?:${CREATION_VERB_CORE})[a-zäöü]*\\b`, 'i');

export function creationOrderPattern(
  noun: string,
  opts: { extraVerbs?: string; verbs?: string; forward?: number; backward?: number } = {}
): RegExp {
  // `verbs` REPLACES the core rather than extending it. One artifact needs that:
  // for images `mach` is the EDIT verb ("Mach das Foto heller"), so inheriting it
  // from the core would swallow every image_edit follow-up into generation.
  const base = opts.verbs ?? CREATION_VERB_CORE;
  const stem = opts.extraVerbs ? `${base}|${opts.extraVerbs}` : base;
  const verbAnyForm = `(?:${stem})[a-zäöü]*`;
  const verbFinalForm = `(?:${stem})(?:e|en|n|st)?`;
  const forward = opts.forward ?? 40;
  const backward = opts.backward ?? forward;
  return new RegExp(
    `\\b${verbAnyForm}\\b.{0,${forward}}\\b(?:${noun})\\b` +
      `|\\b(?:${noun})\\b.{0,${backward}}\\b${verbFinalForm}\\b`,
    'i'
  );
}

/**
 * The ONLY accepted sharepic vocabulary. A sharepic is a branded party template
 * with text on it — "Grafik" and "Kachel" mean a chart or a tile just as often,
 * and inferring one from them is what made sharepics appear unasked-for.
 * Add words HERE; nothing else in the codebase may carry its own sharepic list.
 */
export const SHAREPIC_WORD_RE =
  /\b(share[\s-]?pics?|sharepics?|spruchbild\w*|zitatbild\w*|drei[\s-]?zeiler\w*)\b/i;

/**
 * True when the user asked for a sharepic in so many words. Quotes, negation
 * ("Post ohne Sharepic") and meta questions ("Was macht ein gutes Sharepic
 * aus?") are excluded HERE rather than at each call site — nine call sites used
 * to each remember their own guards, and the ones that forgot were the doors.
 */
export function hasExplicitSharepicWord(text: string): boolean {
  const t = stripQuotedSpans(text ?? '');
  if (!SHAREPIC_WORD_RE.test(t)) return false;
  if (isNegatedArtifactRequest(t, SHAREPIC_WORD_RE)) return false;
  // The meta guard is anchored to the START of the text, so it only speaks for
  // the sentence it opens — scope it there. "Was ist unsere Position zur
  // Mietpreisbremse? Mach ein Sharepic draus" opens with a question about the
  // Mietpreisbremse, not about sharepics; judging the whole message by its
  // first word would refuse a perfectly explicit ask.
  const firstSentence = t.split(/[.!?]/)[0] ?? t;
  return !isMetaQuestionAbout(firstSentence, SHAREPIC_WORD_RE);
}
