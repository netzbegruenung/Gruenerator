import { type GroupSummary, pickRecentEntries } from '@gruenerator/shared/groups';
import { SectionHeader } from '@gruenerator/ui';
import { useMemo } from 'react';

import { formatRelativeDate } from '../../../utils/dateFormatter';
import { SYSTEM_NOTEBOOKS, type NotebookConfigEntry } from '../../notebook/config/notebooksConfig';
import { useItemUsage } from '../../usage/useItemUsage';

import { NotebookTile, SystemNotebookTile, useMyNotebooks } from './ProjekteNotebooksSection';
import { ProjektTile } from './ProjektTile';

import type { NotebookCollection } from '@/types/notebook';

type RecentNotebook =
  | { id: string; source: 'own' | 'shared'; collection: NotebookCollection }
  | { id: string; source: 'system'; entry: NotebookConfigEntry };

/**
 * „Zuletzt" oben auf `/projekte`: die zuletzt genutzten Projekte und Notebooks
 * gemischt — eigene, geteilte und System-Notebooks —, nach dem letzten Öffnen
 * bzw. Chat. Was nie genutzt wurde, steht nur in den Abschnitten darunter bzw.
 * auf `/wissen`; ohne Nutzung bleibt die Reihe ganz weg.
 */
export function ProjekteRecentSection({ projekte }: { projekte: GroupSummary[] }) {
  const { data: projectUsage } = useItemUsage('project');
  const { data: notebookUsage } = useItemUsage('notebook');
  const notebooks = useMyNotebooks();

  const entries = useMemo(() => {
    const candidates: RecentNotebook[] = [
      ...notebooks.own.map((c) => ({ id: c.id, source: 'own' as const, collection: c })),
      ...notebooks.shared.map((c) => ({ id: c.id, source: 'shared' as const, collection: c })),
      // Nur was diese Instanz anbietet — dieselbe Liste wie die Galerie auf /wissen.
      ...SYSTEM_NOTEBOOKS.map((entry) => ({ id: entry.id, source: 'system' as const, entry })),
    ];
    return pickRecentEntries(projekte, candidates, projectUsage, notebookUsage);
  }, [projekte, projectUsage, notebookUsage, notebooks.own, notebooks.shared]);

  if (entries.length === 0) return null;

  return (
    <section aria-label="Zuletzt" className="mb-xl">
      <SectionHeader title="Zuletzt" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
        {entries.map((e) => {
          const when = formatRelativeDate(new Date(e.usedAt));
          if (e.kind === 'project') {
            return <ProjektTile key={e.key} projekt={e.item} extraMeta={[`Projekt · ${when}`]} />;
          }
          if (e.item.source === 'system') {
            return (
              <SystemNotebookTile
                key={e.key}
                entry={e.item.entry}
                extraMeta={[`Notebook · ${when}`]}
              />
            );
          }
          return (
            <NotebookTile
              key={e.key}
              collection={e.item.collection}
              isOwn={e.item.source === 'own'}
              extraMeta={[`Notebook · ${when}`]}
            />
          );
        })}
      </div>
    </section>
  );
}
