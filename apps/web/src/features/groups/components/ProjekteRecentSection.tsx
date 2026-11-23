import { type GroupSummary } from '@gruenerator/shared/groups';
import { type UsageMap } from '@gruenerator/shared/utils';
import { SectionHeader } from '@gruenerator/ui';
import { useMemo } from 'react';

import { formatRelativeDate } from '../../../utils/dateFormatter';
import { useItemUsage } from '../../usage/useItemUsage';

import { NotebookTile, useMyNotebooks } from './ProjekteNotebooksSection';
import { ProjektTile } from './ProjektTile';

import type { NotebookCollection } from '@/types/notebook';

/** Eine Reihe, wie „Zuletzt" auf der Arbeiten-Seite — nicht die ganze Liste. */
const RECENT_LIMIT = 4;

type RecentEntry =
  | { kind: 'project'; key: string; usedAt: number; projekt: GroupSummary }
  | {
      kind: 'notebook';
      key: string;
      usedAt: number;
      collection: NotebookCollection;
      isOwn: boolean;
    };

const usedAtOf = (usage: UsageMap | undefined, id: string): number | null => {
  const stat = usage instanceof Map ? usage.get(id) : usage?.[id];
  if (!stat) return null;
  const ms = new Date(stat.lastUsedAt).getTime();
  return Number.isNaN(ms) ? null : ms;
};

/**
 * „Zuletzt" oben auf `/projekte`: die zuletzt genutzten Projekte und Notebooks
 * gemischt, nach dem letzten Öffnen bzw. Chat. Was nie genutzt wurde, steht nur
 * in den Abschnitten darunter; ohne Nutzung bleibt die Reihe ganz weg.
 */
export function ProjekteRecentSection({ projekte }: { projekte: GroupSummary[] }) {
  const { data: projectUsage } = useItemUsage('project');
  const { data: notebookUsage } = useItemUsage('notebook');
  const notebooks = useMyNotebooks();

  const entries = useMemo(() => {
    const all: RecentEntry[] = [];
    for (const projekt of projekte) {
      const usedAt = usedAtOf(projectUsage, projekt.id);
      if (usedAt !== null) all.push({ kind: 'project', key: `p-${projekt.id}`, usedAt, projekt });
    }
    const addNotebooks = (list: NotebookCollection[], isOwn: boolean) => {
      for (const collection of list) {
        const usedAt = usedAtOf(notebookUsage, collection.id);
        if (usedAt !== null) {
          all.push({ kind: 'notebook', key: `n-${collection.id}`, usedAt, collection, isOwn });
        }
      }
    };
    addNotebooks(notebooks.own, true);
    addNotebooks(notebooks.shared, false);
    return all.sort((a, b) => b.usedAt - a.usedAt).slice(0, RECENT_LIMIT);
  }, [projekte, projectUsage, notebookUsage, notebooks.own, notebooks.shared]);

  if (entries.length === 0) return null;

  return (
    <section aria-label="Zuletzt" className="mb-xl">
      <SectionHeader title="Zuletzt" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
        {entries.map((e) => {
          const when = formatRelativeDate(new Date(e.usedAt));
          return e.kind === 'project' ? (
            <ProjektTile key={e.key} projekt={e.projekt} extraMeta={[`Projekt · ${when}`]} />
          ) : (
            <NotebookTile
              key={e.key}
              collection={e.collection}
              isOwn={e.isOwn}
              extraMeta={[`Notebook · ${when}`]}
            />
          );
        })}
      </div>
    </section>
  );
}
