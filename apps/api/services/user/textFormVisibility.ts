/**
 * Which row wins when the same mention resolves to more than one visible
 * Textform — own, shared into a group, or public. `own` always wins (a
 * person's own override must never be shadowed by something shared at them),
 * `group` beats `public` (a project's own choice outranks the open catalog),
 * and ties within the same access level are broken deterministically so the
 * same input always picks the same row.
 *
 * Eigenes, abhängigkeitsfreies Modul (kein Express, kein Postgres) — reine
 * Funktion über bereits geladene Zeilen, wie `recipeOverrideAccess.ts`.
 */

export type TextFormAccess = 'own' | 'group' | 'public';

const ACCESS_RANK: Record<TextFormAccess, number> = { own: 0, group: 1, public: 2 };

/**
 * Picks the row with the highest-precedence access for `userId`, breaking
 * ties by `created_at` ascending (older wins) and then `id` ascending.
 * Returns `undefined` for an empty input.
 */
export function pickVisibleTextForm<
  T extends { user_id: string; created_at: Date | string; id: string; access: TextFormAccess },
>(rows: readonly T[], userId: string): T | undefined {
  let best: T | undefined;

  for (const row of rows) {
    const access: TextFormAccess = row.user_id === userId ? 'own' : row.access;
    if (!best) {
      best = row;
      continue;
    }
    const bestAccess: TextFormAccess = best.user_id === userId ? 'own' : best.access;
    const cmp = compare({ ...row, access }, { ...best, access: bestAccess });
    if (cmp < 0) best = row;
  }

  return best;
}

function compare(
  a: { created_at: Date | string; id: string; access: TextFormAccess },
  b: { created_at: Date | string; id: string; access: TextFormAccess }
): number {
  const rankDiff = ACCESS_RANK[a.access] - ACCESS_RANK[b.access];
  if (rankDiff !== 0) return rankDiff;

  const createdDiff = toTime(a.created_at) - toTime(b.created_at);
  if (createdDiff !== 0) return createdDiff;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function toTime(value: Date | string): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}
