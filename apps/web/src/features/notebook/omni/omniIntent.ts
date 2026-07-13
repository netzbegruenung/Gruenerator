import { type IconType } from 'react-icons';

import { getOrderedNotebooks } from '../config/notebooksConfig';

/** A navigable ask/open target for the omni composer (system or user notebook). */
export interface OmniTarget {
  key: string;
  title: string;
  path: string;
  icon?: IconType;
  /** Lowercased words/phrases that identify this notebook inside a question. */
  aliases: string[];
}

export interface OmniEntityMatch {
  target: OmniTarget;
  alias: string;
}

// Aliases beyond the registry title — only where the title alone doesn't cover
// common spellings ("MV", "Böll") or contains filler ("Die Grünen Österreich").
const EXTRA_ALIASES: Record<string, string[]> = {
  'gruene-notebook': ['bundesverband', 'grundsatzprogramm', 'bundespartei'],
  'bundestagsfraktion-notebook': ['bundestagsfraktion', 'bundestag'],
  'oesterreich-notebook': ['österreich', 'oesterreich'],
  'mecklenburg-vorpommern-notebook': ['mecklenburg', 'vorpommern', 'meckpomm', 'mv'],
  'schleswig-holstein-notebook': ['schleswig', 'holstein'],
  'thueringen-notebook': ['thüringen', 'thueringen'],
  'sachsen-anhalt-notebook': ['sachsen-anhalt', 'sachsen anhalt'],
  'boell-stiftung-notebook': ['böll', 'boell', 'böll-stiftung'],
  'gruenblog-notebook': ['grünblog', 'gruenblog'],
};

// The aggregate notebook IS the surface the composer sits on — never a routing target.
const EXCLUDED_IDS = new Set(['gruenerator-notebook']);

export function buildSystemTargets(): OmniTarget[] {
  return getOrderedNotebooks()
    .filter((nb) => !EXCLUDED_IDS.has(nb.id))
    .map((nb) => ({
      key: nb.id,
      title: nb.title,
      path: nb.path,
      icon: nb.icon,
      aliases: [nb.title.toLowerCase(), ...(EXTRA_ALIASES[nb.id] ?? [])],
    }));
}

const isLetter = (ch: string | undefined): boolean => !!ch && /\p{L}/u.test(ch);

/** Word-bounded, case-insensitive containment. `\b` breaks on umlauts
 *  ("thüringen"), so the bounds are checked manually. */
function containsWord(text: string, phrase: string): boolean {
  if (!phrase) return false;
  let idx = text.indexOf(phrase);
  while (idx !== -1) {
    if (!isLetter(text[idx - 1]) && !isLetter(text[idx + phrase.length])) return true;
    idx = text.indexOf(phrase, idx + 1);
  }
  return false;
}

/**
 * Which notebooks does this input name? "Was tun die Grünen Berlin für
 * Hitzeschutz?" → the Berlin notebook. Word-bounded so "Berliner Luft"
 * doesn't match. Multiple hits (e.g. "Berlin und Brandenburg") all return —
 * the caller offers them as options instead of hard-routing.
 */
export function detectNotebookEntities(query: string, targets: OmniTarget[]): OmniEntityMatch[] {
  const text = query.toLowerCase();
  if (text.trim().length < 2) return [];
  const matches: OmniEntityMatch[] = [];
  for (const target of targets) {
    const alias = target.aliases.find((a) => containsWord(text, a));
    if (alias) matches.push({ target, alias });
  }
  return matches;
}

const QUESTION_OPENER_RE =
  /^\s*(was|wie|warum|wieso|weshalb|welche[rsnm]?|wer|wessen|wem|wen|wann|wo|womit|wodurch|wofür|wozu|gibt|hat|haben|ist|sind|kann|können|muss|müssen|soll|sollen|will|wollen|fordert|fordern|plant|planen)\b/i;

/**
 * Question (→ KI answer) vs. lookup (→ result list)? Mirrors the docs
 * composer heuristic: interrogative opener, a question mark, or a full
 * phrase (≥ 5 words) reads as a question; 1–3 keywords read as search.
 */
export function detectQuestionIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.includes('?')) return true;
  if (QUESTION_OPENER_RE.test(trimmed)) return true;
  return trimmed.split(/\s+/).length >= 5;
}

/** Title-substring matches for short lookups ("berl" → Berlin) — used for
 *  "Notebook öffnen" options. */
export function matchTargetsByName(query: string, targets: OmniTarget[]): OmniTarget[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  return targets.filter((t) => t.title.toLowerCase().includes(q));
}
