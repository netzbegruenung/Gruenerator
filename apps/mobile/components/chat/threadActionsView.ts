/**
 * The two rules the thread menu carries that are worth stating once: what
 * counts as a rename, and which groups a thread can still be shared with.
 * Split from the sheets so both can be checked without a renderer.
 */

export interface ShareableGroup {
  id: string;
  name: string;
  isShared: boolean;
}

interface GroupLike {
  id: string;
  name: string;
}

interface ShareLike {
  group_id: string;
  group_name: string;
}

/**
 * The user's groups, each marked with whether this thread already reaches it.
 *
 * A share can outlive the membership that created it — someone shares a thread
 * with a group and later leaves. That share is still real and must stay
 * revocable, so it is appended rather than dropped for not being in
 * `userGroups`. Sorted by name so the list does not reorder as shares change.
 */
export function buildShareableGroups(
  userGroups: readonly GroupLike[],
  sharedGroups: readonly ShareLike[]
): ShareableGroup[] {
  const sharedIds = new Set(sharedGroups.map((s) => s.group_id));
  const known = new Set(userGroups.map((g) => g.id));

  const rows: ShareableGroup[] = userGroups.map((group) => ({
    id: group.id,
    name: group.name,
    isShared: sharedIds.has(group.id),
  }));

  for (const share of sharedGroups) {
    if (!known.has(share.group_id)) {
      rows.push({ id: share.group_id, name: share.group_name, isShared: true });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

/**
 * The title to send, or null when there is nothing to do — empty, whitespace
 * only, or unchanged. Returning null rather than throwing keeps the caller a
 * single `if`, and an accidental no-op rename never reaches the backend.
 */
export function sanitizeThreadTitle(input: string, current: string | undefined): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (trimmed === (current ?? '').trim()) return null;
  return trimmed;
}
