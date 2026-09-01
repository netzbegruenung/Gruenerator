import { buildChatThreadSlug } from '@gruenerator/shared/utils';

export interface ThreadUrlState {
  /** remoteId of the settled main thread; null while it is an unsaved draft. */
  mainRemoteId: string | null;
  /** Slug suffix of that thread; null for legacy rows predating the backfill. */
  mainSuffix: string | null;
  mainTitle: string | null;
  /** Current `:threadSlug` URL param (null on bare /chat). */
  threadSlug: string | null;
  /** Suffix extracted from `threadSlug`. */
  suffix: string | null;
  /** main's remoteId on the previous run, to detect leaving a thread. */
  prevRemoteId: string | null;
  /** Whether `suffix` still resolves to a known thread (false ⇒ deleted). */
  slugStillResolves: boolean;
}

export type ThreadUrlAction =
  /** Canonicalise the URL to this slug. Always a replace. */
  | { type: 'replace'; slug: string }
  /** The runtime moved to a fresh draft; leave the thread URL. */
  | { type: 'leave' }
  /** The thread the URL names is gone; back to the hero. */
  | { type: 'gone' }
  | { type: 'none' };

/**
 * Decides whether a change the *runtime* made should be written to the URL.
 *
 * The URL is the source of truth for which thread is open, so this side is
 * deliberately almost mute: it speaks only for transitions the URL cannot know
 * about by itself. Everything else — above all a switch the URL itself started —
 * must return `none`, or the two directions start driving each other, which is
 * exactly the ping-pong this replaced.
 */
export function reconcileThreadUrl(state: ThreadUrlState): ThreadUrlAction {
  const { mainRemoteId, mainSuffix, mainTitle, threadSlug, suffix, prevRemoteId } = state;

  if (mainRemoteId) {
    // Legacy row without a suffix: nothing sensible to write, leave the URL.
    if (!mainSuffix) return { type: 'none' };
    // Both guards below used to key on `suffix`, which is null for a bare /chat
    // AND for a legacy link carrying the raw remoteId (`/chat/<uuid>`). That
    // conflation made each of them answer the other's case wrongly, so they key
    // on `threadSlug` — what the URL actually names — instead.
    if (threadSlug === null) {
      // No thread named: only a thread minted right here may claim the URL —
      // that is the transition from a draft, so main was empty on the previous
      // run. A thread that was ALREADY open is leftover state the URL→thread
      // effect is at this moment swapping for a draft (asynchronously, see
      // `lib/auiAsync.ts`), so main still names it here. Writing its slug back
      // is what oscillated: the draft landed a tick later, read as "left the
      // thread", and bounced the URL back to /chat, 60+ times a second until
      // Safari's replaceState limit turned it into a SecurityError. On a landing
      // (/agents/:slug, ?mode=…) the same write threw the user out of the agent
      // they had just opened and into their last conversation.
      if (prevRemoteId !== null) return { type: 'none' };
    } else if (suffix !== null ? suffix !== mainSuffix : threadSlug !== mainRemoteId) {
      // A switch the URL itself started is still in flight: the URL names the
      // TARGET while main is still the OLD thread. Writing now would drag the
      // URL back and re-trigger the switch. A legacy link is compared by
      // remoteId because that is what it carries; comparing its (absent) suffix
      // skipped this guard entirely and let the old thread claim the URL.
      return { type: 'none' };
    }
    const slug = buildChatThreadSlug(mainTitle, mainSuffix);
    return slug === threadSlug ? { type: 'none' } : { type: 'replace', slug };
  }

  // Main holds no thread. Only interesting if it just left one while a thread
  // URL is showing; on boot (no previous thread) the initial draft is normal.
  if (!prevRemoteId || !suffix) return { type: 'none' };
  // A deletion purges the adapter's slug caches, so an unresolvable suffix is a
  // non-heuristic "really gone". If it still resolves, the runtime moved to a
  // draft on purpose (agent switch) and we just follow it out of the thread URL.
  return state.slugStillResolves ? { type: 'leave' } : { type: 'gone' };
}
