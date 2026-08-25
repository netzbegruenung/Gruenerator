/**
 * Deterministic recipe pick for the single-pass path.
 *
 * `rezept_laden` only exists inside the agentic loop, but the most common
 * writing turn — "Schreib mir eine Pressemitteilung zu X" without a research
 * signal — is single-pass. There the recipe used to load only via an explicit
 * `@presse` mention, which most users never type. This matcher closes that gap
 * WITHOUT a model in the loop: an unambiguous platform word plus a writing
 * verb sets `activeSkillMention`, and from that point on the turn behaves
 * exactly as if the user had picked the recipe (skill fragment, learned
 * text-form precedence, loop-gate suppression — one seam, respondNode).
 *
 * Conservative by design, mirroring the sharepic word guards: quoted spans
 * don't count, negation ("ohne Pressemitteilung") stands down, meta questions
 * ("Was macht eine gute PM aus?") stand down, transformation asks (summarise/
 * translate/shorten) stand down, and TWO platform words yield null — a text
 * requested "für Instagram und Facebook" must not silently get one platform's
 * length limit.
 */
import {
  DISABLED_LV_AGENT_IDS,
  SKILLS,
  isSkillOfferedIn,
  matchesRecipeAudience,
  type Skill,
} from '@gruenerator/shared/agents';
import { type InstanceId } from '@gruenerator/shared/instances';

import { NOUN_TRIGGER_MAX_LENGTH } from '../../../agents/langgraph/ChatGraph/nodes/analyzedMessage.js';
import {
  isMetaQuestionAbout,
  isNegatedArtifactRequest,
  stripQuotedSpans,
} from '../../../agents/langgraph/ChatGraph/nodes/fastPathGuards.js';
import { CURRENT_INSTANCE } from '../../../config/instance.js';

/**
 * Writing verbs (not the artifact CREATION_VERB_CORE: that set answers "is
 * this an order to build something", this one answers "is this an order to
 * write prose" — `schreib`/`verfass`/`formulier` are the difference). `text`
 * covers the noun ("mach einen Text für Instagram") as well as the verb.
 */
const WRITE_SIGNAL_RE =
  /\b(?:schreib|verfass|formulier|erstell|entwirf|entwerf|mach|text)[a-zäöü]*\b/i;

/**
 * The ask transforms EXISTING text rather than writing new text in a platform
 * form — "Erstelle eine Zusammenfassung der Pressemitteilung" names the PM as
 * source material, not as target format. A recipe's length/structure rules
 * would fight the actual task, so any of these words stands the matcher down.
 */
const TRANSFORMATION_RE =
  /\b(?:zusammenfass\w*|zusammenzufassen|fass[et]?\b|übersetz\w*|analys\w*|korrigier\w*|korrektur|kürz\w*|bewert\w*|feedback|prüfe?\b)/i;

/**
 * Platform vocabulary per GENERIC recipe mention. Landesverband variants
 * (`presse-bayern`, `insta-berlin`, …) are deliberately absent: a bare
 * platform word carries no region, and guessing one would inject another LV's
 * speaker tactics. Word patterns stay ASCII at their edges — JS `\b` is
 * ASCII-based, so a leading/trailing umlaut would kill the boundary (see the
 * regex-umlaut lesson); inner umlauts are fine.
 */
const RECIPE_WORDS = [
  [
    'presse',
    /\b(?:pressemitteilung(?:en)?|pressemeldung(?:en)?|presseerkl(?:ä|ae)rung(?:en)?|pressestatement|presseaussendung(?:en)?)\b/i,
  ],
  ['instagram', /\b(?:instagram|insta)(?:-?(?:post|beitrag|caption|text))?s?\b/i],
  ['facebook', /\bfacebook(?:-?(?:post|beitrag))?s?\b/i],
  ['linkedin', /\blinkedin(?:-?(?:post|beitrag))?s?\b/i],
  ['twitter', /\b(?:tweets?|twitter)\b/i],
  ['reel', /\breels?\b/i],
  ['wahlpruefstein', /\bwahlpr(?:ü|ue)fstein(?:e|en)?\b/i],
] as const satisfies ReadonlyArray<readonly [string, RegExp]>;

/** The closed set of implicitly matchable mentions — mirrored as the
 *  `router.implicit_recipe` branches in decisionJournal.ts (typechecked at the
 *  recordDecision call site, so the two lists cannot drift silently). */
export type ImplicitRecipeMention = (typeof RECIPE_WORDS)[number][0];

/**
 * The recipe mention this text unambiguously asks for, or null. Null means
 * "leave the turn alone" — ambiguity, negation, meta, transformation, or
 * simply no platform word. The caller gates on top of this (no explicit
 * mention, no custom prompt, single-pass writing intents only).
 */
export function deriveImplicitRecipeMention(
  text: string,
  userLocale: string | null,
  instanceId: InstanceId = CURRENT_INSTANCE
): ImplicitRecipeMention | null {
  const t = stripQuotedSpans(text ?? '');
  if (t.trim().length === 0) return null;
  // Ab hier ist der Text kein Auftrag mehr, sondern Material: `streamContext`
  // hebt eingefügten Text in die Nutzernachricht, und dann liest dieser Matcher
  // eine ganze Seite statt eines Satzes. Der Lauf vom 13.08.2026 zeigt, wie
  // billig das schiefgeht — 5794 Zeichen einer Webseite, in deren Fußzeile
  // „Facebook" stand und irgendwo das Wort „Text": beide Bedingungen erfüllt,
  // Rezept gesetzt, und der Agent fragte zurück, ob er einen Facebook-Post
  // schreiben soll. Zufällige Ko-Vorkommen sind in einem Dokument die Regel,
  // in einem Auftragssatz die Ausnahme. Dieselbe Schwelle, an der auch der
  // Klassifikator „langer Einfügetext" sagt (`isLongPaste`).
  if (t.length > NOUN_TRIGGER_MAX_LENGTH) return null;
  if (!WRITE_SIGNAL_RE.test(t)) return null;
  if (TRANSFORMATION_RE.test(t)) return null;

  const firstSentence = t.split(/[.!?]/)[0] ?? t;
  const hits: ImplicitRecipeMention[] = [];
  // Same widening as recipeCatalog: `SKILLS` is `as const`, so entries without
  // an `audience` key reject the property — the declared interface carries it.
  const allSkills: readonly Skill[] = SKILLS;
  for (const [mention, wordRe] of RECIPE_WORDS) {
    if (!wordRe.test(t)) continue;
    if (isNegatedArtifactRequest(t, wordRe)) continue;
    if (isMetaQuestionAbout(firstSentence, wordRe)) continue;

    const skill = allSkills.find((s) => s.mention === mention);
    if (!skill) continue;
    if (!matchesRecipeAudience(skill.audience, userLocale)) continue;
    if (DISABLED_LV_AGENT_IDS.has(skill.identifier)) continue;
    // Was die Instanz nicht anbietet, darf auch nicht implizit zünden: sonst
    // schreibt der Turn nach Vorgaben eines Rezepts, das im Menü fehlt und das
    // niemand wieder abwählen kann.
    if (!isSkillOfferedIn(skill, instanceId)) continue;
    hits.push(mention);
  }

  return hits.length === 1 ? (hits[0] ?? null) : null;
}
