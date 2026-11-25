import { Button, SectionHeader } from '@gruenerator/ui';
import { useMemo } from 'react';
import { PiBooks, PiPlus } from 'react-icons/pi';
import { Link } from 'react-router-dom';

import { getToolTheme } from '../../../config/toolTheme';
import { useNotebookCollections } from '../../auth/hooks/useProfileData';
import { type NotebookConfigEntry } from '../../notebook/config/notebooksConfig';
import { useSharedNotebookCollections } from '../../notebook/hooks/useSharedNotebookCollections';
import { OwnNotebookActions } from '../../notebook/wissen/OwnNotebookMenu';
import { collectionSlug } from '../../notebook/wissen/useNotebookShelves';

import { TileCard, type TileTone } from './TileCard';

import type { NotebookCollection } from '@/types/notebook';

const FALLBACK_TONE: TileTone = {
  tile: 'bg-grey-50 dark:bg-grey-800/40',
  icon: 'text-secondary-600',
  title: 'text-foreground-heading',
  desc: 'text-muted-foreground',
};

const EMPTY: NotebookCollection[] = [];
const isOwned = (c: NotebookCollection) => c.access_source == null || c.access_source === 'owned';
const byName = (a: NotebookCollection, b: NotebookCollection) => a.name.localeCompare(b.name);

/**
 * Eigene Notebooks und die, die andere in ein gemeinsames Projekt geteilt
 * haben (ohne Doppelte). Die System-Notebooks stehen im Marktplatz.
 */
export function useMyNotebooks() {
  const { query } = useNotebookCollections({ isActive: true });
  const sharedQuery = useSharedNotebookCollections();
  const lists = useMemo(() => {
    const ownList = (query.data ?? EMPTY).filter(isOwned);
    const ownIds = new Set(ownList.map((c) => c.id));
    return {
      own: [...ownList].sort(byName),
      shared: (sharedQuery.data ?? EMPTY).filter((c) => !ownIds.has(c.id)).sort(byName),
    };
  }, [query.data, sharedQuery.data]);
  return { ...lists, loading: query.isLoading, failed: query.isError };
}

/** Notebook-Kachel: dieselbe wie Projekte und Rezepte; das Menü nur am eigenen. */
export function NotebookTile({
  collection: c,
  isOwn,
  extraMeta = [],
}: {
  collection: NotebookCollection;
  isOwn: boolean;
  /** Steht vor der eigenen Meta-Zeile, z. B. „Notebook · vor 2 Std." in „Zuletzt". */
  extraMeta?: string[];
}) {
  const tone = getToolTheme('projekte') ?? FALLBACK_TONE;
  return (
    <TileCard
      href={`/notebooks/${collectionSlug(c)}`}
      title={c.name}
      tone={tone}
      badge={<PiBooks aria-hidden className="size-5" />}
      meta={[
        ...extraMeta,
        ...(!isOwn && c.shared_via_groups?.length
          ? [`Geteilt in ${c.shared_via_groups.join(', ')}`]
          : []),
      ]}
      description={c.description}
      // Bearbeiten, Teilen und Löschen nur am eigenen — dieselben Einträge wie auf /wissen.
      menu={isOwn ? <OwnNotebookActions collection={c} /> : null}
    />
  );
}

/** System-Notebook-Kachel (z. B. in „Zuletzt"): dieselbe Kachel, ohne Menü — es gehört niemandem. */
export function SystemNotebookTile({
  entry,
  extraMeta = [],
}: {
  entry: NotebookConfigEntry;
  extraMeta?: string[];
}) {
  const Icon = entry.icon;
  return (
    <TileCard
      href={entry.path}
      title={entry.title}
      tone={getToolTheme('projekte') ?? FALLBACK_TONE}
      badge={<Icon aria-hidden className="size-5" />}
      meta={extraMeta}
      description={entry.description}
    />
  );
}

/**
 * „Deine Notebooks" auf `/projekte`: eigene Notebooks und die, die andere in
 * ein gemeinsames Projekt geteilt haben — dieselbe Kachel wie Projekte und
 * Rezepte.
 */
export function ProjekteNotebooksSection() {
  const { own, shared, loading, failed } = useMyNotebooks();

  const newButton = (
    <Button asChild variant="ghost" size="icon" title="Neues Notebook">
      <Link to="/notebooks/neu" aria-label="Neues Notebook">
        <PiPlus aria-hidden className="size-[18px]" />
      </Link>
    </Button>
  );

  return (
    <section aria-label="Deine Notebooks" className="mt-xl">
      <SectionHeader title="Deine Notebooks" actions={newButton} />
      {own.length + shared.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(240px,1fr))] sm:gap-4">
          {own.map((c) => (
            <NotebookTile key={c.id} collection={c} isOwn />
          ))}
          {shared.map((c) => (
            <NotebookTile key={c.id} collection={c} isOwn={false} />
          ))}
        </div>
      ) : (
        // „Noch keine" nur aus einer bestätigt leeren Liste.
        <p className="m-0 py-md text-sm text-grey-500 dark:text-grey-400">
          {failed
            ? 'Deine Notebooks konnten nicht geladen werden.'
            : loading
              ? 'Notebooks werden geladen…'
              : 'Noch keine Notebooks. Ein Notebook beantwortet Fragen aus deinen eigenen Dokumenten.'}
        </p>
      )}
    </section>
  );
}
