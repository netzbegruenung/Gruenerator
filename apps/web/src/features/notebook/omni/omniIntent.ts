import { getNotebookQueryAliases } from '@gruenerator/shared/notebooks';
import { containsWord, type ResearchRegion } from '@gruenerator/shared/utils';
import { type IconType } from 'react-icons';

import { getNotebookConfigBySlug } from '../config/notebookPagesConfig';
import { getOrderedNotebooks, isNotebookVisibleForLocale } from '../config/notebooksConfig';

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

// The aggregate notebook IS the surface the composer sits on — never a routing target.
const EXCLUDED_IDS = new Set(['gruenerator-notebook']);

export function buildSystemTargets(locale: 'de-DE' | 'de-AT'): OmniTarget[] {
  return getOrderedNotebooks()
    .filter((nb) => !EXCLUDED_IDS.has(nb.id) && isNotebookVisibleForLocale(nb, locale))
    .map((nb) => ({
      key: nb.id,
      title: nb.title,
      path: nb.path,
      icon: nb.icon,
      aliases: getNotebookQueryAliases(nb),
    }));
}

/** The targets as regions a research query can name: each system notebook
 *  with its searchable `*-system` collections (own notebooks have none). */
export function toResearchRegions(targets: readonly OmniTarget[]): ResearchRegion[] {
  return targets.map((target) => {
    const slug = target.path.split('/').filter(Boolean).pop();
    const config = slug ? getNotebookConfigBySlug(slug) : undefined;
    return {
      title: target.title,
      aliases: target.aliases,
      collectionIds: (config?.collections ?? [])
        .map((c) => c.id)
        .filter((id) => id.endsWith('-system')),
    };
  });
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
