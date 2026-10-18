/**
 * Agents: der offizielle Katalog (allgemein und Landesverband, über
 * `selectOfficialCatalog`) und die öffentlichen Nutzer-Agents des eigenen
 * Landes. `ref` ist der Identifier eines System-Agents bzw. die Zeilen-uuid
 * eines Nutzer-Agents — über Besitzer hinweg eindeutig, auch für Likes.
 */
import { type MarketplaceItemOf } from '@gruenerator/contracts';
import {
  agentRef,
  getAgentSlug,
  landesverbandRegion,
  type Agent,
} from '@gruenerator/shared/agents';

import {
  listPublicUserAgentListings,
  listUserAgents,
  type PublicUserAgentListing,
} from '../../userAgents/userAgentsRepository.js';
import { type MarketplaceContext } from '../context.js';

import { pageCandidates, type Candidate } from './inMemory.js';
import { librarySave } from './librarySave.js';

import type { MarketplaceSource } from './types.js';

type AgentItem = MarketplaceItemOf<'agent'>;

function officialItem(agent: Agent, origin: 'offiziell' | 'landesverband'): AgentItem {
  return {
    kind: 'agent',
    key: `agent:${agent.identifier}`,
    ref: agent.identifier,
    origin,
    title: agent.title,
    description: agent.description || null,
    thumbnailUrl: null,
    iconKey: agent.iconKey ?? null,
    authorName: null,
    audience: agent.audience ?? 'all',
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn: false,
    reportKind: null,
    createdAt: null,
    agent: {
      identifier: agent.identifier,
      slug: getAgentSlug(agent.identifier),
      isUserAgent: false,
    },
  };
}

function publicItem(ctx: MarketplaceContext, listing: PublicUserAgentListing): AgentItem {
  const { agent } = listing;
  const isOwn = listing.userId === ctx.userId;
  return {
    kind: 'agent',
    key: `agent:${agent.id}`,
    ref: agent.id,
    origin: 'oeffentlich',
    title: agent.title,
    description: agent.description || null,
    thumbnailUrl: null,
    iconKey: agent.iconKey ?? null,
    authorName: agent.author?.trim() || null,
    audience: agent.locale === 'de-AT' ? 'de-AT' : 'de-DE',
    likesCount: 0,
    liked: false,
    saved: false,
    isOwn,
    reportKind: 'user_agent',
    createdAt: listing.createdAt.toISOString(),
    // `slug` is what URLs and chat requests name the agent by (`agentRef`).
    agent: { identifier: agent.identifier, slug: agentRef(agent, isOwn), isUserAgent: true },
  };
}

async function candidates(ctx: MarketplaceContext): Promise<Candidate<'agent'>[]> {
  const [catalog, listings] = await Promise.all([
    ctx.officialCatalog(),
    listPublicUserAgentListings(ctx.userId, ctx.audience),
  ]);
  // Nach Region statt Registry: bei mehreren Zuteilungen stehen die Sachen
  // eines Verbands beieinander — wie in der Agentura.
  const lvAgents = [...catalog.lvAgents].sort((a, b) =>
    landesverbandRegion(a.identifier).localeCompare(landesverbandRegion(b.identifier))
  );
  return [
    ...catalog.generalAgents.map((a, rank) => ({
      item: officialItem(a, 'offiziell'),
      rank,
      searchText: [a.identifier],
    })),
    ...lvAgents.map((a, rank) => ({
      item: officialItem(a, 'landesverband'),
      rank,
      searchText: [a.identifier],
    })),
    ...listings.map((l) => ({
      item: publicItem(ctx, l),
      rank: null,
      searchText: [l.agent.identifier],
    })),
  ];
}

/** The viewer's own agents are held in the library under their identifier. */
async function ownAgentLibraryRefs(
  ctx: MarketplaceContext,
  refs: string[]
): Promise<Map<string, string>> {
  const own = await listUserAgents(ctx.userId);
  const byId = new Map(own.map((a) => [a.id, a.identifier]));
  return new Map(refs.map((ref) => [ref, byId.get(ref) ?? ref]));
}

export const agentSource: MarketplaceSource<'agent'> = {
  kind: 'agent',
  likeType: 'agent',
  reportKind: 'user_agent',
  async list(ctx, query) {
    return pageCandidates(ctx, agentSource, query, await candidates(ctx));
  },
  async isVisible(ctx, ref) {
    return (await candidates(ctx)).some((c) => c.item.ref === ref);
  },
  save: librarySave('agent', ownAgentLibraryRefs),
};
