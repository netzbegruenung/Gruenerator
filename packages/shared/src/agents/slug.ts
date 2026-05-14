import { getSystemAgent, SYSTEM_AGENTS } from './system.js';

const AGENT_ID_PREFIX = 'gruenerator-';

/**
 * Custom slug → identifier map, built from agents that declare an explicit
 * `slug`. Lets short, branded URLs (`/agents/gruene-berlin`) resolve to the
 * verbose identifier (`gruenerator-oeffentlichkeitsarbeit-berlin`).
 */
const customSlugToIdentifier = new Map<string, string>(
  SYSTEM_AGENTS.flatMap((agent) =>
    agent.slug ? [[agent.slug, agent.identifier] as const] : []
  )
);

/**
 * Convert an agent identifier to its URL slug form. Agents with an explicit
 * `slug` use it verbatim; otherwise the `gruenerator-` registry prefix is
 * stripped so the browser bar shows `/agents/oeffentlichkeitsarbeit` instead
 * of the verbose `/agents/gruenerator-oeffentlichkeitsarbeit`.
 *
 * Identifiers without the prefix (user-defined agents) pass through unchanged.
 */
export function getAgentSlug(identifier: string): string {
  const explicit = getSystemAgent(identifier)?.slug;
  if (explicit) return explicit;
  return identifier.startsWith(AGENT_ID_PREFIX)
    ? identifier.slice(AGENT_ID_PREFIX.length)
    : identifier;
}

/**
 * Resolve a URL slug back to a system agent identifier.
 *
 * - An explicit custom slug (e.g. `gruene-berlin`) maps straight to its agent.
 * - If `slug` already carries the `gruenerator-` prefix (legacy URL), return
 *   it unchanged — backwards-compatible with bookmarks predating the slug
 *   refactor.
 * - Otherwise re-prefix and verify a system agent exists; if so, return the
 *   full identifier. This still resolves the prefix-stripped derived slug, so
 *   a custom-slug agent stays reachable under both forms. If no system agent
 *   matches, return the slug as-is so user-defined agents (whose identifiers
 *   don't follow the registry convention) still route correctly.
 */
export function resolveAgentSlug(slug: string): string {
  const custom = customSlugToIdentifier.get(slug);
  if (custom) return custom;
  if (slug.startsWith(AGENT_ID_PREFIX)) return slug;
  const candidate = `${AGENT_ID_PREFIX}${slug}`;
  return getSystemAgent(candidate) ? candidate : slug;
}
