/**
 * Client-side index of navigable features, tools and agents — matched without a
 * network round-trip so the palette has something to show on the first
 * keystroke, while the server categories are still in flight.
 *
 * Ordered so the curated tool catalog (with synonyms) wins the dedup over the
 * plainer nav-derived entries pointing at the same path.
 */
import { getAgentSlug, getVisibleSystemAgentsForLocale } from '@gruenerator/shared/agents';
import { foldUmlauts } from '@gruenerator/shared/utils';

import { getDirectMenuItems, getFooterLinks } from '../../components/layout/Header/menuData';
import FAVOURITE_ITEMS from '../../config/sidebarFavouritesConfig';

import { getToolCatalog } from './toolCatalog';

import type { IconType } from '../../config/icons';
import type { Agent } from '@gruenerator/shared/agents';
import type { ComponentType } from 'react';

export interface FeatureHit {
  /**
   * Unique across the whole index. Ids alone collide: `docs` names both the
   * menu entry (/docs) and the favourites entry (/workplace), and both match
   * a query like "do".
   */
  key: string;
  title: string;
  subtitle: string | null;
  path: string;
  icon?: IconType | ComponentType | null;
  /** Precomputed so matching doesn't re-fold the whole index per keystroke. */
  normalizedTitle: string;
  normalizedSubtitle: string;
  normalizedKeywords: string[];
}

function normalize(value: string): string {
  return foldUmlauts(value).toLowerCase();
}

export interface BuildFeatureIndexArgs {
  isAustrian: boolean;
  locale: string;
  userAgents: Agent[];
}

interface FeatureSource {
  id: string;
  title: string;
  subtitle: string | null;
  path: string;
  icon?: IconType | ComponentType | null;
  keywords?: string[];
}

export function buildFeatureIndex({
  isAustrian,
  locale,
  userAgents,
}: BuildFeatureIndexArgs): FeatureHit[] {
  const hits: FeatureHit[] = [];
  const seen = new Set<string>();

  const push = (source: FeatureSource) => {
    const key = `${source.id}:${source.path}`;
    if (seen.has(key)) return;
    seen.add(key);
    hits.push({
      key,
      title: source.title,
      subtitle: source.subtitle,
      path: source.path,
      icon: source.icon,
      normalizedTitle: normalize(source.title),
      normalizedSubtitle: source.subtitle ? normalize(source.subtitle) : '',
      normalizedKeywords: (source.keywords ?? []).map(normalize),
    });
  };

  for (const tool of getToolCatalog(import.meta.env.DEV)) {
    push(tool);
  }

  for (const item of Object.values(getDirectMenuItems({ isAustrian }))) {
    if (!item.path) continue;
    push({
      id: item.id,
      title: item.title,
      subtitle: item.description || null,
      path: item.path,
      icon: item.icon,
    });
  }

  for (const item of FAVOURITE_ITEMS) {
    push({ id: item.id, title: item.title, subtitle: null, path: item.path, icon: item.icon });
  }

  for (const link of getFooterLinks()) {
    if (!link.path) continue;
    push({
      id: link.id,
      title: link.title,
      subtitle: link.description || null,
      path: link.path,
    });
  }

  for (const agent of getVisibleSystemAgentsForLocale(locale)) {
    push({
      id: `agent-${agent.identifier}`,
      title: agent.title,
      subtitle: agent.description || null,
      path: `/agents/${getAgentSlug(agent.identifier)}`,
    });
  }

  for (const agent of userAgents) {
    push({
      id: `agent-${agent.identifier}`,
      title: agent.title,
      subtitle: null,
      path: `/agents/${getAgentSlug(agent.identifier)}`,
    });
  }

  return hits;
}

/**
 * Score tiers: title prefix (0) → title substring (1) → keyword hit (2) →
 * description substring (3). A keyword match ranks above a description-only
 * hit so a deliberate synonym ("video" → Reel) beats an incidental mention.
 */
function scoreHit(hit: FeatureHit, needle: string): number {
  if (hit.normalizedTitle.startsWith(needle)) return 0;
  if (hit.normalizedTitle.includes(needle)) return 1;
  if (hit.normalizedKeywords.some((k) => k.startsWith(needle))) return 2;
  if (hit.normalizedSubtitle.includes(needle)) return 3;
  if (hit.normalizedKeywords.some((k) => k.includes(needle))) return 3;
  return -1;
}

export function matchFeatures(index: FeatureHit[], query: string, limit = 6): FeatureHit[] {
  const needle = normalize(query.trim());
  if (needle.length === 0) return [];

  const scored: Array<{ hit: FeatureHit; score: number }> = [];
  for (const hit of index) {
    const score = scoreHit(hit, needle);
    if (score >= 0) scored.push({ hit, score });
  }

  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.hit);
}
