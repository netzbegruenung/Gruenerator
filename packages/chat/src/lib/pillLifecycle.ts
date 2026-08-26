import type { Mentionable } from './mentionables';

/**
 * What happens to the composer's pill mentions when the active thread changes.
 *
 * Pills are a draft property of one thread's composer, so switching INTO a
 * thread starts from a clean slate. Landing on the draft (`null`) must not
 * clear them, and that distinction is the whole bug: `currentThreadId` flips to
 * `null` on its own shortly after boot — MainThreadSyncEffect nulls the
 * rehydrated id once the initial draft becomes the main thread, and `/start`
 * additionally calls `switchToNewThread()` from its mount effect. Both land
 * asynchronously, in exactly the seconds a person spends picking `@tally` on the
 * page they just opened. Clearing on those transitions ate the mention before
 * the composer could flush it, so the turn reached the server with no mention at
 * all — no chip, no scope, the connector simply unused.
 *
 * The mint flip (`null` → fresh id when the message is actually sent) is
 * harmless either way: `flushPillMentions` runs synchronously before `send()`,
 * so the pills are already empty by then.
 */
export function pillsAfterThreadChange(
  pills: Mentionable[],
  nextThreadId: string | null
): Mentionable[] {
  return nextThreadId === null ? pills : [];
}
