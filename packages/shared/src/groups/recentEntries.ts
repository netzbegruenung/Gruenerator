import { type UsageMap } from '../utils/usageRanking.js';

/** „Zuletzt" auf `/projekte` (Web und App): eine Reihe, nicht die ganze Liste. */
export const RECENT_LIMIT = 4;

export type RecentEntry<P, N> =
  | { kind: 'project'; key: string; usedAt: number; item: P }
  | { kind: 'notebook'; key: string; usedAt: number; item: N };

const usedAtOf = (usage: UsageMap | null | undefined, id: string): number | null => {
  const stat = usage instanceof Map ? usage.get(id) : usage?.[id];
  if (!stat) return null;
  const ms = new Date(stat.lastUsedAt).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * Die zuletzt genutzten Projekte und Notebooks gemischt, nach letzter Nutzung
 * (Öffnen oder Chat) absteigend. Was nie genutzt wurde, fehlt; Rezepte gehören
 * bewusst nicht dazu. Notebooks heißen in `user_item_usage` wie im Chat: eigene
 * und geteilte per UUID, System-Notebooks per Registry-Id (`bayern-notebook`).
 */
export function pickRecentEntries<P extends { id: string }, N extends { id: string }>(
  projects: readonly P[],
  notebooks: readonly N[],
  projectUsage: UsageMap | null | undefined,
  notebookUsage: UsageMap | null | undefined
): RecentEntry<P, N>[] {
  const all: RecentEntry<P, N>[] = [];
  for (const item of projects) {
    const usedAt = usedAtOf(projectUsage, item.id);
    if (usedAt !== null) all.push({ kind: 'project', key: `p-${item.id}`, usedAt, item });
  }
  for (const item of notebooks) {
    const usedAt = usedAtOf(notebookUsage, item.id);
    if (usedAt !== null) all.push({ kind: 'notebook', key: `n-${item.id}`, usedAt, item });
  }
  return all.sort((a, b) => b.usedAt - a.usedAt).slice(0, RECENT_LIMIT);
}
