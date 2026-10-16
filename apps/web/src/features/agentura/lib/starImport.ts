import { agentKey } from '@gruenerator/shared/agents';
import { type LibraryRef } from '@gruenerator/shared/grueneratoren';

import { type AgentEntry, type RecipeEntry } from './marketItems';

/**
 * Bis Oktober 2026 hat der Stern einen Agent oder ein Rezept auf die Übersicht
 * geholt; heute heftet er nur noch an die Seitenleiste, und auf die Übersicht
 * kommt, was in `user_library_items` steht. Die Sterne liegen nur im Browser
 * (`sidebar-agent-favorites`, `gruenerator-skill-favorites`) — übertragen kann
 * sie deshalb nur der Client, einmal, gegen die Pools, die die Übersicht ohnehin
 * lädt.
 *
 * Agent-Sterne tragen den agentRef, also genau den Verweis der Liste.
 * Rezept-Sterne tragen nur die kleingeschriebene Mention: ein Katalog-Rezept
 * gewinnt, sonst nur ein eindeutiges öffentliches Nutzer-Rezept — dessen
 * Mention ist nur pro Besitzer eindeutig, und raten hieße, ein fremdes Rezept
 * auf die Übersicht zu legen. Eigenes bleibt draußen, es steht ohnehin dort.
 */
export function starredLibraryRefs({
  agentStars,
  recipeStars,
  shopAgents,
  shopRecipes,
  ownAgentKeys,
}: {
  agentStars: readonly string[];
  recipeStars: readonly string[];
  shopAgents: ReadonlyMap<string, AgentEntry>;
  shopRecipes: ReadonlyMap<string, RecipeEntry>;
  ownAgentKeys: ReadonlySet<string>;
}): LibraryRef[] {
  const refs: LibraryRef[] = [];
  const byIdentifier = new Map<string, string[]>();
  for (const [ref, entry] of shopAgents) {
    const id = entry.agent.identifier;
    byIdentifier.set(id, [...(byIdentifier.get(id) ?? []), ref]);
  }
  for (const star of new Set(agentStars)) {
    // Ältere Sterne auf fremden Agents tragen noch den Identifier statt der uuid;
    // `useAgentIndex` schlüsselt sie um, aber vielleicht erst nach diesem Lauf.
    const candidates = byIdentifier.get(star) ?? [];
    const ref = shopAgents.has(star) ? star : candidates.length === 1 ? candidates[0] : null;
    const entry = ref ? shopAgents.get(ref) : null;
    if (ref && entry && !ownAgentKeys.has(agentKey(entry.agent))) refs.push({ kind: 'agent', ref });
  }

  const byMention = new Map<string, RecipeEntry[]>();
  for (const entry of shopRecipes.values()) {
    if (entry.editable) continue;
    const mention = entry.mention.toLowerCase();
    byMention.set(mention, [...(byMention.get(mention) ?? []), entry]);
  }
  for (const star of new Set(recipeStars)) {
    const matches = byMention.get(star.toLowerCase()) ?? [];
    const catalogue = matches.find((e) => e.id === null);
    if (catalogue) refs.push({ kind: 'recipe', ref: catalogue.mention });
    else if (matches.length === 1 && matches[0].id)
      refs.push({ kind: 'recipe', ref: matches[0].id });
  }
  return refs;
}
