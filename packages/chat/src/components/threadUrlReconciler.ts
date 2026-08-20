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
  /**
   * The URL names a context of its own (an agent, a mode) rather than a thread.
   * A missing thread suffix then does NOT mean "no thread yet" — it means the
   * user is on a landing page that must keep its own URL.
   */
  landing: boolean;
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
  const { mainRemoteId, mainSuffix, mainTitle, threadSlug, suffix, prevRemoteId, landing } = state;

  if (mainRemoteId) {
    // Legacy row without a suffix: nothing sensible to write, leave the URL.
    if (!mainSuffix) return { type: 'none' };
    // On a landing (/agents/:slug, ?mode=…) only a thread minted right here may
    // claim the URL — that is the transition from a draft, so main was empty on
    // the previous run. A thread that was ALREADY open when the landing mounted
    // is leftover state, and writing its slug would throw the user out of the
    // agent they just opened and into their last conversation.
    if (landing && suffix === null && prevRemoteId !== null) return { type: 'none' };
    // Only canonicalise for the thread the URL already points at (a title
    // arrived) or when it points at no thread yet (a draft just minted). While
    // a switch is in flight the URL names the TARGET and main is still the OLD
    // thread — writing then would drag the URL back and re-trigger the switch.
    if (suffix !== null && suffix !== mainSuffix) return { type: 'none' };
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
