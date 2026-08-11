/**
 * Task-shape detection for the auto-model policy.
 *
 * The intent taxonomy says WHAT a turn does (search, produce, edit); it says
 * nothing about the OUTPUT CONTRACT the user attached to it. A JSON extraction,
 * a code question and a "genau zwei Zeilen" order all arrive as
 * `produktion`/`direct`/`agentic` and land on the shared prose lane — the
 * 2026-08 QA run showed what that costs: unparseable JSON, ignored line counts,
 * a second array spliced into an existing one on the edit follow-up.
 *
 * `detectTaskShape` is the third, orthogonal input signal next to intent and
 * complexity: deterministic (regex/structure, no model call), computed once
 * after classification, consumed by `resolveAutoSelection` as a lane override
 * on the NEUTRAL intents only. Routing a shape to Mistral Medium also flips
 * the loop to unified mode (`prefersUnifiedLoop`), so these turns skip the
 * split synth entirely.
 *
 * Two shapes, by strength of the contract:
 *  - `code`: the answer IS machine-readable text (JSON/YAML/SQL/…, code,
 *    fenced blocks) — a syntax error voids the answer.
 *  - `strict_format`: prose under an explicit, checkable constraint ("genau
 *    drei Sätze", "ohne Einleitung") — deviation is what the QA run graded
 *    down.
 * `code` wins when both match.
 */

import { type TaskShape } from './autoPolicy.js';

export { type TaskShape };

// ── code ─────────────────────────────────────────────────────────────────────

const FENCE_RE = /```/;

// Machine formats named as the DELIVERABLE. Bare nouns on purpose — "als JSON",
// "das YAML", "eine CSV" all carry the contract; the noun alone is specific
// enough that prose collisions are rare (nobody writes a Pressemitteilung
// about YAML).
const MACHINE_FORMAT_RE =
  /\b(json|ya?ml|toml|xml|svg|regex(?:p)?|sql|csv|ical|vcard|frontmatter|markdown[- ]?tabelle)\b/i;

// Programming languages / artefacts. Deliberately WITHOUT bare "funktion"
// ("die Funktion der Opposition") and "html/css" alone ("HTML-Newsletter" is a
// design ask, not a code ask) — precision over recall: a miss costs the old
// lane, a false positive costs nothing worse than the careful lane, but the
// set should still mean what it says.
// "skript" alone is deliberately absent: in this product a "Skript" is at
// least as often a Reel/video script (prose) as a shell script.
const CODE_LANG_RE =
  /\b(typescript|javascript|python|java|kotlin|swift|rust|golang|c\+\+|c#|php|ruby|bash|shell[- ]?skript|powershell|quellcode|source\s?code|code[- ]?(schnipsel|snippet|beispiel|block)|programmier\w*|debugg?\w*|refactor\w*|stacktrace|regul[äa]re[nrs]?\s+ausdr\w*)\b/i;

// A concrete file name with a code/data extension ("config.yaml", "app.tsx").
const CODE_FILE_RE = /\b[\w-]+\.(ts|tsx|js|jsx|mjs|py|json|ya?ml|sql|sh|css|scss|html|xml|env)\b/i;

// ── strict_format ────────────────────────────────────────────────────────────

const COUNT_WORD = '(?:\\d+|einem?|zwei|drei|vier|f[üu]nf|sechs|sieben|acht|neun|zehn|zw[öo]lf)';

// "genau/exakt/maximal/höchstens N Sätze/Zeilen/Wörter/…" — an explicitly
// countable format order. The unit list is closed on purpose: "genau drei
// Beispiele" is a content wish, not a format contract.
const COUNTED_FORMAT_RE = new RegExp(
  `\\b(genau|exakt|maximal|h[öo]chstens)\\s+${COUNT_WORD}\\s+(s[äa]tze?n?|zeilen?|w[öo]rtern?|stichpunkten?|aufz[äa]hlungspunkten?|bulletpoints?|zeichen|abs[äa]tze?n?)\\b`,
  'i'
);

// Explicit suppression/preservation orders the QA run saw violated.
const FORMAT_ORDER_RE =
  /\b(ohne|keine)\s+(einleitung|vorrede|vorbemerkung|begr[üu](?:ß|ss)ung|erkl[äa]rung(?:en)?|kommentar[e]?)\b|\bnur\s+die\s+([äa]nderungen|stichpunkte|liste|tabelle|betreffzeile)\b|\balle\s+anderen\s+(zeichen|zeilen|stellen)\s+unver[äa]ndert\b|\b(zeilenumbr[üu]che|formatierung)\s+(beibehalten|erhalten|[üu]bernehmen)\b/i;

export interface TaskShapeContext {
  /**
   * The previous assistant answer, for edit stickiness: "ändere den Wert auf 5"
   * after a JSON answer carries no format signal of its own — the thread does.
   * Only consulted for SHORT follow-ups; a full new question after a code
   * answer is a new topic.
   */
  lastAssistantText?: string | null;
}

const STICKY_FOLLOWUP_MAX_WORDS = 25;

/** The previous answer was machine-readable output. */
function answerWasCodeShaped(t: string): boolean {
  const trimmed = t.trim();
  return FENCE_RE.test(trimmed) || /^[[{]/.test(trimmed);
}

export function detectTaskShape(
  userText: string,
  context: TaskShapeContext = {}
): TaskShape | null {
  const t = (userText ?? '').trim();
  if (t.length === 0) return null;

  if (
    FENCE_RE.test(t) ||
    MACHINE_FORMAT_RE.test(t) ||
    CODE_LANG_RE.test(t) ||
    CODE_FILE_RE.test(t)
  ) {
    return 'code';
  }

  const last = context.lastAssistantText ?? '';
  if (
    last.length > 0 &&
    answerWasCodeShaped(last) &&
    t.split(/\s+/).filter(Boolean).length <= STICKY_FOLLOWUP_MAX_WORDS
  ) {
    return 'code';
  }

  if (COUNTED_FORMAT_RE.test(t) || FORMAT_ORDER_RE.test(t)) return 'strict_format';

  return null;
}
